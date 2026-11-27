// Vercel Serverless Function (12/12 slot): PROJECT JARVIS 4.0 Companion API
// Endpoint: /api/buddy
// Supports:
//   GET  ?action=overview          -> memories, timeline, awareness sources, settings, credential manifest
//   POST ?action=awareness_refresh -> live awareness poll across connected platforms + delta observations
//   POST ?action=proactive_tick    -> scheduled briefing & proactive policy evaluation
//   POST ?action=memory            -> create/update/verify/delete long-term companion memory (secret-guarded)
//   POST ?action=execute           -> Tier 1 auto / Tier 2 human-approved real action execution + verification
//   POST ?action=approve           -> approve or reject pending_approval timeline item
//   POST ?action=timeline_status   -> dismiss or record companion timeline event

import { isServerSupabaseConfigured, hasServiceRoleKey, resolveAuthenticatedUser, supabaseServer } from './_lib/db.ts';
import { applyCors } from './_lib/http.ts';
import {
  buildCredentialManifest,
  executeAuthorizedBuddyAction,
  loadCompanionSettingsFromDb,
  recordTimelineItem,
  refreshAwarenessSources,
  runProactiveCompanionTick,
  upsertCompanionMemoryServer,
} from './_lib/buddyEngine.ts';
import { summarizeHonestAwareness } from '../src/lib/awarenessCore.ts';

