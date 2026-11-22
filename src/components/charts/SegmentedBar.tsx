import React, { useEffect, useRef, useState } from 'react';

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** Fill colour (a CSS colour or var()). */
  color: string;
  /** Text colour for a label printed inside the fill: white or near-black by the fill's lightness. */
  ink: string;
}

interface SegmentedBarProps {
  segments: Segment[];
  /** Accessible name for the whole bar. */
  label: string;
  /** Unit for screen readers and the legend, e.g. "tasks". */
  unit: string;
}

/**
 * Tall segmented bar (28px): one whole split into ≤ 6 ordered parts, read at a
 * glance. Each part's count is printed inside only when it fits; parts are
 * separated by a 2px surface gap; a legend below names them in bar order.
 * Every part is focusable and announces its name, count and share.
 */
export const SegmentedBar: React.FC<SegmentedBarProps> = ({ segments, label, unit }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = segments.reduce((s, x) => s + x.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const activeSeg = segments.find((s) => s.key === active);

  return (
    <div className="space-y-3">
      <div ref={ref} role="group" aria-label={`${label}: ${total} ${unit} in total`} className="flex gap-[2px] h-7">
        {visible.map((s) => {
          const share = s.value / total;
          const px = share * width;
          const text = String(s.value);
          const fits = px >= text.length * 7 + 14; // ~7px per digit at 12px + padding
          return (
            <div
              key={s.key}
              tabIndex={0}
              role="img"
              aria-label={`${s.label}: ${s.value} ${unit}, ${Math.round(share * 100)}%`}
              onPointerEnter={() => setActive(s.key)}
              onPointerLeave={() => setActive((a) => (a === s.key ? null : a))}
              onFocus={() => setActive(s.key)}
              onBlur={() => setActive((a) => (a === s.key ? null : a))}
              className="h-full rounded-[4px] flex items-center px-2 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--hub-accent)] focus-visible:ring-offset-[var(--hub-surface)] transition-[flex-grow,filter] duration-500 cursor-default"
              style={{ flexGrow: s.value, flexBasis: 0, background: s.color, filter: active === s.key ? 'brightness(1.1)' : undefined }}
            >
              {fits && (
                <span className="text-xs font-semibold tabular-nums" style={{ color: s.ink }} aria-hidden="true">
                  {text}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--hub-muted)] min-h-4" aria-hidden="true">
        {activeSeg ? (
          <>
            <span className="font-semibold text-[var(--hub-ink)]">
              {activeSeg.value} {unit}
            </span>{' '}
            · {activeSeg.label} · {total > 0 ? Math.round((activeSeg.value / total) * 100) : 0}%
          </>
        ) : (
          'Hover or focus a segment for details'
        )}
      </p>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-hidden="true">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs text-[var(--hub-ink)]">
            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} />
            {s.label}
            <span className="text-[var(--hub-muted)] tabular-nums">{s.value === 0 ? '0' : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
