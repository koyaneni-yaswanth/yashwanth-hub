import { db } from '../../db';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import type { SyncQueueItem, Task } from '../../types';
import { generateId } from '../../lib/utils';
import {
  TASK_V3_FIELDS,
  classifyColumnProbeError,
  hasTaskV3Values,
  toCloudTaskPayload,
  unionV3List,
  type V3ColumnCheck,
} from '../../lib/taskModel';
import { isLifeTable } from './lifeSyncCore';
import { isWorkspaceLocalTable, resolveRemoteWorkspaceTable, toCloudWorkspaceRow } from './workspaceSyncCore';
import { toCloudConversationRow, toCloudMemoryRow } from './extraCloudSyncCore';

type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;

/**
 * One settings row per task whose subtasks / repeat / blockers / stage never
 * reached the cloud (saved before the columns existed). One row per task, read
 * fresh each time, so several open tabs can't overwrite each other's marks.
 */
const V3_MARK_PREFIX = 'tasks_v3_unsynced:';
/** How long a "columns missing" answer is trusted before checking again. */
const V3_NO_RECHECK_MS = 60_000;

const isEmptyV3 = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);

export class SyncQueueService {
  private static isFlushing = false;
  /** Set when a change is queued during a flush, so another flush picks it up. */
  private static flushAgain = false;
  private static listeners: ((count: number) => void)[] = [];

  /** Last definite answer about the cloud tasks table's v3 columns. 'yes' is kept for the session. */
  private static v3Check: { state: 'yes' | 'no'; at: number } | null = null;

