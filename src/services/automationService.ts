/**
 * Yashwanth Hub Client Automation Service
 * 
 * Antigravity Hard Constraints:
 * 1. NEVER execute automation logic in React components, hooks, or client state.
 * 2. Every automation execution MUST take place on the server via Supabase Functions or Vercel API routes (/api/automations/*).
 * 3. Scheduled triggers MUST rely on vercel.json cron jobs or Supabase pg_cron, never browser intervals.
 * 4. No fake timers, mocked responses, or optimistic success indicators without database execution records.
 * 5. All secrets must remain in server-side environment variables or encrypted database columns.
 */

import { getSupabaseClient } from '../lib/supabase';

export interface HubAutomation {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description?: string;
  trigger_type: 'cron' | 'event' | 'webhook' | 'manual';
  cron_expression?: string;
  timezone: string;
  action_type: string;
  configuration: Record<string, any>;
  is_enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationExecutionLog {
  id: string;
  automation_id?: string;
  user_id?: string;
  trigger_source: 'cron_vercel' | 'pg_cron' | 'manual' | 'webhook' | 'event';
  action_type: string;
  status: 'success' | 'failed' | 'partial';
  duration_ms: number;
  records_affected: number;
  input_payload?: Record<string, any>;
  output_payload?: Record<string, any>;
  error_log?: string | null;
  created_at: string;
}

export class AutomationService {
  /**
   * Fetches registered automations for the authenticated user from Supabase.
   */
  public static async getAutomations(): Promise<HubAutomation[]> {
    try {
      const client = getSupabaseClient();
      if (!client) {
        // Fallback to Vercel API endpoint
        const res = await fetch('/api/automations');
        if (res.ok) {
          const json = await res.json();
          return json.automations || [];
        }
        return [];
      }

      const { data, error } = await client
        .from('hub_automations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[AutomationService] Database fetch warning:', error.message);
        return [];
      }

      return (data as HubAutomation[]) || [];
    } catch (err) {
      console.warn('[AutomationService] Failed to fetch automations:', err);
      return [];
    }
  }

  /**
   * Fetches immutable execution history records from the database.
   * Hard Constraint 4: UI relies on verified execution records, never optimistic fakes.
   */
  public static async getExecutionLogs(limit = 20): Promise<AutomationExecutionLog[]> {
    try {
      const client = getSupabaseClient();
      if (!client) {
        const res = await fetch('/api/automations');
        if (res.ok) {
          const json = await res.json();
          return json.recentExecutionLogs || [];
        }
        return [];
      }

      const { data, error } = await client
        .from('automation_execution_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.warn('[AutomationService] Execution logs fetch warning:', error.message);
        return [];
      }

      return (data as AutomationExecutionLog[]) || [];
    } catch (err) {
      console.warn('[AutomationService] Failed to fetch execution logs:', err);
      return [];
    }
  }

  /**
   * Triggers server-side automation execution via /api/automations/run.
   * Strictly server-side execution. Never executes logic in React or browser.
   */
  public static async triggerServerAutomation(
    actionType: string,
    automationId?: string,
    payload?: Record<string, any>
  ): Promise<{ success: boolean; log?: AutomationExecutionLog; error?: string }> {
    try {
      // Get current user session JWT if client is available
      const client = getSupabaseClient();
      let token: string | undefined = undefined;
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        token = session?.access_token;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const resp = await fetch('/api/automations/run', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action_type: actionType,
          automation_id: automationId,
          payload: payload || {},
        }),
      });

      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || errorData.error || `Server responded with status ${resp.status}`,
        };
      }

      const data = await resp.json();
      return {
        success: true,
        log: data.result,
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
