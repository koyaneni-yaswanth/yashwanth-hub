/**
 * Tasks v3 rules: subtasks, repeating tasks, "blocked by" links and board
 * stages. Pure functions (no Dexie, no React) so they are unit-tested.
 */
import type { Recurrence, RecurrenceFreq, Subtask, Task, TaskStage } from '../types';
import { toDueKey } from './utils.ts';

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

export const MAX_INTERVAL = 365;

const usesAnchorDay = (freq: RecurrenceFreq) => freq === 'monthly' || freq === 'yearly';

export function normaliseRecurrence(rec: Recurrence | undefined | null): Recurrence | undefined {
  if (!rec || !RECURRENCE_OPTIONS.some((o) => o.value === rec.freq)) return undefined;
  const interval = Math.max(1, Math.min(MAX_INTERVAL, Math.floor(Number(rec.interval) || 1)));
  const day = Number(rec.day);
  return {
    freq: rec.freq,
    interval: rec.freq === 'weekdays' ? 1 : interval,
    ...(rec.until ? { until: rec.until } : {}),
    ...(usesAnchorDay(rec.freq) && Number.isInteger(day) && day >= 1 && day <= 31 ? { day } : {}),
  };
}

/**
 * One step of the series: the next due date after `fromDue` (or after `today`
 * if there is no due date). Returns null once the series has passed `until`.
 * Monthly/yearly use the series' anchor day (recurrence.day) when set, so
 * Jan 31 -> Feb 28 -> Mar 31 and Feb 29 -> Feb 28 -> ... -> Feb 29.
 */
export function nextDueDate(rec: Recurrence, fromDue: string | undefined, today: string): string | null {
  const r = normaliseRecurrence(rec);
  if (!r) return null;
  const base = fromKey(fromDue || today);
  const anchorDay = r.day ?? base.getDate();
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

/**
 * The first date in the series after today. A task finished late (or one
 * left overdue for weeks) gets its next copy in the future, not another
 * overdue copy, while on-time completions keep the normal rhythm.
 */
export function nextDueAfterToday(rec: Recurrence, fromDue: string | undefined, today: string): string | null {
  let due = nextDueDate(rec, fromDue, today);
  for (let guard = 0; due !== null && due <= today && guard < 5000; guard++) due = nextDueDate(rec, due, today);
  return due !== null && due <= today ? null : due;
}

/**
 * Keeps a monthly/yearly series' anchor day in line with the due date chosen in
 * the editor (a due date moved from the 31st to the 15th re-anchors to the 15th).
 * A due date on the last day of a short month keeps a later anchor (31 -> Feb 28).
 */
export function alignAnchorDay(rec: Recurrence | undefined, dueDate: string | undefined): Recurrence | undefined {
  if (!rec || !usesAnchorDay(rec.freq)) return rec;
  const key = dueDate ? toDueKey(dueDate) : '';
  if (!key) return rec;
  const d = fromKey(key);
  const day = d.getDate();
  if (rec.day && rec.day > day && day === daysInMonth(d.getFullYear(), d.getMonth())) return rec;
  return { ...rec, day };
}

export function describeRecurrence(rec: Recurrence | undefined): string {
  const r = normaliseRecurrence(rec);
  if (!r) return '';
  if (r.freq === 'weekdays') return r.until ? `Every weekday until ${r.until}` : 'Every weekday';
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
  const rec = normaliseRecurrence(task.recurrence);
  if (!rec) return null;
  const fromDue = task.due_date ? toDueKey(task.due_date) || undefined : undefined;
  // Remember the series' day of month the first time, so short months don't shift it for good.
  const series: Recurrence = usesAnchorDay(rec.freq) && !rec.day ? { ...rec, day: fromKey(fromDue || today).getDate() } : rec;
  const due = nextDueAfterToday(series, fromDue, today);
  if (!due) return null;
  return {
    ...task,
    id: newId,
    due_date: due,
    done: false,
    stage: 'todo',
    recurrence: series,
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

type Row = Record<string, unknown>;

/** True when a task holds v3 data worth keeping (an untouched 'todo' stage is just the default). */
export function hasTaskV3Values(task: Row | undefined | null): boolean {
  if (!task) return false;
  const arr = (v: unknown) => Array.isArray(v) && v.length > 0;
  return arr(task.subtasks) || arr(task.blocked_by) || task.recurrence != null || task.stage === 'doing' || task.recurred_to != null;
}

/**
 * The task row to upload.
 * - Cloud without the v3 columns: leave them out (they stay on the device).
 * - Cloud with them: send every v3 column, a missing value as null, so a field
 *   cleared on this device is cleared in the cloud too. Every task upload is a
 *   full row, so "absent here" really means "empty".
 */
export function toCloudTaskPayload<T extends Row>(payload: T, cloudHasV3Columns: boolean): T {
  if (!cloudHasV3Columns) return stripTaskV3Fields(payload);
  const out: Row = { ...payload };
  for (const key of TASK_V3_FIELDS) out[key] = payload[key] ?? null;
  return out as T;
}

/**
 * Applies a task arriving from the cloud.
 * - A v3 key the cloud row doesn't carry (older schema) keeps the local value.
 * - keepLocalV3: this device holds v3 values the cloud has never received
 *   (saved before the columns existed); they win until they are uploaded.
 * - Otherwise the cloud value applies; null means empty and is stored as absent.
 */
export function mergeRemoteTask(local: Task | undefined, remote: Task, opts: { keepLocalV3?: boolean } = {}): Task {
  const merged = { ...remote } as Task & Row;
  for (const key of TASK_V3_FIELDS) {
    const useLocal = !!local && (opts.keepLocalV3 || !(key in remote));
    const value = useLocal ? local![key] : (remote as Task & Row)[key];
    if (value === undefined || value === null) delete merged[key];
    else merged[key] = value as never;
  }
  return merged;
}

export function stripTaskV3Fields<T extends Row>(payload: T): T {
  const copy = { ...payload };
  for (const key of TASK_V3_FIELDS) delete copy[key];
  return copy;
}

/** How the cloud answered the v3 column check. Only a "missing column/table" answer means no. */
export type V3ColumnCheck = 'yes' | 'no' | 'unknown';

export function classifyColumnProbeError(error: { code?: string; message?: string } | null | undefined): V3ColumnCheck {
  if (!error) return 'yes';
  const code = String(error.code ?? '');
  const msg = String(error.message ?? '');
  if (['42703', 'PGRST204', '42P01', 'PGRST205'].includes(code)) return 'no';
  if (/column .* does not exist|could not find the .* column|relation .* does not exist|could not find the table/i.test(msg)) return 'no';
  return 'unknown';
}