export interface BuddyHandlerDeps {
  dbClient?: any;
  authResolver?: typeof resolveAuthenticatedUser;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export function createBuddyHandler(deps: BuddyHandlerDeps = {}) {
  const dbClient = deps.dbClient ?? supabaseServer;
  const authResolver = deps.authResolver ?? resolveAuthenticatedUser;
  const fetchImpl = deps.fetchImpl ?? fetch;

  return async function handler(req: any, res: any) {
    applyCors(req, res, 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const env = deps.env ?? process.env;
    const action = String(Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action || 'overview');
    const serverDbReady = dbClient !== supabaseServer || isServerSupabaseConfigured();

    // Unauthenticated lightweight manifest/config read when anonymous GET ?action=health
    if (req.method === 'GET' && action === 'health') {
      const credentials = buildCredentialManifest(env, {
        hasSupabase: serverDbReady,
        hasServiceRole: hasServiceRoleKey(),
      });
      return res.status(200).json({
        success: true,
        companion: 'JARVIS 4.0',
        configuredCount: credentials.filter((c) => c.configured).length,
        totalCredentials: credentials.length,
        credentials,
      });
    }

    if (!serverDbReady) {
      return res.status(200).json({
        success: true,
        configured: false,
        authenticated: false,
        memories: [],
        timeline: [],
        awarenessSources: [],
        credentials: buildCredentialManifest(env, { hasSupabase: false, hasServiceRole: false }),
        message: 'Supabase not configured on server; local-first mode active in browser IndexedDB.',
      });
    }

    const auth = await authResolver(req, dbClient);
    if (!auth.authenticated || !auth.userId) {
      if (req.method === 'GET' && action === 'overview') {
        const credentials = buildCredentialManifest(env, {
          hasSupabase: true,
          hasServiceRole: hasServiceRoleKey(),
        });
        return res.status(200).json({
          success: true,
          configured: true,
          authenticated: false,
          memories: [],
          timeline: [],
          awarenessSources: [],
          credentials,
          message: 'Sign in with Supabase to enable cloud companion memory, awareness cursors, and server actions.',
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: auth.error || 'Valid Supabase user session is required.',
      });
    }

    const activeDb = (auth as { client?: any }).client ?? dbClient;
    const userId = auth.userId;

    try {
      if (req.method === 'GET' && action === 'overview') {
        const [memRes, tlRes, srcRes, tokRes, settings] = await Promise.all([
          activeDb
            .from('companion_memories')
            .select('id, category, title, content, source, source_ref, project, importance, confidence, durability, expires_at, verified_by_user, contradicts_id, status, tags, created_at, updated_at')
            .eq('user_id', userId)
            .neq('status', 'archived')
            .order('updated_at', { ascending: false })
            .limit(120),
          activeDb
            .from('companion_timeline')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(60),
          activeDb
            .from('awareness_sources')
            .select('*')
            .eq('user_id', userId),
          activeDb
            .from('integration_tokens')
            .select('provider')
            .eq('user_id', userId),
          loadCompanionSettingsFromDb(activeDb, userId),
        ]);

        const providers = new Set((tokRes?.data || []).map((r: any) => String(r.provider)));
        const sources = srcRes?.data || [];
        const credentials = buildCredentialManifest(env, {
          hasGoogleOAuth: providers.has('google'),
          hasNeoSapien: providers.has('neosapien'),
          hasSupabase: true,
          hasServiceRole: hasServiceRoleKey(),
        });

        return res.status(200).json({
          success: true,
          configured: true,
          authenticated: true,
          settings,
          memories: memRes?.data || [],
          timeline: tlRes?.data || [],
          awarenessSources: sources,
          awarenessSummary: summarizeHonestAwareness(sources),
          credentials,
        });
      }

      if (req.method === 'POST' && action === 'awareness_refresh') {
        const result = await refreshAwarenessSources({
          db: activeDb,
          userId,
          env,
          fetchImpl,
        });
        return res.status(200).json({ success: true, ...result });
      }

      if (req.method === 'POST' && action === 'proactive_tick') {
        const body = req.body || {};
        const result = await runProactiveCompanionTick({
          db: activeDb,
          userId,
          forceBriefing: body.forceBriefing,
        });
        return res.status(200).json({ success: true, ...result });
      }

      if (req.method === 'POST' && action === 'memory') {
        const body = req.body || {};
        if (body.op === 'delete' && body.id) {
          const { error } = await activeDb
            .from('companion_memories')
            .delete()
            .eq('user_id', userId)
            .eq('id', String(body.id));
          if (error) throw new Error(error.message);
          return res.status(200).json({ success: true, deletedId: body.id });
        }

        const savedRes = await upsertCompanionMemoryServer({
          db: activeDb,
          userId,
          input: body,
          env,
          fetchImpl,
        });
        if (!savedRes.saved) {
          return res.status(400).json({ success: false, error: savedRes.skippedReason || 'Memory rejected' });
        }
        return res.status(200).json({ success: true, memory: savedRes.saved });
      }

      if (req.method === 'POST' && action === 'execute') {
        const body = req.body || {};
        const exec = await executeAuthorizedBuddyAction({
          db: activeDb,
          userId,
          toolName: String(body.toolName || ''),
          args: body.args || {},
          approvedByHuman: Boolean(body.approvedByHuman),
          timelineId: body.timelineId,
          env,
          fetchImpl,
        });
        const httpCode = exec.status === 'blocked' ? 403 : exec.status === 'failed' ? 422 : 200;
        return res.status(httpCode).json({ success: exec.status === 'executed' || exec.status === 'pending_approval', ...exec });
      }

      if (req.method === 'POST' && action === 'approve') {
        const body = req.body || {};
        const timelineId = String(body.timelineId || '');
        const decision = body.decision === 'reject' ? 'reject' : 'approve';
        if (!timelineId) return res.status(400).json({ success: false, error: 'timelineId required' });

        const itemRes = (await activeDb
          .from('companion_timeline')
          .select('*')
          .eq('user_id', userId)
          .eq('id', timelineId)
          .maybeSingle?.()) ?? { data: null };
        const item = itemRes?.data;

        if (!item) return res.status(404).json({ success: false, error: 'Timeline approval item not found.' });

        if (decision === 'reject') {
          const now = new Date().toISOString();
          await activeDb
            .from('companion_timeline')
            .update({ status: 'rejected', updated_at: now })
            .eq('user_id', userId)
            .eq('id', timelineId);
          return res.status(200).json({ success: true, status: 'rejected', timelineId });
        }

        const toolName = String(item.metadata?.toolName || '');
        const args = (item.metadata?.args || {}) as Record<string, any>;
        const exec = await executeAuthorizedBuddyAction({
          db: activeDb,
          userId,
          toolName,
          args,
          approvedByHuman: true,
          timelineId,
          env,
          fetchImpl,
        });
        return res.status(exec.status === 'failed' ? 422 : 200).json({ success: exec.status === 'executed', ...exec });
      }

      if (req.method === 'POST' && action === 'timeline_status') {
        const body = req.body || {};
        if (body.id && body.status) {
          await activeDb
            .from('companion_timeline')
            .update({ status: String(body.status), updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('id', String(body.id));
          return res.status(200).json({ success: true });
        }
        const row = await recordTimelineItem(activeDb, userId, body);
        return res.status(200).json({ success: true, item: row });
      }

      return res.status(400).json({ success: false, error: `Unknown action "${action}"` });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message || 'Buddy API error',
      });
    }
  };
}

export default createBuddyHandler();
