/** Time ranges for Analytics: buckets of days, weeks or months ending today. Pure. */
import { addDays, parseDateKey, toDateKey, weekStart } from './habits.ts';

export type TimeRange = 'week' | 'month' | 'quarter' | 'year';

export const RANGE_META: Record<TimeRange, { label: string; long: string; bucket: 'day' | 'week' | 'month' }> = {
  week: { label: 'Week', long: 'last 7 days', bucket: 'day' },
  month: { label: 'Month', long: 'last 30 days', bucket: 'day' },
  quarter: { label: 'Quarter', long: 'last 13 weeks', bucket: 'week' },
  year: { label: 'Year', long: 'last 12 months', bucket: 'month' },
};

export interface Bucket {
  key: string;
  label: string;
  longLabel: string;
  /** Inclusive day range 'YYYY-MM-DD'. */
  from: string;
  to: string;
  current: boolean;
}

export function rangeBuckets(range: TimeRange, today: string): Bucket[] {
  const fmt = (k: string, o: Intl.DateTimeFormatOptions) => parseDateKey(k).toLocaleDateString('en-US', o);
  if (range === 'week' || range === 'month') {
    const n = range === 'week' ? 7 : 30;
    return Array.from({ length: n }, (_, i) => {
      const day = addDays(today, i - (n - 1));
      return {
        key: day,
        label: range === 'week' ? fmt(day, { weekday: 'short' }) : fmt(day, { day: 'numeric' }),
        longLabel: fmt(day, { weekday: 'long', month: 'short', day: 'numeric' }),
        from: day,
        to: day,
        current: day === today,
      };
    });
  }
  if (range === 'quarter') {
    const thisWeek = weekStart(today);
    return Array.from({ length: 13 }, (_, i) => {
      const from = addDays(thisWeek, (i - 12) * 7);
      return {
        key: from,
        label: fmt(from, { month: 'short', day: 'numeric' }),
        longLabel: `Week of ${fmt(from, { month: 'long', day: 'numeric' })}`,
        from,
        to: addDays(from, 6),
        current: from === thisWeek,
      };
    });
  }
  // year: 12 calendar months, this month last
  const t = parseDateKey(today);
  return Array.from({ length: 12 }, (_, i) => {
    const first = new Date(t.getFullYear(), t.getMonth() - (11 - i), 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const from = toDateKey(first);
    return {
      key: from,
      label: first.toLocaleDateString('en-US', { month: 'short' }),
      longLabel: first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      from,
      to: toDateKey(last),
      current: i === 11,
    };
  });
}

/** Sums `valueOf(item)` per bucket using each item's day key. */
export function sumByBucket<T>(buckets: Bucket[], items: T[], dayOf: (x: T) => string | undefined, valueOf: (x: T) => number = () => 1): number[] {
  return buckets.map((b) => items.reduce((acc, x) => {
    const d = dayOf(x);
    return d && d >= b.from && d <= b.to ? acc + valueOf(x) : acc;
  }, 0));
}

/** Weekly totals for the heatmap's table view. */
export function weeklyTotals(values: Map<string, number>, end: string, weeks = 26): { label: string; value: number }[] {
  const first = addDays(weekStart(end), -(weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, w) => {
    const ws = addDays(first, w * 7);
    let v = 0;
    for (let d = 0; d < 7; d++) {
      const day = addDays(ws, d);
      if (day <= end) v += values.get(day) ?? 0;
    }
    return { label: `Week of ${parseDateKey(ws).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, value: v };
  }).reverse();
}
