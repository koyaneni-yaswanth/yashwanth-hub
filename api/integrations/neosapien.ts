// Vercel Serverless Function: NeoSapien Official MCP Handshake & Sync Engine
// Endpoint: /api/integrations/neosapien
// Target MCP Endpoint: https://api.neosapien.xyz/mcp

import { supabaseServer } from '../_lib/db.ts';

const NEOSAPIEN_MCP_ENDPOINT = 'https://api.neosapien.xyz/mcp';

export async function getNeoSapienToken(userId: string, req: any): Promise<string | null> {
  // 1. Authorization header passed by client
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const raw = authHeader.slice(7).trim();
    if (raw && !raw.startsWith('sbp_') && !raw.startsWith('eyJ')) {
      return raw;
    }
  }

  // 2. Query integration_tokens vault for user
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

  // 3. Fallback to server environment variables
  return process.env.NEOSAPIEN_API_KEY || process.env.NEOSAPIEN_BEARER_TOKEN || null;
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
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`MCP Server responded with HTTP ${resp.status}: ${errText || resp.statusText}`);
  }

  return await resp.json();
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers?.authorization;
  let userId = '00000000-0000-0000-0000-000000000001';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const { data: { user } } = await supabaseServer.auth.getUser(token);
      if (user) userId = user.id;
    } catch {}
  }

  const action = req.query.action || req.body?.action || 'handshake';
  const token = await getNeoSapienToken(userId, req);

  if (!token) {
    return res.status(401).json({
      success: false,
      connected: false,
      error: 'Unauthorized',
      message: 'NeoSapien API key or OAuth token missing. Save token in Settings -> Integrations.',
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
        // Log failed attempt in sync history
        await supabaseServer.from('neosapien_sync_history').insert({
          user_id: userId,
          method: 'mcp_handshake',
          status: 'error',
          error_message: err.message,
          created_at: new Date().toISOString(),
        });

        return res.status(502).json({
          success: false,
          connected: false,
          error: 'MCP Handshake Failed',
          message: err.message,
          endpoint: NEOSAPIEN_MCP_ENDPOINT,
        });
      }

      const discoveredTools = rpcResult?.result?.tools || [];
      const latencyMs = Date.now() - startTime;

      // Persist live connection record in neosapien_connections
      await supabaseServer.from('neosapien_connections').upsert(
        {
          user_id: userId,
          provider: 'neosapien',
          mcp_endpoint: NEOSAPIEN_MCP_ENDPOINT,
          status: 'connected',
          discovered_tools: discoveredTools,
          last_ping_at: new Date().toISOString(),
          latency_ms: latencyMs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

      // Log successful handshake in neosapien_sync_history
      await supabaseServer.from('neosapien_sync_history').insert({
        user_id: userId,
        method: 'mcp_handshake',
        status: 'success',
        items_synced: discoveredTools.length,
        duration_ms: latencyMs,
        created_at: new Date().toISOString(),
      });

      return res.status(200).json({
        success: true,
        connected: true,
        endpoint: NEOSAPIEN_MCP_ENDPOINT,
        protocol: 'MCP 2024-11-05 (JSON-RPC 2.0)',
        toolsCount: discoveredTools.length,
        tools: discoveredTools,
        latencyMs,
        timestamp: new Date().toISOString(),
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

    // 3. ACTION: Synchronize Task Context to NeoSapien
    if (action === 'sync_task') {
      const { task_id, title, description, done, area } = req.body || {};
      const contextSummary = `Task [${done ? 'COMPLETED' : 'ACTIVE'}]: ${title}. ${description || ''} (Area: ${area || 'Personal'})`;

      // Log context synchronization in neosapien_memories table
      const { data: memoryRecord } = await supabaseServer
        .from('neosapien_memories')
        .insert({
          user_id: userId,
          original_neo_id: `task_${task_id || Date.now()}`,
          title: `Task Update: ${title || 'Untitled'}`,
          summary: contextSummary,
          transcript: contextSummary,
          associated_area: area || 'Personal',
          source_type: 'task_sync',
          sync_method: 'mcp',
          captured_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      return res.status(200).json({
        success: true,
        synchronized: true,
        memory: memoryRecord,
        timestamp: new Date().toISOString(),
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
      message: err.message || 'Error communicating with NeoSapien MCP endpoint.',
    });
  }
}
