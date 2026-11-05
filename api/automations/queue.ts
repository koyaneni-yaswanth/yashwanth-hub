// Vercel Serverless Function: Durable Automation Queue Processor
// Endpoint: /api/automations/queue
// Hard Constraint 2: Every automation execution MUST take place on the server.
// Hard Constraint 4: No fake timers or mocked responses without database execution records.

import { supabaseServer } from './db';
import { executeAutomation } from './executor';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';

  // Protect queue drain from unauthorized external callers
  if (cronSecret) {
    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (bearer !== cronSecret && !isVercelCron) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid CRON_SECRET or service authorization required to process queue.',
      });
    }
  }

  try {
    const nowISO = new Date().toISOString();

    // 1. Fetch pending jobs from database queue
    const { data: pendingJobs, error: fetchErr } = await supabaseServer
      .from('automation_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', nowISO)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(10);

    if (fetchErr) {
      return res.status(500).json({
        error: 'Database Queue Fetch Error',
        message: fetchErr.message,
      });
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Automation queue is idle. No pending jobs due for execution.',
        processed: 0,
      });
    }

    const processedResults = [];

    // 2. Process each job with status locking
    for (const job of pendingJobs) {
      // Mark as processing
      await supabaseServer
        .from('automation_queue')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Execute on server
      const execution = await executeAutomation({
        automation_id: job.automation_id,
        user_id: job.user_id,
        action_type: job.action_type,
        trigger_source: 'pg_cron',
        payload: job.payload,
      });

      // Update queue job status
      if (execution.success) {
        await supabaseServer
          .from('automation_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      } else {
        const newRetry = (job.retry_count || 0) + 1;
        const willRetry = newRetry < (job.max_retries || 3);
        await supabaseServer
          .from('automation_queue')
          .update({
            status: willRetry ? 'pending' : 'failed',
            retry_count: newRetry,
            error_message: execution.error || 'Execution failed',
            scheduled_for: willRetry ? new Date(Date.now() + 60000 * newRetry).toISOString() : job.scheduled_for,
          })
          .eq('id', job.id);
      }

      processedResults.push({
        job_id: job.id,
        action_type: job.action_type,
        success: execution.success,
        duration_ms: execution.duration_ms,
        records_affected: execution.records_affected,
      });
    }

    return res.status(200).json({
      success: true,
      processedCount: processedResults.length,
      jobs: processedResults,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Automation Queue] Processor error:', error);
    return res.status(500).json({
      error: 'Queue Processing Failed',
      message: error.message || 'Server error while running queue.',
    });
  }
}
