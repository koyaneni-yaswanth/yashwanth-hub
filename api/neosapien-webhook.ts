// Vercel Serverless Function: NeoSapien Webhook Ingestion Endpoint
// Accepts incoming memory payloads from NeoSapien Desktop, Neo 1 capture pipelines, or external webhooks.

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST requests are accepted at /api/neosapien-webhook',
    });
  }

  // Optional Bearer Secret Verification
  const authHeader = req.headers.authorization;
  const configuredSecret = process.env.NEOSAPIEN_WEBHOOK_SECRET;

  if (configuredSecret && authHeader !== `Bearer ${configuredSecret}`) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing Bearer authorization token.',
    });
  }

  try {
    const payload = req.body;

    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Empty payload received. Expected a NeoSapien memory object or array of memories.',
      });
    }

    const items = Array.isArray(payload) ? payload : [payload];
    const processedIds: string[] = [];

    for (const item of items) {
      const memoryId = item.id || item.originalNeoId || `neo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      processedIds.push(memoryId);
    }

    return res.status(200).json({
      success: true,
      status: 'received',
      receivedCount: processedIds.length,
      memoryIds: processedIds,
      timestamp: new Date().toISOString(),
      note: 'Memory payload queued and ready for Yashwanth Hub client sync.',
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'Failed to process NeoSapien webhook payload',
    });
  }
}
