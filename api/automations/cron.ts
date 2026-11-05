// Vercel Serverless Function: Scheduled Automation Cron Handler
// Endpoint: /api/automations/cron
// Hard Constraint 3: Scheduled triggers MUST rely on vercel.json cron jobs or Supabase pg_cron, never browser intervals.
// Hard Constraint 5: Secrets (CRON_SECRET) must remain in server environment variables.

import { supabaseServer } from './db';
import { executeAutomation } from './executor';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Security Check: Validate CRON_SECRET or Vercel Cron header
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers['x-vercel-cron'] === '1';

  // If CRON_SECRET is configured, enforce Bearer authentication unless verified Vercel Cron internal header
  if (cronSecret) {
    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (bearer !== cronSecret && !isVercelCron) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or missing CRON_SECRET authorization token.',
      });
    }
  }

  const requestedAction = req.query.action || (req.body && req.body.action);
  const results: any[] = [];

  try {
    if (requestedAction) {
      // Execute targeted action specified in cron URL (e.g. /api/automations/cron?action=task_deadline_scan)
      const execution = await executeAutomation({
        action_type: requestedAction,
        trigger_source: 'cron_vercel',
        payload: { source: 'vercel_cron', timestamp: new Date().toISOString() },
      });
      results.push(execution);
    } else {
      // Query active, enabled automations from database
      const { data: automations, error } = await supabaseServer
        .from('hub_automations')
        .select('*')
        .eq('is_enabled', true)
        .eq('trigger_type', 'cron');

      if (error) {
        console.warn('[Automation Cron] Could not query hub_automations:', error.message);
      }

      const activeList = automations && automations.length > 0
        ? automations
        : [
            { slug: 'task-meeting-scanner', action_type: 'task_deadline_scan' },
            { slug: 'executive-morning-briefing', action_type: 'morning_briefing' },
          ];

      for (const auto of activeList) {
        const execution = await executeAutomation({
          automation_id: auto.id,
          user_id: auto.user_id,
          action_type: auto.action_type,
          trigger_source: 'cron_vercel',
          payload: auto.configuration || {},
        });
        results.push(execution);

        // Update last_run_at in database
        if (auto.id) {
          await supabaseServer
            .from('hub_automations')
            .update({ last_run_at: new Date().toISOString() })
            .eq('id', auto.id);
        }
      }
    }

    return res.status(200).json({
      success: true,
      executedCount: results.length,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    console.error('[Automation Cron] Fatal error:', error);
    return res.status(500).json({
      error: 'Cron Execution Failed',
      message: error.message || 'Internal server error during scheduled automation run.',
    });
  }
}
