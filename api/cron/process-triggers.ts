// Vercel Serverless Function: Durable Scheduled Automation Cron Processor
// Endpoint: /api/cron/process-triggers
// Protected by CRON_SECRET Bearer token (or explicit Vercel Cron invocation when configured).
// Enqueues due recurring & one-time schedules into public.automation_queue,
// respects approval gating, and executes due jobs with backoff retries.

import { isServerSupabaseConfigured, supabaseServer } from '../_lib/db.ts';
import { processAutomationTick } from '../_lib/queueEngine.ts';
import { executeAutomationRun } from '../_lib/runner.ts';

export function createCronTriggersHandler(dbClient: any = supabaseServer) {
  return async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // 1. Validate CRON_SECRET Bearer authorization
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const isVercelCron = req.headers?.['x-vercel-cron'] === '1';

    if (cronSecret) {
      if (bearer !== cronSecret) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid or missing CRON_SECRET authorization token.',
        });
      }
    } else if (process.env.VERCEL === '1' && !isVercelCron) {
      return res.status(503).json({
        error: 'Server Misconfigured',
        configured: false,
        message: 'CRON_SECRET is not configured in Vercel Environment Variables.',
      });
    }

    // 2. Ensure server Supabase database is configured (fail honestly instead of silent fallback)
    if (dbClient === supabaseServer && !isServerSupabaseConfigured()) {
      return res.status(503).json({
        error: 'Server Database Not Configured',
        configured: false,
        message:
          'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in Vercel Environment Variables before cron jobs can read or persist automation state.',
      });
    }

    try {
      const summary = await processAutomationTick(dbClient, executeAutomationRun, {
        now: new Date(),
        timeZone: 'Asia/Kolkata',
      });

      return res.status(200).json({
        success: true,
        ...summary,
        processedAutomationsCount: summary.executedCount,
        executed: summary.executedRuns,
      });
    } catch (error: any) {
      console.error('[Cron Trigger Processor] Fatal error:', error);
      return res.status(500).json({
        error: 'Cron Processing Error',
        message: error?.message || 'Internal error while processing scheduled triggers.',
      });
    }
  };
}

export default createCronTriggersHandler();
