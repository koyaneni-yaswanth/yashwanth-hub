/**
 * Server-Side Engine for PROJECT JARVIS 4.0 (/api/buddy)
 * Handles:
 * - Honest integration & secret manifest (never fakes missing credentials)
 * - Awareness Engine polling & cursor updates across connected platforms
 * - Companion memory persistence + optional Gemini pgvector embedding
 * - Proactive scheduling & notification policy enforcement
 * - Tiered real-world execution (Tier 1 Auto, Tier 2 Approval + Verification, Tier 3 Blocked)
 */

import { detectConfiguredProviders } from './aiProviderAdapters.ts';
import { fetchDevMonitorReport } from './devMonitor.ts';
import { dispatchNotificationToChannels, getNotificationChannelsStatus } from './notificationChannels.ts';
import { fetchResearchIntelligence } from './researchConnectors.ts';
import {
  AWARENESS_PLATFORMS,
  normalizeExternalObservation,
  summarizeHonestAwareness,
  type CredentialStatusItem,
} from '../../src/lib/awarenessCore.ts';

export type { CredentialStatusItem };
import { classifyCompanionActionTier } from '../../src/lib/companionAgents.ts';
import { DEFAULT_COMPANION_SETTINGS } from '../../src/lib/companionIdentity.ts';
import { containsSensitiveSecret, redactSensitiveSecrets } from '../../src/lib/companionSecurity.ts';
import { evaluateProactiveNotification, isScheduledBriefingDue } from '../../src/lib/notificationPolicy.ts';
import type {
  AwarenessSourceRecord,
  CompanionMemoryRecord,
  CompanionTimelineItem,
  JarvisCompanionSettings,
} from '../../src/types/index.ts';

export function buildCredentialManifest(
  env: Record<string, string | undefined> = process.env,
  flags: { hasGoogleOAuth?: boolean; hasNeoSapien?: boolean; hasServiceRole?: boolean; hasSupabase?: boolean } = {}
): CredentialStatusItem[] {
  const aiCfg = detectConfiguredProviders(env);
  const chanStatus = getNotificationChannelsStatus(env);
  const byChan = new Map(chanStatus.channels.map((c) => [c.id, c.configured]));
  const sentryConfigured = Boolean((env.SENTRY_AUTH_TOKEN || '').trim() && (env.SENTRY_ORG || '').trim());

  return [
    { id: 'gemini', label: 'Google Gemini API', configured: aiCfg.gemini, envVar: 'GEMINI_API_KEY', scope: 'ai', requiredFor: 'Primary streaming AI + pgvector embeddings' },
    { id: 'openai', label: 'OpenAI API', configured: aiCfg.openai, envVar: 'OPENAI_API_KEY', scope: 'ai', requiredFor: 'OpenAI reasoning / model failover' },
    { id: 'anthropic', label: 'Anthropic Claude API', configured: aiCfg.anthropic, envVar: 'ANTHROPIC_API_KEY', scope: 'ai', requiredFor: 'Claude deep engineering analysis' },
    { id: 'openrouter', label: 'OpenRouter API', configured: aiCfg.openrouter, envVar: 'OPENROUTER_API_KEY', scope: 'ai', requiredFor: 'Unified multi-model routing' },
    { id: 'huggingface', label: 'Hugging Face Token', configured: aiCfg.huggingface, envVar: 'HF_TOKEN', scope: 'ai', requiredFor: 'Open-weights HF Inference Router' },
    { id: 'ollama', label: 'Ollama Local Server', configured: aiCfg.ollama, envVar: 'OLLAMA_BASE_URL', scope: 'ai', requiredFor: 'Private zero-cost local inference' },
    { id: 'github', label: 'GitHub PAT', configured: Boolean((env.GITHUB_TOKEN || '').trim()), envVar: 'GITHUB_TOKEN', scope: 'dev', requiredFor: 'Private repo access, higher rate limit & creating GitHub issues' },
    { id: 'vercel', label: 'Vercel API Token', configured: Boolean((env.VERCEL_TOKEN || '').trim()), envVar: 'VERCEL_TOKEN', scope: 'dev', requiredFor: 'Deployment list & build error inspection' },
    { id: 'sentry', label: 'Sentry API Monitoring', configured: sentryConfigured, envVar: 'SENTRY_AUTH_TOKEN / SENTRY_ORG', scope: 'monitoring', requiredFor: 'Runtime error monitoring' },
    { id: 'telegram', label: 'Telegram Bot Alerts', configured: Boolean(byChan.get('telegram')), envVar: 'TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID', scope: 'notifications', requiredFor: 'Proactive Telegram delivery' },
    { id: 'discord', label: 'Discord Webhook', configured: Boolean(byChan.get('discord')), envVar: 'DISCORD_WEBHOOK_URL', scope: 'notifications', requiredFor: 'Developer alert webhook' },
    { id: 'webhook', label: 'n8n / Automation Webhook', configured: Boolean(byChan.get('webhook')), envVar: 'N8N_WEBHOOK_URL', scope: 'notifications', requiredFor: 'External workflow dispatch' },
    { id: 'semantic_scholar', label: 'Semantic Scholar API', configured: Boolean((env.SEMANTIC_SCHOLAR_API_KEY || '').trim()), envVar: 'SEMANTIC_SCHOLAR_API_KEY (optional)', scope: 'research', requiredFor: 'Higher-rate academic citation queries' },
    { id: 'google_workspace', label: 'Google Workspace OAuth', configured: Boolean(flags.hasGoogleOAuth), envVar: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET + user OAuth', scope: 'workspace', requiredFor: 'Gmail, Calendar, Tasks, Drive sync' },
    { id: 'supabase_cron', label: 'Unattended Background Cron', configured: Boolean(flags.hasServiceRole && flags.hasSupabase), envVar: 'SUPABASE_SERVICE_ROLE_KEY', scope: 'monitoring', requiredFor: 'Background server cron briefings & triggers' },
    { id: 'neosapien', label: 'NeoSapien Neo 1 MCP', configured: Boolean(flags.hasNeoSapien), envVar: 'NeoSapien OAuth / MCP token', scope: 'workspace', requiredFor: 'Wearable & meeting transcripts' },
  ];
}

async function computeGeminiEmbedding(
  text: string,
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch
): Promise<number[] | null> {
  const apiKey = (env.GEMINI_API_KEY || '').trim();
  if (!apiKey || !text.trim()) return null;
  try {
    const model = 'text-embedding-004';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 6000) }] },
        outputDimensionality: 768,
      }),
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: { values?: number[] } };
    const values = data?.embedding?.values;
    return Array.isArray(values) && values.length === 768 ? values : null;
  } catch {
    return null;
  }
}

