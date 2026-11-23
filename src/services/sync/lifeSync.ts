import type { Transaction } from 'dexie';
import { db } from '../../db';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { SupabaseAuthService } from '../auth/supabaseAuthService';
import { SyncQueueService } from './syncQueueService';
import {
  LIFE_TABLES,
  applyMods,
  fromCloudRow,
  planReconcile,
  rowStamp,
  toCloudRow,
  type LifeTable,
  type PendingIds,
} from './lifeSyncCore';

/**
 * Cloud sync for goals, milestones, habits, habit logs, daily plans and focus
 * sessions. Pages keep writing to Dexie as before; table hooks queue every
 * write (including cascades and bulk edits) for upload, and reconcile() merges
 * the cloud copy back in on start, sign-in, reconnect and when the app returns
 * to the foreground.
 */

type Row = Record<string, unknown>;
const REMOTE_FLAG = '__lifeSyncRemote';
const PAGE = 1000;

const currentUserId = () => SupabaseAuthService.getState().user?.id ?? null;

/** Writes made while applying cloud data must not be queued for upload again. */
function isRemote(tx: Transaction | undefined): boolean {
  let t = tx as (Transaction & { parent?: Transaction; [REMOTE_FLAG]?: boolean }) | undefined;
  while (t) {
    if (t[REMOTE_FLAG]) return true;
    t = t.parent as typeof t;
  }
  return false;
}

function runRemote<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', LIFE_TABLES.map((t) => db.table(t)), (tx) => {
    (tx as unknown as Record<string, boolean>)[REMOTE_FLAG] = true;
    return fn();
  });
}

function queue(table: LifeTable, id: string, action: 'INSERT' | 'UPDATE' | 'DELETE', row?: Row) {
  const payload = action === 'DELETE' ? { id } : toCloudRow(table, row!, currentUserId());
  SyncQueueService.enqueueChange(table, id, action, payload).catch((err) =>
    console.warn(`[lifeSync] Could not queue ${table} ${action}:`, err)
  );
}

let hooksInstalled = false;

/** Installs Dexie hooks so every local write to the six tables is queued for the cloud. */
export function installLifeSyncHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;
  for (const table of LIFE_TABLES) {
    const t = db.table(table);
    t.hook('creating', function (_key, obj, tx) {
      if (isRemote(tx)) return;
      const row = { ...(obj as Row) };
      tx.on('complete', () => queue(table, String(row.id), 'INSERT', row));
    });
    t.hook('updating', function (mods, key, obj, tx) {
      if (isRemote(tx)) return;
      const row = applyMods(obj as Row, mods as Row);
      tx.on('complete', () => queue(table, String(key), 'UPDATE', row));
    });
    t.hook('deleting', function (key, _obj, tx) {
      if (isRemote(tx)) return;
      tx.on('complete', () => queue(table, String(key), 'DELETE'));
    });
  }
}

const seenKey = (userId: string, table: LifeTable) => `life_sync_seen:${userId}:${table}`;

async function loadSeen(userId: string, table: LifeTable): Promise<Set<string>> {
  const s = await db.settings.get(seenKey(userId, table));
  return new Set(Array.isArray(s?.value) ? (s!.value as string[]) : []);
}

function saveSeen(userId: string, table: LifeTable, ids: Iterable<string>) {
  return db.settings.put({ key: seenKey(userId, table), value: [...new Set(ids)], updated_at: new Date().toISOString() });
}

async function pendingByTable(): Promise<Record<string, PendingIds>> {
  const out: Record<string, PendingIds> = {};
  for (const item of await db.sync_queue.toArray()) {
    const p = (out[item.table_name] ??= { upserts: new Set(), deletes: new Set() });
    (item.action === 'DELETE' ? p.deletes : p.upserts).add(item.record_id);
  }
  return out;
}

async function fetchAll(table: LifeTable): Promise<{ rows: Row[]; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { rows: [], error: 'Supabase not configured' };
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client.from(table).select('*').order('id').range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...((data as Row[]) ?? []));
    if (!data || data.length < PAGE) return { rows };
  }
}

export type LifeSyncResult =
  | { status: 'skipped'; reason: string }
  | { status: 'unavailable'; table: LifeTable; error: string }
  | { status: 'ok'; pulled: number; deleted: number; uploaded: number };

let running: Promise<LifeSyncResult> | null = null;

/** Two-way merge of the six tables with Supabase. Safe to call often; concurrent calls share one run. */
export function reconcileLifeData(): Promise<LifeSyncResult> {
  if (!running) running = doReconcile().finally(() => (running = null));
  return running;
}

