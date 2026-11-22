import React, { useState } from 'react';
import { niceTicks, compactNumber } from './scale';

export interface ColumnDatum {
  key: string;
  /** Short axis label, e.g. "Mon" or "12 Nov". */
  label: string;
  /** Full label for the tooltip and screen readers, e.g. "Monday 17 Nov". */
  longLabel?: string;
  value: number;
  /** The current period: drawn in the series colour while the rest recede. */
  current?: boolean;
}

interface ColumnChartProps {
  data: ColumnDatum[];
  /** Formats a value for the tooltip and the tip label, e.g. "45 min". */
  format?: (v: number) => string;
  /** Plot height in px (the axis band is added on top of this). */
  height?: number;
  /** Accessible name for the whole chart. */
  label: string;
}

/**
 * Single-series column chart over time. Emphasis form: the current period is
 * in the series colour and past periods recede, so "now" reads first. Thin
 * columns (≤24px) with 4px rounded tops, square at the baseline; hairline grid.
 * Each column is focusable and shows its value on hover or focus.
 */
export const ColumnChart: React.FC<ColumnChartProps> = ({ data, format = (v) => compactNumber(v), height = 140, label }) => {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max, 3);
  const top = ticks[ticks.length - 1] || 1;
  const hasCurrent = data.some((d) => d.current);
  const peak = data.reduce<ColumnDatum | null>((best, d) => (d.value > 0 && (!best || d.value > best.value) ? d : best), null);

  return (
    <div role="group" aria-label={label} className="select-none">
      {/* pt-5 leaves room for the value label above a full-height column */}
      <div className="flex gap-2 pt-5">
        {/* Y axis ticks */}
        <div className="relative w-8 shrink-0 text-[10px] tabular-nums text-[var(--hub-muted)]" style={{ height }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${(1 - t / top) * 100}%` }}>
              {compactNumber(t)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative flex-1 min-w-0" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute left-0 right-0 h-px"
              style={{ top: `${(1 - t / top) * 100}%`, background: t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)' }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around gap-[2px]">
            {data.map((d) => {
              const h = (d.value / top) * 100;
              const isActive = active === d.key;
              const emphasised = !hasCurrent || d.current;
              const showTip = isActive || d.current || d.key === peak?.key;
              const text = `${d.longLabel ?? d.label}: ${format(d.value)}`;
              return (
                <div
                  key={d.key}
                  tabIndex={0}
                  role="img"
                  aria-label={text}
                  onPointerEnter={() => setActive(d.key)}
                  onPointerLeave={() => setActive((a) => (a === d.key ? null : a))}
                  onFocus={() => setActive(d.key)}
                  onBlur={() => setActive((a) => (a === d.key ? null : a))}
                  className="group relative h-full flex-1 flex flex-col items-center justify-end outline-none cursor-default focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)] rounded-md"
                >
                  {showTip && d.value > 0 && (
                    <span
                      className={`absolute text-[10px] font-semibold tabular-nums whitespace-nowrap ${
                        isActive ? 'text-[var(--hub-ink)]' : 'text-[var(--hub-muted)]'
                      }`}
                      style={{ bottom: `calc(${h}% + 4px)` }}
                      aria-hidden="true"
                    >
                      {format(d.value)}
                    </span>
                  )}
                  <div
                    className="w-full max-w-6 rounded-t-[4px] transition-[height,filter] duration-500"
                    style={{
                      height: `${Math.max(d.value > 0 ? 2 : 0, h)}%`,
                      background: emphasised ? 'var(--viz-series-1)' : 'var(--viz-deemph)',
                      filter: isActive ? 'brightness(1.12)' : undefined,
                    }}
                    aria-hidden="true"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* X axis labels */}
      <div className="flex gap-2 mt-1.5" aria-hidden="true">
        <div className="w-8 shrink-0" />
        <div className="flex-1 flex justify-around gap-[2px]">
          {data.map((d, i) => {
            // Many columns: label every other one, counting back from the latest, so labels never clip.
            const step = data.length > 8 ? 2 : 1;
            const show = (data.length - 1 - i) % step === 0;
            return (
              <span
                key={d.key}
                className={`flex-1 min-w-0 text-center text-[11px] whitespace-nowrap overflow-visible ${
                  d.current ? 'font-semibold text-[var(--hub-ink)]' : 'text-[var(--hub-muted)]'
                }`}
              >
                {show ? d.label : ''}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
