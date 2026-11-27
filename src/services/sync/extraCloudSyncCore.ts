/**
 * Pure cloud row mappers & conflict resolution helpers for:
 * - ai_conversations
 * - memories (Dexie db.neo_memories <-> Supabase public.memories)
 * - user_preferences (synced settings like v3f_assessment_v2, pawan_shakti_pv_telemetry)
 * Zero DOM or Dexie imports so Node unit tests verify every mapping directly.
 */
import { ensureWorkspaceUuid } from './workspaceSyncCore.ts';

type Row = Record<string, unknown>;

const VALID_MEMORY_SOURCES = new Set([
  'wearable_neo1',
  'desktop_meeting',
  'web_import',
  'mcp_sync',
  'webhook',
]);

const VALID_MEMORY_PLATFORMS = new Set([
  'google_meet',
  'zoom',
  'microsoft_teams',
  'whatsapp',
  'in_person',
  'phone_call',
  'other',
]);

export const SYNCED_PREFERENCE_KEYS = [
  'v3f_assessment_v2',
  'pawan_pv_telemetry_v1',
  'jarvis_companion_settings_v1',
] as const;

export type SyncedPreferenceKey = (typeof SYNCED_PREFERENCE_KEYS)[number];

export function isSyncedPreferenceKey(key: string): key is SyncedPreferenceKey {
  return (SYNCED_PREFERENCE_KEYS as readonly string[]).includes(key);
}

export function rowTimestampMs(row: Row | null | undefined, fallbackField = 'created_at'): number {
  if (!row) return 0;
  const raw =
    row.updated_at ??
    row.imported_at ??
    row.importedAt ??
    row.captured_at ??
    row.capturedAt ??
    row[fallbackField];
  const parsed = Date.parse(String(raw ?? ''));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function toCloudConversationRow(conv: Row, userId?: string | null): Row {
  const now = new Date().toISOString();
  const out: Row = {
    id: ensureWorkspaceUuid(String(conv.id || '')),
    title: String(conv.title || 'AI Thread').slice(0, 200),
    agent_id: String(conv.agent_id || 'orchestrator'),
    mode: String(conv.mode || 'personal'),
    project_id: conv.project_id ? String(conv.project_id) : null,
    messages: Array.isArray(conv.messages) ? conv.messages : [],
    total_tokens: Number(conv.total_tokens || 0) || 0,
    total_cost_usd: Number(conv.total_cost_usd || 0) || 0,
    created_at: String(conv.created_at || now),
    updated_at: String(conv.updated_at || now),
  };
  if (userId) out.user_id = userId;
  return out;
}

export function fromCloudConversationRow(row: Row): Row {
  return {
    id: String(row.id),
    title: String(row.title || 'AI Thread'),
    agent_id: String(row.agent_id || 'orchestrator'),
    mode: String(row.mode || 'personal'),
    project_id: row.project_id ? String(row.project_id) : undefined,
    messages: Array.isArray(row.messages) ? row.messages : [],
    total_tokens: Number(row.total_tokens || 0) || 0,
    total_cost_usd: Number(row.total_cost_usd || 0) || 0,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
  };
}

export function toCloudMemoryRow(mem: Row, userId?: string | null): Row {
  const rawSource = String(mem.source || 'web_import');
  const source = VALID_MEMORY_SOURCES.has(rawSource) ? rawSource : 'web_import';
  const rawPlatform = String(mem.platform || 'in_person');
  const platform = VALID_MEMORY_PLATFORMS.has(rawPlatform) ? rawPlatform : 'other';
  const now = new Date().toISOString();
  const out: Row = {
    id: ensureWorkspaceUuid(String(mem.id || '')),
    original_neo_id: mem.originalNeoId ?? mem.original_neo_id ?? null,
    title: String(mem.title || 'Untitled Memory'),
    source,
    platform,
    captured_at: String(mem.capturedAt ?? mem.captured_at ?? now),
    duration_minutes: mem.durationMinutes ?? mem.duration_minutes ?? null,
    summary: String(mem.summary || ''),
    transcript: mem.transcript ? String(mem.transcript) : null,
    speakers: Array.isArray(mem.speakers) ? mem.speakers : [],
    decisions: Array.isArray(mem.decisions) ? mem.decisions : [],
    action_items: Array.isArray(mem.actionItems ?? mem.action_items)
      ? (mem.actionItems ?? mem.action_items)
      : [],
    commitments: Array.isArray(mem.commitments) ? mem.commitments : [],
    follow_ups: Array.isArray(mem.followUps ?? mem.follow_ups)
      ? (mem.followUps ?? mem.follow_ups)
      : [],
    reminders: Array.isArray(mem.reminders) ? mem.reminders : [],
    people_mentioned: Array.isArray(mem.peopleMentioned ?? mem.people_mentioned)
      ? (mem.peopleMentioned ?? mem.people_mentioned)
      : [],
    tags: Array.isArray(mem.tags) ? mem.tags : [],
    associated_project_id: mem.associatedProjectId ?? mem.associated_project_id ?? null,
    associated_area: mem.associatedArea ?? mem.associated_area ?? 'Personal',
    associated_google_event_id: mem.associatedGoogleEventId ?? mem.associated_google_event_id ?? null,
    sync_method: mem.syncMethod ?? mem.sync_method ?? 'web_import',
    is_important: Boolean(mem.isImportant ?? mem.is_important ?? false),
    imported_at: String(mem.importedAt ?? mem.imported_at ?? now),
    updated_at: String(mem.updated_at ?? mem.importedAt ?? mem.imported_at ?? now),
  };
  if (userId) out.user_id = userId;
  return out;
}

export function fromCloudMemoryRow(row: Row): Row {
  const iso = (val: unknown) => {
    const t = Date.parse(String(val ?? ''));
    return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
  };
  return {
    id: String(row.id),
    originalNeoId: row.original_neo_id ? String(row.original_neo_id) : undefined,
    title: String(row.title || 'Neo Memory'),
    source: String(row.source || 'web_import'),
    platform: String(row.platform || 'in_person'),
    capturedAt: iso(row.captured_at),
    durationMinutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : undefined,
    summary: String(row.summary || ''),
    transcript: row.transcript ? String(row.transcript) : undefined,
    speakers: Array.isArray(row.speakers) ? row.speakers : [],
    decisions: Array.isArray(row.decisions) ? row.decisions : [],
    actionItems: Array.isArray(row.action_items) ? row.action_items : [],
    commitments: Array.isArray(row.commitments) ? row.commitments : [],
    followUps: Array.isArray(row.follow_ups) ? row.follow_ups : [],
    reminders: Array.isArray(row.reminders) ? row.reminders : [],
    peopleMentioned: Array.isArray(row.people_mentioned) ? row.people_mentioned : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    associatedProjectId: row.associated_project_id ? String(row.associated_project_id) : undefined,
    associatedArea: row.associated_area ? String(row.associated_area) : 'Personal',
    associatedGoogleEventId: row.associated_google_event_id ? String(row.associated_google_event_id) : undefined,
    syncMethod: row.sync_method ? String(row.sync_method) : 'cloud',
    isImportant: Boolean(row.is_important),
    importedAt: iso(row.imported_at ?? row.captured_at),
  };
}
