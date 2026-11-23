/**
 * Deep Work: pure timer and insight maths. The timer is computed from timestamps,
 * not by counting ticks, so it stays correct when the tab sleeps or the phone locks.
 */
import type { FocusPresetId, FocusSession } from '../types';
import { addDays, parseDateKey, weekStart } from './habits.ts';

export interface FocusPreset {
  id: FocusPresetId;
  label: string;
  focus: number;
  rest: number;
  hint: string;
}

export const FOCUS_PRESETS: FocusPreset[] = [
  { id: '25-5', label: '25 / 5', focus: 25, rest: 5, hint: 'Classic Pomodoro — easy to start' },
  { id: '50-10', label: '50 / 10', focus: 50, rest: 10, hint: 'Steady block for most work' },
  { id: '90-20', label: '90 / 20', focus: 90, rest: 20, hint: 'Long deep-work block' },
];

export const MIN_FOCUS = 5;
export const MAX_FOCUS = 180;

export function clampMinutes(n: number, min = MIN_FOCUS, max = MAX_FOCUS): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Timer state kept while a session runs. All times are epoch milliseconds. */
export interface RunningTimer {
  startedAt: number;
  plannedMs: number;
  /** Total time spent paused so far (finished pauses). */
  pausedMs: number;
  /** Set while paused. */
  pausedAt?: number;
}

export function elapsedMs(t: RunningTimer, now: number): number {
  const pausedNow = t.pausedAt ? now - t.pausedAt : 0;
  return Math.max(0, now - t.startedAt - t.pausedMs - pausedNow);
}

export function remainingMs(t: RunningTimer, now: number): number {
  return Math.max(0, t.plannedMs - elapsedMs(t, now));
}

export function pause(t: RunningTimer, now: number): RunningTimer {
  return t.pausedAt ? t : { ...t, pausedAt: now };
}

export function resume(t: RunningTimer, now: number): RunningTimer {
  if (!t.pausedAt) return t;
  return { ...t, pausedMs: t.pausedMs + (now - t.pausedAt), pausedAt: undefined };
}

/** "24:59" countdown text. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface WeeklyFocus {
  /** Monday of the week. */
  weekStart: string;
  /** Minutes per day, Monday first (7 entries). */
  days: { date: string; minutes: number }[];
  totalMinutes: number;
  sessions: number;
  completedSessions: number;
  interruptions: number;
  /** Average self-rating, if any sessions were rated. */
  averageRating?: number;
}

export function weeklyFocus(sessions: FocusSession[], anyDayInWeek: string): WeeklyFocus {
  const start = weekStart(anyDayInWeek);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const inWeek = sessions.filter((s) => s.date >= dates[0] && s.date <= dates[6]);
  const days = dates.map((date) => ({
    date,
    minutes: inWeek.filter((s) => s.date === date).reduce((sum, s) => sum + (s.actual_minutes || 0), 0),
  }));
  const rated = inWeek.filter((s) => typeof s.focus_rating === 'number');
  return {
    weekStart: start,
    days,
    totalMinutes: days.reduce((sum, d) => sum + d.minutes, 0),
    sessions: inWeek.length,
    completedSessions: inWeek.filter((s) => s.completed).length,
    interruptions: inWeek.reduce((sum, s) => sum + (s.interruptions || 0), 0),
    averageRating: rated.length ? rated.reduce((sum, s) => sum + (s.focus_rating || 0), 0) / rated.length : undefined,
  };
}

export interface FocusWindow {
  startHour: number;
  endHour: number;
  minutes: number;
}

/**
 * The 3-hour window of the day with the most focused minutes, across the given
 * sessions. Needs a few sessions to mean anything, so it returns null below
 * `minSessions`.
 */
export function bestFocusWindow(sessions: FocusSession[], minSessions = 5, width = 3): FocusWindow | null {
  const usable = sessions.filter((s) => (s.actual_minutes || 0) > 0);
  if (usable.length < minSessions) return null;
  const byHour = new Array(24).fill(0);
  for (const s of usable) byHour[new Date(s.started_at).getHours()] += s.actual_minutes;
  let best: FocusWindow | null = null;
  for (let h = 0; h <= 24 - width; h++) {
    const minutes = byHour.slice(h, h + width).reduce((a, b) => a + b, 0);
    if (!best || minutes > best.minutes) best = { startHour: h, endHour: h + width, minutes };
  }
  return best && best.minutes > 0 ? best : null;
}

export function formatHour(h: number): string {
  const suffix = h < 12 || h === 24 ? 'AM' : 'PM';
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n} ${suffix}`;
}

/** Short weekday label for a date key, e.g. "Mon". */
export function weekdayLabel(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', { weekday: 'short' });
}

// ---------------------------------------------------------------------------
// The running session, shared between Deep Work (which owns it) and other pages
// ---------------------------------------------------------------------------

/** localStorage key for the running Deep Work session (survives reloads). */
export const FOCUS_RUN_KEY = 'yash_focus_running_v1';

export interface RunningFocusInfo {
  label: string;
  goalId?: string;
  taskId?: string;
  plannedMs: number;
  remainingMs: number;
  /** 0–1 share of the session done. */
  progress: number;
  paused: boolean;
}

/** Summarises a stored running session at `now`; null when none or unreadable. */
export function describeRunningFocus(raw: string | null, now: number): RunningFocusInfo | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as { label?: string; goal_id?: string; task_id?: string; timer?: RunningTimer };
    if (!s.timer || typeof s.timer.startedAt !== 'number' || typeof s.timer.plannedMs !== 'number') return null;
    const remaining = remainingMs(s.timer, now);
    if (remaining <= 0) return null;
    return {
      label: s.label || 'Focus session',
      goalId: s.goal_id,
      taskId: s.task_id,
      plannedMs: s.timer.plannedMs,
      remainingMs: remaining,
      progress: Math.min(1, 1 - remaining / Math.max(1, s.timer.plannedMs)),
      paused: Boolean(s.timer.pausedAt),
    };
  } catch {
    return null;
  }
}
