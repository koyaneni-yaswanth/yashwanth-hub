export const M3_SYNC_TABLES = [
  'knowledge_links',
  'research_bookmarks',
  'agent_execution_logs',
] as const;

export type M3TableName = (typeof M3_SYNC_TABLES)[number];

export interface TimestampedM3Row {
  id: string;
  updated_at?: string;
  saved_at?: string;
  created_at?: string;
}

export function m3RowTimestamp(row: TimestampedM3Row | null | undefined): string {
  if (!row) return '';
  return String(row.updated_at || row.saved_at || row.created_at || '');
}

/**
 * Pure realtime reconciliation helper for M3 cloud-synced collections.
 * Preserves newer local edits when stale cloud echoes arrive and applies remote deletions.
 */
export function applyM3PayloadToArray<T extends TimestampedM3Row>(
  current: T[],
  payload: { eventType: string; new?: any; old?: any },
  maxItems = 250,
): T[] {
  const eventType = String(payload?.eventType || '').toUpperCase();

  if (eventType === 'INSERT' || eventType === 'UPDATE') {
    const incoming = payload?.new as T | undefined;
    if (!incoming?.id) return current;

    const existing = current.find((item) => item.id === incoming.id);
    if (existing && m3RowTimestamp(existing) > m3RowTimestamp(incoming)) {
      return current;
    }

    const updated = [incoming, ...current.filter((item) => item.id !== incoming.id)];
    updated.sort((a, b) => m3RowTimestamp(b).localeCompare(m3RowTimestamp(a)));
    return updated.slice(0, maxItems);
  }

  if (eventType === 'DELETE') {
    const deletedId = payload?.old?.id;
    if (!deletedId) return current;
    return current.filter((item) => item.id !== deletedId);
  }

  return current;
}
