/**
 * Unified single-flight cloud sync coordinator across:
 * 1) Local write queue upload (SyncQueueService.flushQueue)
 * 2) Two-way Goals / Habits / Milestones / Daily Plans / Focus reconciliation (reconcileLifeData)
 * 3) Two-way Workspace tables reconciliation (reconcileWorkspaceData)
 */

import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { SyncQueueService } from './syncQueueService';
import { reconcileLifeData } from './lifeSync';
import { reconcileWorkspaceData } from './workspaceSync';
import { reconcileExtraCloudData } from './extraCloudSync';
import { loadKnowledgeLinks, loadResearchBookmarks } from './m3CloudStore';
import { DeviceFleetService } from '../deviceFleetService';

export interface CloudSyncSummary {
  status: 'synced' | 'offline' | 'signed_out' | 'local_only' | 'partial_error';
  uploaded: number;
  pulled: number;
  deleted: number;
  failed: number;
  errors: string[];
  timestamp: string;
}

const listeners = new Set<(summary: CloudSyncSummary) => void>();
let inFlightSync: Promise<CloudSyncSummary> | null = null;
let lastCompletedSummary: CloudSyncSummary | null = null;

export function onCloudSyncCompleted(listener: (summary: CloudSyncSummary) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getLastCloudSyncSummary(): CloudSyncSummary | null {
  return lastCompletedSummary;
}

export function runFullCloudSync(): Promise<CloudSyncSummary> {
  if (!inFlightSync) {
    inFlightSync = executeFullCloudSync().finally(() => {
      inFlightSync = null;
    });
  }
  return inFlightSync;
}

async function executeFullCloudSync(): Promise<CloudSyncSummary> {
  const now = new Date().toISOString();
  if (!isSupabaseConfigured()) {
    return { status: 'local_only', uploaded: 0, pulled: 0, deleted: 0, failed: 0, errors: [], timestamp: now };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { status: 'offline', uploaded: 0, pulled: 0, deleted: 0, failed: 0, errors: [], timestamp: now };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { status: 'local_only', uploaded: 0, pulled: 0, deleted: 0, failed: 0, errors: [], timestamp: now };
  }

  const sessionRes = await client.auth.getSession().catch(() => null);
  const session = sessionRes?.data?.session ?? null;
  if (!session?.user?.id) {
    return { status: 'signed_out', uploaded: 0, pulled: 0, deleted: 0, failed: 0, errors: [], timestamp: now };
  }

  const errors: string[] = [];

  // Step 1: Flush local queue first so newer device writes reach cloud before pull merge.
  const firstFlush = await SyncQueueService.flushQueue();

  // Step 2: Reconcile life tables, workspace tables, AI conversations/memories/prefs, and fleet in parallel.
  const [lifeRes, wsRes, extraRes] = await Promise.all([
    reconcileLifeData().catch((err) => ({
      status: 'unavailable' as const,
      table: 'goals' as const,
      error: err?.message || String(err),
    })),
    reconcileWorkspaceData().catch((err) => ({
      status: 'ok' as const,
      pulled: 0,
      deleted: 0,
      uploaded: 0,
      tableErrors: [err?.message || String(err)],
    })),
    reconcileExtraCloudData().catch((err) => ({
      pulled: 0,
      uploaded: 0,
      errors: [err?.message || String(err)],
    })),
    loadKnowledgeLinks().catch(() => []),
    loadResearchBookmarks().catch(() => []),
    DeviceFleetService.syncFleetFromCloud().catch(() => {}),
  ]);

  let pulled = extraRes.pulled;
  let deleted = 0;
  let queuedFromReconcile = extraRes.uploaded;
  if (extraRes.errors.length) errors.push(...extraRes.errors);

  if (lifeRes.status === 'ok') {
    pulled += lifeRes.pulled;
    deleted += lifeRes.deleted;
    queuedFromReconcile += lifeRes.uploaded;
  } else if (lifeRes.status === 'unavailable') {
    errors.push(`${lifeRes.table}: ${lifeRes.error}`);
  }

  if (wsRes.status === 'ok') {
    pulled += wsRes.pulled;
    deleted += wsRes.deleted;
    queuedFromReconcile += wsRes.uploaded;
    if (wsRes.tableErrors.length) errors.push(...wsRes.tableErrors);
  }

  // Step 3: Upload any newly backfilled / newer local rows discovered during reconciliation.
  const secondFlush = queuedFromReconcile > 0 ? await SyncQueueService.flushQueue() : { processed: 0, failed: 0 };

  const uploaded = firstFlush.processed + secondFlush.processed;
  const failed = Math.max(firstFlush.failed, secondFlush.failed);
  const status: CloudSyncSummary['status'] = failed > 0 || errors.length > 0 ? 'partial_error' : 'synced';

  const summary: CloudSyncSummary = {
    status,
    uploaded,
    pulled,
    deleted,
    failed,
    errors,
    timestamp: new Date().toISOString(),
  };

  lastCompletedSummary = summary;
  listeners.forEach((cb) => cb(summary));
  return summary;
}
