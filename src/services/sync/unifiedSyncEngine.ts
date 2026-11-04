import { GoogleAuthService } from '../google/googleAuthService';
import { GoogleCalendarService } from '../google/googleCalendarService';
import { GoogleTasksService } from '../google/googleTasksService';
import { GoogleContactsService } from '../google/googleContactsService';
import { GmailService } from '../google/gmailService';
import { GoogleDriveService } from '../google/googleDriveService';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { db } from '../../db';
import type { SyncEngineStatus, SyncHistoryRecord, SyncEngineState } from '../../types';
import { generateId } from '../../lib/utils';

export class UnifiedSyncEngine {
  private static isSyncing = false;
  private static syncListeners: ((status: SyncEngineStatus) => void)[] = [];

  public static getStatus(): SyncEngineStatus {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (!isOnline) {
      return {
        state: 'offline',
        pendingQueueCount: 0,
        failedCount: 0,
        message: 'Device is offline (Changes queued locally in IndexedDB)',
      };
    }

    const isGoogleConnected = GoogleAuthService.isConnected();
    const isCloudConnected = isSupabaseConfigured();

    if (!isGoogleConnected && !isCloudConnected) {
      return {
        state: 'synced',
        pendingQueueCount: 0,
        failedCount: 0,
        message: 'Local Mode: IndexedDB persistent and operational',
      };
    }

    return {
      state: this.isSyncing ? 'syncing' : 'synced',
      pendingQueueCount: 0,
      failedCount: 0,
      message: this.isSyncing ? 'Synchronizing connected services...' : 'All connected services up to date',
    };
  }

  // Subscribe to sync state changes
  public static subscribe(listener: (status: SyncEngineStatus) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  private static notify(status: SyncEngineStatus) {
    this.syncListeners.forEach((l) => l(status));
  }

  // Log a synchronization event into db.sync_history
  public static async logSyncEvent(
    service: string,
    action: string,
    status: 'success' | 'warning' | 'error',
    itemCount: number,
    details?: string
  ): Promise<void> {
    try {
      const record: SyncHistoryRecord = {
        id: generateId(),
        service,
        action,
        status,
        itemCount,
        timestamp: new Date().toISOString(),
        details,
      };
      await db.sync_history.add(record);
    } catch (e) {
      console.warn('Failed to record sync history:', e);
    }
  }

  // Master synchronization routine across all active integrations
  public static async runFullSync(): Promise<{
    success: boolean;
    syncedServices: string[];
    errors: string[];
  }> {
    if (this.isSyncing) {
      return { success: false, syncedServices: [], errors: ['Sync already in progress'] };
    }

    if (!navigator.onLine) {
      this.notify({
        state: 'offline',
        pendingQueueCount: await db.sync_queue.count(),
        failedCount: 0,
        message: 'Device is offline',
      });
      return { success: false, syncedServices: [], errors: ['Device offline'] };
    }

    this.isSyncing = true;
    const syncedServices: string[] = [];
    const errors: string[] = [];

    this.notify({
      state: 'syncing',
      pendingQueueCount: await db.sync_queue.count(),
      failedCount: 0,
      message: 'Synchronizing connected platforms...',
    });

    try {
      // 1. Google Workspace Services Sync (if token is present)
      if (GoogleAuthService.isConnected()) {
        const config = GoogleAuthService.getConfig();

        // A. Google Calendar Two-Way Sync
        if (config.services?.calendar?.enabled ?? true) {
          try {
            const events = await db.events.toArray();
            const calResult = await GoogleCalendarService.syncTwoWay(events);
            syncedServices.push('Google Calendar');
            await this.logSyncEvent('Google Calendar', 'Two-Way Sync', 'success', calResult.syncedCount, `Conflicts: ${calResult.conflicts.length}`);
          } catch (calErr: any) {
            errors.push(`Calendar: ${calErr.message}`);
            await this.logSyncEvent('Google Calendar', 'Two-Way Sync', 'error', 0, calErr.message);
          }
        }

        // B. Google Tasks Two-Way Sync
        if (config.services?.tasks?.enabled ?? true) {
          try {
            const tasksResult = await GoogleTasksService.syncTwoWay();
            syncedServices.push('Google Tasks');
            await this.logSyncEvent('Google Tasks', 'Two-Way Sync', 'success', tasksResult.imported + tasksResult.exported, `Imported: ${tasksResult.imported}, Exported: ${tasksResult.exported}`);
          } catch (taskErr: any) {
            errors.push(`Google Tasks: ${taskErr.message}`);
            await this.logSyncEvent('Google Tasks', 'Two-Way Sync', 'error', 0, taskErr.message);
          }
        }

        // C. Google Contacts Sync
        if (config.services?.contacts?.enabled ?? true) {
          try {
            const contactsResult = await GoogleContactsService.fetchContacts();
            syncedServices.push('Google Contacts');
            await this.logSyncEvent('Google Contacts', 'People Sync', 'success', contactsResult.length, `Imported ${contactsResult.length} contacts`);
          } catch (contactErr: any) {
            errors.push(`Google Contacts: ${contactErr.message}`);
          }
        }

        // D. Gmail Follow-Up & Deadline Scan
        if (config.services?.gmail?.enabled ?? true) {
          try {
            const followUps = await GmailService.searchMessages('is:important or label:UNREAD');
            syncedServices.push('Gmail');
            await this.logSyncEvent('Gmail', 'Metadata & Deadlines Scan', 'success', followUps.length, `Found ${followUps.length} follow-up candidates`);
          } catch (gmailErr: any) {
            errors.push(`Gmail: ${gmailErr.message}`);
          }
        }

        // E. Google Drive Recent Files Index
        if (config.services?.drive?.enabled ?? true) {
          try {
            const driveFiles = await GoogleDriveService.searchFiles('');
            syncedServices.push('Google Drive');
            await this.logSyncEvent('Google Drive', 'Index Files', 'success', driveFiles.length, `Indexed ${driveFiles.length} cloud files`);
          } catch (driveErr: any) {
            errors.push(`Google Drive: ${driveErr.message}`);
          }
        }
      }

      // 2. Supabase PostgreSQL Cloud Sync (if configured)
      if (isSupabaseConfigured()) {
        try {
          const client = getSupabaseClient();
          if (client) {
            const queue = await db.sync_queue.toArray();
            let queueSynced = 0;
            for (const item of queue) {
              try {
                if (item.action === 'INSERT' || item.action === 'UPDATE') {
                  await (client.from(item.table_name) as any).upsert(item.payload);
                } else if (item.action === 'DELETE') {
                  await (client.from(item.table_name) as any).delete().eq('id', item.record_id);
                }
                await db.sync_queue.delete(item.id);
                queueSynced++;
              } catch (itemErr) {
                console.warn('Queue item sync error:', itemErr);
              }
            }
            syncedServices.push('Supabase Cloud');
            await this.logSyncEvent('Supabase', 'Cloud Queue Sync', 'success', queueSynced);
          }
        } catch (sbErr: any) {
          errors.push(`Supabase: ${sbErr.message}`);
        }
      }

      const finalState: SyncEngineState = errors.length > 0 ? 'failed' : 'synced';
      this.notify({
        state: finalState,
        lastSuccessTimestamp: new Date().toISOString(),
        pendingQueueCount: await db.sync_queue.count(),
        failedCount: errors.length,
        message: errors.length === 0 ? 'All services synchronized' : `Sync finished with ${errors.length} warnings`,
      });

      return {
        success: errors.length === 0,
        syncedServices,
        errors,
      };
    } finally {
      this.isSyncing = false;
    }
  }
}
