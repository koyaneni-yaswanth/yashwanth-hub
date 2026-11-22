/**
 * Conflict rules for changes arriving from the cloud (Supabase realtime) while the
 * device may hold newer, not-yet-uploaded edits. Local unsynced work is never
 * silently overwritten: it wins, and its queued upload brings the cloud back in line.
 */

export type RemoteDecision = 'apply' | 'keep-local';

export interface Timestamped {
  updated_at?: string;
}

export function resolveRemoteUpsert(
  local: Timestamped | undefined,
  remote: Timestamped,
  hasPendingLocalChange: boolean
): RemoteDecision {
  if (!local) return 'apply';
  if (hasPendingLocalChange) return 'keep-local';
  if (local.updated_at && remote.updated_at && remote.updated_at < local.updated_at) return 'keep-local';
  return 'apply';
}

export function resolveRemoteDelete(hasPendingLocalChange: boolean): RemoteDecision {
  // A pending local edit re-uploads the record; deleting it locally would discard that edit.
  return hasPendingLocalChange ? 'keep-local' : 'apply';
}
