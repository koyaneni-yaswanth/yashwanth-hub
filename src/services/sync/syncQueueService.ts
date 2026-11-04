import { db } from '../../db';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import type { SyncQueueItem } from '../../types';
import { generateId } from '../../lib/utils';

export class SyncQueueService {
  private static isFlushing = false;
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
            const { error } = await (client.from(item.table_name) as any).upsert(item.payload);
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
          console.warn(`Failed to sync item ${item.id} for table ${item.table_name}:`, itemErr);
          failed++;
        }
      }
    } finally {
      this.isFlushing = false;
      const remainingCount = await db.sync_queue.count();
      this.notify(remainingCount);
    }

    return { processed, failed };
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
