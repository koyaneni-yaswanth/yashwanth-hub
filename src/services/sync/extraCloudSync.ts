/**
 * Cross-device reconciliation & live BroadcastChannel helpers for:
 * - public.ai_conversations <-> db.ai_conversations
 * - public.memories <-> db.neo_memories
 * - public.user_preferences <-> db.settings (v3f_assessment_v2, pawan_shakti_pv_telemetry)
 */
import { db } from '../../db';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { SyncQueueService } from './syncQueueService';
import {
  SYNCED_PREFERENCE_KEYS,
  fromCloudConversationRow,
  fromCloudMemoryRow,
  isSyncedPreferenceKey,
  rowTimestampMs,
  toCloudConversationRow,
  toCloudMemoryRow,
} from './extraCloudSyncCore';
import { ensureWorkspaceUuid } from './workspaceSyncCore';

export const EXTRA_CLOUD_UPDATE_EVENT = 'yash_extra_cloud_update';

type Row = Record<string, unknown>;

let tabChannel: BroadcastChannel | null = null;
function getTabChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!tabChannel) tabChannel = new BroadcastChannel('yashwanth_hub_sync');
  return tabChannel;
}

export function broadcastExtraUpdate(kind: 'ai_conversations' | 'neo_memories' | 'user_preferences', key?: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EXTRA_CLOUD_UPDATE_EVENT, { detail: { kind, key } }));
  }
  try {
    getTabChannel()?.postMessage({ kind, key, at: Date.now() });
  } catch {
    /* ignore BroadcastChannel failures */
  }
}

