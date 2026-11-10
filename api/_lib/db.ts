import { createClient } from '@supabase/supabase-js';

// Server-side Supabase client initialization
const rawUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const rawServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const rawFallbackKey = (
  rawServiceKey ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  ''
).trim();

export function getServerSupabaseUrl(): string {
  return rawUrl;
}

export function isServerSupabaseConfigured(): boolean {
  return Boolean(
    rawUrl &&
      rawUrl.startsWith('https://') &&
      !rawUrl.includes('sample-project.supabase.co') &&
      rawServiceKey &&
      rawServiceKey !== 'service-role-placeholder'
  );
}

const supabaseUrl = rawUrl || 'https://sample-project.supabase.co';
const supabaseKey = rawFallbackKey || 'service-role-placeholder';

export const supabaseServer = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export interface RequestAuthResult {
  authenticated: boolean;
  userId: string | null;
  email?: string;
  isCron?: boolean;
  error?: string;
}

/**
 * Resolves the authenticated Supabase user from Authorization: Bearer <jwt>
 * or validates CRON_SECRET when running internal cron endpoints.
 * Never returns a default/spoofed user ID when unauthenticated.
 */
export async function resolveAuthenticatedUser(
  req: any,
  dbClient: any = supabaseServer
): Promise<RequestAuthResult> {
  const authHeader = req?.headers?.authorization || req?.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, userId: null, error: 'Missing Authorization Bearer token.' };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { authenticated: false, userId: null, error: 'Empty Bearer token.' };
  }

  const cronSecret = (process.env.CRON_SECRET || '').trim();
  if (cronSecret && token === cronSecret) {
    return { authenticated: true, userId: null, isCron: true };
  }

  if (!isServerSupabaseConfigured() && dbClient === supabaseServer) {
    return {
      authenticated: false,
      userId: null,
      error: 'Server Supabase credentials are not configured.',
    };
  }

  try {
    const { data, error } = await dbClient.auth.getUser(token);
    if (error || !data?.user?.id) {
      return {
        authenticated: false,
        userId: null,
        error: error?.message || 'Invalid or expired Supabase user session.',
      };
    }
    return {
      authenticated: true,
      userId: data.user.id,
      email: data.user.email || undefined,
    };
  } catch (err: any) {
    return {
      authenticated: false,
      userId: null,
      error: err?.message || 'Failed to verify authentication token.',
    };
  }
}

export interface AutomationExecutionRecord {
  id?: string;
  automation_id?: string;
  user_id?: string;
  trigger_source: 'cron_vercel' | 'pg_cron' | 'manual' | 'webhook' | 'event' | 'one_time_schedule';
  action_type: string;
  status: 'success' | 'failed' | 'partial';
  duration_ms: number;
  records_affected: number;
  input_payload?: any;
  output_payload?: any;
  error_log?: string | null;
  created_at?: string;
}

/**
 * Persists an immutable execution record into public.automation_execution_logs.
 */
export async function recordExecutionLog(log: AutomationExecutionRecord, dbClient: any = supabaseServer) {
  try {
    const payload = {
      automation_id: log.automation_id || null,
      user_id: log.user_id || null,
      trigger_source: log.trigger_source,
      action_type: log.action_type,
      status: log.status,
      duration_ms: Math.max(0, Math.round(log.duration_ms)),
      records_affected: log.records_affected || 0,
      input_payload: log.input_payload || {},
      output_payload: log.output_payload || {},
      error_log: log.error_log || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await dbClient
      .from('automation_execution_logs')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[Automation Engine] Error logging execution to Supabase:', error.message);
      return null;
    }

    return data;
  } catch (err: any) {
    console.error('[Automation Engine] Fatal error in recordExecutionLog:', err);
    return null;
  }
}

/**
 * Enqueues a job into public.automation_queue
 */
export async function enqueueAutomationJob(
  params: {
    automation_id?: string;
    user_id?: string;
    action_type: string;
    trigger_source?: string;
    payload?: any;
    priority?: number;
    scheduled_for?: string;
    approval_status?: 'auto_approved' | 'pending_approval' | 'approved' | 'rejected';
    idempotency_key?: string;
    max_retries?: number;
  },
  dbClient: any = supabaseServer
) {
  const { data, error } = await dbClient
    .from('automation_queue')
    .insert({
      automation_id: params.automation_id || null,
      user_id: params.user_id || null,
      action_type: params.action_type,
      trigger_source: params.trigger_source || 'manual',
      status: 'pending',
      approval_status: params.approval_status || 'auto_approved',
      priority: params.priority || 0,
      payload: params.payload || {},
      retry_count: 0,
      max_retries: params.max_retries ?? 3,
      scheduled_for: params.scheduled_for || new Date().toISOString(),
      idempotency_key: params.idempotency_key || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to enqueue automation job: ${error.message}`);
  }

  return data;
}