async function doReconcile(): Promise<LifeSyncResult> {
  if (!isSupabaseConfigured()) return { status: 'skipped', reason: 'Supabase not configured' };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { status: 'skipped', reason: 'offline' };
  const userId = currentUserId();
  if (!userId) return { status: 'skipped', reason: 'signed out' };

  // Fetch everything first: if any table is missing (migration not applied yet), change nothing.
  const remote: Partial<Record<LifeTable, Row[]>> = {};
  for (const table of LIFE_TABLES) {
    const { rows, error } = await fetchAll(table);
    if (error) return { status: 'unavailable', table, error };
    remote[table] = rows;
  }

  const pending = await pendingByTable();
  let pulled = 0;
  let deleted = 0;
  let uploaded = 0;

  // Parents (goals, habits) come first in LIFE_TABLES, so uploads keep a sensible order.
  for (const table of LIFE_TABLES) {
    const local = (await db.table(table).toArray()) as Row[];
    const plan = planReconcile(table, local, remote[table]!, pending[table] ?? { upserts: new Set(), deletes: new Set() }, await loadSeen(userId, table));
    if (plan.applyLocal.length || plan.deleteLocal.length) {
      await runRemote(async () => {
        if (plan.applyLocal.length) await db.table(table).bulkPut(plan.applyLocal);
        if (plan.deleteLocal.length) await db.table(table).bulkDelete(plan.deleteLocal);
      });
    }
    for (const row of plan.upload) {
      await SyncQueueService.enqueueChange(table, String(row.id), 'UPDATE', toCloudRow(table, row, userId));
    }
    await saveSeen(userId, table, plan.seen);
    pulled += plan.applyLocal.length;
    deleted += plan.deleteLocal.length;
    uploaded += plan.upload.length;
  }

  if (pulled || deleted || uploaded) {
    console.info(`[lifeSync] Synced goals/habits/plans/focus: ${pulled} in, ${uploaded} out, ${deleted} removed.`);
  }
  return { status: 'ok', pulled, deleted, uploaded };
}

/** True when any local change (including a delete) for this record is still waiting to upload. */
async function hasAnyPending(table: LifeTable, id: string): Promise<boolean> {
  return (await db.sync_queue.where('record_id').equals(id).filter((i) => i.table_name === table).count()) > 0;
}

/** Applies one realtime change from another device (same rules as reconcile). */
export async function applyLifeRealtime(table: LifeTable, payload: { eventType: string; new?: Row; old?: Row }): Promise<void> {
  const userId = currentUserId();
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id ? String(payload.old.id) : null;
    if (!id) return;
    if (await hasAnyPending(table, id)) return;
    await runRemote(() => db.table(table).delete(id));
    if (userId) {
      const seen = await loadSeen(userId, table);
      seen.delete(id);
      await saveSeen(userId, table, seen);
    }
    return;
  }
  if (!payload.new?.id) return;
  const row = fromCloudRow(table, payload.new);
  const id = String(row.id);
  if (await hasAnyPending(table, id)) return;
  const local = (await db.table(table).get(id)) as Row | undefined;
  if (local && rowStamp(table, local) > rowStamp(table, row)) return;
  await runRemote(() => db.table(table).put(row));
  if (userId) {
    const seen = await loadSeen(userId, table);
    seen.add(id);
    await saveSeen(userId, table, seen);
  }
}

let triggersInstalled = false;

/** Runs reconcile on start-up, sign-in, reconnect and return to foreground (at most every 2 min). */
export function startLifeSync(): void {
  installLifeSyncHooks();
  if (triggersInstalled || typeof window === 'undefined') return;
  triggersInstalled = true;
  let lastRun = 0;
  let lastUser: string | null = null;
  const run = (force = false) => {
    if (!force && Date.now() - lastRun < 120_000) return;
    lastRun = Date.now();
    // Also retry anything left in the upload queue (failed earlier, or from a previous session),
    // which includes backfilling task fields once the cloud has their columns.
    SyncQueueService.flushQueue().catch((err) => console.warn('[sync] Queue flush failed:', err));
    reconcileLifeData()
      .then((r) => {
        if (r.status === 'unavailable') console.info(`[lifeSync] Cloud tables not ready (${r.table}): ${r.error}. Data stays local and queued.`);
      })
      .catch((err) => console.warn('[lifeSync] Reconcile failed:', err));
  };
  SupabaseAuthService.subscribe((s) => {
    if (s.loading) return;
    const id = s.user?.id ?? null;
    if (id && id !== lastUser) run(true);
    lastUser = id;
  });
  window.addEventListener('online', () => run(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });
}
