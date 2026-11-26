// Vercel Serverless Function: Unified Integrations Synchronizer & Live Connectors
// Endpoint: /api/integrations/sync
// - POST (auth required): Bidirectional sync across Google Tasks and NeoSapien MCP.
// - GET ?action=research&q=...: Real zero-key arXiv + OpenAlex + Crossref academic feed.
// - GET ?action=dev_status&repo=...: Real GitHub REST + Vercel deployment telemetry.

import { isServerSupabaseConfigured, supabaseServer } from '../_lib/db.ts';
import { getUserIdFromRequest, getAuthenticatedGoogleOAuthClient } from './google-tasks.ts';
import { getNeoSapienToken, executeMcpJsonRpc } from './neosapien.ts';
import { google } from 'googleapis';
import { applyCors } from '../_lib/http.ts';
import { fetchResearchIntelligence } from '../_lib/researchConnectors.ts';
import { fetchDevMonitorReport } from '../_lib/devMonitor.ts';

export function createIntegrationsSyncHandler(fetchImpl: typeof fetch = fetch) {
  return async function handler(req: any, res: any) {
    applyCors(req, res, 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const action = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;

    if (req.method === 'GET' && action === 'research') {
      const qParam = Array.isArray(req.query?.q) ? req.query.q[0] : req.query?.q;
      const feed = await fetchResearchIntelligence(String(qParam || ''), fetchImpl);
      return res.status(200).json(feed);
    }

    if (req.method === 'GET' && action === 'dev_status') {
      const repoParam = Array.isArray(req.query?.repo) ? req.query.repo[0] : req.query?.repo;
      const report = await fetchDevMonitorReport({
        repo: repoParam ? String(repoParam) : undefined,
        env: process.env,
        fetchImpl,
      });
      return res.status(200).json({ success: true, ...report });
    }

  if (!isServerSupabaseConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Server Database Not Configured',
      message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables.',
    });
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Valid Supabase Bearer session is required.',
    });
  }

  const startTime = Date.now();

  const results: {
    googleTasks?: any;
    neoSapien?: any;
    errors: string[];
  } = {
    errors: [],
  };

  // 1. Synchronize Google Tasks (if connected)
  try {
    const { oauth2Client, tokenRecord } = await getAuthenticatedGoogleOAuthClient(userId);
    const tasksService = google.tasks({ version: 'v1', auth: oauth2Client });

    // Fetch remote tasks
    const remoteResp = await tasksService.tasks.list({
      tasklist: '@default',
      showCompleted: true,
      showHidden: true,
      maxResults: 100,
    });
    const remoteTasks = remoteResp.data.items || [];

    // Fetch local tasks
    const { data: localTasks } = await supabaseServer
      .from('tasks')
      .select('*')
      .eq('user_id', userId);

    const localList = localTasks || [];
    const remoteMap = new Map<string, any>();
    remoteTasks.forEach((rt) => {
      if (rt.id) remoteMap.set(rt.id, rt);
    });

    let createdInGoogle = 0;
    let createdInHub = 0;

    // Push local unmapped tasks to Google
    for (const lt of localList) {
      if (!lt.google_task_id) {
        try {
          const created = await tasksService.tasks.insert({
            tasklist: '@default',
            requestBody: {
              title: lt.text,
              notes: lt.notes || lt.description || undefined,
              due: lt.due_date ? new Date(lt.due_date).toISOString() : undefined,
              status: lt.done ? 'completed' : 'needsAction',
            },
          });
          if (created.data.id) {
            await supabaseServer
              .from('tasks')
              .update({
                google_task_id: created.data.id,
                synced: true,
                last_synced_at: new Date().toISOString(),
              })
              .eq('id', lt.id);
            createdInGoogle++;
          }
        } catch (e: any) {
          console.warn('[Sync API] Error pushing task to Google:', e.message);
        }
      }
    }

    // Pull unmapped remote tasks to Hub
    const existingGoogleIds = new Set(localList.map((t) => t.google_task_id).filter(Boolean));
    for (const rt of remoteTasks) {
      if (rt.id && !existingGoogleIds.has(rt.id)) {
        const dueDate = rt.due ? new Date(rt.due).toISOString().slice(0, 10) : null;
        await supabaseServer.from('tasks').insert({
          user_id: userId,
          text: rt.title || 'Imported Google Task',
          description: rt.notes || null,
          done: rt.status === 'completed',
          due_date: dueDate,
          area: 'Personal',
          priority: 'medium',
          google_task_id: rt.id,
          synced: true,
          last_synced_at: new Date().toISOString(),
        });
        createdInHub++;
      }
    }

    results.googleTasks = {
      connected: true,
      accountEmail: tokenRecord.account_email,
      totalRemote: remoteTasks.length,
      totalLocal: localList.length,
      createdInGoogle,
      createdInHub,
    };
  } catch (err: any) {
    results.googleTasks = {
      connected: false,
      message: err.message,
    };
    results.errors.push(`Google Tasks: ${err.message}`);
  }

  // 2. Synchronize NeoSapien MCP (if connected)
  try {
    const neoToken = await getNeoSapienToken(userId, req);
    if (neoToken) {
      const rpcResult = await executeMcpJsonRpc('https://api.neosapien.xyz/mcp', neoToken, 'tools/list');
      const tools = rpcResult?.result?.tools || [];

      results.neoSapien = {
        connected: true,
        endpoint: 'https://api.neosapien.xyz/mcp',
        toolsDiscovered: tools.length,
      };

      await supabaseServer.from('neosapien_sync_history').insert({
        user_id: userId,
        sync_method: 'manual',
        status: 'success',
        records_imported: tools.length,
        details: `Manual sync discovered ${tools.length} NeoSapien MCP tools in ${Date.now() - startTime}ms.`,
        created_at: new Date().toISOString(),
      });
    } else {
      results.neoSapien = {
        connected: false,
        message: 'No active NeoSapien token configured.',
      };
    }
  } catch (err: any) {
    results.neoSapien = {
      connected: false,
      message: err.message,
    };
    results.errors.push(`NeoSapien MCP: ${err.message}`);
  }

  const bothDisconnected = !results.googleTasks?.connected && !results.neoSapien?.connected;
    return res.status(bothDisconnected && results.errors.length > 0 ? 502 : 200).json({
      success: results.errors.length === 0 || !bothDisconnected,
      results,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  };
}

export default createIntegrationsSyncHandler();