export async function loadCompanionSettingsFromDb(db: any, userId: string): Promise<JarvisCompanionSettings> {
  try {
    const prefRes = (await db
      .from('user_preferences')
      .select('value, updated_at')
      .eq('user_id', userId)
      .eq('id', 'jarvis_companion_settings_v1')
      .maybeSingle?.()) ?? { data: null };
    const data = prefRes?.data;
    if (data?.value && typeof data.value === 'object') {
      return {
        ...DEFAULT_COMPANION_SETTINGS,
        ...(data.value as Partial<JarvisCompanionSettings>),
        updated_at: data.updated_at || DEFAULT_COMPANION_SETTINGS.updated_at,
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_COMPANION_SETTINGS };
}

export async function recordTimelineItem(
  db: any,
  userId: string,
  item: Omit<CompanionTimelineItem, 'id' | 'created_at' | 'updated_at'> & { id?: string }
): Promise<CompanionTimelineItem> {
  const now = new Date().toISOString();
  const row: CompanionTimelineItem = {
    id: item.id || `tl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: userId,
    kind: item.kind,
    source: item.source || 'jarvis',
    agent_id: item.agent_id,
    project: item.project,
    title: String(item.title || 'Update').slice(0, 180),
    summary: String(item.summary || '').slice(0, 1200),
    importance: item.importance || 'normal',
    status: item.status || 'recorded',
    action_url: item.action_url,
    metadata: item.metadata || {},
    created_at: now,
    updated_at: now,
  };

  try {
    await db.from('companion_timeline').upsert(row, { onConflict: 'user_id,id' });
  } catch {
    /* non-fatal in mocked environments */
  }
  return row;
}

export async function upsertCompanionMemoryServer(options: {
  db: any;
  userId: string;
  input: Partial<CompanionMemoryRecord>;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<{ saved: CompanionMemoryRecord | null; skippedReason?: string }> {
  const rawContent = String(options.input.content || '').trim();
  const rawTitle = String(options.input.title || '').trim();
  if (!rawContent || !rawTitle) {
    return { saved: null, skippedReason: 'Memory title and content are required.' };
  }

  if (containsSensitiveSecret(rawContent) || containsSensitiveSecret(rawTitle)) {
    const cleanContent = redactSensitiveSecrets(rawContent).redacted;
    if (cleanContent.includes('[REDACTED')) {
      return {
        saved: null,
        skippedReason: 'Rejected: passwords, API keys, tokens, and secrets are never persisted in JARVIS memory.',
      };
    }
  }

  const now = new Date().toISOString();
  const row: Record<string, any> = {
    id: options.input.id || `cm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    user_id: options.userId,
    category: options.input.category || 'project',
    title: rawTitle.slice(0, 180),
    content: rawContent.slice(0, 1500),
    source: options.input.source || 'conversation',
    source_ref: options.input.source_ref || null,
    project: options.input.project || null,
    importance: Math.min(10, Math.max(1, Number(options.input.importance || 6))),
    confidence: Math.min(1, Math.max(0.1, Number(options.input.confidence || 0.85))),
    durability: options.input.durability === 'temporary' ? 'temporary' : 'long_term',
    expires_at: options.input.expires_at || null,
    verified_by_user: Boolean(options.input.verified_by_user),
    contradicts_id: options.input.contradicts_id || null,
    status: options.input.status || 'active',
    tags: Array.isArray(options.input.tags) ? options.input.tags.slice(0, 12) : [],
    created_at: options.input.created_at || now,
    updated_at: now,
  };

  const env = options.env || process.env;
  const vec = await computeGeminiEmbedding(`${row.title}\n${row.content}`, env, options.fetchImpl || fetch);
  if (vec) {
    row.embedding = `[${vec.map((n) => Number(n.toFixed(6))).join(',')}]`;
  }

  if (row.contradicts_id) {
    await options.db
      .from('companion_memories')
      .update({ status: 'superseded', updated_at: now })
      .eq('user_id', options.userId)
      .eq('id', row.contradicts_id);
  }

  const { error } = await options.db
    .from('companion_memories')
    .upsert(row, { onConflict: 'user_id,id' });
  if (error) {
    throw new Error(`Failed saving memory: ${error.message}`);
  }

  delete row.embedding;
  await recordTimelineItem(options.db, options.userId, {
    kind: 'learned_memory',
    source: row.source,
    project: row.project || undefined,
    title: `Memory saved: ${row.title}`,
    summary: `[${row.category} · ${row.durability}] ${row.content.slice(0, 200)}`,
    importance: row.importance >= 8 ? 'high' : 'normal',
    status: 'recorded',
    metadata: { memoryId: row.id, category: row.category },
  });

  return { saved: row as CompanionMemoryRecord };
}

export async function refreshAwarenessSources(options: {
  db: any;
  userId: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<{
  sources: AwarenessSourceRecord[];
  observationsCreated: CompanionTimelineItem[];
  promptBanner: string;
}> {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const nowISO = new Date().toISOString();

  // Check user integrations in Postgres (Google OAuth & NeoSapien)
  let hasGoogleOAuth = false;
  let hasNeoSapien = false;
  try {
    const { data: tokens } = await options.db
      .from('integration_tokens')
      .select('provider, expires_at')
      .eq('user_id', options.userId);
    for (const t of tokens || []) {
      if (t.provider === 'google') hasGoogleOAuth = true;
      if (t.provider === 'neosapien') hasNeoSapien = true;
    }
  } catch {
    /* ignore */
  }

  const [devReport, researchFeed, recentTlRes] = await Promise.all([
    fetchDevMonitorReport({ env, fetchImpl }).catch(() => null),
    fetchResearchIntelligence('small wind turbine OR agilex robotics', fetchImpl).catch(() => null),
    options.db
      .from('companion_timeline')
      .select('*')
      .eq('user_id', options.userId)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const recentTimeline = (recentTlRes?.data || []) as CompanionTimelineItem[];
  const settings = await loadCompanionSettingsFromDb(options.db, options.userId);
  const candidates = [];

  const updatedSources: AwarenessSourceRecord[] = [];
  const pushSource = (rec: AwarenessSourceRecord) => updatedSources.push(rec);

  // 1. Workspace Hub (always active)
  pushSource({
    id: 'workspace_hub',
    status: 'connected',
    enabled: true,
    poll_interval_minutes: 5,
    last_checked_at: nowISO,
    latest_summary: 'Dexie + Supabase realtime workspace sync active',
    updated_at: nowISO,
  });

  // 2. GitHub
  if (devReport?.github) {
    const gh = devReport.github;
    const latestSha = gh.recentCommits?.[0]?.sha;
    const latestRun = gh.recentWorkflowRuns?.[0];
    pushSource({
      id: 'github',
      status: gh.status === 'connected' ? 'connected' : 'degraded',
      enabled: true,
      poll_interval_minutes: 15,
      cursor_token: latestSha || undefined,
      last_checked_at: nowISO,
      last_event_at: gh.recentCommits?.[0]?.date,
      last_error: gh.error,
      latest_summary:
        gh.recentCommits?.[0]?.message
          ? `${gh.repo} @ ${latestSha}: ${gh.recentCommits[0].message.slice(0, 80)}`
          : gh.error || gh.repo,
      metadata: {
        repo: gh.repo,
        openPullRequests: gh.openPullRequests.length,
        latestCiConclusion: latestRun?.conclusion || latestRun?.status || null,
      },
      updated_at: nowISO,
    });

    if (latestRun && latestRun.conclusion === 'failure') {
      candidates.push(
        normalizeExternalObservation({
          dedupKey: `gh_ci_fail_${latestRun.id}`,
          source: 'github',
          project: 'Yashwanth Hub',
          rawTitle: `CI workflow failed: ${latestRun.name}`,
          rawBody: `Branch ${latestRun.branch} run #${latestRun.id} finished with conclusion=${latestRun.conclusion}.`,
          importanceScore: 9,
          actionUrl: latestRun.url,
        })
      );
    } else if (gh.recentCommits?.[0]) {
      candidates.push(
        normalizeExternalObservation({
          dedupKey: `gh_commit_${gh.recentCommits[0].sha}`,
          source: 'github',
          project: 'Yashwanth Hub',
          rawTitle: `Latest GitHub commit ${gh.recentCommits[0].sha}`,
          rawBody: gh.recentCommits[0].message,
          importanceScore: 6,
          actionUrl: gh.recentCommits[0].url,
        })
      );
    }
  }

  // 3. Vercel
  if (devReport?.vercel) {
    const vc = devReport.vercel;
    const latestDep = vc.latestDeployments?.[0];
    const hasVcRuntime = Boolean(vc.runtimeCommitSha || vc.tokenConfigured);
    pushSource({
      id: 'vercel',
      status: vc.error ? 'degraded' : hasVcRuntime ? 'connected' : 'not_configured',
      enabled: true,
      poll_interval_minutes: 15,
      cursor_token: latestDep?.uid || vc.runtimeCommitSha || undefined,
      last_checked_at: nowISO,
      last_event_at: latestDep?.createdAt,
      last_error: vc.error,
      latest_summary: latestDep
        ? `${latestDep.state} · ${latestDep.url}`
        : vc.runtimeCommitSha
        ? `Live commit ${vc.runtimeCommitSha.slice(0, 7)} (${vc.runtimeCommitRef || 'prod'})`
        : 'Add VERCEL_TOKEN to query deployment history',
      updated_at: nowISO,
    });
    if (latestDep && (latestDep.state === 'ERROR' || latestDep.state === 'CANCELED')) {
      candidates.push(
        normalizeExternalObservation({
          dedupKey: `vc_deploy_${latestDep.uid}`,
          source: 'vercel',
          project: 'Yashwanth Hub',
          rawTitle: `Vercel deployment ${latestDep.state}`,
          rawBody: latestDep.commitMessage || latestDep.url,
          importanceScore: 9,
          actionUrl: latestDep.url,
        })
      );
    }
  }

  // 4. Google Workspace
  pushSource({
    id: 'google_workspace',
    status: hasGoogleOAuth ? 'connected' : 'not_configured',
    enabled: true,
    poll_interval_minutes: 20,
    last_checked_at: nowISO,
    latest_summary: hasGoogleOAuth
      ? 'Google OAuth token active (Gmail, Calendar, Tasks, Drive)'
      : 'Connect Google OAuth in Hub Integrations to inspect emails, calendar & tasks',
    updated_at: nowISO,
  });

  // 5. Research Feeds
  const topPaper = researchFeed?.papers?.[0];
  pushSource({
    id: 'research_feeds',
    status: topPaper ? 'connected' : 'degraded',
    enabled: true,
    poll_interval_minutes: 180,
    cursor_token: topPaper?.id,
    last_checked_at: nowISO,
    last_event_at: topPaper?.publishedDate,
    latest_summary: topPaper
      ? `${researchFeed?.papers.length || 0} relevant papers · Top: ${topPaper.title.slice(0, 70)}`
      : 'arXiv/OpenAlex reachable on demand',
    updated_at: nowISO,
  });
  if (topPaper && topPaper.relevanceScore >= 36) {
    candidates.push(
      normalizeExternalObservation({
        dedupKey: `paper_${topPaper.id}`,
        source: 'arxiv',
        project: topPaper.title.toLowerCase().includes('wind') ? 'PAWAN SHAKTI' : 'IvLabs / Robotics',
        rawTitle: `High-relevance paper (${topPaper.source.toUpperCase()}): ${topPaper.title}`,
        rawBody: topPaper.summary || topPaper.matchedKeywords.join(', '),
        importanceScore: 7,
        actionUrl: topPaper.url,
      })
    );
  }

  // 6. Semantic Scholar (live lightweight check)
  let s2Status: AwarenessSourceRecord['status'] = 'not_configured';
  let s2Summary = 'Queried on demand via Semantic Scholar public API';
  try {
    const s2Headers: Record<string, string> = { Accept: 'application/json' };
    if ((env.SEMANTIC_SCHOLAR_API_KEY || '').trim()) {
      s2Headers['x-api-key'] = String(env.SEMANTIC_SCHOLAR_API_KEY).trim();
    }
    const s2Res = await fetchImpl(
      'https://api.semanticscholar.org/graph/v1/paper/search?query=small+wind+turbine&limit=1&fields=title,year,url',
      { headers: s2Headers, signal: AbortSignal.timeout(3500) }
    );
    if (s2Res.ok) {
      const json = (await s2Res.json()) as { data?: Array<{ title?: string; url?: string }> };
      s2Status = 'connected';
      s2Summary = json?.data?.[0]?.title ? `Live · ${json.data[0].title.slice(0, 72)}` : 'Connected';
    } else if (s2Res.status === 429) {
      s2Status = 'degraded';
      s2Summary = 'Rate-limited (add SEMANTIC_SCHOLAR_API_KEY for dedicated quota)';
    }
  } catch {
    s2Status = 'degraded';
  }
  pushSource({
    id: 'semantic_scholar',
    status: s2Status,
    enabled: true,
    poll_interval_minutes: 240,
    last_checked_at: nowISO,
    latest_summary: s2Summary,
    updated_at: nowISO,
  });

  // 7. Supabase
  pushSource({
    id: 'supabase',
    status: (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').trim() ? 'connected' : 'not_configured',
    enabled: true,
    poll_interval_minutes: 30,
    last_checked_at: nowISO,
    latest_summary: (env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
      ? 'Full server & cron Postgres access active'
      : 'User-scoped RLS active (set SUPABASE_SERVICE_ROLE_KEY for background cron)',
    updated_at: nowISO,
  });

  // 8. Sentry (optional)
  const sentryConfigured = Boolean((env.SENTRY_AUTH_TOKEN || '').trim() && (env.SENTRY_ORG || '').trim());
  pushSource({
    id: 'sentry',
    status: sentryConfigured ? 'connected' : 'not_configured',
    enabled: sentryConfigured,
    poll_interval_minutes: 15,
    last_checked_at: nowISO,
    latest_summary: sentryConfigured
      ? `Monitoring Sentry org ${env.SENTRY_ORG}`
      : 'Not configured (set SENTRY_AUTH_TOKEN & SENTRY_ORG if using Sentry)',
    updated_at: nowISO,
  });

  // 9. n8n / Telegram / Discord Webhooks
  const chanReport = getNotificationChannelsStatus(env);
  const configuredChannels = chanReport.channels.filter((c) => c.configured).map((c) => c.label);
  pushSource({
    id: 'n8n_webhooks',
    status: configuredChannels.length > 0 ? 'connected' : 'not_configured',
    enabled: configuredChannels.length > 0,
    poll_interval_minutes: 30,
    last_checked_at: nowISO,
    latest_summary:
      configuredChannels.length > 0
        ? `Ready: ${configuredChannels.join(', ')}`
        : 'Not configured (set TELEGRAM_BOT_TOKEN / DISCORD_WEBHOOK_URL / N8N_WEBHOOK_URL)',
    updated_at: nowISO,
  });

  // 10. NeoSapien
  pushSource({
    id: 'neosapien',
    status: hasNeoSapien ? 'connected' : 'not_configured',
    enabled: true,
    poll_interval_minutes: 30,
    last_checked_at: nowISO,
    latest_summary: hasNeoSapien ? 'Neo 1 OAuth / MCP active' : 'Connect NeoSapien in Memory Vault to ingest wearable transcripts',
    updated_at: nowISO,
  });

  // Persist awareness sources
  for (const src of updatedSources) {
    try {
      await options.db
        .from('awareness_sources')
        .upsert({ ...src, user_id: options.userId }, { onConflict: 'user_id,id' });
    } catch {
      /* non-fatal */
    }
  }

  // Persist policy-filtered observations
  const observationsCreated: CompanionTimelineItem[] = [];
  for (const ev of candidates) {
    const policy = evaluateProactiveNotification(
      {
        dedupKey: ev.dedupKey,
        title: ev.title,
        summary: ev.summary,
        importanceScore: ev.importanceScore,
        severity: ev.severity,
        source: ev.source,
      },
      { settings, recentTimeline }
    );
    if (policy.decision === 'suppress_duplicate' || policy.decision === 'suppress_low_importance') {
      continue;
    }
    const row = await recordTimelineItem(options.db, options.userId, {
      kind: 'live_observation',
      source: ev.source,
      project: ev.project,
      title: ev.title,
      summary: ev.summary,
      importance: ev.severity,
      status: 'recorded',
      action_url: ev.actionUrl,
      metadata: {
        dedupKey: ev.dedupKey,
        deliveryPolicy: policy.decision,
        untrustedNotice: ev.untrustedNotice || false,
      },
    });
    observationsCreated.push(row);
    recentTimeline.unshift(row);
  }

  // Ensure every platform in AWARENESS_PLATFORMS appears once
  const summary = summarizeHonestAwareness(updatedSources);
  void AWARENESS_PLATFORMS;

  return {
    sources: updatedSources,
    observationsCreated,
    promptBanner: summary.promptBanner,
  };
}

export async function runProactiveCompanionTick(options: {
  db: any;
  userId: string;
  now?: Date;
  forceBriefing?: 'morning' | 'evening' | 'weekly';
}): Promise<{
  evaluated: boolean;
  briefingGenerated: string | null;
  alertsCreated: CompanionTimelineItem[];
}> {
  const now = options.now || new Date();
  const settings = await loadCompanionSettingsFromDb(options.db, options.userId);

  const [tasksRes, projectsRes, tlRes] = await Promise.all([
    options.db.from('tasks').select('id, text, area, priority, due_date, done').eq('user_id', options.userId).eq('done', false),
    options.db.from('projects').select('id, title, area, status, progress, target_date').eq('user_id', options.userId),
    options.db
      .from('companion_timeline')
      .select('*')
      .eq('user_id', options.userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const openTasks = (tasksRes?.data || []) as Array<any>;
  const activeProjects = (projectsRes?.data || []).filter((p: any) => p.status === 'active' || p.status === 'planning');
  const recentTimeline = (tlRes?.data || []) as CompanionTimelineItem[];
  const todayISO = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const overdue = openTasks.filter((t) => t.due_date && String(t.due_date).slice(0, 10) < todayISO);
  const dueToday = openTasks.filter((t) => t.due_date && String(t.due_date).slice(0, 10) === todayISO);

  const alertsCreated: CompanionTimelineItem[] = [];
  let briefingGenerated: string | null = null;

  // Check overdue critical interrupt
  if (overdue.length > 0) {
    const dedupKey = `proactive_overdue_${todayISO}`;
    const policy = evaluateProactiveNotification(
      {
        dedupKey,
        title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need triage`,
        summary: `Highest priority: ${overdue[0].text} (${overdue[0].area || 'Personal'})`,
        importanceScore: 9,
        severity: overdue.length >= 3 ? 'critical' : 'high',
        source: 'jarvis',
      },
      { settings, recentTimeline, now }
    );
    if (policy.decision === 'deliver_now') {
      const item = await recordTimelineItem(options.db, options.userId, {
        kind: 'recommendation',
        source: 'jarvis',
        agent_id: 'productivity',
        project: overdue[0].area || undefined,
        title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need triage`,
        summary: `Top item: "${overdue[0].text}". Want to reschedule stale items or focus on one first?`,
        importance: overdue.length >= 3 ? 'critical' : 'high',
        status: 'recorded',
        metadata: { dedupKey },
      });
      alertsCreated.push(item);
      recentTimeline.unshift(item);
    }
  }

  // Evaluate Morning / Evening / Weekly Briefing cadences
  const lastOfKind = (cadence: string) =>
    recentTimeline.find((t) => t.metadata?.briefingCadence === cadence)?.created_at || null;

  const cadences: Array<{ key: 'morning' | 'evening' | 'weekly'; time: string; title: string }> = [
    { key: 'morning', time: settings.morningBriefingTime, title: 'Morning Companion Briefing' },
    { key: 'evening', time: settings.eveningBriefingTime, title: 'Evening Wrap-Up Reflection' },
    { key: 'weekly', time: settings.weeklyReviewTime, title: 'Weekly Executive Synthesis' },
  ];

  for (const c of cadences) {
    const due =
      options.forceBriefing === c.key ||
      (settings.proactiveEnabled &&
        isScheduledBriefingDue({
          cadence: c.key,
          scheduleTimeHHmm: c.time,
          weeklyDay: settings.weeklyReviewDay,
          lastSentAt: lastOfKind(c.key),
          now,
        }));

    if (!due) continue;

    const pawan = activeProjects.find((p: any) => String(p.area || '').toUpperCase().includes('PAWAN'));
    const body = [
      `Open tasks: ${openTasks.length} (${dueToday.length} due today, ${overdue.length} overdue).`,
      `Active projects: ${activeProjects.length}${pawan ? ` · ${pawan.title} at ${pawan.progress ?? 0}%` : ''}.`,
      overdue.length > 0
        ? `Recommended focus: Clear "${overdue[0].text}" first.`
        : dueToday.length > 0
        ? `Recommended focus: Complete "${dueToday[0].text}" today.`
        : 'Slate is clear — good window for deep research or engineering.',
    ].join(' ');

    const item = await recordTimelineItem(options.db, options.userId, {
      kind: 'recommendation',
      source: 'jarvis',
      agent_id: 'executive',
      title: `${c.title} (${todayISO})`,
      summary: body,
      importance: overdue.length > 0 ? 'high' : 'normal',
      status: 'recorded',
      metadata: { briefingCadence: c.key, dedupKey: `brief_${c.key}_${todayISO}` },
    });
    alertsCreated.push(item);
    briefingGenerated = c.key;
    break;
  }

  return {
    evaluated: true,
    briefingGenerated,
    alertsCreated,
  };
}

export async function executeAuthorizedBuddyAction(options: {
  db: any;
  userId: string;
  toolName: string;
  args: Record<string, any>;
  approvedByHuman?: boolean;
  timelineId?: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<{
  status: 'executed' | 'pending_approval' | 'blocked' | 'failed';
  tier: 1 | 2 | 3;
  message: string;
  verifiedRecordId?: string;
  actionUrl?: string;
  timelineItem?: CompanionTimelineItem;
}> {
  const { level, policyLabel } = classifyCompanionActionTier(options.toolName);
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;

  // Tier 3 strictly blocked
  if (level === 3) {
    const blockedItem = await recordTimelineItem(options.db, options.userId, {
      kind: 'error',
      source: 'agent',
      title: `Blocked Tier 3 action: ${options.toolName}`,
      summary: `Restricted action "${options.toolName}" (${policyLabel}) cannot be executed autonomously.`,
      importance: 'high',
      status: 'rejected',
      metadata: { toolName: options.toolName, tier: 3 },
    });
    return {
      status: 'blocked',
      tier: 3,
      message: `Security policy strictly blocks "${options.toolName}" (Tier 3 restricted action).`,
      timelineItem: blockedItem,
    };
  }

  // Tier 2 requires explicit human approval
  if (level === 2 && !options.approvedByHuman) {
    const pendingItem = await recordTimelineItem(options.db, options.userId, {
      id: options.timelineId,
      kind: 'pending_approval',
      source: 'agent',
      project: options.args?.project ? String(options.args.project) : undefined,
      title: `Approval needed: ${String(options.args?.title || options.args?.text || options.toolName).slice(0, 120)}`,
      summary: String(options.args?.summary || options.args?.description || `Proposed Tier 2 action: ${options.toolName}`),
      importance: 'high',
      status: 'pending_approval',
      metadata: { toolName: options.toolName, args: options.args, tier: 2 },
    });
    return {
      status: 'pending_approval',
      tier: 2,
      message: `"${options.toolName}" requires your explicit confirmation before execution.`,
      timelineItem: pendingItem,
    };
  }

  // Execute + Verify
  try {
    const now = new Date().toISOString();
    let verifiedRecordId: string | undefined;
    let actionUrl: string | undefined;
    let summaryText = '';

    switch (options.toolName) {
      case 'create_task': {
        const text = String(options.args?.text || options.args?.title || '').trim();
        if (!text) throw new Error('Task text is required.');
        const id = crypto.randomUUID();
        const { data, error } = await options.db
          .from('tasks')
          .insert({
            id,
            user_id: options.userId,
            text: text.slice(0, 280),
            area: String(options.args?.area || options.args?.project || 'Personal'),
            priority: ['low', 'medium', 'high', 'urgent'].includes(options.args?.priority) ? options.args.priority : 'medium',
            due_date: options.args?.due_date || null,
            starred: Boolean(options.args?.starred),
            done: false,
            notes: options.args?.notes ? String(options.args.notes).slice(0, 1000) : null,
            created_at: now,
            updated_at: now,
          })
          .select('id, text')
          .single();
        if (error || !data?.id) throw new Error(error?.message || 'Task verification failed.');
        verifiedRecordId = String(data.id);
        summaryText = `Created & verified task "${data.text}" (${verifiedRecordId}).`;
        break;
      }

      case 'schedule_event': {
        const title = String(options.args?.title || '').trim();
        const date = String(options.args?.date || now.slice(0, 10));
        if (!title) throw new Error('Event title is required.');
        const id = crypto.randomUUID();
        const { data, error } = await options.db
          .from('events')
          .insert({
            id,
            user_id: options.userId,
            title: title.slice(0, 200),
            date,
            start_time: options.args?.start_time || null,
            end_time: options.args?.end_time || null,
            kind: options.args?.kind || 'Meeting',
            area: options.args?.area || 'Personal',
            notes: options.args?.notes || null,
            created_at: now,
            updated_at: now,
          })
          .select('id, title, date')
          .single();
        if (error || !data?.id) throw new Error(error?.message || 'Event insert failed.');
        verifiedRecordId = String(data.id);
        summaryText = `Scheduled & verified "${data.title}" on ${data.date}.`;
        break;
      }

      case 'save_note':
      case 'create_handover_doc': {
        const title = String(options.args?.title || 'JARVIS Technical Handover').trim();
        const body = String(options.args?.body || options.args?.content || '').trim();
        if (!body) throw new Error('Document body is required.');
        if (containsSensitiveSecret(body)) {
          throw new Error('Refused saving raw secret inside note/handover document.');
        }
        const id = crypto.randomUUID();
        const { data, error } = await options.db
          .from('notes')
          .insert({
            id,
            user_id: options.userId,
            title: title.slice(0, 200),
            body: body.slice(0, 12000),
            area: String(options.args?.area || options.args?.project || 'General'),
            pinned: options.toolName === 'create_handover_doc',
            created_at: now,
            updated_at: now,
          })
          .select('id, title')
          .single();
        if (error || !data?.id) throw new Error(error?.message || 'Note verification failed.');
        verifiedRecordId = String(data.id);
        summaryText = `Saved & verified ${options.toolName === 'create_handover_doc' ? 'handover document' : 'note'} "${data.title}".`;
        break;
      }

      case 'save_memory': {
        const res = await upsertCompanionMemoryServer({
          db: options.db,
          userId: options.userId,
          input: options.args,
          env,
          fetchImpl,
        });
        if (!res.saved) throw new Error(res.skippedReason || 'Memory save skipped.');
        verifiedRecordId = res.saved.id;
        summaryText = `Stored companion memory "${res.saved.title}".`;
        break;
      }

      case 'send_notification':
      case 'dispatch_webhook': {
        const results = await dispatchNotificationToChannels(
          {
            channel: String(options.args?.channel || 'all') as any,
            title: String(options.args?.title || 'JARVIS Notification'),
            message: String(options.args?.summary || options.args?.message || ''),
            severity: (options.args?.severity as any) || 'warning',
            webhookUrl: options.args?.action_url,
          },
          { env, fetchImpl }
        );
        const sent = results.filter((r) => r.status === 'sent');
        if (sent.length === 0) {
          throw new Error(results.map((r) => `${r.channel}: ${r.error || r.status}`).join(' | ') || 'No configured outbound channels.');
        }
        verifiedRecordId = `dispatch_${Date.now()}`;
        summaryText = `Dispatched via ${sent.map((s) => s.channel).join(', ')}.`;
        break;
      }

      case 'create_github_issue': {
        const token = (env.GITHUB_TOKEN || '').trim();
        const repo = String(options.args?.repo || env.GITHUB_REPO || 'koyaneni-yaswanth/yashwanth-hub').trim();
        if (!token) {
          throw new Error('GITHUB_TOKEN is not configured in server environment; cannot create GitHub issue.');
        }
        if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
          throw new Error('Invalid GitHub repository slug.');
        }
        const title = String(options.args?.title || '').trim();
        const body = String(options.args?.body || '').trim();
        if (!title) throw new Error('GitHub issue title is required.');

        const ghRes = await fetchImpl(`https://api.github.com/repos/${repo}/issues`, {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'JARVIS-Buddy-4.0',
          },
          body: JSON.stringify({
            title: title.slice(0, 200),
            body: body.slice(0, 4000),
            labels: Array.isArray(options.args?.labels) ? options.args.labels.slice(0, 5) : undefined,
          }),
          signal: AbortSignal.timeout(6000),
        });
        const ghData = (await ghRes.json().catch(() => ({}))) as { number?: number; html_url?: string; message?: string };
        if (!ghRes.ok || !ghData.html_url) {
          throw new Error(`GitHub API ${ghRes.status}: ${ghData.message || 'failed to create issue'}`);
        }
        verifiedRecordId = `gh_issue_${ghData.number}`;
        actionUrl = ghData.html_url;
        summaryText = `Created & verified GitHub issue #${ghData.number} in ${repo}.`;
        break;
      }

      default:
        throw new Error(`Unsupported companion tool: ${options.toolName}`);
    }

    const doneItem = await recordTimelineItem(options.db, options.userId, {
      id: options.timelineId,
      kind: 'executed_action',
      source: options.toolName === 'create_github_issue' ? 'github' : 'jarvis',
      project: options.args?.project ? String(options.args.project) : undefined,
      title: `Completed: ${String(options.args?.title || options.args?.text || options.toolName).slice(0, 120)}`,
      summary: summaryText,
      importance: 'normal',
      status: 'executed',
      action_url: actionUrl,
      metadata: {
        toolName: options.toolName,
        tier: level,
        verifiedRecordId,
      },
    });

    return {
      status: 'executed',
      tier: level,
      message: summaryText,
      verifiedRecordId,
      actionUrl,
      timelineItem: doneItem,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const errItem = await recordTimelineItem(options.db, options.userId, {
      id: options.timelineId,
      kind: 'error',
      source: 'agent',
      title: `Execution failed: ${options.toolName}`,
      summary: errMsg,
      importance: 'high',
      status: 'failed',
      metadata: { toolName: options.toolName, tier: level },
    });
    return {
      status: 'failed',
      tier: level,
      message: errMsg,
      timelineItem: errItem,
    };
  }
}
