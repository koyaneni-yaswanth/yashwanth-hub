import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { db } from '../../db';
import { SupabaseAuthService } from '../auth/supabaseAuthService';
import { SyncQueueService } from './syncQueueService';
import { resolveRemoteUpsert, resolveRemoteDelete } from './conflict';
import { applyLifeRealtime } from './lifeSync';
import { LIFE_TABLES } from './lifeSyncCore';
import { applyWorkspaceRealtime } from './workspaceSync';
import { WORKSPACE_LOCAL_TABLES, WORKSPACE_TABLE_SPECS } from './workspaceSyncCore';
import { mergeRemoteTask } from '../../lib/taskModel';
import { googleDeletedKey, googleStatusKey } from '../../lib/googleTaskSync';

export class RealtimeSyncManager {
  private static channels: any[] = [];
  private static isSubscribed = false;
  private static activeUserId: string | null = null;
  private static authBound = false;

  /**
   * Initializes real-time subscriptions across all synchronized operational tables
   * and re-subscribes cleanly when the signed-in Supabase user changes.
   */
  public static init(): void {
    if (!isSupabaseConfigured()) return;

    const client = getSupabaseClient();
    if (!client) return;

    if (!this.authBound) {
      this.authBound = true;
      SupabaseAuthService.subscribe((s) => {
        if (s.loading) return;
        const nextUser = s.user?.id ?? null;
        if (nextUser && nextUser !== this.activeUserId) {
          this.destroy();
          this.activeUserId = nextUser;
          this.subscribeChannels(client);
        } else if (!nextUser && this.activeUserId) {
          this.activeUserId = null;
          this.destroy();
        }
      });
    }

    const currentUser = SupabaseAuthService.getState().user?.id ?? null;
    if (this.isSubscribed && currentUser === this.activeUserId) return;
    if (!currentUser) return;
    this.activeUserId = currentUser;
    this.subscribeChannels(client);
  }

  private static subscribeChannels(client: NonNullable<ReturnType<typeof getSupabaseClient>>): void {
    if (this.isSubscribed) return;

    try {
      // 1. Tasks Realtime Channel
      const tasksChannel = client
        .channel('realtime_tasks_channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks' },
          async (payload: any) => {
            // Never let a cloud echo overwrite a newer local edit that is still waiting to upload.
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              if (payload.new?.id) {
                // A whole row with the v3 keys proves the cloud has those columns.
                SyncQueueService.noteRemoteTaskColumns(payload.new);
                const [local, pending] = await Promise.all([
                  db.tasks.get(payload.new.id),
                  SyncQueueService.hasPendingChange('tasks', payload.new.id),
                ]);
                if (resolveRemoteUpsert(local, payload.new, pending) === 'apply') {
                  // Another device changed a Google-linked task's done/open status: this device's
                  // record of the last agreed status is out of date, so drop it (the next Google
                  // sync then decides by edit times instead of undoing that change).
                  if (local?.google_task_id && typeof payload.new.done === 'boolean' && payload.new.done !== local.done) {
                    const gid = local.google_task_id;
                    const done = payload.new.done;
                    // Bring Google in line now if this device can (the push records the new agreed
                    // status); otherwise drop the out-of-date record so the next sync decides by edit times.
                    void import('../google/googleTasksService')
                      .then(({ GoogleTasksService }) => GoogleTasksService.setGoogleTaskStatus(gid, done))
                      .then((pushed) => (pushed ? undefined : db.settings.delete(googleStatusKey(gid))))
                      .catch(() => db.settings.delete(googleStatusKey(gid)));
                  }
                  // A linked task that is back (e.g. another device's edit won over a delete) keeps
                  // its Google copy: cancel any pending Google delete for it.
                  if (payload.new.google_task_id) await db.settings.delete(googleDeletedKey(payload.new.google_task_id));
                  // Keep subtasks / repeat / blockers the cloud doesn't carry yet, or that this
                  // device saved before the cloud had the columns (they win until uploaded).
                  const keepLocalV3 = await SyncQueueService.isTaskV3Unsynced(payload.new.id);
                  await db.tasks.put(mergeRemoteTask(local, payload.new, { keepLocalV3 }));
                }
              }
            } else if (payload.eventType === 'DELETE') {
              if (payload.old?.id) {
                const pending = await SyncQueueService.hasPendingChange('tasks', payload.old.id);
                if (resolveRemoteDelete(pending) === 'apply') {
                  // Deleted on another device: if it was linked to Google, delete it there too at
                  // this device's next Google sync, so it isn't imported back. One transaction, so a
                  // Google sync can never see the marker while the task still looks present.
                  const id = payload.old.id;
                  await db.transaction('rw', db.tasks, db.settings, async () => {
                    const local = await db.tasks.get(id);
                    await db.tasks.delete(id);
                    if (local?.google_task_id) {
                      await db.settings.put({ key: googleDeletedKey(local.google_task_id), value: true, updated_at: new Date().toISOString() });
                    }
                  });
                }
              }
            }
          }
        )
        .subscribe();
      this.channels.push(tasksChannel);

