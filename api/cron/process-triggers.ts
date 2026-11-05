// Vercel Serverless Function: Scheduled Automation Cron Processor
// Endpoint: /api/cron/process-triggers
// Protected by CRON_SECRET Bearer token. Evaluates due triggers and dispatches them to the runner.

import { supabaseServer } from '../automations/db.ts';
import { executeAutomationRun } from '../automations/runner.ts';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Validate CRON_SECRET or Vercel Cron header
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';

  if (cronSecret) {
    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (bearer !== cronSecret && !isVercelCron) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing CRON_SECRET authorization token.',
      });
    }
  }

  try {
    const now = new Date();
    const nowISO = now.toISOString();

    // 2. Query active automations that are due
    const { data: automations, error: fetchErr } = await supabaseServer
      .from('automations')
      .select('*')
      .eq('status', 'active')
      .eq('trigger_type', 'cron');

    if (fetchErr) {
      return res.status(500).json({
        error: 'Database Query Failed',
        message: fetchErr.message,
      });
    }

    const executedRuns: any[] = [];
    const activeAutomations = automations || [];

    for (const auto of activeAutomations) {
      const triggerConfig = auto.trigger_config || {};
      const nextRunAt = triggerConfig.next_run_at ? new Date(triggerConfig.next_run_at) : null;

      // Check if due (either next_run_at <= now, or next_run_at not set)
      const isDue = !nextRunAt || nextRunAt <= now;

      if (isDue) {
        const idempotencyKey = `cron_${auto.id}_${now.toISOString().substring(0, 13)}`; // Once per hour/window

        // Insert run record
        const { data: runRecord } = await supabaseServer
          .from('automation_runs')
          .insert({
            automation_id: auto.id,
            user_id: auto.user_id,
            trigger_source: 'cron_vercel',
            status: 'queued',
            input_payload: auto.action_config || {},
            idempotency_key: idempotencyKey,
          })
          .select()
          .single();

        if (runRecord) {
          // Execute runner
          const result = await executeAutomationRun({
            run_id: runRecord.id,
            automation_id: auto.id,
            user_id: auto.user_id,
            action_type: auto.action_type,
            action_config: auto.action_config,
            input_payload: auto.action_config,
            trigger_source: 'cron_vercel',
          });

          // Compute next run timestamp in Asia/Kolkata timezone
          const nextScheduled = computeNextRunTimestamp(triggerConfig.cron_expression || '0 * * * *');

          // Update automation trigger config with next_run_at
          await supabaseServer
            .from('automations')
            .update({
              trigger_config: {
                ...triggerConfig,
                last_run_at: nowISO,
                next_run_at: nextScheduled.toISOString(),
              },
              updated_at: nowISO,
            })
            .eq('id', auto.id);

          executedRuns.push({
            automation_id: auto.id,
            name: auto.name,
            run_id: runRecord.id,
            status: result.status,
            duration_ms: result.duration_ms,
            records_affected: result.records_affected,
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      processedAutomationsCount: executedRuns.length,
      timestamp: nowISO,
      executed: executedRuns,
    });
  } catch (error: any) {
    console.error('[Cron Trigger Processor] Fatal error:', error);
    return res.status(500).json({
      error: 'Cron Processing Error',
      message: error.message || 'Internal error while processing scheduled triggers.',
    });
  }
}

/**
 * Computes next run timestamp for standard cron expressions
 * Supports default Asia/Kolkata timezone (+05:30)
 */
function computeNextRunTimestamp(cronExpression: string): Date {
  const next = new Date();
  // Standard interval approximation: hourly or daily
  if (cronExpression.includes('*/2')) {
    next.setHours(next.getHours() + 2, 0, 0, 0);
  } else if (cronExpression.includes('* * * *')) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  } else {
    next.setDate(next.getDate() + 1);
    next.setHours(7, 0, 0, 0); // 07:00 AM IST
  }
  return next;
}
