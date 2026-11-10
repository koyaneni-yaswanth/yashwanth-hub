// Vercel Serverless Function: NeoSapien Official MCP Server Protocol & Signed Webhook Receiver
// Endpoint: /api/neosapien/mcp
// Features:
// - Genuine MCP JSON-RPC 2.0 (initialize + tools/list + tools/call) with NO fabricated fallback tools
// - Strict HMAC-SHA256 X-NeoSapien-Signature webhook verification + replay window check
// - Verified Supabase persistence into public.neosapien_memories & public.neosapien_sync_history

import crypto from 'node:crypto';
import { isServerSupabaseConfigured, supabaseServer } from '../_lib/db.ts';

const NEOSAPIEN_BASE_URL = 'https://api.neosapien.xyz';
const MCP_ENDPOINT = `${NEOSAPIEN_BASE_URL}/mcp`;

export function verifyNeoSapienWebhookSignature(
  rawBody: string,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  secret: string,
  nowMs: number = Date.now()
): { valid: boolean; reason?: string } {
  if (!secret) {
    return { valid: false, reason: 'Webhook secret not configured.' };
  }
  if (!timestampHeader || !signatureHeader) {
    return { valid: false, reason: 'Missing X-NeoSapien-Timestamp or X-NeoSapien-Signature header.' };
  }

  const tsNum = Number(timestampHeader);
  if (!Number.isFinite(tsNum)) {
    return { valid: false, reason: 'Invalid X-NeoSapien-Timestamp format.' };
  }

  const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
  if (Math.abs(nowMs - tsMs) > 5 * 60 * 1000) {
    return { valid: false, reason: 'Webhook timestamp outside 5-minute replay tolerance.' };
  }

  const cleanSig = signatureHeader.trim().replace(/^sha256=/i, '').toLowerCase();
  const signedPayload = `${timestampHeader}.${rawBody}`;
  const expectedHex = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex').toLowerCase();

  if (cleanSig.length !== expectedHex.length) {
    return { valid: false, reason: 'HMAC signature length mismatch.' };
  }

  const ok = crypto.timingSafeEqual(Buffer.from(cleanSig, 'utf8'), Buffer.from(expectedHex, 'utf8'));
  return ok ? { valid: true } : { valid: false, reason: 'HMAC signature verification failed.' };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-NeoSapien-Signature, X-NeoSapien-Timestamp, X-NeoSapien-Event, X-NeoSapien-Delivery');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query?.action || (req.body && req.body.action) || 'status';

  // ---------------------------------------------------------------------------
  // 1. WEBHOOK INGESTION (Authenticated via HMAC-SHA256 signature, no user Bearer)
  // ---------------------------------------------------------------------------
  if (action === 'webhook') {
    const webhookSecret = (process.env.NEOSAPIEN_WEBHOOK_SECRET || '').trim();
    if (!webhookSecret) {
      return res.status(503).json({
        success: false,
        error: 'Webhook Secret Not Configured',
        message: 'Set NEOSAPIEN_WEBHOOK_SECRET in server environment variables before accepting webhooks.',
      });
    }

    if (!isServerSupabaseConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Server Database Not Configured',
        message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to persist webhook memories.',
      });
    }

    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const timestampHeader = (req.headers?.['x-neosapien-timestamp'] || req.headers?.['X-NeoSapien-Timestamp']) as string | undefined;
    const signatureHeader = (req.headers?.['x-neosapien-signature'] || req.headers?.['X-NeoSapien-Signature']) as string | undefined;

    const sigCheck = verifyNeoSapienWebhookSignature(rawBody, timestampHeader, signatureHeader, webhookSecret);
    if (!sigCheck.valid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid Webhook Signature',
        message: sigCheck.reason,
      });
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
    const rawItems = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.memories)
      ? payload.memories
      : payload?.memory
      ? [payload.memory]
      : payload
      ? [payload]
      : [];

    // Resolve destination user ID via explicit query param or active neosapien connection
    let targetUserId = req.query?.user_id ? String(req.query.user_id) : payload?.user_id ? String(payload.user_id) : null;
    if (!targetUserId) {
      const { data: conn } = await supabaseServer
        .from('neosapien_connections')
        .select('user_id')
        .eq('status', 'connected')
        .limit(1)
        .single();
      targetUserId = conn?.user_id || null;
    }

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'Unmapped Webhook User',
        message: 'No user_id provided and no connected NeoSapien user found in neosapien_connections.',
      });
    }

    let imported = 0;
    const savedIds: string[] = [];

    for (const item of rawItems) {
      const sourceRecordId = String(item.id || item._id || item.memory_id || `wh_${Date.now()}_${imported}`);
      const summaryText = String(item.summary || item.mom || item.title || 'Webhook capture');
      const contentHash = crypto.createHash('sha256').update(`${sourceRecordId}:${summaryText}`).digest('hex').slice(0, 24);

      const { error: upsertErr } = await supabaseServer.from('neosapien_memories').upsert(
        {
          user_id: targetUserId,
          source_record_id: sourceRecordId,
          title: String(item.title || 'NeoSapien Webhook Capture'),
          content_hash: contentHash,
          source: 'webhook',
          platform: 'in_person',
          captured_at: item.captured_at || item.started_at || item.created_at || new Date().toISOString(),
          summary: summaryText,
          transcript: item.transcript || null,
          associated_area: item.associated_area || 'Personal',
          tags: Array.isArray(item.tags) ? item.tags : ['NeoSapien', 'Webhook'],
          imported_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,source_record_id' }
      );

      if (!upsertErr) {
        imported++;
        savedIds.push(sourceRecordId);
      }
    }

    await supabaseServer.from('neosapien_sync_history').insert({
      user_id: targetUserId,
      sync_method: 'webhook',
      status: imported === rawItems.length ? 'success' : imported > 0 ? 'partial' : 'failed',
      records_imported: imported,
      details: `Webhook event ${(req.headers?.['x-neosapien-event'] || 'memory.created')} persisted ${imported}/${rawItems.length} item(s).`,
      created_at: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      persisted: imported,
      memoryIds: savedIds,
      timestamp: new Date().toISOString(),
    });
  }

  // ---------------------------------------------------------------------------
  // Require Bearer token for upstream NeoSapien MCP requests
  // ---------------------------------------------------------------------------
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'NeoSapien Bearer authorization token required.',
    });
  }

  try {
    // 2. ACTION: Real MCP JSON-RPC initialize + tools/list (never returns fake fallback tools)
    if (action === 'tools') {
      await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'init_1',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'yashwanth-hub', version: '2.0.0' },
          },
        }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);

      const rpcResp = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'tools_discovery',
          method: 'tools/list',
          params: {},
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!rpcResp.ok) {
        const errText = await rpcResp.text().catch(() => '');
        return res.status(rpcResp.status).json({
          success: false,
          error: `Upstream MCP tools/list returned HTTP ${rpcResp.status}`,
          message: errText || 'Authentication rejected or NeoSapien MCP endpoint unavailable.',
          endpoint: MCP_ENDPOINT,
        });
      }

      const rpcData = await rpcResp.json();
      if (!Array.isArray(rpcData?.result?.tools)) {
        return res.status(502).json({
          success: false,
          error: 'Invalid MCP Response',
          message: rpcData?.error?.message || 'Upstream MCP did not return a tools array.',
          endpoint: MCP_ENDPOINT,
        });
      }

      return res.status(200).json({
        success: true,
        protocol: 'MCP 2024-11-05',
        endpoint: MCP_ENDPOINT,
        tools: rpcData.result.tools,
      });
    }

    // 3. ACTION: Synchronize Memories via official /api/v1/memories/sync
    if (action === 'sync') {
      const { cursor, session_id, limit = 50 } = req.body || {};
      const syncUrl = new URL(`${NEOSAPIEN_BASE_URL}/api/v1/memories/sync`);
      syncUrl.searchParams.set('limit', String(Math.min(Number(limit) || 50, 100)));
      if (cursor) syncUrl.searchParams.set('cursor', String(cursor));
      if (session_id) syncUrl.searchParams.set('session_id', String(session_id));

      const syncResp = await fetch(syncUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!syncResp.ok) {
        const errBody = await syncResp.text().catch(() => '');
        return res.status(syncResp.status).json({
          success: false,
          error: syncResp.status === 401 ? 'Token Expired or Invalid' : 'NeoSapien Sync Error',
          message: errBody || `Sync API returned HTTP ${syncResp.status}`,
        });
      }

      const syncData = await syncResp.json();
      const rawMemories = syncData.memories || [];

      const normalized = rawMemories.map((raw: any) => {
        const decisions: string[] = [];
        const actionItems: { text: string; priority: string; status: string; isCommitment: boolean }[] = [];

        if (raw.mom && typeof raw.mom === 'string') {
          for (const line of raw.mom.split('\n')) {
            const clean = line.replace(/^[-*•\d.]\s*/, '').trim();
            if (/decision|agreed|concluded/i.test(line) && clean.length > 5) {
              decisions.push(clean);
            } else if (/action|todo|commit|deliver|follow-up/i.test(line) && clean.length > 5) {
              actionItems.push({
                text: clean,
                priority: /urgent|asap/i.test(clean) ? 'urgent' : 'medium',
                status: 'pending_approval',
                isCommitment: true,
              });
            }
          }
        }

        return {
          id: `neo_${raw._id || raw.id || Math.random().toString(36).slice(2, 9)}`,
          originalNeoId: raw._id || raw.id || '',
          title: raw.title || 'Ambient Audio Recording',
          source: raw.source || 'neo_1_device',
          platform: 'in_person',
          capturedAt: raw.started_at || raw.created_at || new Date().toISOString(),
          durationMinutes: Math.round(
            ((new Date(raw.finished_at || raw.created_at).getTime() -
              new Date(raw.started_at || raw.created_at).getTime()) /
              60000) ||
              15
          ),
          summary: raw.summary || (raw.mom ? raw.mom.slice(0, 300) : 'No summary generated.'),
          transcript: raw.transcript || '',
          speakers: Array.isArray(raw.participants) ? raw.participants : [],
          decisions: decisions.length > 0 ? decisions : raw.topics || [],
          actionItems,
          commitments: decisions,
          followUps: [],
          reminders: [],
          peopleMentioned: Array.isArray(raw.participants) ? raw.participants : [],
          associatedArea: 'Personal',
          tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags : ['NeoSapien'],
          syncMethod: 'mcp',
          importedAt: new Date().toISOString(),
        };
      });

      return res.status(200).json({
        success: true,
        memories: normalized,
        pagination: syncData.pagination || {},
        syncInfo: syncData.sync_info || {},
        count: normalized.length,
        timestamp: new Date().toISOString(),
      });
    }

    // 4. ACTION: Execute MCP Tool Call
    if (action === 'call') {
      const { name, arguments: toolArgs } = req.body || {};
      if (!name) {
        return res.status(400).json({ error: 'Missing tool name' });
      }

      const toolResp = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `call_${Date.now()}`,
          method: 'tools/call',
          params: {
            name,
            arguments: toolArgs || {},
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!toolResp.ok) {
        const errText = await toolResp.text().catch(() => '');
        return res.status(toolResp.status).json({
          error: 'Tool Execution Failed',
          message: errText,
        });
      }

      const toolResult = await toolResp.json();
      return res.status(200).json(toolResult);
    }

    // 5. ACTION: Status & Health
    if (action === 'status' || action === 'history') {
      const checkResp = await fetch(`${NEOSAPIEN_BASE_URL}/api/v1/memories/sync?limit=1`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      return res.status(checkResp.ok ? 200 : checkResp.status).json({
        connected: checkResp.ok,
        status: checkResp.ok ? 'connected' : checkResp.status === 401 ? 'unauthorized' : 'degraded',
        endpoint: MCP_ENDPOINT,
        httpStatus: checkResp.status,
        lastCheckTimestamp: new Date().toISOString(),
      });
    }

    return res.status(400).json({
      error: 'Invalid Action',
      message: `Unknown NeoSapien MCP action "${action}".`,
    });
  } catch (error: any) {
    return res.status(502).json({
      success: false,
      error: 'MCP Gateway Error',
      message: error?.message || 'Error communicating with NeoSapien MCP',
    });
  }
}