  /**
   * Initializes offline queue network event listeners.
   */
  public static init(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', async () => {
      console.log('Network restored. Flushing offline sync queue...');
      await this.flushQueue();
    });
  }

  /**
   * Subscribes to queue length changes.
   */
  public static subscribe(listener: (count: number) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notify(count: number) {
    this.listeners.forEach((l) => l(count));
  }

  // ---------------------------------------------------------------------------
  // Tasks v3 columns: check, local-only marks and backfill
  // ---------------------------------------------------------------------------

  /** True when this device holds v3 values for the task that the cloud has not received yet. */
  public static async isTaskV3Unsynced(taskId: string): Promise<boolean> {
    return Boolean(await db.settings.get(V3_MARK_PREFIX + taskId));
  }

  private static async markV3Unsynced(taskId: string): Promise<void> {
    await db.settings.put({ key: V3_MARK_PREFIX + taskId, value: true, updated_at: new Date().toISOString() });
  }

  private static async clearV3Unsynced(taskId: string): Promise<void> {
    await db.settings.delete(V3_MARK_PREFIX + taskId);
  }

  private static async listV3Unsynced(): Promise<string[]> {
    const rows = await db.settings.filter((s) => typeof s.key === 'string' && s.key.startsWith(V3_MARK_PREFIX)).toArray();
    return rows.map((r) => r.key.slice(V3_MARK_PREFIX.length));
  }

  /**
   * A task row arriving from the cloud that carries any v3 key proves the
   * columns exist (realtime sends whole rows). Uploads start sending them at
   * once, and any local-only values get backfilled.
   */
  public static noteRemoteTaskColumns(row: Record<string, unknown> | null | undefined): void {
    if (!row || this.v3Check?.state === 'yes') return;
    if (!TASK_V3_FIELDS.some((k) => k in row)) return;
    this.v3Check = { state: 'yes', at: Date.now() };
    void this.listV3Unsynced().then((ids) => {
      if (ids.length) this.flushQueue().catch((err) => console.warn('Flush error:', err));
    });
  }

  /**
   * Does the cloud tasks table have the v3 columns?
   * Only a "missing column/table" error means no; network or server errors are
   * 'unknown', so uploads wait and retry instead of silently dropping fields.
   */
  private static async checkTaskV3Columns(client: Client): Promise<V3ColumnCheck> {
    if (this.v3Check?.state === 'yes') return 'yes';
    if (this.v3Check?.state === 'no' && Date.now() - this.v3Check.at < V3_NO_RECHECK_MS) return 'no';
    let result: V3ColumnCheck;
    try {
      const { error } = await client.from('tasks').select(TASK_V3_FIELDS.join(',')).limit(1);
      result = classifyColumnProbeError(error);
    } catch {
      result = 'unknown';
    }
    if (result !== 'unknown') this.v3Check = { state: result, at: Date.now() };
    return result;
  }

  /**
   * Uploads v3 values that stayed on this device, without touching anything
   * else: only the v3 columns, never by re-creating a row (a task deleted
   * elsewhere stays deleted), filling fields the cloud has empty and adding
   * local-only list items (subtasks, blockers) to the cloud's. Each write is
   * guarded by the cloud value it was based on, and the local row is re-read
   * after the round trip, so changes made meanwhile (another tab, another
   * device) are never overwritten. Only runs with a signed-in session (see
   * flushQueue), so "no row" really means the task is gone.
   */
  private static async backfillTaskV3(client: Client, ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        // A queued upload of this task carries the values itself (and clears the mark).
        if (await this.hasPendingChange('tasks', id)) continue;
        const before = await db.tasks.get(id);
        if (!before || !hasTaskV3Values(before as unknown as Record<string, unknown>)) {
          await this.clearV3Unsynced(id);
          continue;
        }
        const { data, error } = await client.from('tasks').select(TASK_V3_FIELDS.join(',')).eq('id', id).maybeSingle();
        if (error) continue; // keep the mark; try again on a later flush
        if (!data) {
          await this.clearV3Unsynced(id); // deleted elsewhere
          continue;
        }
        // Re-check after the round trip: another tab may have uploaded or changed this task meanwhile.
        if (!(await this.isTaskV3Unsynced(id)) || (await this.hasPendingChange('tasks', id))) continue;
        const local = (await db.tasks.get(id)) as (Task & Record<string, unknown>) | undefined;
        if (!local) {
          await this.clearV3Unsynced(id);
          continue;
        }
        const cloud = data as unknown as Record<string, unknown>;
        let settled = true;

        // 1. Fields the cloud has empty: fill them, only if still empty when the write lands.
        const fill: Record<string, unknown> = {};
        for (const k of TASK_V3_FIELDS) if (cloud[k] == null && !isEmptyV3(local[k])) fill[k] = local[k];
        if (Object.keys(fill).length) {
          let query = (client.from('tasks') as any).update(fill).eq('id', id);
          for (const k of Object.keys(fill)) query = query.is(k, null);
          const { error: fillErr } = await query;
          if (fillErr) settled = false;
        }

        // 2. Lists the cloud already has: add the local-only items, only if the cloud list is
        //    still the one read above (otherwise retry on a later flush with a fresh read).
        for (const k of ['subtasks', 'blocked_by'] as const) {
          const c = cloud[k];
          const l = local[k];
          if (!Array.isArray(c) || !c.length || !Array.isArray(l) || !l.length) continue;
          const merged = unionV3List(k, c, l);
          if (merged.length === c.length) continue;
          const { data: rows, error: listErr } = await (client.from('tasks') as any)
            .update({ [k]: merged })
            .eq('id', id)
            .eq(k, JSON.stringify(c))
            .select('id');
          if (listErr || !Array.isArray(rows) || rows.length === 0) settled = false;
        }

        if (settled) await this.clearV3Unsynced(id);
      } catch {
        // Keep the mark; a later flush retries.
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queue
  // ---------------------------------------------------------------------------

  /**
   * Enqueues an offline or online mutation to be reconciled with the cloud database.
   * Coalesces multiple rapid edits (e.g. Dexie hooks + service calls) per (table, record_id).
   */
  public static async enqueueChange(
    tableName: string,
    recordId: string,
    action: 'INSERT' | 'UPDATE' | 'DELETE' | 'PATCH',
    payload: any
  ): Promise<void> {
    const existing = await db.sync_queue
      .where('record_id')
      .equals(recordId)
      .filter((i) => i.table_name === tableName)
      .toArray();

    const now = new Date().toISOString();

    if (action === 'DELETE') {
      if (existing.length > 0) {
        await db.sync_queue.bulkDelete(existing.map((e) => e.id));
      }
      const item: SyncQueueItem = {
        id: generateId(),
        table_name: tableName,
        record_id: recordId,
        action: 'DELETE',
        payload,
        created_at: now,
        attempts: 0,
      };
      await db.sync_queue.put(item);
    } else {
      const sameSuperset = existing.find((e) => e.action === 'INSERT' || e.action === 'UPDATE');
      if (sameSuperset && (action === 'INSERT' || action === 'UPDATE')) {
        await db.sync_queue.update(sameSuperset.id, {
          action: sameSuperset.action === 'INSERT' ? 'INSERT' : action,
          payload,
          created_at: now,
          attempts: 0,
          last_error: undefined,
          last_attempt_at: undefined,
        });
      } else {
        const item: SyncQueueItem = {
          id: generateId(),
          table_name: tableName,
          record_id: recordId,
          action,
          payload,
          created_at: now,
          attempts: 0,
        };
        await db.sync_queue.put(item);
      }
    }

    const count = await db.sync_queue.count();
    this.notify(count);

    // If online, trigger immediate flush (or a follow-up one if a flush is running)
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      if (this.isFlushing) this.flushAgain = true;
      else this.flushQueue().catch((err) => console.warn('Flush error:', err));
    }
  }

  /**
   * Flushes all pending mutations from Dexie to Supabase.
   */
  public static async flushQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isFlushing) return { processed: 0, failed: 0 };
    if (!isSupabaseConfigured()) return { processed: 0, failed: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { processed: 0, failed: 0 };
    }

    const client = getSupabaseClient();
    if (!client) return { processed: 0, failed: 0 };

    // Claim the flush before any await, so calls in the same moment can't run two flushes at once.
    this.isFlushing = true;
    this.flushAgain = false;

    // Every cloud table is per-user (row level security): without a signed-in session writes
    // fail and reads see nothing, which must not be mistaken for "deleted". Changes stay queued.
    let userId: string | null = null;
    try {
      const { data } = await client.auth.getSession();
      userId = data?.session?.user?.id ?? null;
    } catch {
      userId = null;
    }
    if (!userId) {
      this.isFlushing = false;
      return { processed: 0, failed: 0 };
    }

    let processed = 0;
    let failed = 0;
    // Checked at most once per flush, and only when needed.
    let v3: Promise<V3ColumnCheck> | null = null;
    const v3Columns = () => (v3 ??= this.checkTaskV3Columns(client));

    try {
      const items = await db.sync_queue.orderBy('created_at').toArray();

      for (const item of items) {
        const remoteTable = resolveRemoteWorkspaceTable(item.table_name);
        try {
          if (item.action === 'INSERT' || item.action === 'UPDATE') {
            let payload = item.payload;
            let uploadedV3 = false;
            if (item.table_name === 'tasks' && payload) {
              const state = await v3Columns();
              if (state === 'unknown') {
                throw new Error('Could not confirm which task columns the cloud has; will retry.');
              }
              if (state === 'no' && hasTaskV3Values(payload)) {
                // These fields stay on this device for now; remember to upload them once the columns exist.
                await this.markV3Unsynced(item.record_id);
              }
              payload = toCloudTaskPayload(toCloudWorkspaceRow('tasks', payload, payload?.user_id || userId), state === 'yes');
              uploadedV3 = state === 'yes';
            } else if (isWorkspaceLocalTable(item.table_name) && payload) {
              payload = toCloudWorkspaceRow(item.table_name, payload, payload?.user_id || userId);
            } else if (item.table_name === 'ai_conversations' && payload) {
              payload = toCloudConversationRow(payload, payload?.user_id || userId);
            } else if (item.table_name === 'memories' && payload) {
              payload = toCloudMemoryRow(payload, payload?.user_id || userId);
            } else if (item.table_name === 'user_preferences' && payload) {
              payload = { ...payload, user_id: payload.user_id || userId };
            } else if (payload && !payload.user_id) {
              payload = { ...payload, user_id: userId };
            }
            const useUserIdComposite = isLifeTable(item.table_name) || item.table_name === 'user_preferences';
            const { error } = useUserIdComposite
              ? await (client.from(remoteTable) as any).upsert(payload, { onConflict: 'user_id,id' })
              : await (client.from(remoteTable) as any).upsert(payload);
            if (error) throw error;
            if (uploadedV3) await this.clearV3Unsynced(item.record_id);
          } else if (item.action === 'PATCH') {
            // Only the given columns, only on an existing row: never re-creates or overwrites a task.
            const { data: rows, error } = await (client.from(remoteTable) as any)
              .update(item.payload)
              .eq('id', item.record_id)
              .select('id');
            if (error) throw error;
            // No row yet but its upload is still queued (e.g. it failed earlier in this flush):
            // keep the patch for the next flush instead of losing it.
            if ((!Array.isArray(rows) || rows.length === 0) && (await this.hasPendingChange(item.table_name, item.record_id))) {
              throw new Error('The row this change belongs to has not been uploaded yet; will retry.');
            }
          } else if (item.action === 'DELETE') {
            const { error } = await (client.from(remoteTable) as any)
              .delete()
              .eq('id', item.record_id);
            if (error) throw error;
          }

          // Successfully synchronized to cloud — remove from queue
          await db.sync_queue.delete(item.id);
          processed++;
        } catch (itemErr) {
          // Keep the change queued (never discard it) and record why, so the UI can show it.
          console.warn(`Failed to sync item ${item.id} for table ${item.table_name}:`, itemErr);
          failed++;
          const message =
            itemErr && typeof itemErr === 'object' && 'message' in itemErr
              ? String((itemErr as { message: unknown }).message)
              : String(itemErr);
          await db.sync_queue
            .update(item.id, {
              attempts: (item.attempts || 0) + 1,
              last_error: message.slice(0, 300),
              last_attempt_at: new Date().toISOString(),
            })
            .catch(() => {});
        }
      }

      // Local-only v3 values: upload them as soon as the cloud has the columns.
      const marked = await this.listV3Unsynced();
      if (marked.length && (await v3Columns()) === 'yes') await this.backfillTaskV3(client, marked);
    } finally {
      this.isFlushing = false;
      const remainingCount = await db.sync_queue.count();
      this.notify(remainingCount);
      if (this.flushAgain) {
        this.flushAgain = false;
        setTimeout(() => {
          this.flushQueue().catch((err) => console.warn('Flush error:', err));
        }, 0);
      }
    }

    return { processed, failed };
  }

  /**
   * True when this record has a local INSERT/UPDATE that hasn't reached the cloud yet (a whole
   * row that will be uploaded). A PATCH doesn't count: it can't re-create a row, so it must not
   * make this device ignore another device's delete or update.
   */
  public static async hasPendingChange(tableName: string, recordId: string): Promise<boolean> {
    const count = await db.sync_queue
      .where('record_id')
      .equals(recordId)
      .filter((i) => i.table_name === tableName && (i.action === 'INSERT' || i.action === 'UPDATE'))
      .count();
    return count > 0;
  }

  /** Number of queued changes whose last upload attempt failed. */
  public static async getFailedCount(): Promise<number> {
    return db.sync_queue.filter((i) => (i.attempts || 0) > 0).count();
  }

  /**
   * Returns current pending queue count.
   */
  public static async getPendingCount(): Promise<number> {
    return await db.sync_queue.count();
  }
}

// Auto-initialize on import
SyncQueueService.init();
