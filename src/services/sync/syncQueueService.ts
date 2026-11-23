import { db } from '../../db';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import type { SyncQueueItem } from '../../types';
import { generateId } from '../../lib/utils';
import {
  TASK_V3_FIELDS,
  classifyColumnProbeError,
  hasTaskV3Values,
  toCloudTaskPayload,
  type V3ColumnCheck,
} from '../../lib/taskModel';

type Client = NonNullable<ReturnType<typeof getSupabaseClient>>;

/** Tasks whose subtasks / repeat / blockers / stage never reached the cloud (saved before the columns existed). */
const V3_UNSYNCED_KEY = 'tasks_v3_unsynced';
/** How long a "columns missing" answer is trusted before checking again. */
const V3_NO_RECHECK_MS = 60_000;

export class SyncQueueService {
  private static isFlushing = false;
  /** Set when a change is queued during a flush, so another flush picks it up. */
  private static flushAgain = false;
  private static listeners: ((count: number) => void)[] = [];

  /** Last definite answer about the cloud tasks table's v3 columns. 'yes' is kept for the session. */
  private static v3Check: { state: 'yes' | 'no'; at: number } | null = null;
  private static v3BackfillStarted = false;
  private static v3Unsynced: Promise<Set<string>> | null = null;

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
  // Tasks v3 columns: check, local-only tracking and backfill
  // ---------------------------------------------------------------------------

  private static loadV3Unsynced(): Promise<Set<string>> {
    if (!this.v3Unsynced) {
      this.v3Unsynced = db.settings
        .get(V3_UNSYNCED_KEY)
        .then((s) => new Set<string>(Array.isArray(s?.value) ? (s!.value as string[]) : []))
        .catch(() => new Set<string>());
    }
    return this.v3Unsynced;
  }

  private static async saveV3Unsynced(set: Set<string>): Promise<void> {
    await db.settings.put({ key: V3_UNSYNCED_KEY, value: [...set], updated_at: new Date().toISOString() });
  }

  /** True when this device holds v3 values for the task that the cloud has not received yet. */
  public static async isTaskV3Unsynced(taskId: string): Promise<boolean> {
    return (await this.loadV3Unsynced()).has(taskId);
  }

  private static async markV3Unsynced(taskId: string): Promise<void> {
    const set = await this.loadV3Unsynced();
    if (set.has(taskId)) return;
    set.add(taskId);
    await this.saveV3Unsynced(set);
  }

  private static async clearV3Unsynced(taskId: string): Promise<void> {
    const set = await this.loadV3Unsynced();
    if (set.delete(taskId)) await this.saveV3Unsynced(set);
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
    if (result === 'yes') await this.backfillTaskV3();
    return result;
  }

  /** Once the columns exist, upload the full row of every task whose v3 values stayed on this device. */
  private static async backfillTaskV3(): Promise<void> {
    if (this.v3BackfillStarted) return;
    this.v3BackfillStarted = true;
    for (const id of [...(await this.loadV3Unsynced())]) {
      const task = await db.tasks.get(id);
      if (!task) {
        await this.clearV3Unsynced(id);
        continue;
      }
      await this.enqueueChange('tasks', id, 'UPDATE', task);
    }
  }

  // ---------------------------------------------------------------------------
  // Queue
  // ---------------------------------------------------------------------------

  /**
   * Enqueues an offline or online mutation to be reconciled with the cloud database.
   */
  public static async enqueueChange(
    tableName: string,
    recordId: string,
    action: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: any
  ): Promise<void> {
    const item: SyncQueueItem = {
      id: generateId(),
      table_name: tableName,
      record_id: recordId,
      action,
      payload,
      created_at: new Date().toISOString(),
      attempts: 0,
    };

    await db.sync_queue.put(item);
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

    this.isFlushing = true;
    this.flushAgain = false;
    let processed = 0;
    let failed = 0;
    // Checked at most once per flush, and only if a task is being uploaded.
    let v3: Promise<V3ColumnCheck> | null = null;
    const v3Columns = () => (v3 ??= this.checkTaskV3Columns(client));

    try {
      const items = await db.sync_queue.orderBy('created_at').toArray();

      for (const item of items) {
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
              payload = toCloudTaskPayload(payload, state === 'yes');
              uploadedV3 = state === 'yes';
            }
            const { error } = await (client.from(item.table_name) as any).upsert(payload);
            if (error) throw error;
            if (uploadedV3) await this.clearV3Unsynced(item.record_id);
          } else if (item.action === 'DELETE') {
            const { error } = await (client.from(item.table_name) as any)
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

  /** True when this record has a local INSERT/UPDATE that hasn't reached the cloud yet. */
  public static async hasPendingChange(tableName: string, recordId: string): Promise<boolean> {
    const count = await db.sync_queue
      .where('record_id')
      .equals(recordId)
      .filter((i) => i.table_name === tableName && i.action !== 'DELETE')
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
