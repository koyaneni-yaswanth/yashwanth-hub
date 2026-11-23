/**
 * Rules for two-way Google Tasks sync, kept pure so they are unit-tested.
 */
import type { GoogleTaskItem, Task } from '../types';

const norm = (s: string | undefined) => String(s ?? '').trim().toLowerCase();

/**
 * The local task a Google task belongs to.
 * 1. The task already linked to it (google_task_id).
 * 2. Otherwise an unlinked, open, non-repeating task with the same title that
 *    hasn't been matched yet. Repeating tasks are excluded: each completion
 *    leaves a finished copy and a same-titled next copy, and a title match
 *    could tick off the wrong one.
 */
export function matchLocalTask(gt: Pick<GoogleTaskItem, 'id' | 'title'>, localTasks: Task[], alreadyMatched: Set<string> = new Set()): Task | undefined {
  const byId = localTasks.find((lt) => lt.google_task_id === gt.id);
  if (byId) return byId;
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
 * Which side's done/open status wins: the one changed most recently.
 * - 'import': apply Google's status locally.
 * - 'export': push the local status to Google.
 * A finished copy of a repeating series is never reopened from Google (its
 * next copy already exists); its "done" is pushed to Google instead.
 */
export function decideStatusSync(gt: Pick<GoogleTaskItem, 'status' | 'updated'>, local: Pick<Task, 'done' | 'updated_at' | 'recurred_to'>): StatusSync {
  const googleDone = gt.status === 'completed';
  if (googleDone === local.done) return 'none';
  if (local.recurred_to) return local.done ? 'export' : 'none';
  const googleAt = Date.parse(String(gt.updated ?? ''));
  const localAt = Date.parse(String(local.updated_at ?? ''));
  if (Number.isNaN(googleAt)) return 'import';
  if (Number.isNaN(localAt)) return 'import';
  return localAt > googleAt ? 'export' : 'import';
}
