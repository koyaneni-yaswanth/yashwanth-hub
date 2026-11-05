// Vercel Serverless Function: NeoSapien Connection Status & Health Check
// Endpoint: /api/neosapien/status

const NEOSAPIEN_BASE_URL = 'https://api.neosapien.xyz';
const MCP_ENDPOINT = `${NEOSAPIEN_BASE_URL}/mcp`;

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      connected: false,
      status: 'unauthenticated',
      endpoint: MCP_ENDPOINT,
      message: 'No Bearer authorization token provided.',
    });
  }

  try {
    // Validate token against live NeoSapien MCP endpoint
    const checkResp = await fetch(`${NEOSAPIEN_BASE_URL}/api/v1/memories/sync?limit=1`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (checkResp.status === 401) {
      return res.status(401).json({
        connected: false,
        status: 'token_expired',
        endpoint: MCP_ENDPOINT,
        message: 'NeoSapien authorization token has expired or is invalid.',
      });
    }

    const isLive = checkResp.ok || checkResp.status < 500;

    return res.status(200).json({
      connected: isLive,
      status: isLive ? 'connected' : 'degraded',
      endpoint: MCP_ENDPOINT,
      authenticated: true,
      lastCheckTimestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({
      connected: false,
      status: 'unreachable',
      endpoint: MCP_ENDPOINT,
      error: err.message || 'Failed to reach NeoSapien endpoint',
    });
  }
}
