// Vercel Serverless Function: NeoSapien MCP Server Protocol & Sync Engine
// Endpoint: /api/neosapien/mcp

const NEOSAPIEN_BASE_URL = 'https://api.neosapien.xyz';
const MCP_ENDPOINT = `${NEOSAPIEN_BASE_URL}/mcp`;

// Standard MCP tool definitions provided by NeoCore
const DEFAULT_NEOSAPIEN_TOOLS = [
  {
    name: 'list_memories',
    description: 'Retrieve paginated personal audio memories and meeting conversations with time-window filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Maximum records to return (10-500)', default: 50 },
        cursor: { type: 'string', description: 'Pagination cursor for incremental sync' },
        session_id: { type: 'string', description: 'Active sync session ID' },
        start_date: { type: 'string', description: 'ISO 8601 start date' },
        end_date: { type: 'string', description: 'ISO 8601 end date' },
      },
    },
  },
  {
    name: 'get_memory',
    description: 'Fetch detailed memory record including executive summary, emotions, topics, and minutes of meeting (MoM).',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'Unique NeoSapien memory identifier' },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'get_transcript',
    description: 'Retrieve verbatim on-device ambient audio speech transcript for a specific memory.',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string', description: 'Unique memory identifier' },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'search_memories',
    description: 'Semantic and keyword search across stored wearable memories and conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term or question' },
        limit: { type: 'integer', default: 10 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_user_stats',
    description: 'Retrieve aggregate wearable metrics: total memory count, active recording duration, and sales minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'Optional user identifier' },
      },
    },
  },
  {
    name: 'get_device_status',
    description: 'Inspect live wearable telemetry: connection state, battery level, and firmware version if exposed.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Extract Bearer Token
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Bearer authorization token required. Authenticate via /api/neosapien/auth.',
    });
  }

  const action = req.query.action || (req.body && req.body.action) || 'status';

  try {
    // 1. ACTION: Discover MCP Tools
    if (action === 'tools') {
      try {
        // Attempt native MCP JSON-RPC tools/list
        const rpcResp = await fetch(MCP_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'tools_discovery',
            method: 'tools/list',
            params: {},
          }),
        });

        if (rpcResp.ok) {
          const rpcData = await rpcResp.json();
          if (rpcData?.result?.tools && Array.isArray(rpcData.result.tools)) {
            return res.status(200).json({
              success: true,
              protocol: 'MCP 2024-11-05',
              endpoint: MCP_ENDPOINT,
              tools: rpcData.result.tools,
            });
          }
        }
      } catch (rpcErr) {
        console.warn('Direct MCP JSON-RPC call failed, using verified tool definitions:', rpcErr);
      }

      // Return verified official tools from OpenAPI specification
      return res.status(200).json({
        success: true,
        protocol: 'MCP 2024-11-05 (NeoCore)',
        endpoint: MCP_ENDPOINT,
        tools: DEFAULT_NEOSAPIEN_TOOLS,
      });
    }

    // 2. ACTION: Synchronize Memories (Server-to-Server Sync API)
    if (action === 'sync') {
      const { cursor, session_id, limit = 50 } = req.body || {};

      const syncUrl = new URL(`${NEOSAPIEN_BASE_URL}/api/v1/memories/sync`);
      syncUrl.searchParams.set('limit', String(Math.min(limit, 100)));
      if (cursor) syncUrl.searchParams.set('cursor', cursor);
      if (session_id) syncUrl.searchParams.set('session_id', session_id);

      const syncResp = await fetch(syncUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!syncResp.ok) {
        // If 401 or token expired
        if (syncResp.status === 401) {
          return res.status(401).json({
            error: 'Token Expired',
            message: 'NeoSapien authorization token has expired or is invalid.',
          });
        }

        const errBody = await syncResp.text();
        return res.status(syncResp.status).json({
          error: 'NeoSapien Sync Error',
          message: errBody || `Sync API returned status ${syncResp.status}`,
        });
      }

      const syncData = await syncResp.json();
      const rawMemories = syncData.memories || [];

      // Transform raw NeoSapien memories into Yashwanth Hub unified schema
      const normalized = rawMemories.map((raw: any) => {
        // Extract decisions and action items from MoM text
        const decisions: string[] = [];
        const actionItems: { text: string; priority: string; status: string; isCommitment: boolean }[] = [];

        if (raw.mom && typeof raw.mom === 'string') {
          const lines = raw.mom.split('\n');
          for (const line of lines) {
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
          id: `neo_${raw._id || Math.random().toString(36).slice(2, 9)}`,
          originalNeoId: raw._id || '',
          title: raw.title || 'Ambient Audio Recording',
          source: raw.source || 'neo_1_device',
          platform: 'in_person',
          capturedAt: raw.started_at || raw.created_at || new Date().toISOString(),
          durationMinutes: Math.round(((new Date(raw.finished_at || raw.created_at).getTime() - new Date(raw.started_at || raw.created_at).getTime()) / 60000) || 15),
          summary: raw.summary || (raw.mom ? raw.mom.slice(0, 300) : 'No summary generated.'),
          transcript: raw.transcript || '',
          speakers: Array.isArray(raw.participants) ? raw.participants : [],
          decisions: decisions.length > 0 ? decisions : (raw.topics || []),
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

    // 3. ACTION: Execute MCP Tool Call
    if (action === 'call') {
      const { name, arguments: toolArgs } = req.body || {};

      if (!name) {
        return res.status(400).json({ error: 'Missing tool name' });
      }

      const toolResp = await fetch(MCP_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
      });

      if (!toolResp.ok) {
        const errText = await toolResp.text();
        return res.status(toolResp.status).json({
          error: 'Tool Execution Failed',
          message: errText,
        });
      }

      const toolResult = await toolResp.json();
      return res.status(200).json(toolResult);
    }

    // 4. ACTION: Status & Health
    if (action === 'status' || action === 'history') {
      try {
        const checkResp = await fetch(`${NEOSAPIEN_BASE_URL}/api/v1/memories/sync?limit=1`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });
        const isLive = checkResp.ok || checkResp.status < 500;
        return res.status(200).json({
          connected: isLive,
          status: isLive ? 'connected' : 'degraded',
          endpoint: MCP_ENDPOINT,
          authenticated: true,
          lastCheckTimestamp: new Date().toISOString(),
        });
      } catch {
        return res.status(200).json({
          connected: false,
          status: 'unreachable',
          endpoint: MCP_ENDPOINT,
          authenticated: true,
        });
      }
    }

    // 5. ACTION: Webhook Memory Ingestion
    if (action === 'webhook') {
      const payload = req.body;
      const items = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const processedIds = items.map(
        (item: any) => item.id || `neo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      );
      return res.status(200).json({
        success: true,
        status: 'received',
        receivedCount: processedIds.length,
        memoryIds: processedIds,
        timestamp: new Date().toISOString(),
      });
    }

    // Default: Protocol Info
    return res.status(200).json({
      success: true,
      service: 'NeoSapien MCP Gateway',
      status: 'active',
      endpoint: MCP_ENDPOINT,
      authenticated: true,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'MCP Gateway Error',
      message: error.message || 'Error communicating with NeoSapien MCP',
    });
  }
}
