/**
 * Tasks v3 rules: subtasks, repeating tasks, "blocked by" links and board
 * stages. Pure functions (no Dexie, no React) so they are unit-tested.
 */
import type { Recurrence, RecurrenceFreq, Subtask, Task, TaskStage } from '../types';

// ---------------------------------------------------------------------------
// Dates (local calendar days as 'YYYY-MM-DD')
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

function addMonthsClamped(d: Date, months: number, anchorDay: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  target.setDate(Math.min(anchorDay, daysInMonth(target.getFullYear(), target.getMonth())));
  return target;
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------
export const RECURRENCE_OPTIONS: { value: RecurrenceFreq; label: string; unit: string }[] = [
  { value: 'daily', label: 'Daily', unit: 'day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)', unit: 'weekday' },
  { value: 'weekly', label: 'Weekly', unit: 'week' },
  { value: 'monthly', label: 'Monthly', unit: 'month' },
  { value: 'yearly', label: 'Yearly', unit: 'year' },
];

export function normaliseRecurrence(rec: Recurrence | undefined | null): Recurrence | undefined {
  if (!rec || !RECURRENCE_OPTIONS.some((o) => o.value === rec.freq)) return undefined;
  const interval = Math.max(1, Math.min(365, Math.floor(Number(rec.interval) || 1)));
  return { freq: rec.freq, interval: rec.freq === 'weekdays' ? 1 : interval, ...(rec.until ? { until: rec.until } : {}) };
}

/**
 * The next due date after `fromDue` (or after `today` if the task had no due
 * date). Returns null once the series has passed its `until` date.
 * Monthly/yearly keep the original day where possible (Jan 31 -> Feb 28 -> Mar 31).
 */
export function nextDueDate(rec: Recurrence, fromDue: string | undefined, today: string): string | null {
  const r = normaliseRecurrence(rec);
  if (!r) return null;
  const base = fromKey(fromDue || today);
  const anchorDay = base.getDate();
  let next: Date;
  switch (r.freq) {
    case 'daily':
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + r.interval);
      break;
    case 'weekdays': {
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
      break;
    }
    case 'weekly':
      next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 7 * r.interval);
      break;
    case 'monthly':
      next = addMonthsClamped(base, r.interval, anchorDay);
      break;
    case 'yearly':
      next = addMonthsClamped(base, 12 * r.interval, anchorDay);
      break;
  }
  const key = toKey(next);
  if (r.until && key > r.until) return null;
  return key;
}

export function describeRecurrence(rec: Recurrence | undefined): string {
  const r = normaliseRecurrence(rec);
  if (!r) return '';
  if (r.freq === 'weekdays') return 'Every weekday';
  const unit = RECURRENCE_OPTIONS.find((o) => o.value === r.freq)!.unit;
  const base = r.interval === 1 ? (r.freq === 'daily' ? 'Daily' : `Every ${unit}`) : `Every ${r.interval} ${unit}s`;
  return r.until ? `${base} until ${r.until}` : base;
}

/**
 * The open copy that replaces a completed repeating task. The series moves to
 * the new copy (the finished one keeps a pointer to it), so completing, undoing
 * and completing again never creates duplicates.
 */
export function buildNextOccurrence(task: Task, today: string, newId: string, now: string): Task | null {
  if (!task.recurrence) return null;
  const due = nextDueDate(task.recurrence, task.due_date, today);
  if (!due) return null;
  return {
    ...task,
    id: newId,
    due_date: due,
    done: false,
    stage: 'todo',
    subtasks: task.subtasks?.map((s) => ({ ...s, done: false })),
    recurred_to: undefined,
    google_task_id: undefined,
    synced: false,
    created_at: now,
    updated_at: now,
  };
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------
export function subtaskProgress(task: Pick<Task, 'subtasks'>): { done: number; total: number } {
  const list = task.subtasks ?? [];
  return { done: list.filter((s) => s.done).length, total: list.length };
}

export function cleanSubtasks(list: Subtask[] | undefined): Subtask[] | undefined {
  const cleaned = (list ?? []).map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
  return cleaned.length ? cleaned : undefined;
}

// ---------------------------------------------------------------------------
// Blocked by
// ---------------------------------------------------------------------------
/** Open tasks this task is still waiting on (missing or finished blockers don't count). */
export function openBlockers(task: Pick<Task, 'blocked_by'>, byId: Map<string, Task>): Task[] {
  return (task.blocked_by ?? []).map((id) => byId.get(id)).filter((t): t is Task => !!t && !t.done);
}

export function isBlocked(task: Pick<Task, 'blocked_by' | 'done'>, byId: Map<string, Task>): boolean {
  return !task.done && openBlockers(task, byId).length > 0;
}

/** True if making `taskId` wait on `blockerId` would create a loop (A waits on B waits on A). */
export function wouldCreateCycle(taskId: string, blockerId: string, byId: Map<string, Task>): boolean {
  if (taskId === blockerId) return true;
  const stack = [blockerId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const next of byId.get(id)?.blocked_by ?? []) stack.push(next);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
export type BoardColumn = TaskStage | 'done';
export const BOARD_COLUMNS: { id: BoardColumn; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

export function boardColumnOf(task: Pick<Task, 'done' | 'stage'>): BoardColumn {
  if (task.done) return 'done';
  return task.stage === 'doing' ? 'doing' : 'todo';
}

/** The task changes that move a card to a column. */
export function moveToColumn(column: BoardColumn): Partial<Task> {
  return column === 'done' ? { done: true } : { done: false, stage: column };
}

// ---------------------------------------------------------------------------
// Cloud safety
// ---------------------------------------------------------------------------
/** Task fields added in v3. Older cloud schemas may not have these columns yet. */
export const TASK_V3_FIELDS = ['subtasks', 'recurrence', 'blocked_by', 'stage', 'recurred_to'] as const;

/**
 * Applies a task arriving from the cloud without losing v3 fields the cloud
 * copy doesn't carry (e.g. before its columns exist).
 */
export function mergeRemoteTask(local: Task | undefined, remote: Task): Task {
  if (!local) return remote;
  const merged = { ...remote } as Task & Record<string, unknown>;
  for (const key of TASK_V3_FIELDS) {
    if (!(key in remote) && local[key] !== undefined) merged[key] = local[key] as never;
  }
  return merged;
}

export function stripTaskV3Fields<T extends Record<string, unknown>>(payload: T): T {
  const copy = { ...payload };
  for (const key of TASK_V3_FIELDS) delete copy[key];
  return copy;
}
