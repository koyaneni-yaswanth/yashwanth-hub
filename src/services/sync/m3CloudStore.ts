import { db } from '../../db';
import { getSupabaseClient } from '../../lib/supabase';
import { generateId } from '../../lib/utils';

export type KnowledgeEntityType = 'task' | 'goal' | 'note' | 'project' | 'paper' | 'habit' | 'area';

export interface KnowledgeLinkRecord {
  id: string;
  source_type: KnowledgeEntityType;
  source_id: string;
  source_label: string;
  target_type: KnowledgeEntityType;
  target_id: string;
  target_label: string;
  relation: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ResearchBookmarkRecord {
  id: string;
  source: 'arxiv' | 'openalex' | 'crossref' | 'other';
  external_id: string;
  title: string;
  authors: string[];
  year?: number | null;
  url: string;
  summary?: string;
  topic?: string;
  tags: string[];
  note_id?: string | null;
  saved_at: string;
  updated_at: string;
}

export interface AgentExecutionLogRecord {
  id: string;
  action_type: string;
  permission_level: 1 | 2 | 3;
  status: 'executed' | 'pending_approval' | 'approved' | 'rejected' | 'blocked' | 'failed';
  summary: string;
  channel?: string;
  details?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const LINKS_SETTING_KEY = 'm3_knowledge_links';
const BOOKMARKS_SETTING_KEY = 'm3_research_bookmarks';
const LOGS_SETTING_KEY = 'm3_agent_execution_logs';
const MAX_LOCAL_LOGS = 80;

async function readSettingArray<T>(key: string): Promise<T[]> {
  try {
    const row = await db.settings.get(key);
    if (Array.isArray(row?.value)) {
      return row.value as T[];
    }
  } catch {
    // Fallback to localStorage below when IndexedDB unavailable (e.g. headless test)
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as T[];
      }
    } catch {
      // Ignore corrupt localStorage payload
    }
  }
  return [];
}

async function writeSettingArray<T>(key: string, items: T[]): Promise<void> {
  try {
    await db.settings.put({
      key,
      value: items,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Ignore when running outside browser Dexie runtime
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      // Ignore storage quota issues
    }
  }
}

async function getSignedInContext(): Promise<{ client: NonNullable<ReturnType<typeof getSupabaseClient>>; userId: string } | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getUser();
    if (!data?.user?.id) return null;
    return { client, userId: data.user.id };
  } catch {
    return null;
  }
}

function mergeById<T extends { id: string; updated_at?: string; saved_at?: string; created_at?: string }>(
  localItems: T[],
  remoteItems: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const item of localItems) {
    byId.set(item.id, item);
  }
  for (const remote of remoteItems) {
    const existing = byId.get(remote.id);
    if (!existing) {
      byId.set(remote.id, remote);
      continue;
    }
    const existingTs = existing.updated_at || existing.saved_at || existing.created_at || '';
    const remoteTs = remote.updated_at || remote.saved_at || remote.created_at || '';
    if (remoteTs >= existingTs) {
      byId.set(remote.id, remote);
    }
  }
  return Array.from(byId.values()).sort((a, b) => {
    const tsA = a.updated_at || a.saved_at || a.created_at || '';
    const tsB = b.updated_at || b.saved_at || b.created_at || '';
    return tsB.localeCompare(tsA);
  });
}

// ---------------------------------------------------------------------------
// 1. User-Created Knowledge Graph Links (`knowledge_links`)
// ---------------------------------------------------------------------------

export async function loadKnowledgeLinks(): Promise<KnowledgeLinkRecord[]> {
  const local = await readSettingArray<KnowledgeLinkRecord>(LINKS_SETTING_KEY);
  const auth = await getSignedInContext();
  if (!auth) return local;

  try {
    const { data, error } = await auth.client
      .from('knowledge_links')
      .select('*')
      .eq('user_id', auth.userId)
      .order('updated_at', { ascending: false })
      .limit(250);

    if (error || !Array.isArray(data)) return local;
    const merged = mergeById(local, data as KnowledgeLinkRecord[]);
    await writeSettingArray(LINKS_SETTING_KEY, merged);
    return merged;
  } catch {
    return local;
  }
}