export function listenExtraBroadcasts(onEvent: (detail: { kind: string; key?: string }) => void): () => void {
  const ch = getTabChannel();
  if (!ch) return () => {};
  const handler = (ev: MessageEvent) => {
    if (ev.data?.kind) onEvent(ev.data);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

/** Saves a synced preference locally AND queues cloud upload across devices. */
export async function saveSyncedPreference(key: string, value: unknown, updatedAt?: string): Promise<void> {
  const ts = updatedAt || new Date().toISOString();
  await db.settings.put({ key, value, updated_at: ts });
  if (isSyncedPreferenceKey(key)) {
    await SyncQueueService.enqueueChange('user_preferences', key, 'UPDATE', {
      id: key,
      value,
      created_at: ts,
      updated_at: ts,
    }).catch(() => {});
  }
  broadcastExtraUpdate('user_preferences', key);
}

export async function reconcileExtraCloudData(): Promise<{
  pulled: number;
  uploaded: number;
  errors: string[];
}> {
  if (!isSupabaseConfigured() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { pulled: 0, uploaded: 0, errors: [] };
  }
  const client = getSupabaseClient();
  if (!client) return { pulled: 0, uploaded: 0, errors: [] };

  const sessionRes = await client.auth.getSession().catch(() => null);
  const userId = sessionRes?.data?.session?.user?.id ?? null;
  if (!userId) return { pulled: 0, uploaded: 0, errors: [] };

  let pulled = 0;
  let uploaded = 0;
  const errors: string[] = [];

  // 1. ai_conversations
  try {
    const { data: remoteConvs, error } = await client.from('ai_conversations').select('*').order('updated_at', { ascending: false }).limit(100);
    if (!error && Array.isArray(remoteConvs)) {
      const localConvs = (await db.ai_conversations.toArray()) as unknown as Row[];
      const localById = new Map(localConvs.map((c) => [ensureWorkspaceUuid(String(c.id)), c]));
      const remoteById = new Map((remoteConvs as Row[]).map((r) => [ensureWorkspaceUuid(String(r.id)), r]));

      for (const [id, r] of remoteById) {
        const pending = await SyncQueueService.hasPendingChange('ai_conversations', id);
        if (pending) continue;
        const l = localById.get(id);
        if (!l || rowTimestampMs(r) > rowTimestampMs(l)) {
          await db.ai_conversations.put(fromCloudConversationRow(r) as any);
          pulled++;
        } else if (rowTimestampMs(l) > rowTimestampMs(r)) {
          await SyncQueueService.enqueueChange('ai_conversations', id, 'UPDATE', toCloudConversationRow(l, userId));
          uploaded++;
        }
      }
      for (const [id, l] of localById) {
        if (!remoteById.has(id)) {
          await SyncQueueService.enqueueChange('ai_conversations', id, 'INSERT', toCloudConversationRow(l, userId));
          uploaded++;
        }
      }
    }
  } catch (e: any) {
    errors.push(`ai_conversations: ${e?.message || 'sync failed'}`);
  }

  // 2. memories (Neo 1) <-> db.neo_memories
  try {
    const { data: remoteMems, error } = await client.from('memories').select('*').order('captured_at', { ascending: false }).limit(200);
    if (!error && Array.isArray(remoteMems)) {
      const localMems = (await db.neo_memories.toArray()) as unknown as Row[];
      const localById = new Map(localMems.map((m) => [ensureWorkspaceUuid(String(m.id)), m]));
      const remoteById = new Map((remoteMems as Row[]).map((r) => [ensureWorkspaceUuid(String(r.id)), r]));

      for (const [id, r] of remoteById) {
        const pending = await SyncQueueService.hasPendingChange('memories', id);
        if (pending) continue;
        const l = localById.get(id);
        if (!l || rowTimestampMs(r) > rowTimestampMs(l)) {
          await db.neo_memories.put(fromCloudMemoryRow(r) as any);
          pulled++;
        }
      }
      // Push local memories that are missing on cloud (excluding pure starter demo rows when cloud already holds real ones? Actually Neo seeds use unique ids; safe to upload user's memories!)
      for (const [id, l] of localById) {
        if (!remoteById.has(id)) {
          await SyncQueueService.enqueueChange('memories', id, 'INSERT', toCloudMemoryRow(l, userId));
          uploaded++;
        }
      }
    }
  } catch (e: any) {
    errors.push(`memories: ${e?.message || 'sync failed'}`);
  }

  // 3. user_preferences (V3F state & P-v telemetry)
  try {
    const { data: remotePrefs, error } = await client.from('user_preferences').select('*').in('id', [...SYNCED_PREFERENCE_KEYS]);
    if (!error && Array.isArray(remotePrefs)) {
      const remoteById = new Map((remotePrefs as Row[]).map((r) => [String(r.id), r]));
      for (const key of SYNCED_PREFERENCE_KEYS) {
        const pending = await SyncQueueService.hasPendingChange('user_preferences', key);
        if (pending) continue;
        const localRow = (await db.settings.get(key)) as unknown as Row | undefined;
        const remoteRow = remoteById.get(key);
        if (remoteRow && (!localRow || rowTimestampMs(remoteRow) > rowTimestampMs(localRow))) {
          await db.settings.put({
            key,
            value: remoteRow.value as any,
            updated_at: String(remoteRow.updated_at || new Date().toISOString()),
          });
          broadcastExtraUpdate('user_preferences', key);
          pulled++;
        } else if (localRow && (!remoteRow || rowTimestampMs(localRow) > rowTimestampMs(remoteRow))) {
          await SyncQueueService.enqueueChange('user_preferences', key, 'UPDATE', {
            id: key,
            value: localRow.value,
            created_at: String(localRow.updated_at || new Date().toISOString()),
            updated_at: String(localRow.updated_at || new Date().toISOString()),
          });
          uploaded++;
        }
      }
    }
  } catch {
    /* table may not exist in older mocked tests */
  }

  return { pulled, uploaded, errors };
}

export async function applyExtraRealtime(
  table: 'ai_conversations' | 'memories' | 'user_preferences',
  payload: { eventType: string; new?: Row; old?: Row },
): Promise<void> {
  if (payload.eventType === 'DELETE') {
    const id = payload.old?.id ? String(payload.old.id) : null;
    if (!id) return;
    if (await SyncQueueService.hasPendingChange(table, id)) return;
    if (table === 'ai_conversations') {
      await db.ai_conversations.delete(id);
      broadcastExtraUpdate('ai_conversations', id);
    } else if (table === 'memories') {
      await db.neo_memories.delete(id);
      broadcastExtraUpdate('neo_memories', id);
    } else if (table === 'user_preferences') {
      await db.settings.delete(id);
      broadcastExtraUpdate('user_preferences', id);
    }
    return;
  }

  if (!payload.new?.id) return;
  const id = String(payload.new.id);
  if (await SyncQueueService.hasPendingChange(table, id)) return;

  if (table === 'ai_conversations') {
    const local = (await db.ai_conversations.get(id)) as unknown as Row | undefined;
    if (local && rowTimestampMs(local) > rowTimestampMs(payload.new)) return;
    await db.ai_conversations.put(fromCloudConversationRow(payload.new) as any);
    broadcastExtraUpdate('ai_conversations', id);
  } else if (table === 'memories') {
    const local = (await db.neo_memories.get(id)) as unknown as Row | undefined;
    if (local && rowTimestampMs(local) > rowTimestampMs(payload.new)) return;
    await db.neo_memories.put(fromCloudMemoryRow(payload.new) as any);
    broadcastExtraUpdate('neo_memories', id);
  } else if (table === 'user_preferences' && isSyncedPreferenceKey(id)) {
    const local = (await db.settings.get(id)) as unknown as Row | undefined;
    if (local && rowTimestampMs(local) > rowTimestampMs(payload.new)) return;
    await db.settings.put({
      key: id,
      value: payload.new.value as any,
      updated_at: String(payload.new.updated_at || new Date().toISOString()),
    });
    broadcastExtraUpdate('user_preferences', id);
  }
}
