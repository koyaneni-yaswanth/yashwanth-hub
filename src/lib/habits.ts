/**
 * Pure date + streak maths for goals and habits. Dates are local calendar days as
 * 'YYYY-MM-DD' strings, so results never shift with time zones or DST.
 *
 * Streaks are forgiving by design: today not being checked off yet never breaks a
 * streak (the day isn't over), and weekly habits only need their weekly target.
 */

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const d = parseDateKey(key);
  const offset = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(key, -offset);
}

export interface HabitStats {
  /** Consecutive days (daily habits) or weeks meeting target (weekly habits), ending now. */
  current: number;
  best: number;
  unit: 'day' | 'week';
  doneToday: boolean;
  /** Check-ins in the current Mon–Sun week. */
  thisWeek: number;
  /** Check-ins in the last 7 / 30 days including today. */
  last7: number;
  last30: number;
}

function longestDailyRun(sorted: string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    run = prev && addDays(prev, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

export function computeHabitStats(doneDates: Iterable<string>, todayKey: string, weeklyTarget = 7): HabitStats {
  const set = new Set(doneDates);
  const sorted = [...set].filter((k) => k <= todayKey).sort();
  const doneToday = set.has(todayKey);

  const countSince = (fromKey: string) => sorted.filter((k) => k >= fromKey).length;
  const thisWeekStart = weekStart(todayKey);
  const thisWeek = countSince(thisWeekStart);
  const last7 = countSince(addDays(todayKey, -6));
  const last30 = countSince(addDays(todayKey, -29));

  if (weeklyTarget >= 7) {
    let current = 0;
    let cursor = doneToday ? todayKey : addDays(todayKey, -1);
    while (set.has(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
    }
    return { current, best: Math.max(current, longestDailyRun(sorted)), unit: 'day', doneToday, thisWeek, last7, last30 };
  }

  // Weekly habits: count consecutive weeks that met the target. The current week
  // counts once met, and is never held against the streak while still in progress.
  const perWeek = new Map<string, number>();
  for (const k of sorted) perWeek.set(weekStart(k), (perWeek.get(weekStart(k)) ?? 0) + 1);
  const met = (wk: string) => (perWeek.get(wk) ?? 0) >= weeklyTarget;

  let current = met(thisWeekStart) ? 1 : 0;
  let cursor = addDays(thisWeekStart, -7);
  while (met(cursor)) {
    current++;
    cursor = addDays(cursor, -7);
  }

  let best = 0;
  const weeks = [...perWeek.keys()].sort();
  let run = 0;
  let prev: string | null = null;
  for (const wk of weeks) {
    if (!met(wk)) {
      run = 0;
      prev = wk;
      continue;
    }
    run = prev && addDays(prev, 7) === wk && met(prev) ? run + 1 : 1;
    best = Math.max(best, run);
    prev = wk;
  }

  return { current, best: Math.max(best, current), unit: 'week', doneToday, thisWeek, last7, last30 };
}

/** Encouraging, never shaming, one-line summary for a habit. */
export function habitEncouragement(stats: HabitStats, weeklyTarget: number): string {
  if (weeklyTarget < 7) {
    const left = Math.max(0, weeklyTarget - stats.thisWeek);
    if (left === 0) return stats.current >= 2 ? `Target met — ${stats.current}-week streak` : 'Weekly target met — nice work';
    return stats.current >= 1
      ? `${stats.current}-week streak · ${left} more this week keeps it going`
      : `${left} more this week to hit your target`;
  }
  if (stats.current >= 2) return `${stats.current}-day streak — keep it going`;
  if (stats.doneToday) return 'Done today — every day counts';
  if (stats.last7 > 0) return `${stats.last7} of the last 7 days — a fresh start is one check-in away`;
  return 'Ready when you are — start with one check-in today';
}

/** Share (0–100) of milestones completed; 0 when a goal has none yet. */
export function milestoneProgress(milestones: { done: boolean }[]): number {
  if (milestones.length === 0) return 0;
  return Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100);
}
