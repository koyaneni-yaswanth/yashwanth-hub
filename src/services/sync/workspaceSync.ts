import type { Transaction } from 'dexie';
import { db } from '../../db';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { SupabaseAuthService } from '../auth/supabaseAuthService';
import { SyncQueueService } from './syncQueueService';
import { applyMods, planReconcile, type PendingIds } from './lifeSyncCore';
import {
  WORKSPACE_LOCAL_TABLES,
  WORKSPACE_TABLE_SPECS,
  ensureWorkspaceUuid,
  fromCloudWorkspaceRow,
  toCloudWorkspaceRow,
  resolveLocalWorkspaceTable,
  workspaceRowStamp,
  type WorkspaceLocalTable,
} from './workspaceSyncCore';
import { mergeRemoteTask } from '../../lib/taskModel';
import type { Task } from '../../types';

type Row = Record<string, unknown>;
const REMOTE_FLAG = '__workspaceSyncRemote';
const PAGE = 1000;

const currentUserId = () => SupabaseAuthService.getState().user?.id ?? null;

function isRemote(tx: Transaction | undefined): boolean {
  let t = tx as (Transaction & { parent?: Transaction; [REMOTE_FLAG]?: boolean }) | undefined;
  while (t) {
    if (t[REMOTE_FLAG]) return true;
    t = t.parent as typeof t;
  }
  return false;
}

function runRemote<T>(table: WorkspaceLocalTable, fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [db.table(table)], (tx) => {
    (tx as unknown as Record<string, boolean>)[REMOTE_FLAG] = true;
    return fn();
  });
}

function queueWorkspaceMutation(
  table: WorkspaceLocalTable,
  id: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  row?: Row,
) {
  const normalizedId = ensureWorkspaceUuid(id);
  const payload =
    action === 'DELETE'
      ? { id: normalizedId }
      : toCloudWorkspaceRow(table, { ...row!, id: normalizedId }, currentUserId());
  SyncQueueService.enqueueChange(table, normalizedId, action, payload).catch((err) =>
    console.warn(`[workspaceSync] Could not queue ${table} ${action}:`, err),
  );
}

let hooksInstalled = false;
let hookSuppressDepth = 0;

/** Temporarily suppresses Dexie write hooks (used during one-time starter seeding). */
export async function runWithWorkspaceHooksSuppressed<T>(fn: () => Promise<T>): Promise<T> {
  hookSuppressDepth++;
  try {
    return await fn();
  } finally {
    hookSuppressDepth = Math.max(0, hookSuppressDepth - 1);
  }
}

/** Installs idempotent Dexie write hooks across all 10 core workspace tables. */
export function installWorkspaceSyncHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  for (const table of WORKSPACE_LOCAL_TABLES) {
    const t = db.table(table);
    t.hook('creating', function (_key, obj, tx) {
      if (hookSuppressDepth > 0 || isRemote(tx)) return;
      const row = { ...(obj as Row) };
      tx.on('complete', () => queueWorkspaceMutation(table, String(row.id), 'INSERT', row));
    });
    t.hook('updating', function (mods, key, obj, tx) {
      if (hookSuppressDepth > 0 || isRemote(tx)) return;
      const row = applyMods(obj as Row, mods as Row);
      tx.on('complete', () => queueWorkspaceMutation(table, String(key), 'UPDATE', row));
    });
    t.hook('deleting', function (key, _obj, tx) {
      if (hookSuppressDepth > 0 || isRemote(tx)) return;
      tx.on('complete', () => queueWorkspaceMutation(table, String(key), 'DELETE'));
    });
  }
}

const seenKey = (userId: string, table: WorkspaceLocalTable) => `workspace_sync_seen:${userId}:${table}`;

async function loadSeen(userId: string, table: WorkspaceLocalTable): Promise<Set<string>> {
  const s = await db.settings.get(seenKey(userId, table));
  return new Set(Array.isArray(s?.value) ? (s!.value as string[]) : []);
}