export async function createKnowledgeLink(input: {
  source_type: KnowledgeEntityType;
  source_id: string;
  source_label: string;
  target_type: KnowledgeEntityType;
  target_id: string;
  target_label: string;
  relation?: string;
  notes?: string;
}): Promise<KnowledgeLinkRecord> {
  const now = new Date().toISOString();
  const record: KnowledgeLinkRecord = {
    id: generateId(),
    source_type: input.source_type,
    source_id: input.source_id.trim(),
    source_label: input.source_label.trim(),
    target_type: input.target_type,
    target_id: input.target_id.trim(),
    target_label: input.target_label.trim(),
    relation: (input.relation || 'related_to').trim(),
    notes: input.notes?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  const existing = await readSettingArray<KnowledgeLinkRecord>(LINKS_SETTING_KEY);
  const next = [record, ...existing.filter((l) => l.id !== record.id)];
  await writeSettingArray(LINKS_SETTING_KEY, next);

  const auth = await getSignedInContext();
  if (auth) {
    try {
      await auth.client.from('knowledge_links').upsert({
        ...record,
        user_id: auth.userId,
      });
    } catch {
      // Keep local record cleanly even if offline
    }
  }

  return record;
}

export async function deleteKnowledgeLink(id: string): Promise<void> {
  const existing = await readSettingArray<KnowledgeLinkRecord>(LINKS_SETTING_KEY);
  await writeSettingArray(
    LINKS_SETTING_KEY,
    existing.filter((item) => item.id !== id),
  );

  const auth = await getSignedInContext();
  if (auth) {
    try {
      await auth.client
        .from('knowledge_links')
        .delete()
        .eq('user_id', auth.userId)
        .eq('id', id);
    } catch {
      // Offline fallback already applied
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Synced Research Bookmarks (`research_bookmarks`)
// ---------------------------------------------------------------------------

export async function loadResearchBookmarks(): Promise<ResearchBookmarkRecord[]> {
  const local = await readSettingArray<ResearchBookmarkRecord>(BOOKMARKS_SETTING_KEY);
  const auth = await getSignedInContext();
  if (!auth) return local;

  try {
    const { data, error } = await auth.client
      .from('research_bookmarks')
      .select('*')
      .eq('user_id', auth.userId)
      .order('saved_at', { ascending: false })
      .limit(200);

    if (error || !Array.isArray(data)) return local;
    const merged = mergeById(local, data as ResearchBookmarkRecord[]);
    await writeSettingArray(BOOKMARKS_SETTING_KEY, merged);
    return merged;
  } catch {
    return local;
  }
}

export async function saveResearchBookmark(input: {
  source: 'arxiv' | 'openalex' | 'crossref' | 'other';
  external_id: string;
  title: string;
  authors?: string[];
  year?: number | null;
  url: string;
  summary?: string;
  topic?: string;
  tags?: string[];
  note_id?: string | null;
}): Promise<ResearchBookmarkRecord> {
  const now = new Date().toISOString();
  const stableId = `${input.source}:${input.external_id}`
    .toLowerCase()
    .replace(/[^a-z0-9:._-]/g, '_')
    .slice(0, 120);

  const record: ResearchBookmarkRecord = {
    id: stableId,
    source: input.source,
    external_id: input.external_id,
    title: input.title.trim(),
    authors: Array.isArray(input.authors) ? input.authors : [],
    year: input.year ?? null,
    url: input.url.trim(),
    summary: input.summary?.trim() || '',
    topic: input.topic?.trim() || undefined,
    tags: Array.isArray(input.tags) ? input.tags : [],
    note_id: input.note_id ?? null,
    saved_at: now,
    updated_at: now,
  };

  const existing = await readSettingArray<ResearchBookmarkRecord>(BOOKMARKS_SETTING_KEY);
  const next = [record, ...existing.filter((item) => item.id !== record.id)];
  await writeSettingArray(BOOKMARKS_SETTING_KEY, next);

  const auth = await getSignedInContext();
  if (auth) {
    try {
      await auth.client.from('research_bookmarks').upsert({
        ...record,
        user_id: auth.userId,
      });
    } catch {
      // Offline cache retains bookmark
    }
  }

  return record;
}

export async function removeResearchBookmark(id: string): Promise<void> {
  const existing = await readSettingArray<ResearchBookmarkRecord>(BOOKMARKS_SETTING_KEY);
  await writeSettingArray(
    BOOKMARKS_SETTING_KEY,
    existing.filter((item) => item.id !== id),
  );

  const auth = await getSignedInContext();
  if (auth) {
    try {
      await auth.client
        .from('research_bookmarks')
        .delete()
        .eq('user_id', auth.userId)
        .eq('id', id);
    } catch {
      // Local removal completed
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Autonomous Agent Execution Audit Logs (`agent_execution_logs`)
// ---------------------------------------------------------------------------

export async function loadExecutionLogs(): Promise<AgentExecutionLogRecord[]> {
  const local = await readSettingArray<AgentExecutionLogRecord>(LOGS_SETTING_KEY);
  const auth = await getSignedInContext();
  if (!auth) return local;

  try {
    const { data, error } = await auth.client
      .from('agent_execution_logs')
      .select('*')
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(MAX_LOCAL_LOGS);

    if (error || !Array.isArray(data)) return local;
    const merged = mergeById(local, data as AgentExecutionLogRecord[]).slice(0, MAX_LOCAL_LOGS);
    await writeSettingArray(LOGS_SETTING_KEY, merged);
    return merged;
  } catch {
    return local;
  }
}

export async function recordExecutionLog(entry: {
  id?: string;
  action_type: string;
  permission_level: 1 | 2 | 3;
  status: AgentExecutionLogRecord['status'];
  summary: string;
  channel?: string;
  details?: Record<string, unknown>;
}): Promise<AgentExecutionLogRecord> {
  const now = new Date().toISOString();
  const record: AgentExecutionLogRecord = {
    id: entry.id || generateId(),
    action_type: entry.action_type,
    permission_level: entry.permission_level,
    status: entry.status,
    summary: entry.summary,
    channel: entry.channel || 'diagnostics',
    details: entry.details ?? {},
    created_at: now,
    updated_at: now,
  };

  const existing = await readSettingArray<AgentExecutionLogRecord>(LOGS_SETTING_KEY);
  const next = [record, ...existing.filter((item) => item.id !== record.id)].slice(0, MAX_LOCAL_LOGS);
  await writeSettingArray(LOGS_SETTING_KEY, next);

  const auth = await getSignedInContext();
  if (auth) {
    try {
      await auth.client.from('agent_execution_logs').upsert({
        ...record,
        user_id: auth.userId,
      });
    } catch {
      // Keep local log cleanly
    }
  }

  return record;
}
