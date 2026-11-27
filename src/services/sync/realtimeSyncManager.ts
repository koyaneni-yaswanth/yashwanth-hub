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
import { applyM3Realtime, M3_SYNC_TABLES } from './m3CloudStore';
import { applyExtraRealtime } from './extraCloudSync';

export class RealtimeSyncManager {
  private static channels: any[] = [];
  private static isSubscribed = false;
  private static activeUserId: string | null = null;
  private static authBound = false;

  /**
   * Initializes a single multiplexed Supabase Realtime channel across all
   * synchronized operational, life, knowledge, memory, and preference tables.
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
      let unifiedChannel = client.channel('realtime_yashwanth_hub_unified');

      // 1. Tasks Realtime Handler
      unifiedChannel = unifiedChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        async (payload: any) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new?.id) {
              SyncQueueService.noteRemoteTaskColumns(payload.new);
              const [local, pending] = await Promise.all([
                db.tasks.get(payload.new.id),
                SyncQueueService.hasPendingChange('tasks', payload.new.id),
              ]);
              if (resolveRemoteUpsert(local, payload.new, pending) === 'apply') {
                if (local?.google_task_id && typeof payload.new.done === 'boolean' && payload.new.done !== local.done) {
                  const gid = local.google_task_id;
                  const done = payload.new.done;
                  void import('../google/googleTasksService')
                    .then(({ GoogleTasksService }) => GoogleTasksService.setGoogleTaskStatus(gid, done))
                    .then((pushed) => (pushed ? undefined : db.settings.delete(googleStatusKey(gid))))
                    .catch(() => db.settings.delete(googleStatusKey(gid)));
                }
                if (payload.new.google_task_id) await db.settings.delete(googleDeletedKey(payload.new.google_task_id));
                const keepLocalV3 = await SyncQueueService.isTaskV3Unsynced(payload.new.id);
                await db.tasks.put(mergeRemoteTask(local, payload.new, { keepLocalV3 }));
              }
            }
          } else if (payload.eventType === 'DELETE') {
            if (payload.old?.id) {
              const pending = await SyncQueueService.hasPendingChange('tasks', payload.old.id);
              if (resolveRemoteDelete(pending) === 'apply') {
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
      );

      // 2. Core Workspace Tables (events, projects, notes, meetings, expenses, contacts, travel, documents, robotics_experiments)
      for (const localTable of WORKSPACE_LOCAL_TABLES) {
        if (localTable === 'tasks') continue;
        const remoteTable = WORKSPACE_TABLE_SPECS[localTable].remoteTable;
        unifiedChannel = unifiedChannel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: remoteTable },
          (payload: any) => {
            applyWorkspaceRealtime(remoteTable, payload).catch((err) =>
              console.warn(`[workspaceSync] Realtime ${remoteTable} failed:`, err)
            );
          }
        );
      }

      // 3. Connected Devices Fleet Realtime Handler
      unifiedChannel = unifiedChannel.on(
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
                const inferredType =
                  payload.new.device_type === 'android_companion' || payload.new.device_type === 'ios'
                    ? 'mobile'
                    : 'laptop';
                await db.device_sessions.put({
                  id: payload.new.hardware_id,
                  deviceName: payload.new.name || 'Remote Device',
                  platform: payload.new.device_type === 'ios' ? 'ios' : payload.new.device_type === 'android_companion' ? 'android' : 'browser',
                  browser: 'Synced Device',
                  deviceType: inferredType,
                  isCurrent: false,
                  status: payload.new.connection_state === 'connected' ? 'online' : 'offline',
                  syncStatus: 'synced',
                  lastActive: payload.new.last_status_update || new Date().toISOString(),
                  registeredAt: payload.new.created_at || new Date().toISOString(),
                });
              }
            }
          } else if (payload.eventType === 'DELETE' && payload.old?.hardware_id) {
            await db.device_sessions.delete(payload.old.hardware_id);
          }
        }
      );

      // 4. Goals, Milestones, Habits, Habit Logs, Daily Plans, Focus Sessions
      for (const table of LIFE_TABLES) {
        unifiedChannel = unifiedChannel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload: any) => {
          applyLifeRealtime(table, payload).catch((err) => console.warn(`[lifeSync] Realtime ${table} failed:`, err));
        });
      }

      // 5. M3 Knowledge Links, Research Bookmarks & Agent Execution Logs
      for (const table of M3_SYNC_TABLES) {
        unifiedChannel = unifiedChannel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload: any) => {
          applyM3Realtime(table, payload).catch((err) => console.warn(`[m3Sync] Realtime ${table} failed:`, err));
        });
      }

      // 6. Extra Cloud Tables (ai_conversations, memories, user_preferences)
      for (const table of ['ai_conversations', 'memories', 'user_preferences'] as const) {
        unifiedChannel = unifiedChannel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload: any) => {
          applyExtraRealtime(table, payload).catch((err) => console.warn(`[extraSync] Realtime ${table} failed:`, err));
        });
      }

      unifiedChannel.subscribe();
      this.channels.push(unifiedChannel);
      this.isSubscribed = true;
      console.log('RealtimeSyncManager: Unified multiplexed Realtime channel connected.');
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