function saveSeen(userId: string, table: WorkspaceLocalTable, ids: Iterable<string>) {
  return db.settings.put({
    key: seenKey(userId, table),
    value: [...new Set(ids)],
    updated_at: new Date().toISOString(),
  });
}

async function pendingByWorkspaceTable(): Promise<Record<string, PendingIds>> {
  const out: Record<string, PendingIds> = {};
  for (const item of await db.sync_queue.toArray()) {
    const localTbl = resolveLocalWorkspaceTable(item.table_name);
    if (!localTbl) continue;
    const p = (out[localTbl] ??= { upserts: new Set(), deletes: new Set() });
    (item.action === 'DELETE' ? p.deletes : p.upserts).add(item.record_id);
  }
  return out;
}

async function fetchRemoteWorkspaceTable(table: WorkspaceLocalTable): Promise<{ rows: Row[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { rows: [], error: 'Supabase not configured' };
  const remoteTable = WORKSPACE_TABLE_SPECS[table].remoteTable;
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await (client.from(remoteTable) as any)
      .select('*')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...((data as Row[]) ?? []));
    if (!data || data.length < PAGE) return { rows };
  }
}

export type WorkspaceSyncResult =
  | { status: 'skipped'; reason: string }
  | { status: 'ok'; pulled: number; deleted: number; uploaded: number; tableErrors: string[] };

let runningWorkspaceReconcile: Promise<WorkspaceSyncResult> | null = null;

/** Bidirectional pull + push reconciliation for all core workspace tables. */
export function reconcileWorkspaceData(): Promise<WorkspaceSyncResult> {
  if (!runningWorkspaceReconcile) {
    runningWorkspaceReconcile = doReconcileWorkspace().finally(() => {
      runningWorkspaceReconcile = null;
    });
  }
  return runningWorkspaceReconcile;
}

async function doReconcileWorkspace(): Promise<WorkspaceSyncResult> {
  if (!isSupabaseConfigured()) return { status: 'skipped', reason: 'Supabase not configured' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'skipped', reason: 'offline' };

  const client = getSupabaseClient();
  const sessionRes = client ? await client.auth.getSession().catch(() => null) : null;
  const userId = sessionRes?.data?.session?.user?.id ?? currentUserId();
  if (!userId) return { status: 'skipped', reason: 'signed out' };

  const pending = await pendingByWorkspaceTable();
  const seedMeta = await db.settings.get('starter_seed_ids');
  const starterSeedIds = new Set<string>(Array.isArray(seedMeta?.value) ? (seedMeta!.value as string[]) : []);
  let pulled = 0;
  let deleted = 0;
  let uploaded = 0;
  const tableErrors: string[] = [];

  for (const table of WORKSPACE_LOCAL_TABLES) {
    const { rows: remoteRaw, error } = await fetchRemoteWorkspaceTable(table);
    if (error) {
      tableErrors.push(`${table}: ${error}`);
      continue;
    }

    if (table === 'tasks' && remoteRaw.length > 0) {
      SyncQueueService.noteRemoteTaskColumns(remoteRaw[0]);
    }

    const localRows = (await db.table(table).toArray()) as Row[];
    const localMap = new Map(localRows.map((r) => [String(r.id), r]));
    const pendingForTable = pending[table] ?? { upserts: new Set(), deletes: new Set() };
    const seen = await loadSeen(userId, table);

    // Map remote rows with local-table shape (preserving blobs / contacts mapping) before comparison.
    const remoteMapped = remoteRaw.map((r) => fromCloudWorkspaceRow(table, r, localMap.get(String(r.id))));

    const plan = planReconcileForWorkspace(table, localRows, remoteMapped, pendingForTable, seen);
    // Avoid uploading auto-generated starter demo rows onto another device when cloud already holds real records.
    if (starterSeedIds.size > 0 && remoteMapped.length > 0) {
      for (let i = plan.upload.length - 1; i >= 0; i--) {
        const sid = ensureWorkspaceUuid(String(plan.upload[i].id));
        if (starterSeedIds.has(sid)) {
          plan.deleteLocal.push(String(plan.upload[i].id));
          plan.upload.splice(i, 1);
        }
      }
    }

    if (plan.applyLocal.length || plan.deleteLocal.length) {
      const mergedRows: Row[] = [];
      for (const r of plan.applyLocal) {
        if (table === 'tasks') {
          const local = localMap.get(String(r.id)) as Task | undefined;
          const keepLocalV3 = await SyncQueueService.isTaskV3Unsynced(String(r.id));
          mergedRows.push(mergeRemoteTask(local, r as unknown as Task, { keepLocalV3 }) as unknown as Row);
        } else {
          mergedRows.push(r);
        }
      }
      await runRemote(table, async () => {
        if (mergedRows.length) await db.table(table).bulkPut(mergedRows);
        if (plan.deleteLocal.length) await db.table(table).bulkDelete(plan.deleteLocal);
      });
    }

    for (const row of plan.upload) {
      const normalizedId = ensureWorkspaceUuid(String(row.id));
      await SyncQueueService.enqueueChange(
        table,
        normalizedId,
        'UPDATE',
        toCloudWorkspaceRow(table, { ...row, id: normalizedId }, userId),
      );
    }

    await saveSeen(userId, table, plan.seen);
    pulled += plan.applyLocal.length;
    deleted += plan.deleteLocal.length;
    uploaded += plan.upload.length;
  }

  return { status: 'ok', pulled, deleted, uploaded, tableErrors };
}

