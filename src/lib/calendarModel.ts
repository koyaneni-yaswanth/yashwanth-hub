/**
 * Calendar rules: date ranges for each view, merging events, meetings and
 * due tasks into one timeline, and clash (overlap) detection. Pure functions.
 */

export type CalSource = 'event' | 'meeting' | 'task';

export interface CalItem {
  id: string;
  source: CalSource;
  title: string;
  date: string; // YYYY-MM-DD
  start?: string; // HH:mm
  end?: string; // HH:mm
  done?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromDateKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** 'HH:mm' -> minutes after midnight, or null when missing/invalid. */
export function toMinutes(time: string | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins < 24 * 60 ? mins : null;
}

/** Default length used for a timed item without an end time. */
export const DEFAULT_DURATION_MIN = 60;

/** [start, end) in minutes for a timed item, or null for all-day items and tasks. */
export function timeSpan(item: Pick<CalItem, 'start' | 'end' | 'source'>): [number, number] | null {
  if (item.source === 'task') return null;
  const s = toMinutes(item.start);
  if (s === null) return null;
  const e = toMinutes(item.end);
  return [s, e !== null && e > s ? e : Math.min(24 * 60, s + DEFAULT_DURATION_MIN)];
}

/** True when an end time is set but is not after the start time. */
export function endBeforeStart(start: string | undefined, end: string | undefined): boolean {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s !== null && e !== null && e <= s;
}

/** Timed items on the same day that overlap `candidate` (touching end-to-start is fine). */
export function clashesWith(candidate: Pick<CalItem, 'date' | 'start' | 'end' | 'source'> & { id?: string }, items: CalItem[]): CalItem[] {
  const span = timeSpan(candidate);
  if (!span) return [];
  return items.filter((it) => {
    if (it.date !== candidate.date || (candidate.id && it.id === candidate.id && it.source === candidate.source)) return false;
    const other = timeSpan(it);
    return !!other && span[0] < other[1] && other[0] < span[1];
  });
}

/** Map of `${source}:${id}` -> the items it overlaps with, for every clashing item. */
export function findClashes(items: CalItem[]): Map<string, CalItem[]> {
  const out = new Map<string, CalItem[]>();
  const byDate = new Map<string, CalItem[]>();
  for (const it of items) {
    if (!timeSpan(it)) continue;
    const list = byDate.get(it.date) ?? [];
    list.push(it);
    byDate.set(it.date, list);
  }
  for (const list of byDate.values()) {
    for (const it of list) {
      const hits = clashesWith({ ...it }, list);
      if (hits.length) out.set(itemKey(it), hits);
    }
  }
  return out;
}

export const itemKey = (it: Pick<CalItem, 'source' | 'id'>) => `${it.source}:${it.id}`;

/** Sorts a day's items: all-day and tasks first, then by start time. */
export function sortDay(items: CalItem[]): CalItem[] {
  return [...items].sort((a, b) => {
    const sa = toMinutes(a.start) ?? -1;
    const sb = toMinutes(b.start) ?? -1;
    return sa - sb || a.title.localeCompare(b.title);
  });
}

/** Date keys shown by a list view: one day, the Sun–Sat week, or the next 14 days. */
export function rangeFor(view: 'day' | 'week' | 'agenda', anchor: Date): string[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (view === 'week') start.setDate(start.getDate() - start.getDay());
  const len = view === 'day' ? 1 : view === 'week' ? 7 : 14;
  return Array.from({ length: len }, (_, i) => dateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
}

export function formatTimeRange(item: Pick<CalItem, 'start' | 'end'>): string {
  if (!item.start) return 'All day';
  return item.end ? `${item.start}–${item.end}` : item.start;
}