      // 2. Core Workspace Tables Realtime Channels (events, projects, notes, meetings, expenses, contacts, travel, documents, robotics_experiments)
      for (const localTable of WORKSPACE_LOCAL_TABLES) {
        if (localTable === 'tasks') continue; // tasks has bespoke Google Tasks reconciliation above
        const remoteTable = WORKSPACE_TABLE_SPECS[localTable].remoteTable;
        const channel = client
          .channel(`realtime_${remoteTable}_channel`)
          .on('postgres_changes', { event: '*', schema: 'public', table: remoteTable }, (payload: any) => {
            applyWorkspaceRealtime(remoteTable, payload).catch((err) =>
              console.warn(`[workspaceSync] Realtime ${remoteTable} failed:`, err)
            );
          })
          .subscribe();
        this.channels.push(channel);
      }

      // 3. Memories (NeoSapien) Realtime Channel
      const memoriesChannel = client
        .channel('realtime_memories_channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'memories' },
          async (payload: any) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              if (payload.new) {
                await db.neo_memories.put(payload.new);
              }
            } else if (payload.eventType === 'DELETE') {
              if (payload.old?.id) {
                await db.neo_memories.delete(payload.old.id);
              }
            }
          }
        )
        .subscribe();
      this.channels.push(memoriesChannel);

      // 4. Connected Devices Fleet Realtime Channel
      const devicesChannel = client
        .channel('realtime_devices_channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'connected_devices' },
          async (payload: any) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              if (payload.new?.hardware_id) {
                const existing = await db.device_sessions.get(payload.new.hardware_id);
                if (existing) {
                  await db.device_sessions.update(payload.new.hardware_id, {
                    deviceName: payload.new.name || existing.deviceName,
                    status: payload.new.connection_state === 'connected' ? 'online' : 'offline',
                    lastActive: payload.new.last_status_update || existing.lastActive,
                  });
                } else {
                  await db.device_sessions.put({
                    id: payload.new.hardware_id,
                    deviceName: payload.new.name || 'Remote Device',
                    platform: 'browser',
                    browser: 'Web',
                    deviceType: payload.new.device_type || 'desktop',
                    isCurrent: false,
                    status: payload.new.connection_state === 'connected' ? 'online' : 'offline',
                    syncStatus: 'synced',
                    lastActive: payload.new.last_status_update || new Date().toISOString(),
                    registeredAt: payload.new.created_at || new Date().toISOString(),
                  });
                }
              }
            }
          }
        )
        .subscribe();
      this.channels.push(devicesChannel);

      // 5. Goals, milestones, habits, habit logs, daily plans, focus sessions
      for (const table of LIFE_TABLES) {
        const channel = client
          .channel(`realtime_${table}_channel`)
          .on('postgres_changes', { event: '*', schema: 'public', table }, (payload: any) => {
            applyLifeRealtime(table, payload).catch((err) => console.warn(`[lifeSync] Realtime ${table} failed:`, err));
          })
          .subscribe();
        this.channels.push(channel);
      }

      this.isSubscribed = true;
      console.log('RealtimeSyncManager: All universal Realtime channels connected.');
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }
  }

  /**
   * Cleanly destroys all active Realtime subscriptions.
   */
  public static destroy(): void {
    const client = getSupabaseClient();
    if (client) {
      this.channels.forEach((channel) => client.removeChannel(channel));
    }
    this.channels = [];
    this.isSubscribed = false;
  }
}
