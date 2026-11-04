import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { db } from '../../db';

export class RealtimeSyncManager {
  private static channels: any[] = [];
  private static isSubscribed = false;

  /**
   * Initializes real-time subscriptions across all synchronized operational tables.
   */
  public static init(): void {
    if (this.isSubscribed) return;
    if (!isSupabaseConfigured()) return;

    const client = getSupabaseClient();
    if (!client) return;

    try {
      // 1. Tasks Realtime Channel
      const tasksChannel = client
        .channel('realtime_tasks_channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tasks' },
          async (payload: any) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              if (payload.new) {
                await db.tasks.put(payload.new);
              }
            } else if (payload.eventType === 'DELETE') {
              if (payload.old?.id) {
                await db.tasks.delete(payload.old.id);
              }
            }
          }
        )
        .subscribe();
      this.channels.push(tasksChannel);

      // 2. Events / Calendar Realtime Channel
      const eventsChannel = client
        .channel('realtime_events_channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'events' },
          async (payload: any) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              if (payload.new) {
                await db.events.put(payload.new);
              }
            } else if (payload.eventType === 'DELETE') {
              if (payload.old?.id) {
                await db.events.delete(payload.old.id);
              }
            }
          }
        )
        .subscribe();
      this.channels.push(eventsChannel);

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
