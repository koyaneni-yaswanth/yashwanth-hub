// Vercel Serverless Function: NeoSapien Official MCP Handshake & Sync Engine
// Endpoint: /api/integrations/neosapien
// Target MCP Endpoint: https://api.neosapien.xyz/mcp

import crypto from 'node:crypto';
import {
  isServerSupabaseConfigured,
  resolveAuthenticatedUser,
  supabaseServer,
} from '../_lib/db.ts';

const NEOSAPIEN_MCP_ENDPOINT = 'https://api.neosapien.xyz/mcp';

export async function getNeoSapienToken(userId: string, req: any): Promise<string | null> {
  const explicitNeoHeader = req?.headers?.['x-neosapien-token'] || req?.headers?.['X-NeoSapien-Token'];
  if (typeof explicitNeoHeader === 'string' && explicitNeoHeader.trim()) {
    return explicitNeoHeader.trim();
  }

  const { data: tokenRecord } = await supabaseServer
    .from('integration_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'neosapien')
    .single();

  if (tokenRecord) {
    const token = tokenRecord.access_token || tokenRecord.encrypted_access_token;
    if (token) return token;
  }

  return (process.env.NEOSAPIEN_API_KEY || process.env.NEOSAPIEN_BEARER_TOKEN || '').trim() || null;
}

export async function executeMcpJsonRpc(endpoint: string, token: string, method: string, params: any = {}) {
  const payload = {
    jsonrpc: '2.0',
    id: `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    method,
    params,
  };

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`MCP Server responded with HTTP ${resp.status}: ${errText || resp.statusText}`);
  }

  return await resp.json();
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-NeoSapien-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isServerSupabaseConfigured()) {
    return res.status(503).json({
      success: false,
      connected: false,
      error: 'Server Database Not Configured',
      message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables.',
    });
  }

  const auth = await resolveAuthenticatedUser(req);
  if (!auth.authenticated || !auth.userId) {
    return res.status(401).json({
      success: false,
      connected: false,
      error: 'Unauthorized',
      message: auth.error || 'Valid Supabase user session token is required.',
    });
  }

  const userId = auth.userId;
  const action = req.query?.action || req.body?.action || 'handshake';
  const token = await getNeoSapienToken(userId, req);

  if (!token) {
    return res.status(401).json({
      success: false,
      connected: false,
      error: 'NeoSapien Token Missing',
      message: 'NeoSapien API key or OAuth token missing. Save token in Integrations -> NeoSapien.',
    });
  }

  try {
    // 1. ACTION: MCP Handshake & Tool Discovery (tools/list)
    if (action === 'handshake' || action === 'tools' || action === 'ping' || action === 'test') {
      const startTime = Date.now();
      let rpcResult: any;

      try {
        rpcResult = await executeMcpJsonRpc(NEOSAPIEN_MCP_ENDPOINT, token, 'tools/list');
      } catch (err: any) {
        await supabaseServer.from('neosapien_sync_history').insert({
          user_id: userId,
          sync_method: 'mcp',
          status: 'failed',
          records_imported: 0,
          error_message: err?.message || 'Handshake failed',
          created_at: new Date().toISOString(),
        });

        return res.status(502).json({
          success: false,
          connected: false,
          error: 'MCP Handshake Failed',
          message: err?.message || 'Unable to reach NeoSapien MCP',
          endpoint: NEOSAPIEN_MCP_ENDPOINT,
        });
      }

      const discoveredTools = rpcResult?.result?.tools || [];
      const latencyMs = Date.now() - startTime;
      const nowISO = new Date().toISOString();

      await supabaseServer.from('neosapien_connections').upsert(
        {
          user_id: userId,
          provider: 'neosapien',
          mcp_endpoint: NEOSAPIEN_MCP_ENDPOINT,
          status: 'connected',
          capabilities: discoveredTools,
          last_sync_at: nowISO,
          metadata: { latency_ms: latencyMs },
          updated_at: nowISO,
        },
        { onConflict: 'user_id,provider' }
      );

      await supabaseServer.from('neosapien_sync_history').insert({
        user_id: userId,
        sync_method: 'mcp',
        status: 'success',
        records_imported: discoveredTools.length,
        details: `MCP handshake discovered ${discoveredTools.length} tools in ${latencyMs}ms.`,
        created_at: nowISO,
      });

      return res.status(200).json({
        success: true,
        connected: true,
        endpoint: NEOSAPIEN_MCP_ENDPOINT,
        protocol: 'MCP 2024-11-05 (JSON-RPC 2.0)',
        toolsCount: discoveredTools.length,
        tools: discoveredTools,
        latencyMs,
        timestamp: nowISO,
      });
    }

    // 2. ACTION: Call MCP Tool
    if (action === 'call' || action === 'tools/call') {
      const { name, arguments: toolArgs } = req.body || {};
      if (!name) {
        return res.status(400).json({ error: 'Missing required "name" parameter for tool call.' });
      }

      const rpcResult = await executeMcpJsonRpc(NEOSAPIEN_MCP_ENDPOINT, token, 'tools/call', {
        name,
        arguments: toolArgs || {},
      });

      return res.status(200).json({
        success: true,
        tool: name,
        result: rpcResult.result || rpcResult,
      });
    }

    // 3. ACTION: Synchronize Task Context into neosapien_memories (exact schema columns)
    if (action === 'sync_task') {
      const { task_id, title, description, done, area } = req.body || {};
      const contextSummary = `Task [${done ? 'COMPLETED' : 'ACTIVE'}]: ${title}. ${description || ''} (Area: ${area || 'Personal'})`;
      const sourceRecordId = `task_${task_id || Date.now()}`;
      const contentHash = crypto.createHash('sha256').update(`${sourceRecordId}:${contextSummary}`).digest('hex').slice(0, 24);
      const nowISO = new Date().toISOString();

      const { data: memoryRecord, error: memErr } = await supabaseServer
        .from('neosapien_memories')
        .upsert(
          {
            user_id: userId,
            source_record_id: sourceRecordId,
            title: `Task Update: ${title || 'Untitled'}`,
            content_hash: contentHash,
            source: 'mcp_sync',
            platform: 'other',
            summary: contextSummary,
            transcript: contextSummary,
            associated_area: area || 'Personal',
            captured_at: nowISO,
            imported_at: nowISO,
            updated_at: nowISO,
          },
          { onConflict: 'user_id,source_record_id' }
        )
        .select()
        .single();

      if (memErr) {
        return res.status(400).json({ success: false, error: memErr.message });
      }

      return res.status(200).json({
        success: true,
        synchronized: true,
        memory: memoryRecord,
        timestamp: nowISO,
      });
    }

    return res.status(400).json({
      error: 'Invalid Action',
      message: `Unknown action "${action}". Valid actions: handshake, tools, ping, call, sync_task.`,
    });
  } catch (err: any) {
    console.error('[NeoSapien API Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'NeoSapien Integration Error',
      message: err?.message || 'Error communicating with NeoSapien MCP endpoint.',
    });
  }
}
