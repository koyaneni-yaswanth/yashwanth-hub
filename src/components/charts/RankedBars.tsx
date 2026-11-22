import React from 'react';

export interface RankedDatum {
  key: string;
  label: string;
  value: number;
  /** Optional identity swatch (e.g. a workspace's own colour), shown beside the name only. */
  swatch?: string;
}

interface RankedBarsProps {
  data: RankedDatum[];
  format?: (v: number) => string;
  /** Accessible name for the list. */
  label: string;
  /** Keep the given order instead of sorting largest first (for naturally ordered categories). */
  keepOrder?: boolean;
  /** Optional share-of-total text after the value, e.g. "(42%)". */
  showShare?: boolean;
}

/**
 * Ranked horizontal bars: one hue, one baseline, largest first, so parts are
 * compared by length. Name above the bar, value at the bar's tip (text tokens,
 * never the series colour). Bars are ≤ 10px thick with a 4px rounded end.
 */
export const RankedBars: React.FC<RankedBarsProps> = ({ data, format = (v) => v.toLocaleString('en-IN'), label, keepOrder, showShare }) => {
  const rows = keepOrder ? data : [...data].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const max = Math.max(0, ...rows.map((r) => r.value)) || 1;
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <ul aria-label={label} className="space-y-3">
      {rows.map((r) => {
        const pct = (r.value / max) * 100;
        const share = total > 0 ? Math.round((r.value / total) * 100) : 0;
        const valueText = `${format(r.value)}${showShare ? ` (${share}%)` : ''}`;
        return (
          <li key={r.key} aria-label={`${r.label}: ${valueText}`}>
            <div className="flex items-center gap-2 text-sm text-[var(--hub-ink)]" aria-hidden="true">
              {r.swatch && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.swatch }} />}
              <span className="truncate">{r.label}</span>
            </div>
            <div className="mt-1 flex items-center gap-2" aria-hidden="true">
              <div className="flex-1 min-w-0">
                <div
                  className="h-2.5 rounded-r-[4px] transition-[width] duration-500"
                  style={{ width: `${r.value > 0 ? Math.max(1.5, pct) : 0}%`, background: 'var(--viz-series-1)' }}
                />
              </div>
              <span className="shrink-0 w-24 text-right text-xs tabular-nums text-[var(--hub-muted)]">
                <span className="font-semibold text-[var(--hub-ink)]">{format(r.value)}</span>
                {showShare && <span> ({share}%)</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
