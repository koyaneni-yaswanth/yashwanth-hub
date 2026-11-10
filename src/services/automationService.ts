/**
 * Yashwanth Hub Client Automation Service (V2 Unified Schema)
 *
 * Strictly delegates automation execution and scheduling to Vercel API routes (/api/automations/*)
 * backed by Supabase public.automations, public.automation_queue, and public.automation_runs.
 * Never runs automation logic in browser intervals or fabricates fake execution records.
 */

import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { SupabaseAuthService } from './auth/supabaseAuthService';

export interface AutomationDefinition {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  trigger_type: 'cron' | 'one_time' | 'event' | 'webhook' | 'manual';
  schedule_type?: 'recurring' | 'one_time';
  cron_expression?: string;
  timezone?: string;
  scheduled_for?: string;
  next_run_at?: string;
  last_run_at?: string;
  requires_approval?: boolean;
  trigger_config: {
    cron_expression?: string;
    scheduled_for?: string;
    timezone?: string;
    next_run_at?: string;
    last_run_at?: string;
  };
  action_type: string;
  action_config: Record<string, any>;
  status: 'active' | 'paused' | 'error' | 'needs_authorization' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface AutomationQueueJob {
  id: string;
  automation_id?: string;
  user_id?: string;
  action_type: string;
  trigger_source: string;
  status: 'pending' | 'processing' | 'retry_scheduled' | 'completed' | 'failed' | 'cancelled';
  approval_status: 'auto_approved' | 'pending_approval' | 'approved' | 'rejected';
  approved_by?: string;
  approved_at?: string;
  priority: number;
  payload: Record<string, any>;
  result_payload?: Record<string, any>;
  retry_count: number;
  max_retries: number;
  scheduled_for: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string | null;
  idempotency_key?: string;
  created_at: string;
}

export interface AutomationExecutionLog {
  id: string;
  automation_id?: string;
  queue_job_id?: string;
  user_id?: string;
  trigger_source: 'cron_vercel' | 'pg_cron' | 'manual' | 'webhook' | 'event' | 'one_time_schedule';
  action_type?: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'success' | 'partial';
  started_at?: string;
  completed_at?: string;
  duration_ms: number;
  records_affected: number;
  input_payload?: Record<string, any>;
  output_payload?: Record<string, any>;
  error_log?: string | null;
  retry_count: number;
  idempotency_key?: string;
  created_at: string;
}

export interface AutomationDashboardData {
  configured: boolean;
  authenticated: boolean;
  message?: string;
  automations: AutomationDefinition[];
  queue: AutomationQueueJob[];
  runs: AutomationExecutionLog[];
}

export class AutomationService {
  private static async getAuthHeaders(): Promise<{ headers: Record<string, string>; authenticated: boolean }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = await SupabaseAuthService.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      return { headers, authenticated: true };
    }
    return { headers, authenticated: false };
  }

  /**
   * Loads unified server automations, durable queue items, and run history.
   */
  public static async loadDashboardData(): Promise<AutomationDashboardData> {
    const supabaseConfigured = isSupabaseConfigured();
    const { headers, authenticated } = await this.getAuthHeaders();

    if (!supabaseConfigured) {
      return {
        configured: false,
        authenticated: false,
        message: 'Supabase client is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
        automations: [],
        queue: [],
        runs: [],
      };
    }

    if (!authenticated) {
      return {
        configured: true,
        authenticated: false,
        message: 'Sign in with your Yashwanth Hub account in Integrations to view and control your cloud automations.',
        automations: [],
        queue: [],
        runs: [],
      };
    }

    try {
      const resp = await fetch('/api/automations/dispatch', { headers });
      const data = await resp.json().catch(() => ({}));

      if (resp.status === 503 || data.configured === false) {
        return {
          configured: false,
          authenticated: true,
          message:
            data.message ||
            'Server database credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured on Vercel.',
          automations: [],
          queue: [],
          runs: [],
        };
      }

      if (resp.ok && data.success) {
        return {
          configured: true,
          authenticated: true,
          automations: data.automations || [],
          queue: data.queue || [],
          runs: data.runs || [],
        };
      }

      // Direct Supabase RLS-scoped fallback query (when local vite dev doesn't proxy /api)
      const client = getSupabaseClient();
      if (client) {
        const [aRes, qRes, rRes] = await Promise.all([
          client.from('automations').select('*').order('created_at', { ascending: false }),
          client.from('automation_queue').select('*').order('created_at', { ascending: false }).limit(40),
          client.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(40),
        ]);
        if (!aRes.error) {
          return {
            configured: true,
            authenticated: true,
            automations: (aRes.data as AutomationDefinition[]) || [],
            queue: (qRes.data as AutomationQueueJob[]) || [],
            runs: (rRes.data as AutomationExecutionLog[]) || [],
          };
        }
      }

      return {
        configured: true,
        authenticated: true,
        message: data.message || data.error || `Server responded HTTP ${resp.status}`,
        automations: [],
        queue: [],
        runs: [],
      };
    } catch (err: any) {
      return {
        configured: true,
        authenticated,
        message: err?.message || 'Unable to reach /api/automations/dispatch.',
        automations: [],
        queue: [],
        runs: [],
      };
    }
  }

  public static async getAutomations(): Promise<AutomationDefinition[]> {
    const data = await this.loadDashboardData();
    return data.automations;
  }

  public static async getExecutionLogs(limit = 20): Promise<AutomationExecutionLog[]> {
    const data = await this.loadDashboardData();
    return data.runs.slice(0, limit);
  }

  public static async createSchedule(params: {
    name: string;
    description?: string;
    action_type: string;
    trigger_type: 'cron' | 'one_time' | 'manual';
    cron_expression?: string;
    scheduled_for?: string;
    timezone?: string;
    requires_approval?: boolean;
    action_config?: Record<string, any>;
  }): Promise<{ success: boolean; automation?: AutomationDefinition; error?: string }> {
    const { headers, authenticated } = await this.getAuthHeaders();
    if (!authenticated) {
      return { success: false, error: 'Sign in first before creating server automations.' };
    }

    try {
      const resp = await fetch('/api/automations/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'create_automation',
          ...params,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        return { success: false, error: data.message || data.error || `HTTP ${resp.status}` };
      }
      return { success: true, automation: data.automation };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to create schedule.' };
    }
  }

  public static async toggleStatus(
    automationId: string,
    status: 'active' | 'paused'
  ): Promise<{ success: boolean; automation?: AutomationDefinition; error?: string }> {
    const { headers, authenticated } = await this.getAuthHeaders();
    if (!authenticated) {
      return { success: false, error: 'Sign in first.' };
    }
    try {
      const resp = await fetch('/api/automations/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'toggle_status',
          automation_id: automationId,
          status,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        return { success: false, error: data.message || data.error || `HTTP ${resp.status}` };
      }
      return { success: true, automation: data.automation };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to update status.' };
    }
  }

  public static async reviewQueueJob(
    queueJobId: string,
    decision: 'approve_job' | 'reject_job' | 'retry_job'
  ): Promise<{ success: boolean; error?: string }> {
    const { headers, authenticated } = await this.getAuthHeaders();
    if (!authenticated) {
      return { success: false, error: 'Sign in first.' };
    }
    try {
      const resp = await fetch('/api/automations/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: decision,
          queue_job_id: queueJobId,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) {
        return { success: false, error: data.message || data.error || `HTTP ${resp.status}` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Queue review failed.' };
    }
  }

  /**
   * Triggers server-side automation execution via /api/automations/dispatch.
   */
  public static async triggerServerAutomation(
    actionType: string,
    automationId?: string,
    payload?: Record<string, any>,
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    queued?: boolean;
    requires_approval?: boolean;
    log?: AutomationExecutionLog;
    error?: string;
  }> {
    try {
      const { headers, authenticated } = await this.getAuthHeaders();
      if (!authenticated) {
        return {
          success: false,
          error: 'Sign in to Yashwanth Hub to execute authenticated server automations.',
        };
      }

      const key = idempotencyKey || `manual_${automationId || actionType}_${Date.now()}`;
      headers['Idempotency-Key'] = key;

      const resp = await fetch('/api/automations/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action_type: actionType,
          automation_id: automationId,
          input_payload: payload || {},
          trigger_source: 'manual',
          idempotency_key: key,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return {
          success: false,
          error: data.message || data.error || `Server responded with status ${resp.status}`,
        };
      }

      return {
        success: Boolean(data.success),
        queued: Boolean(data.queued),
        requires_approval: Boolean(data.requires_approval),
        log: data.result,
        error: data.error,
      };
    } catch (err: any) {
      console.error('[AutomationService] Server trigger failure:', err);
      return {
        success: false,
        error: err.message || 'Failed to contact server automation endpoint.',
      };
    }
  }
}
