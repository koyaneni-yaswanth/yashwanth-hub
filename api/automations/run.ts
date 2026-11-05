// Vercel Serverless Function: On-Demand Server-Side Automation Execution
// Endpoint: /api/automations/run
// Hard Constraint 1: NEVER execute automation logic in React components, hooks, or client state.
// Hard Constraint 2: Every automation execution MUST take place on the server via Supabase Functions or Vercel API routes.
// Hard Constraint 4: No fake timers, mocked responses, or optimistic success indicators without database execution records.

import { supabaseServer } from './db';
import { executeAutomation } from './executor';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST requests are supported at /api/automations/run',
    });
  }

  try {
    const authHeader = req.headers.authorization;
    let userId: string | undefined = undefined;

    // Resolve authenticated user from Bearer JWT if provided
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const { data: { user } } = await supabaseServer.auth.getUser(token);
      if (user) {
        userId = user.id;
      }
    }

    const { action_type, automation_id, payload } = req.body || {};

    if (!action_type) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing required parameter: "action_type" (e.g., "task_deadline_scan", "morning_briefing", "neosapien_sync")',
      });
    }

    // Execute strictly on the server
    const execution = await executeAutomation({
      action_type,
      automation_id,
      user_id: userId,
      trigger_source: 'manual',
      payload: payload || {},
    });

    if (!execution.success) {
      return res.status(500).json({
        success: false,
        error: 'Automation Execution Failed',
        details: execution.error,
        log_id: execution.log_id,
        duration_ms: execution.duration_ms,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Automation "${action_type}" successfully executed on server.`,
      result: execution,
    });
  } catch (error: any) {
    console.error('[Automation Run] Execution error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Error occurred while running automation.',
    });
  }
}
