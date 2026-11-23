import { db } from '../../db';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import type { SyncQueueItem } from '../../types';
import { generateId } from '../../lib/utils';
import { TASK_V3_FIELDS, stripTaskV3Fields } from '../../lib/taskModel';

export class SyncQueueService {
  private static isFlushing = false;
  /** Whether the cloud tasks table has the Phase 3 columns (checked once per session). */
  private static taskV3Columns: Promise<boolean> | null = null;

  private static cloudHasTaskV3Columns(client: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<boolean> {
    if (!this.taskV3Columns) {
      this.taskV3Columns = Promise.resolve(client.from('tasks').select(TASK_V3_FIELDS.join(',')).limit(1))
        .then(({ error }) => {
          if (error) {
            // Retry the check later in case the migration is applied while the app is open.
            setTimeout(() => (this.taskV3Columns = null), 10 * 60 * 1000);
            return false;
          }
          return true;
        })
        .catch(() => {
          this.taskV3Columns = null;
          return false;
        });
    }
    return this.taskV3Columns;
  }
  private static listeners: ((count: number) => void)[] = [];

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

    // If online, trigger immediate flush
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.flushQueue().catch((err) => console.warn('Flush error:', err));
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
    let processed = 0;
    let failed = 0;

    try {
      const items = await db.sync_queue.orderBy('created_at').toArray();

      for (const item of items) {
        try {
          if (item.action === 'INSERT' || item.action === 'UPDATE') {
            let payload = item.payload;
            // Older cloud schemas lack the Tasks v3 columns: send the rest rather than failing the whole task.
            if (item.table_name === 'tasks' && payload && !(await this.cloudHasTaskV3Columns(client))) {
              payload = stripTaskV3Fields(payload);
            }
            const { error } = await (client.from(item.table_name) as any).upsert(payload);
            if (error) throw error;
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
