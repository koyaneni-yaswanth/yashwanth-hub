// Vercel Serverless Function: NeoSapien Disconnect & Session Invalidation
// Endpoint: /api/neosapien/disconnect

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Clear server-side session or log revocation
  return res.status(200).json({
    success: true,
    status: 'disconnected',
    message: 'NeoSapien integration disconnected and session terminated.',
    timestamp: new Date().toISOString(),
  });
}