function planReconcileForWorkspace(
  _table: WorkspaceLocalTable,
  localRows: Row[],
  remoteMapped: Row[],
  pending: PendingIds,
  previouslySeen: Set<string>,
) {
  const local = new Map(localRows.map((r) => [ensureWorkspaceUuid(String(r.id)), r]));
  const remote = new Map(remoteMapped.map((r) => [ensureWorkspaceUuid(String(r.id)), r]));
  const applyLocal: Row[] = [];
  const deleteLocal: string[] = [];
  const upload: Row[] = [];
  const seen = [...remote.keys()];

  for (const [id, r] of remote) {
    if (pending.upserts.has(id) || pending.deletes.has(id)) continue;
    const l = local.get(id);
    if (!l) {
      applyLocal.push(r);
      continue;
    }
    const lt = workspaceRowStamp(l);
    const rt = workspaceRowStamp(r);
    if (rt > lt) applyLocal.push(r);
    else if (lt > rt) upload.push(l);
  }

  for (const [id, l] of local) {
    if (remote.has(id) || pending.upserts.has(id)) continue;
    if (previouslySeen.has(id)) deleteLocal.push(String(l.id));
    else upload.push(l);
  }

  return { applyLocal, deleteLocal, upload, seen };
}

/** Applies a single Postgres realtime event for any workspace table cleanly into Dexie. */
export async function applyWorkspaceRealtime(
  tableOrRemote: string,
  payload: { eventType: string; new?: Row; old?: Row },
): Promise<void> {
  const table = resolveLocalWorkspaceTable(tableOrRemote);
  if (!table) return;
  const userId = currentUserId();

  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id ? String(payload.old.id) : null;
    if (!id) return;
    if (await SyncQueueService.hasPendingChange(table, id)) return;
    await runRemote(table, () => db.table(table).delete(id));
    if (userId) {
      const seen = await loadSeen(userId, table);
      seen.delete(id);
      await saveSeen(userId, table, seen);
    }
    return;
  }

  if (!payload.new?.id) return;
  const id = String(payload.new.id);
  if (await SyncQueueService.hasPendingChange(table, id)) return;

  const existing = (await db.table(table).get(id)) as Row | undefined;
  const mapped = fromCloudWorkspaceRow(table, payload.new, existing);
  if (existing && workspaceRowStamp(existing) > workspaceRowStamp(mapped)) return;

  await runRemote(table, () => db.table(table).put(mapped));
  if (userId) {
    const seen = await loadSeen(userId, table);
    seen.add(id);
    await saveSeen(userId, table, seen);
  }
}
