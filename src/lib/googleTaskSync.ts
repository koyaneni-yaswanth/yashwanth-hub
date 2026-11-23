/**
 * Rules for two-way Google Tasks sync, kept pure so they are unit-tested.
 */
import type { GoogleTaskItem, Task } from '../types';

const norm = (s: string | undefined) => String(s ?? '').trim().toLowerCase();

/**
 * The local task a Google task belongs to.
 * 1. The task already linked to it (google_task_id).
 * 2. Otherwise, for a Google task that is still open: an unlinked, open,
 *    non-repeating task with the same title that hasn't been matched yet.
 *    Repeating tasks are excluded (each completion leaves a finished copy and
 *    a same-titled next copy, and a title match could tick off the wrong one),
 *    and completed Google tasks are excluded (an old finished task must not be
 *    reopened by a new one that happens to share its title).
 */
export function matchLocalTask(
  gt: Pick<GoogleTaskItem, 'id' | 'title' | 'status'>,
  localTasks: Task[],
  alreadyMatched: Set<string> = new Set()
): Task | undefined {
  const byId = localTasks.find((lt) => lt.google_task_id === gt.id);
  if (byId) return byId;
  if (gt.status === 'completed') return undefined;
  return localTasks.find(
    (lt) =>
      !lt.google_task_id &&
      !lt.done &&
      !lt.recurrence &&
      !lt.recurred_to &&
      !alreadyMatched.has(lt.id) &&
      norm(lt.text) === norm(gt.title)
  );
}

export type StatusSync = 'none' | 'import' | 'export';

/**
 * Which side's done/open status wins when they differ.
 * - lastSyncedDone is the status both sides last agreed on (recorded after
 *   every sync and every status push). Whichever side moved away from it wins:
 *   Google changed -> 'import', the hub changed -> 'export'. Unrelated edits
 *   (a star, a note, a due date) don't count, and device clocks don't matter.
 * - With no record yet, Google wins (the behaviour before this rule existed).
 * - A finished copy of a repeating series is never reopened from Google (its
 *   next copy already exists); its "done" is pushed to Google instead.
 */
export function decideStatusSync(
  gt: Pick<GoogleTaskItem, 'status'>,
  local: Pick<Task, 'done' | 'recurred_to'>,
  lastSyncedDone?: boolean
): StatusSync {
  const googleDone = gt.status === 'completed';
  if (googleDone === local.done) return 'none';
  if (local.recurred_to) return local.done ? 'export' : 'none';
  if (lastSyncedDone === undefined) return 'import';
  return googleDone !== lastSyncedDone ? 'import' : 'export';
}

/**
 * A stable task id for a task imported from Google, the same on every device,
 * so two devices importing the same Google task create one cloud row, not two.
 * Name-based UUID (version 5 layout) from SHA-1 of the Google task id.
 */
export async function taskIdForGoogleTask(googleTaskId: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`yashwanth-hub:google-task:${googleTaskId}`))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
