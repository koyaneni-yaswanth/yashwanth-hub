// Durable Automation Queue Engine
// Handles due cron & one-time schedule enqueueing, idempotency deduplication,
// human approval gating, atomic claim locking, retry backoff, and failure notifications.

import { computeNextCronRun } from './cronParser.ts';
import type { AutomationJobInput, RunnerResult } from './runner.ts';

export type QueueRunnerFn = (job: AutomationJobInput, dbClient?: any) => Promise<RunnerResult>;

export function computeRetryBackoffMs(retryCount: number, baseBackoffMs = 30000): number {
  return baseBackoffMs * Math.pow(2, Math.max(0, retryCount));
}

export interface TickSummary {
  timestamp: string;
  enqueuedCount: number;
  skippedDuplicateCount: number;
  pendingApprovalCount: number;
  executedCount: number;
  retryScheduledCount: number;
  failedCount: number;
  executedRuns: Array<{
    queue_job_id: string;
    automation_id: string;
    run_id: string;
    action_type: string;
    status: string;
    duration_ms: number;
    records_affected: number;
    retry_count: number;
    next_retry_at?: string;
  }>;
}

/**
 * Evaluates active `cron` and `one_time` schedules and enqueues due jobs
 * into `public.automation_queue` with strict idempotency protection.
 */
export async function enqueueDueAutomations(
  db: any,
  options: { now?: Date; timeZone?: string } = {}
): Promise<{ enqueued: number; skippedDuplicates: number; pendingApproval: number }> {
  const now = options.now || new Date();
  const nowISO = now.toISOString();
  const defaultTz = options.timeZone || 'Asia/Kolkata';

  const { data: automations, error } = await db
    .from('automations')
    .select('*')
    .eq('status', 'active')
    .in('trigger_type', ['cron', 'one_time']);

  if (error) {
    throw new Error(`Failed to load active automations: ${error.message}`);
  }

  let enqueued = 0;
  let skippedDuplicates = 0;
  let pendingApproval = 0;

  for (const auto of automations || []) {
    const triggerConfig = auto.trigger_config || {};
    const tz = auto.timezone || triggerConfig.timezone || defaultTz;

    if (auto.trigger_type === 'one_time') {
      const scheduledIso = auto.scheduled_for || triggerConfig.scheduled_for || auto.next_run_at;
      if (!scheduledIso) continue;
      const scheduledDate = new Date(scheduledIso);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate > now) continue;

      const idempotencyKey = `once_${auto.id}`;
      const { data: existing } = await db
        .from('automation_queue')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle?.() ?? await db
          .from('automation_queue')
          .select('id')
          .eq('idempotency_key', idempotencyKey)
          .single();

      if (existing) {
        skippedDuplicates++;
        continue;
      }

      const requiresApproval = Boolean(auto.requires_approval);
      const { error: qErr } = await db.from('automation_queue').insert({
        automation_id: auto.id,
        user_id: auto.user_id,
        action_type: auto.action_type,
        trigger_source: 'one_time_schedule',
        status: 'pending',
        approval_status: requiresApproval ? 'pending_approval' : 'auto_approved',
        priority: 2,
        payload: auto.action_config || {},
        retry_count: 0,
        max_retries: Number.isInteger(auto.action_config?.max_retries) ? auto.action_config.max_retries : 3,
        scheduled_for: nowISO,
        idempotency_key: idempotencyKey,
      });

      if (!qErr) {
        enqueued++;
        if (requiresApproval) {
          pendingApproval++;
          await insertQueueNotification(db, auto.user_id, {
            title: `Approval Required: ${auto.name}`,
            message: `One-time scheduled automation (${auto.action_type}) is waiting in your approval queue.`,
            type: 'system',
            priority: 'high',
            action_link: 'automations',
          });
        }
        await db
          .from('automations')
          .update({
            status: 'completed',
            trigger_config: { ...triggerConfig, enqueued_at: nowISO },
            updated_at: nowISO,
          })
          .eq('id', auto.id);
      }
      continue;
    }

    // Recurring cron schedule evaluation
    const cronExpr = auto.cron_expression || triggerConfig.cron_expression || '0 * * * *';
    const nextRunIso = auto.next_run_at || triggerConfig.next_run_at;
    const nextRunDate = nextRunIso ? new Date(nextRunIso) : null;
    const isDue = !nextRunDate || nextRunDate <= now;
    if (!isDue) continue;

    const bucketRef = nextRunDate ? nextRunDate.toISOString().slice(0, 16) : nowISO.slice(0, 16);
    const idempotencyKey = `cron_${auto.id}_${bucketRef}`;

    const existingQuery = db
      .from('automation_queue')
      .select('id')
      .eq('idempotency_key', idempotencyKey);
    const { data: existing } =
      typeof existingQuery.maybeSingle === 'function'
        ? await existingQuery.maybeSingle()
        : await existingQuery.single();

    if (existing) {
      skippedDuplicates++;
      continue;
    }

    const requiresApproval = Boolean(auto.requires_approval);
    const { error: qErr } = await db.from('automation_queue').insert({
      automation_id: auto.id,
      user_id: auto.user_id,
      action_type: auto.action_type,
      trigger_source: 'cron_vercel',
      status: 'pending',
      approval_status: requiresApproval ? 'pending_approval' : 'auto_approved',
      priority: 1,
      payload: auto.action_config || {},
      retry_count: 0,
      max_retries: Number.isInteger(auto.action_config?.max_retries) ? auto.action_config.max_retries : 3,
      scheduled_for: nowISO,
      idempotency_key: idempotencyKey,
    });

    if (!qErr) {
      enqueued++;
      if (requiresApproval) {
        pendingApproval++;
        await insertQueueNotification(db, auto.user_id, {
          title: `Approval Required: ${auto.name}`,
          message: `Recurring automation (${auto.action_type}) queued and awaiting approval.`,
          type: 'system',
          priority: 'high',
          action_link: 'automations',
        });
      }

      const nextScheduled = computeNextCronRun(cronExpr, now, tz);
      const nextScheduledIso = nextScheduled.toISOString();
      await db
        .from('automations')
        .update({
          next_run_at: nextScheduledIso,
          trigger_config: {
            ...triggerConfig,
            cron_expression: cronExpr,
            timezone: tz,
            next_run_at: nextScheduledIso,
          },
          updated_at: nowISO,
        })
        .eq('id', auto.id);
    }
  }

  return { enqueued, skippedDuplicates, pendingApproval };
}

