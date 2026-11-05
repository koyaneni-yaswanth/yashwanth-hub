// Vercel Serverless Function: Hub Automations Registry & Audit Log API
// Endpoint: /api/automations
// Hard Constraint 2: Every automation execution MUST take place on the server via Supabase Functions or Vercel API routes.
// Hard Constraint 4: No optimistic success indicators without database execution records.

import { supabaseServer } from './db';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  let userId: string | undefined = undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const { data: { user } } = await supabaseServer.auth.getUser(token);
    if (user) {
      userId = user.id;
    }
  }

  try {
    if (req.method === 'GET') {
      // 1. Fetch Automations
      let automationsQuery = supabaseServer
        .from('hub_automations')
        .select('*')
        .order('created_at', { ascending: false });

      if (userId) {
        automationsQuery = automationsQuery.eq('user_id', userId);
      }

      // 2. Fetch Recent Execution Logs
      let logsQuery = supabaseServer
        .from('automation_execution_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (userId) {
        logsQuery = logsQuery.eq('user_id', userId);
      }

      const [autoRes, logsRes] = await Promise.all([automationsQuery, logsQuery]);

      return res.status(200).json({
        success: true,
        automations: autoRes.data || [],
        recentExecutionLogs: logsRes.data || [],
        timestamp: new Date().toISOString(),
      });
    }

    if (req.method === 'POST') {
      const { name, slug, description, trigger_type, cron_expression, action_type, configuration, is_enabled } = req.body || {};

      if (!name || !slug || !action_type) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Missing required fields: "name", "slug", "action_type"',
        });
      }

      const { data, error } = await supabaseServer
        .from('hub_automations')
        .upsert({
          user_id: userId || null,
          name,
          slug,
          description: description || null,
          trigger_type: trigger_type || 'cron',
          cron_expression: cron_expression || '0 * * * *',
          action_type,
          configuration: configuration || {},
          is_enabled: is_enabled !== undefined ? is_enabled : true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,slug' })
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          error: 'Database Error',
          message: error.message,
        });
      }

      return res.status(200).json({
        success: true,
        automation: data,
      });
    }

    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Supported methods: GET, POST',
    });
  } catch (error: any) {
    console.error('[Automations API] Error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Error handling automation registry request.',
    });
  }
}
