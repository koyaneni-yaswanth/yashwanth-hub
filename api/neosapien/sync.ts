// Vercel Serverless Function: NeoSapien Memory Synchronization Engine
// Endpoint: /api/neosapien/sync

const NEOSAPIEN_BASE_URL = 'https://api.neosapien.xyz';

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
      message: 'Bearer authorization token required for synchronization.',
    });
  }

  try {
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
        durationMinutes: Math.round(
          ((new Date(raw.finished_at || raw.created_at).getTime() -
            new Date(raw.started_at || raw.created_at).getTime()) /
            60000) || 15
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
  } catch (error: any) {
    return res.status(500).json({
      error: 'Sync Processing Error',
      message: error.message || 'Error processing memory sync',
    });
  }
}
