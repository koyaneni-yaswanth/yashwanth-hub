/**
 * Daily Compass: pure planning maths, no database or React. Dates are local
 * 'YYYY-MM-DD' keys (see habits.ts), so nothing shifts with time zones.
 *
 * Design rules:
 * - A plan is realistic: it is filled only up to the time the user says they have.
 * - The Top 3 are simply the first three plan items, so reordering the plan
 *   reorders the Top 3 too.
 * - Rescue mode never shames: it shrinks the day to one small step.
 */
import type { PlanItem, Priority, Task } from '../types';
import { addDays } from './habits.ts';

export const DEFAULT_AVAILABLE_MINUTES = 240;
export const RESCUE_MINUTES = 25;
export const TOP_COUNT = 3;

const PRIORITY_WEIGHT: Record<Priority, number> = { urgent: 40, high: 25, medium: 10, low: 0 };

/** How strongly a task wants to be done today. Higher first. */
export function scoreTask(task: Pick<Task, 'priority' | 'due_date' | 'starred'>, today: string): number {
  let score = PRIORITY_WEIGHT[task.priority] ?? 0;
  if (task.starred) score += 15;
  if (task.due_date) {
    if (task.due_date < today) score += 30; // overdue
    else if (task.due_date === today) score += 20;
    else if (task.due_date === addDays(today, 1)) score += 8;
  }
  return score;
}

/** A first guess at effort; the user can change it per task on the plan. */
export function defaultEstimate(task: Pick<Task, 'priority'>): number {
  return task.priority === 'urgent' || task.priority === 'high' ? 45 : 30;
}

/** Open tasks, best first. Ties keep the older task first so the order is stable. */
export function rankTasks<T extends Task>(tasks: T[], today: string): T[] {
  return tasks
    .filter((t) => !t.done)
    .map((t, i) => ({ t, i, s: scoreTask(t, today) }))
    .sort((a, b) => b.s - a.s || (a.t.created_at || '').localeCompare(b.t.created_at || '') || a.i - b.i)
    .map((x) => x.t);
}

export interface BuildPlanOptions {
  availableMinutes?: number;
  rescue?: boolean;
  /** Estimates the user already set for some tasks (task_id → minutes). */
  estimates?: Record<string, number>;
}

/**
 * Builds a plan from open tasks: best tasks first, added while they fit in the
 * available time. The best task is always included, even if it alone is longer
 * than the time available, so the plan is never empty while open tasks exist.
 */
export function buildPlan(tasks: Task[], today: string, options: BuildPlanOptions = {}): PlanItem[] {
  const ranked = rankTasks(tasks, today);
  if (ranked.length === 0) return [];
  const estimateOf = (t: Task) => options.estimates?.[t.id] ?? defaultEstimate(t);

  if (options.rescue) {
    return [{ task_id: ranked[0].id, minutes: Math.min(estimateOf(ranked[0]), RESCUE_MINUTES) }];
  }

  const budget = Math.max(0, options.availableMinutes ?? DEFAULT_AVAILABLE_MINUTES);
  const items: PlanItem[] = [];
  let used = 0;
  for (const t of ranked) {
    const minutes = estimateOf(t);
    if (items.length > 0 && used + minutes > budget) continue; // try smaller tasks that still fit
    items.push({ task_id: t.id, minutes });
    used += minutes;
  }
  return items;
}

/** Moves one item, clamping indexes. Returns a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items.slice();
  const target = Math.max(0, Math.min(items.length - 1, to));
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

export interface PlanLoad {
  plannedMinutes: number;
  availableMinutes: number;
  /** Planned minus available; positive means over-planned. */
  overBy: number;
  state: 'light' | 'balanced' | 'over';
}

export function planLoad(items: PlanItem[], availableMinutes: number): PlanLoad {
  const plannedMinutes = items.reduce((sum, i) => sum + Math.max(0, i.minutes || 0), 0);
  const overBy = plannedMinutes - availableMinutes;
  const state = overBy > 0 ? 'over' : plannedMinutes < availableMinutes * 0.5 ? 'light' : 'balanced';
  return { plannedMinutes, availableMinutes, overBy, state };
}

/** Drops plan items whose task no longer exists (deleted elsewhere). */
export function pruneMissing(items: PlanItem[], taskIds: Set<string>): PlanItem[] {
  return items.filter((i) => taskIds.has(i.task_id));
}

export interface WrapUpSplit {
  completed_ids: string[];
  open_ids: string[];
}

/** Splits a plan into finished and still-open tasks at the end of the day. */
export function splitForWrapUp(items: PlanItem[], tasksById: Map<string, Pick<Task, 'done'>>): WrapUpSplit {
  const completed_ids: string[] = [];
  const open_ids: string[] = [];
  for (const i of items) {
    const t = tasksById.get(i.task_id);
    if (!t) continue;
    (t.done ? completed_ids : open_ids).push(i.task_id);
  }
  return { completed_ids, open_ids };
}

/** "1 h 15 min" style, for plan totals. */
export function formatMinutes(min: number): string {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/**
 * Re-plans the day without losing what's already done: finished plan items are
 * kept (at the end, so the Top 3 stay actionable) and their minutes count
 * against the time available. User-set estimates are carried over.
 */
export function replan(current: PlanItem[], tasks: Task[], today: string, options: Omit<BuildPlanOptions, 'estimates'> = {}): PlanItem[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const finished = current.filter((i) => byId.get(i.task_id)?.done);
  const finishedMinutes = finished.reduce((sum, i) => sum + i.minutes, 0);
  const estimates = Object.fromEntries(current.map((i) => [i.task_id, i.minutes]));
  const available = options.availableMinutes ?? DEFAULT_AVAILABLE_MINUTES;
  const open = buildPlan(tasks, today, {
    ...options,
    availableMinutes: Math.max(0, available - finishedMinutes),
    estimates,
  });
  return [...open, ...finished];
}
