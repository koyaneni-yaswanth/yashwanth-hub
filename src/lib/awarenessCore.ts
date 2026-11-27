/**
 * JARVIS 4.0 Connected Platform Awareness Normalizer & Honest Status Evaluator
 * Zero DOM / Dexie dependencies (Node & Browser safe).
 * Never fabricates telemetry for unconfigured or disconnected integrations.
 */
import type { AwarenessSourceRecord, CompanionTimelineItem } from '../types';
import { wrapUntrustedExternalContent } from './companionSecurity.ts';

export interface CredentialStatusItem {
  id: string;
  label: string;
  configured: boolean;
  envVar: string;
  scope: 'ai' | 'dev' | 'workspace' | 'monitoring' | 'research' | 'notifications';
  requiredFor: string;
}

export type AwarenessSourceId =
  | 'workspace_hub'
  | 'github'
  | 'vercel'
  | 'google_workspace'
  | 'research_feeds'
  | 'semantic_scholar'
  | 'supabase'
  | 'sentry'
  | 'n8n_webhooks'
  | 'neosapien';

export interface AwarenessPlatformMeta {
  id: AwarenessSourceId;
  label: string;
  category: 'development' | 'productivity' | 'research' | 'intelligence' | 'monitoring';
  defaultIntervalMinutes: number;
  requiredCredentialsHint: string;
}

export const AWARENESS_PLATFORMS: AwarenessPlatformMeta[] = [
  {
    id: 'workspace_hub',
    label: 'Yashwanth Hub Workspace',
    category: 'productivity',
    defaultIntervalMinutes: 5,
    requiredCredentialsHint: 'Local-first Dexie (always active)',
  },
  {
    id: 'github',
    label: 'GitHub Repositories & CI',
    category: 'development',
    defaultIntervalMinutes: 15,
    requiredCredentialsHint: 'GITHUB_TOKEN optional for private repos / higher rate limits / issue creation',
  },
  {
    id: 'vercel',
    label: 'Vercel Deployments & Builds',
    category: 'development',
    defaultIntervalMinutes: 15,
    requiredCredentialsHint: 'VERCEL_TOKEN optional for deployment listing & build diagnostics',
  },
  {
    id: 'google_workspace',
    label: 'Google Workspace (Gmail, Calendar, Tasks, Drive)',
    category: 'productivity',
    defaultIntervalMinutes: 20,
    requiredCredentialsHint: 'Sign in with Google OAuth in Hub Integrations',
  },
  {
    id: 'research_feeds',
    label: 'arXiv & OpenAlex Research Radar',
    category: 'research',
    defaultIntervalMinutes: 180,
    requiredCredentialsHint: 'Zero-key public academic APIs',
  },
  {
    id: 'semantic_scholar',
    label: 'Semantic Scholar Citation Graph',
    category: 'research',
    defaultIntervalMinutes: 240,
    requiredCredentialsHint: 'Public API (SEMANTIC_SCHOLAR_API_KEY optional for higher throughput)',
  },
  {
    id: 'supabase',
    label: 'Supabase Database & Auth',
    category: 'development',
    defaultIntervalMinutes: 30,
    requiredCredentialsHint: 'SUPABASE_URL + SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY',
  },
  {
    id: 'sentry',
    label: 'Sentry Error Monitoring',
    category: 'monitoring',
    defaultIntervalMinutes: 15,
    requiredCredentialsHint: 'SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT (not configured unless added)',
  },
  {
    id: 'n8n_webhooks',
    label: 'n8n / Telegram / Discord Channels',
    category: 'monitoring',
    defaultIntervalMinutes: 30,
    requiredCredentialsHint: 'N8N_WEBHOOK_URL / TELEGRAM_BOT_TOKEN / DISCORD_WEBHOOK_URL',
  },
  {
    id: 'neosapien',
    label: 'NeoSapien Neo 1 Wearable / MCP',
    category: 'intelligence',
    defaultIntervalMinutes: 30,
    requiredCredentialsHint: 'NeoSapien OAuth/MCP token in Memory Vault',
  },
];

export interface NormalizedAwarenessEvent {
  dedupKey: string;
  source: string;
  project?: string;
  title: string;
  summary: string;
  importanceScore: number;
  severity: CompanionTimelineItem['importance'];
  actionUrl?: string;
  untrustedNotice?: boolean;
}

export function normalizeExternalObservation(input: {
  dedupKey: string;
  source: string;
  project?: string;
  rawTitle: string;
  rawBody: string;
  importanceScore: number;
  actionUrl?: string;
}): NormalizedAwarenessEvent {
  const safeBody = wrapUntrustedExternalContent(input.source, input.rawBody, 500);
  const safeTitle = String(input.rawTitle || 'Observation').replace(/[\r\n]+/g, ' ').slice(0, 140);
  const score = Math.min(10, Math.max(1, Math.round(input.importanceScore)));
  const severity: CompanionTimelineItem['importance'] =
    score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'normal' : 'low';

  return {
    dedupKey: input.dedupKey,
    source: input.source,
    project: input.project,
    title: safeTitle,
    summary: safeBody.suspicious
      ? `${safeTitle} — Note: upstream text contained suspicious instruction patterns that were isolated.`
      : String(input.rawBody || '').replace(/\s+/g, ' ').slice(0, 260),
    importanceScore: score,
    severity,
    actionUrl: input.actionUrl,
    untrustedNotice: safeBody.suspicious,
  };
}

export function summarizeHonestAwareness(sources: AwarenessSourceRecord[]): {
  connectedLabels: string[];
  unconfiguredLabels: string[];
  degradedLabels: string[];
  promptBanner: string;
} {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const connectedLabels: string[] = [];
  const unconfiguredLabels: string[] = [];
  const degradedLabels: string[] = [];

  for (const meta of AWARENESS_PLATFORMS) {
    const rec = byId.get(meta.id);
    const status = rec?.status || (meta.id === 'workspace_hub' ? 'connected' : 'not_configured');
    if (status === 'connected') {
      connectedLabels.push(`${meta.label}${rec?.latest_summary ? ` (${rec.latest_summary})` : ''}`);
    } else if (status === 'error' || status === 'degraded') {
      degradedLabels.push(`${meta.label}: ${rec?.last_error || status}`);
    } else if (status !== 'paused') {
      unconfiguredLabels.push(`${meta.label} [${meta.requiredCredentialsHint}]`);
    }
  }

  const lines = [
    `Connected & Live (${connectedLabels.length}): ${connectedLabels.join(' | ') || 'Local Hub only'}`,
    degradedLabels.length > 0 ? `Degraded (${degradedLabels.length}): ${degradedLabels.join(' | ')}` : '',
    `Not Configured / Disconnected (${unconfiguredLabels.length}): ${unconfiguredLabels.map((l) => l.split(' [')[0]).join(', ')}`,
  ].filter(Boolean);

  return {
    connectedLabels,
    unconfiguredLabels,
    degradedLabels,
    promptBanner: lines.join('\n'),
  };
}
