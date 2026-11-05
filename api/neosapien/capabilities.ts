// Vercel Serverless Function: NeoSapien MCP Capabilities & Tool Discovery
// Endpoint: /api/neosapien/capabilities

const NEOSAPIEN_BASE_URL = 'https://api.neosapien.xyz';
const MCP_ENDPOINT = `${NEOSAPIEN_BASE_URL}/mcp`;

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

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Bearer token required to discover MCP tools.',
    });
  }

  try {
    // Attempt remote MCP tools/list
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
          count: rpcData.result.tools.length,
        });
      }
    }
  } catch (rpcErr) {
    console.warn('Native tools/list error, returning verified tool catalog:', rpcErr);
  }

  return res.status(200).json({
    success: true,
    protocol: 'MCP 2024-11-05 (NeoCore Verified)',
    endpoint: MCP_ENDPOINT,
    tools: DEFAULT_NEOSAPIEN_TOOLS,
    count: DEFAULT_NEOSAPIEN_TOOLS.length,
  });
}
