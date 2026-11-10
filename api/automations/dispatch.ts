// Vercel Serverless Function: Automation Dispatcher, Schedule Registry & Approval Queue
// Endpoint: /api/automations/dispatch (also serves /api/automations and /api/automations/run via rewrites)
// Validates Supabase JWT strictly, prevents cross-user access, supports creating schedules,
// approving/rejecting human-gated jobs, retrying failed jobs, and durable queued runs.

import { computeNextCronRun, isValidCronExpression } from '../_lib/cronParser.ts';
import {
  enqueueAutomationJob,
  isServerSupabaseConfigured,
  resolveAuthenticatedUser,
  supabaseServer,
} from '../_lib/db.ts';
import { processDueQueueJobs } from '../_lib/queueEngine.ts';
import { executeAutomationRun } from '../_lib/runner.ts';

export function createDispatchHandler(
  dbClient: any = supabaseServer,
  authResolver: typeof resolveAuthenticatedUser = resolveAuthenticatedUser
) {
  return async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const dbConfigured = dbClient !== supabaseServer || isServerSupabaseConfigured();
    if (!dbConfigured) {
      if (req.method === 'GET') {
        return res.status(200).json({
          success: false,
          configured: false,
          automations: [],
          queue: [],
          runs: [],
          recentExecutionLogs: [],
          message: 'Server Supabase database credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured.',
          timestamp: new Date().toISOString(),
        });
      }
      return res.status(503).json({
        error: 'Server Database Not Configured',
        configured: false,
        message: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment variables before running automations.',
      });
    }

    const auth = await authResolver(req, dbClient);
    if (!auth.authenticated || (!auth.userId && !auth.isCron)) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: auth.error || 'Valid Supabase user session is required to manage automations.',
      });
    }

    // ---------------------------------------------------------------------------
    // GET: Return user-scoped automations, durable queue jobs, and recent runs
    // ---------------------------------------------------------------------------
    if (req.method === 'GET') {
      try {
        let automationsQuery = dbClient.from('automations').select('*').order('created_at', { ascending: false });
        let queueQuery = dbClient.from('automation_queue').select('*').order('created_at', { ascending: false }).limit(40);
        let runsQuery = dbClient.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(40);

        if (auth.userId) {
          automationsQuery = automationsQuery.eq('user_id', auth.userId);
          queueQuery = queueQuery.eq('user_id', auth.userId);
          runsQuery = runsQuery.eq('user_id', auth.userId);
        }

        const [autoRes, queueRes, runsRes] = await Promise.all([automationsQuery, queueQuery, runsQuery]);

        return res.status(200).json({
          success: true,
          configured: true,
          automations: autoRes.data || [],
          queue: queueRes.data || [],
          runs: runsRes.data || [],
          recentExecutionLogs: runsRes.data || [],
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        return res.status(500).json({
          error: 'Failed to fetch automations',
          message: err?.message || 'Database query error.',
        });
      }
    }

    if (req.method !== 'POST' && req.method !== 'PATCH') {
      return res.status(405).json({
        error: 'Method Not Allowed',
        message: 'Supported methods: GET, POST, PATCH',
      });
    }

    try {
      const body = req.body || {};
      const action = body.action as string | undefined;

      // -------------------------------------------------------------------------
      // Action 1: Create new Recurring / One-Time Automation Schedule
      // -------------------------------------------------------------------------
      if (action === 'create_automation') {
        if (!auth.userId) {
          return res.status(401).json({ error: 'User session required to create automations.' });
        }
        const name = String(body.name || '').trim();
        const description = String(body.description || '').trim();
        const actionType = String(body.action_type || 'task_deadline_scan').trim();
        const triggerType = body.trigger_type === 'one_time' ? 'one_time' : body.trigger_type === 'manual' ? 'manual' : 'cron';
        const timezone = String(body.timezone || 'Asia/Kolkata').trim();
        const cronExpression = String(body.cron_expression || '0 7 * * *').trim();
        const scheduledForRaw = body.scheduled_for ? String(body.scheduled_for) : null;
        const requiresApproval = Boolean(body.requires_approval);
        const actionConfig = body.action_config && typeof body.action_config === 'object' ? body.action_config : {};

        if (!name || !actionType) {
          return res.status(400).json({ error: 'Both name and action_type are required.' });
        }

        let nextRunIso: string | null = null;
        let scheduledForIso: string | null = null;

        if (triggerType === 'cron') {
          if (!isValidCronExpression(cronExpression)) {
            return res.status(400).json({
              error: `Invalid 5-field cron expression: "${cronExpression}"`,
            });
          }
          nextRunIso = computeNextCronRun(cronExpression, new Date(), timezone).toISOString();
        } else if (triggerType === 'one_time') {
          const parsed = scheduledForRaw ? new Date(scheduledForRaw) : null;
          if (!parsed || Number.isNaN(parsed.getTime())) {
            return res.status(400).json({ error: 'Valid ISO scheduled_for timestamp is required for one_time schedules.' });
          }
          scheduledForIso = parsed.toISOString();
          nextRunIso = scheduledForIso;
        }

        const { data: created, error: createErr } = await dbClient
          .from('automations')
          .insert({
            user_id: auth.userId,
            name,
            description,
            trigger_type: triggerType,
            schedule_type: triggerType === 'one_time' ? 'one_time' : 'recurring',
            cron_expression: triggerType === 'cron' ? cronExpression : null,
            timezone,
            scheduled_for: scheduledForIso,
            next_run_at: nextRunIso,
            requires_approval: requiresApproval,
            trigger_config: {
              cron_expression: triggerType === 'cron' ? cronExpression : undefined,
              scheduled_for: scheduledForIso || undefined,
              timezone,
              next_run_at: nextRunIso || undefined,
            },
            action_type: actionType,
            action_config: actionConfig,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createErr || !created) {
          return res.status(400).json({
            error: createErr?.message || 'Failed to create automation.',
          });
        }

        return res.status(201).json({ success: true, automation: created });
      }

      // -------------------------------------------------------------------------
      // Action 2: Pause / Resume Automation
      // -------------------------------------------------------------------------
      if (action === 'toggle_status') {
        if (!auth.userId || !body.automation_id) {
          return res.status(400).json({ error: 'automation_id and authenticated user are required.' });
        }
        const nextStatus = body.status === 'paused' ? 'paused' : 'active';
        const { data: updated, error: upErr } = await dbClient
          .from('automations')
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq('id', body.automation_id)
          .eq('user_id', auth.userId)
          .select()
          .single();

        if (upErr || !updated) {
          return res.status(404).json({ error: upErr?.message || 'Automation not found for current user.' });
        }
        return res.status(200).json({ success: true, automation: updated });
      }

      // -------------------------------------------------------------------------
      // Action 3: Human-in-the-loop Approval / Rejection / Manual Retry of Queue Jobs
      // -------------------------------------------------------------------------
      if (action === 'approve_job' || action === 'reject_job' || action === 'retry_job') {
        if (!auth.userId || !body.queue_job_id) {
          return res.status(400).json({ error: 'queue_job_id and authenticated user are required.' });
        }
        const nowISO = new Date().toISOString();

        if (action === 'reject_job') {
          const { data: rejected, error: rejErr } = await dbClient
            .from('automation_queue')
            .update({
              approval_status: 'rejected',
              status: 'cancelled',
              approved_by: auth.userId,
              approved_at: nowISO,
              completed_at: nowISO,
              error_message: 'Rejected by user approval review.',
            })
            .eq('id', body.queue_job_id)
            .eq('user_id', auth.userId)
            .select()
            .single();

          if (rejErr || !rejected) {
            return res.status(404).json({ error: rejErr?.message || 'Queue job not found.' });
          }
          return res.status(200).json({ success: true, queue_job: rejected });
        }

        const updateFields =
          action === 'approve_job'
            ? {
                approval_status: 'approved',
                approved_by: auth.userId,
                approved_at: nowISO,
                status: 'pending',
                scheduled_for: nowISO,
              }
            : {
                status: 'pending',
                scheduled_for: nowISO,
                error_message: null,
              };

        const { data: updatedJob, error: updErr } = await dbClient
          .from('automation_queue')
          .update(updateFields)
          .eq('id', body.queue_job_id)
          .eq('user_id', auth.userId)
          .select()
          .single();

        if (updErr || !updatedJob) {
          return res.status(404).json({ error: updErr?.message || 'Queue job not found.' });
        }

        const execRes = await processDueQueueJobs(dbClient, executeAutomationRun, {
          now: new Date(),
          limit: 5,
        });

        return res.status(200).json({
          success: true,
          queue_job: updatedJob,
          executed: execRes.executedRuns,
        });
      }

      // -------------------------------------------------------------------------
      // Default POST: Enqueue & Dispatch Immediate Execution (with Idempotency)
      // -------------------------------------------------------------------------
      const {
        automation_id,
        action_type,
        trigger_source = 'manual',
        idempotency_key: bodyIdempKey,
      } = body;
      const input_payload = body.input_payload ?? body.payload ?? {};

      const idempotencyKey =
        req.headers?.['idempotency-key'] ||
        bodyIdempKey ||
        `dispatch_${automation_id || action_type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      if (!action_type && !automation_id) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Either "automation_id" or "action_type" must be provided.',
        });
      }

      let targetAutomationId = automation_id;
      let targetActionType = action_type;
      let actionConfig: Record<string, any> = {};
      let requiresApproval = Boolean(body.requires_approval);
      let effectiveUserId = auth.userId;

      if (automation_id) {
        let query = dbClient.from('automations').select('*').eq('id', automation_id);
        if (auth.userId) {
          query = query.eq('user_id', auth.userId);
        }
        const { data: auto, error: autoErr } = await query.single();

        if (autoErr || !auto) {
          return res.status(404).json({
            error: 'Not Found',
            message: 'Automation not found or does not belong to the authenticated user.',
          });
        }
        targetActionType = auto.action_type || targetActionType;
        actionConfig = auto.action_config || {};
        requiresApproval = Boolean(auto.requires_approval);
        if (!effectiveUserId && auto.user_id) {
          effectiveUserId = auto.user_id;
        }
      }

      if (!targetActionType || !effectiveUserId) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Authenticated user and action_type are required.',
        });
      }

      // Database-backed idempotency check scoped to user
      const { data: existingRun } = await dbClient
        .from('automation_runs')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', effectiveUserId)
        .single();

      if (existingRun) {
        return res.status(200).json({
          success: true,
          idempotent: true,
          run_id: existingRun.id,
          status: existingRun.status,
          duration_ms: existingRun.duration_ms || 0,
          records_affected: existingRun.records_affected || 0,
          message: `Existing execution run returned for idempotency key: ${idempotencyKey}`,
          run: existingRun,
        });
      }

      const { data: existingQueue } = await dbClient
        .from('automation_queue')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', effectiveUserId)
        .single();

      if (existingQueue) {
        return res.status(200).json({
          success: true,
          idempotent: true,
          queued: true,
          queue_job: existingQueue,
          message: `Existing queue job returned for idempotency key: ${idempotencyKey}`,
        });
      }

      const queueJob = await enqueueAutomationJob(
        {
          automation_id: targetAutomationId || undefined,
          user_id: effectiveUserId,
          action_type: targetActionType,
          trigger_source,
          payload: { ...actionConfig, ...input_payload },
          priority: 2,
          approval_status: requiresApproval ? 'pending_approval' : 'auto_approved',
          idempotency_key: idempotencyKey,
        },
        dbClient
      );

      if (requiresApproval) {
        await dbClient.from('notifications').insert({
          user_id: effectiveUserId,
          title: `Approval Required: ${targetActionType}`,
          message: `Automation job queued for manual confirmation before execution.`,
          type: 'system',
          priority: 'high',
          action_link: 'automations',
          read: false,
          created_at: new Date().toISOString(),
        });

        return res.status(202).json({
          success: true,
          queued: true,
          requires_approval: true,
          status: 'pending_approval',
          queue_job: queueJob,
          message: 'Job queued and awaiting human approval before execution.',
        });
      }

      // Claim queue job & create automation_runs row
      await dbClient
        .from('automation_queue')
        .update({ status: 'processing', started_at: new Date().toISOString() })
        .eq('id', queueJob.id);

      const { data: runRecord, error: runErr } = await dbClient
        .from('automation_runs')
        .insert({
          automation_id: targetAutomationId || null,
          queue_job_id: queueJob.id,
          user_id: effectiveUserId,
          trigger_source,
          status: 'queued',
          input_payload,
          idempotency_key: idempotencyKey,
        })
        .select()
        .single();

      if (runErr || !runRecord?.id) {
        throw new Error(`Failed to persist automation_runs record: ${runErr?.message || 'Unknown DB error'}`);
      }

      const execution = await executeAutomationRun(
        {
          run_id: runRecord.id,
          automation_id: targetAutomationId,
          user_id: effectiveUserId,
          action_type: targetActionType,
          action_config: actionConfig,
          input_payload,
          trigger_source,
          max_retries: 0,
        },
        dbClient
      );

      const doneISO = new Date().toISOString();
      await dbClient
        .from('automation_queue')
        .update({
          status: execution.status === 'completed' ? 'completed' : 'failed',
          completed_at: doneISO,
          result_payload: execution.output_payload || {},
          error_message: execution.error_log || null,
        })
        .eq('id', queueJob.id);

      return res.status(200).json({
        success: execution.status === 'completed',
        idempotent: false,
        queue_job_id: queueJob.id,
        run_id: execution.run_id,
        status: execution.status,
        duration_ms: execution.duration_ms,
        records_affected: execution.records_affected,
        output: execution.output_payload,
        error: execution.error_log || undefined,
        result: {
          id: execution.run_id,
          automation_id: targetAutomationId,
          trigger_source,
          action_type: targetActionType,
          status: execution.status,
          duration_ms: execution.duration_ms,
          records_affected: execution.records_affected,
          output_payload: execution.output_payload,
          error_log: execution.error_log,
          created_at: doneISO,
        },
      });
    } catch (error: any) {
      console.error('[Dispatcher] Fatal unhandled error:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: error?.message || 'Failed to dispatch automation execution.',
      });
    }
  };
}

export default createDispatchHandler();
