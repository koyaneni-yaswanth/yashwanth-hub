import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, parseDateKey, weekStart } from '../../lib/habits';

interface HeatmapCalendarProps {
  /** Value per day, keyed 'YYYY-MM-DD'. */
  values: Map<string, number>;
  /** Last day shown (usually today). */
  end: string;
  weeks?: number;
  /** e.g. "check-ins" or "focus minutes" — for labels. */
  unit: string;
  label: string;
}

/** Sequential steps, one hue, light → dark (validated ordinal ramp tokens); zero sits on the grid colour. */
const STEPS = ['var(--viz-grid)', 'var(--viz-ord-1)', 'var(--viz-ord-2)', 'var(--viz-ord-3)', 'var(--viz-ord-4)'];

/**
 * A calendar heatmap: one column per week (Monday on top), one cell per day,
 * darker = more. Values are bucketed into four steps by quartile of the
 * non-zero days, so one huge day doesn't wash out the rest. Hover a cell for
 * its value; the card's table view lists weekly totals.
 */
export const HeatmapCalendar: React.FC<HeatmapCalendarProps> = ({ values, end, weeks = 26, unit, label }) => {
  const [active, setActive] = useState<{ day: string; v: number } | null>(null);
  // On narrow screens the grid scrolls inside its card: start at the most recent weeks.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks, end]);
  const first = addDays(weekStart(end), -(weeks - 1) * 7);

  const { columns, thresholds, total, activeDays } = useMemo(() => {
    const cols: { day: string; v: number; future: boolean }[][] = [];
    const nonZero: number[] = [];
    let sum = 0;
    for (let w = 0; w < weeks; w++) {
      const col: { day: string; v: number; future: boolean }[] = [];
      for (let d = 0; d < 7; d++) {
        const day = addDays(first, w * 7 + d);
        const v = values.get(day) ?? 0;
        const future = day > end;
        if (!future && v > 0) {
          nonZero.push(v);
          sum += v;
        }
        col.push({ day, v, future });
      }
      cols.push(col);
    }
    nonZero.sort((a, b) => a - b);
    const q = (f: number) => nonZero[Math.min(nonZero.length - 1, Math.floor(f * nonZero.length))] ?? 0;
    return { columns: cols, thresholds: [q(0.25), q(0.5), q(0.75)], total: sum, activeDays: nonZero.length };
  }, [values, end, weeks, first]);

  const step = (v: number) => (v <= 0 ? 0 : v <= thresholds[0] ? 1 : v <= thresholds[1] ? 2 : v <= thresholds[2] ? 3 : 4);
  const fmt = (day: string) => parseDateKey(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Month labels where a new month starts in a column.
  const months = columns.map((col, i) => {
    const m = parseDateKey(col[0].day).getMonth();
    const prev = i ? parseDateKey(columns[i - 1][0].day).getMonth() : -1;
    return m !== prev ? parseDateKey(col[0].day).toLocaleDateString('en-US', { month: 'short' }) : '';
  });

  return (
    <div>
      <div ref={scrollRef} className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          <div className="flex gap-[3px] pl-8 text-[10px] text-[var(--hub-muted)] h-4" aria-hidden="true">
            {months.map((m, i) => (
              <span key={i} className="w-[13px] shrink-0 overflow-visible whitespace-nowrap">
                {m}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            <div className="w-7 shrink-0 grid grid-rows-7 gap-[3px] text-[10px] text-[var(--hub-muted)] leading-[13px]" aria-hidden="true">
              {['Mon', '', 'Wed', '', 'Fri', '', ''].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div role="img" aria-label={`${label}: ${total} ${unit} over ${activeDays} active days in the last ${weeks} weeks`} className="flex gap-[3px]">
              {columns.map((col, i) => (
                <div key={i} className="grid grid-rows-7 gap-[3px]">
                  {col.map((c) => (
                    <span
                      key={c.day}
                      onPointerEnter={() => !c.future && setActive({ day: c.day, v: c.v })}
                      onPointerLeave={() => setActive(null)}
                      className="w-[13px] h-[13px] rounded-[3px]"
                      style={{ background: c.future ? 'transparent' : STEPS[step(c.v)], outline: active?.day === c.day ? '1px solid var(--hub-ink)' : undefined }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--hub-muted)]">
        <span aria-hidden="true" className="min-h-4">
          {active ? (
            <>
              <span className="font-semibold text-[var(--hub-ink)]">
                {active.v} {unit}
              </span>{' '}
              · {fmt(active.day)}
            </>
          ) : (
            `${total} ${unit} · ${activeDays} active days`
          )}
        </span>
        <span className="flex items-center gap-1" aria-hidden="true">
          Less
          {STEPS.map((c) => (
            <span key={c} className="w-[11px] h-[11px] rounded-[3px]" style={{ background: c }} />
          ))}
          More
        </span>
      </div>
    </div>
  );
};