/**
 * Claims due approved jobs in `public.automation_queue` (`pending` or `retry_scheduled`)
 * and executes each once, persisting `automation_runs`, updating retry backoff or final state.
 */
export async function processDueQueueJobs(
  db: any,
  runner: QueueRunnerFn,
  options: { now?: Date; limit?: number; baseBackoffMs?: number } = {}
): Promise<{
  executedRuns: TickSummary['executedRuns'];
  retryScheduledCount: number;
  failedCount: number;
}> {
  const now = options.now || new Date();
  const nowISO = now.toISOString();
  const limit = options.limit ?? 15;
  const baseBackoffMs = options.baseBackoffMs ?? 30000;

  const { data: dueJobs, error } = await db
    .from('automation_queue')
    .select('*')
    .in('status', ['pending', 'retry_scheduled'])
    .in('approval_status', ['auto_approved', 'approved'])
    .lte('scheduled_for', nowISO)
    .order('priority', { ascending: false })
    .order('scheduled_for', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch queued jobs: ${error.message}`);
  }

  const executedRuns: TickSummary['executedRuns'] = [];
  let retryScheduledCount = 0;
  let failedCount = 0;

  for (const job of dueJobs || []) {
    // Atomic claim to prevent concurrent workers double-executing the same job
    const { data: claimed, error: claimErr } = await db
      .from('automation_queue')
      .update({
        status: 'processing',
        started_at: nowISO,
      })
      .eq('id', job.id)
      .in('status', ['pending', 'retry_scheduled'])
      .select()
      .single();

    if (claimErr || !claimed) {
      continue;
    }

    const attemptNumber = Number(job.retry_count || 0);
    const runIdempotency = job.idempotency_key
      ? `${job.idempotency_key}_attempt_${attemptNumber}`
      : `queue_${job.id}_attempt_${attemptNumber}`;

    const { data: runRecord } = await db
      .from('automation_runs')
      .insert({
        automation_id: job.automation_id || null,
        queue_job_id: job.id,
        user_id: job.user_id,
        trigger_source: job.trigger_source || 'cron_vercel',
        status: 'queued',
        input_payload: job.payload || {},
        retry_count: attemptNumber,
        idempotency_key: runIdempotency,
      })
      .select()
      .single();

    const runId = runRecord?.id || `run_${job.id}_${attemptNumber}`;

    let result: RunnerResult;
    try {
      result = await runner(
        {
          run_id: runId,
          automation_id: job.automation_id,
          user_id: job.user_id,
          action_type: job.action_type,
          action_config: job.payload || {},
          input_payload: job.payload || {},
          trigger_source: job.trigger_source || 'cron_vercel',
          max_retries: 0, // Backoff retry is managed durably in automation_queue
        },
        db
      );
    } catch (err: any) {
      result = {
        run_id: runId,
        status: 'failed',
        duration_ms: 0,
        records_affected: 0,
        output_payload: { error: err?.message || String(err) },
        error_log: err?.stack || err?.message || String(err),
        retry_count: attemptNumber,
      };
    }

    const doneAtISO = new Date().toISOString();

    if (result.status === 'completed') {
      await db
        .from('automation_queue')
        .update({
          status: 'completed',
          completed_at: doneAtISO,
          result_payload: result.output_payload || {},
          error_message: null,
        })
        .eq('id', job.id);

      if (job.automation_id) {
        await db
          .from('automations')
          .update({ last_run_at: doneAtISO, updated_at: doneAtISO })
          .eq('id', job.automation_id);
      }

      executedRuns.push({
        queue_job_id: job.id,
        automation_id: job.automation_id,
        run_id: runId,
        action_type: job.action_type,
        status: 'completed',
        duration_ms: result.duration_ms,
        records_affected: result.records_affected,
        retry_count: attemptNumber,
      });
      continue;
    }

    if (result.status === 'needs_authorization') {
      failedCount++;
      await db
        .from('automation_queue')
        .update({
          status: 'failed',
          completed_at: doneAtISO,
          result_payload: result.output_payload || {},
          error_message: result.error_log || 'Authorization required.',
        })
        .eq('id', job.id);

      await insertQueueNotification(db, job.user_id, {
        title: `Authorization Needed: ${job.action_type}`,
        message: result.error_log || 'Connect Google or NeoSapien in Integrations to resume this automation.',
        type: 'system',
        priority: 'high',
        action_link: 'integrations',
      });

      executedRuns.push({
        queue_job_id: job.id,
        automation_id: job.automation_id,
        run_id: runId,
        action_type: job.action_type,
        status: 'needs_authorization',
        duration_ms: result.duration_ms,
        records_affected: 0,
        retry_count: attemptNumber,
      });
      continue;
    }

    // Transient / Hard Failure handling with durable exponential backoff in queue
    const maxRetries = Number.isInteger(job.max_retries) ? job.max_retries : 3;
    if (attemptNumber < maxRetries) {
      const nextRetryCount = attemptNumber + 1;
      const backoffMs = computeRetryBackoffMs(attemptNumber, baseBackoffMs);
      const nextRetryAt = new Date(now.getTime() + backoffMs).toISOString();
      retryScheduledCount++;

      await db
        .from('automation_queue')
        .update({
          status: 'retry_scheduled',
          retry_count: nextRetryCount,
          scheduled_for: nextRetryAt,
          error_message: result.error_log || 'Scheduled retry after failure.',
        })
        .eq('id', job.id);

      executedRuns.push({
        queue_job_id: job.id,
        automation_id: job.automation_id,
        run_id: runId,
        action_type: job.action_type,
        status: 'retry_scheduled',
        duration_ms: result.duration_ms,
        records_affected: 0,
        retry_count: nextRetryCount,
        next_retry_at: nextRetryAt,
      });
    } else {
      failedCount++;
      await db
        .from('automation_queue')
        .update({
          status: 'failed',
          completed_at: doneAtISO,
          result_payload: result.output_payload || {},
          error_message: result.error_log || 'Maximum retry attempts exhausted.',
        })
        .eq('id', job.id);

      if (job.automation_id) {
        await db
          .from('automations')
          .update({ status: 'error', updated_at: doneAtISO })
          .eq('id', job.automation_id);
      }

      await insertQueueNotification(db, job.user_id, {
        title: `Automation Failed: ${job.action_type}`,
        message: `Failed permanently after ${attemptNumber} retries: ${String(result.error_log || 'Unknown error').slice(0, 160)}`,
        type: 'system',
        priority: 'high',
        action_link: 'automations',
      });

      executedRuns.push({
        queue_job_id: job.id,
        automation_id: job.automation_id,
        run_id: runId,
        action_type: job.action_type,
        status: 'failed',
        duration_ms: result.duration_ms,
        records_affected: 0,
        retry_count: attemptNumber,
      });
    }
  }

  return { executedRuns, retryScheduledCount, failedCount };
}

async function insertQueueNotification(
  db: any,
  userId: string,
  notif: { title: string; message: string; type: string; priority: string; action_link: string }
) {
  try {
    if (!userId) return;
    await db.from('notifications').insert({
      user_id: userId,
      title: notif.title,
      message: notif.message,
      type: notif.type,
      priority: notif.priority,
      action_link: notif.action_link,
      read: false,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal notification failure
  }
}

export async function processAutomationTick(
  db: any,
  runner: QueueRunnerFn,
  options: { now?: Date; timeZone?: string; limit?: number; baseBackoffMs?: number } = {}
): Promise<TickSummary> {
  const now = options.now || new Date();
  const enq = await enqueueDueAutomations(db, { now, timeZone: options.timeZone });
  const proc = await processDueQueueJobs(db, runner, {
    now,
    limit: options.limit,
    baseBackoffMs: options.baseBackoffMs,
  });

  return {
    timestamp: now.toISOString(),
    enqueuedCount: enq.enqueued,
    skippedDuplicateCount: enq.skippedDuplicates,
    pendingApprovalCount: enq.pendingApproval,
    executedCount: proc.executedRuns.length,
    retryScheduledCount: proc.retryScheduledCount,
    failedCount: proc.failedCount,
    executedRuns: proc.executedRuns,
  };
}
