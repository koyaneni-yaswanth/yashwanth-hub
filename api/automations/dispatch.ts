// Vercel Serverless Function: Automation Dispatcher & Registry
// Endpoint: /api/automations/dispatch (also serves /api/automations and /api/automations/run via rewrites)
// Validates user JWT, enforces idempotency, inserts 'queued' run record, and triggers runner.

import { supabaseServer } from '../_lib/db.ts';
import { executeAutomationRun } from '../_lib/runner.ts';

const memoryIdempotencyCache = new Map<string, any>();

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Authenticate User JWT if present
  const authHeader = req.headers.authorization;
  let userId: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const { data: { user }, error: authErr } = await supabaseServer.auth.getUser(token);
      if (user && !authErr) {
        userId = user.id;
      }
    } catch {
      // Ignored for unauthenticated or mock tests
    }
  }

  // ---------------------------------------------------------------------------
  // GET: Return automations list and recent execution history
  // ---------------------------------------------------------------------------
  if (req.method === 'GET') {
    try {
      let automationsQuery = supabaseServer
        .from('automations')
        .select('*')
        .order('created_at', { ascending: false });

      let runsQuery = supabaseServer
        .from('automation_runs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(25);

      if (userId) {
        automationsQuery = automationsQuery.eq('user_id', userId);
        runsQuery = runsQuery.eq('user_id', userId);
      }

      const [autoRes, runsRes] = await Promise.all([automationsQuery, runsQuery]);

      return res.status(200).json({
        success: true,
        automations: autoRes.data || [],
        recentExecutionLogs: runsRes.data || [],
        runs: runsRes.data || [],
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'Failed to fetch automations',
        message: err.message,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // POST: Execute / Dispatch automation run
  // ---------------------------------------------------------------------------
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Supported methods: GET, POST',
    });
  }

  try {
    const {
      automation_id,
      action_type,
      input_payload = {},
      trigger_source = 'manual',
      idempotency_key: bodyIdempKey,
    } = req.body || {};

    const idempotencyKey =
      req.headers['idempotency-key'] ||
      bodyIdempKey ||
      (automation_id ? `dispatch_${automation_id}_${Date.now()}` : `run_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`);

    if (!action_type && !automation_id) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Either "automation_id" or "action_type" must be provided.',
      });
    }

    let targetAutomationId = automation_id;
    let targetActionType = action_type;
    let actionConfig = {};

    // 2. If automation_id is provided, resolve config from automations table
    if (automation_id) {
      try {
        const { data: auto } = await supabaseServer
          .from('automations')
          .select('*')
          .eq('id', automation_id)
          .single();

        if (auto) {
          targetActionType = auto.action_type || targetActionType;
          actionConfig = auto.action_config || {};
          if (!userId && auto.user_id) {
            userId = auto.user_id;
          }
        }
      } catch (err) {
        console.warn('[Dispatch] Automations table lookup warning:', err);
      }
    }

    if (!targetActionType) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Could not resolve action_type for automation.',
      });
    }

    if (!userId) {
      // Default to system owner if unauthenticated local invocation
      userId = '00000000-0000-0000-0000-000000000001';
    }

    // 3. Enforce Idempotency
    const cachedRun = memoryIdempotencyCache.get(idempotencyKey);
    if (cachedRun) {
      return res.status(200).json({
        success: true,
        idempotent: true,
        message: `Existing execution run returned from memory cache for idempotency key: ${idempotencyKey}`,
        run: cachedRun,
      });
    }

    try {
      const { data: existingRun } = await supabaseServer
        .from('automation_runs')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .single();

      if (existingRun) {
        memoryIdempotencyCache.set(idempotencyKey, existingRun);
        return res.status(200).json({
          success: true,
          idempotent: true,
          message: `Existing execution run returned for idempotency key: ${idempotencyKey}`,
          run: existingRun,
        });
      }
    } catch {
      // Supabase query error ignored in offline fallback
    }

    // 4. Insert Run Record with status: 'queued'
    let runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    try {
      const { data: runRecord } = await supabaseServer
        .from('automation_runs')
        .insert({
          automation_id: targetAutomationId || 'a0000000-0000-0000-0000-000000000001',
          user_id: userId,
          trigger_source,
          status: 'queued',
          input_payload,
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

      if (runRecord?.id) {
        runId = runRecord.id;
      }
    } catch (insertErr: any) {
      console.warn('[Dispatch] Run record database insert warning:', insertErr.message);
    }

    // 5. Dispatch Execution to Runner
    const execution = await executeAutomationRun({
      run_id: runId,
      automation_id: targetAutomationId,
      user_id: userId,
      action_type: targetActionType,
      action_config: actionConfig,
      input_payload,
      trigger_source,
    });

    const responsePayload = {
      success: execution.status === 'completed',
      status: execution.status,
      run_id: runId,
      duration_ms: execution.duration_ms,
      records_affected: execution.records_affected,
      output: execution.output_payload,
      error: execution.error_log,
      retry_count: execution.retry_count,
    };

    memoryIdempotencyCache.set(idempotencyKey, {
      id: runId,
      ...responsePayload,
      output_payload: execution.output_payload,
      idempotency_key: idempotencyKey,
    });

    return res.status(200).json(responsePayload);
  } catch (error: any) {
    console.error('[Automation Dispatcher] Error:', error);
    return res.status(500).json({
      error: 'Dispatch Error',
      message: error.message || 'Fatal error while dispatching automation run.',
    });
  }
}
