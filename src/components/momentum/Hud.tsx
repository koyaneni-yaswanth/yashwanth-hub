import React, { useId, useState } from 'react';
import { ChartCard } from '../charts/ChartCard';
import type { DomainBalance } from '../../lib/lifeDomains';

/* Shared: an SVG arc path for a gauge (angles in degrees, 0 = 12 o'clock, clockwise). */
function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const s = { x: cx + r * Math.cos(rad(start)), y: cy + r * Math.sin(rad(start)) };
  const e = { x: cx + r * Math.cos(rad(end)), y: cy + r * Math.sin(rad(end)) };
  const large = end - start > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Life Score gauge (a meter: the track is a lighter step of the same hue)
// ---------------------------------------------------------------------------

export const LifeScoreGauge: React.FC<{ score: number | null; band: string; delta: number | null }> = ({ score, band, delta }) => {
  const START = -135;
  const SWEEP = 270;
  const v = score ?? 0;
  // Unique per instance: a gradient defined inside a hidden copy can't be referenced.
  const gradId = `gauge-grad-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <div
      role="meter"
      aria-label={`Life Score ${score ?? 'not enough data yet'}${score !== null ? ' out of 100' : ''}, ${band}${delta !== null ? `, ${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta)} versus last week` : ''}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className="relative w-44 h-44 mx-auto"
    >
      <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#c4b5fd" />
          </linearGradient>
        </defs>
        <path d={arcPath(100, 100, 82, START, START + SWEEP)} fill="none" stroke="rgba(125,211,252,0.14)" strokeWidth="12" strokeLinecap="round" />
        {v > 0 && (
          <path
            d={arcPath(100, 100, 82, START, START + (SWEEP * v) / 100)}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="12"
            strokeLinecap="round"
            className="os-gauge-value"
          />
        )}
        {[0, 25, 50, 75, 100].map((t) => {
          const a = ((START + (SWEEP * t) / 100 - 90) * Math.PI) / 180;
          return <line key={t} x1={100 + 66 * Math.cos(a)} y1={100 + 66 * Math.sin(a)} x2={100 + 70 * Math.cos(a)} y2={100 + 70 * Math.sin(a)} stroke="rgba(154,171,200,0.5)" strokeWidth="1.5" />;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center" aria-hidden="true">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--hub-muted)]">Life Score</p>
          <p className="text-5xl font-semibold leading-none text-[var(--hub-ink)] mt-1">{score ?? '—'}</p>
          <p className="text-xs font-medium text-[var(--hub-ink)] mt-1.5">{band}</p>
          {delta !== null && (
            <p className="text-[11px] text-[var(--hub-muted)]">{delta === 0 ? 'Same as last week' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs last week`}</p>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Momentum sparkline (past weeks recede, this week in the accent)
// ---------------------------------------------------------------------------

export const ScoreSparkline: React.FC<{ history: { end: string; score: number | null }[] }> = ({ history }) => {
  const [active, setActive] = useState<number | null>(null);
  const W = 260;
  const H = 64;
  const pad = 8;
  const pts = history.map((h, i) => ({
    x: pad + (i * (W - pad * 2)) / Math.max(1, history.length - 1),
    y: h.score === null ? null : H - pad - ((h.score / 100) * (H - pad * 2)),
    ...h,
  }));
  const valid = pts.filter((p) => p.y !== null) as (typeof pts[number] & { y: number })[];
  const path = valid.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const last = valid[valid.length - 1];
  const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <ChartCard
      bare
      title="Weekly momentum"
      subtitle={valid.length >= 2 ? `Life Score at the end of each of the last ${history.length} weeks` : 'Builds up as weeks pass'}
      tableColumns={['Week ending', 'Life Score']}
      tableRows={history.map((h) => ({ label: fmt(h.end), cells: [h.score === null ? '—' : String(h.score)] }))}
      empty={valid.length === 0 ? 'No activity yet — your weekly trend appears here.' : undefined}
    >
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16 overflow-visible" role="img" aria-label={`Life Score by week: ${history.map((h) => `${fmt(h.end)} ${h.score ?? 'no data'}`).join(', ')}`}>
          <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} stroke="var(--viz-axis)" strokeWidth="1" />
          <path d={path} fill="none" stroke="var(--viz-deemph)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {valid.length >= 2 && (
            <path
              d={`M ${valid[valid.length - 2].x} ${valid[valid.length - 2].y} L ${last.x} ${last.y}`}
              fill="none"
              stroke="var(--hub-accent)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
          {last && <circle cx={last.x} cy={last.y} r="4.5" fill="var(--hub-accent)" stroke="var(--hub-surface)" strokeWidth="2" />}
          {pts.map((p, i) => (
            <rect
              key={p.end}
              x={p.x - (W - pad * 2) / history.length / 2}
              y={0}
              width={(W - pad * 2) / history.length}
              height={H}
              fill="transparent"
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
            />
          ))}
          {active !== null && pts[active].y !== null && <line x1={pts[active].x} x2={pts[active].x} y1={0} y2={H - pad} stroke="var(--hub-muted)" strokeWidth="1" />}
        </svg>
        <p className="mt-1 text-xs text-[var(--hub-muted)] min-h-4" aria-hidden="true">
          {active !== null ? (
            <>
              <span className="font-semibold text-[var(--hub-ink)]">{pts[active].score ?? '—'}</span> · week ending {fmt(pts[active].end)}
            </>
          ) : last ? (
            <>
              <span className="font-semibold text-[var(--hub-ink)]">{last.score}</span> this week
            </>
          ) : null}
        </p>
      </div>
    </ChartCard>
  );
};

// ---------------------------------------------------------------------------
// Habit consistency rings
// ---------------------------------------------------------------------------

export interface RingHabit {
  id: string;
  title: string;
  consistency: number;
  streak: number;
  unit: string;
  color: string;
  domainLabel: string;
}

const Ring: React.FC<{ value: number }> = ({ value }) => {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90" aria-hidden="true">
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgba(125,211,252,0.14)" strokeWidth="5" />
      <circle cx="28" cy="28" r={r} fill="none" stroke="var(--hub-accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} className="os-ring-value" />
    </svg>
  );
};

export const HabitRings: React.FC<{ habits: RingHabit[] }> = ({ habits }) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-base font-bold text-[var(--hub-ink)]">Habit consistency</h3>
      <p className="text-xs text-[var(--hub-muted)]">Check-ins vs. target, last 14 days</p>
    </div>
    {habits.length === 0 ? (
      <p className="text-sm text-[var(--hub-muted)] py-4">No habits yet. Add one in Goals &amp; Habits.</p>
    ) : (
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-3">
        {habits.slice(0, 6).map((h) => {
          const pct = Math.round(h.consistency * 100);
          return (
            <li key={h.id} className="flex items-center gap-2.5 min-w-0" aria-label={`${h.title}: ${pct}% consistent${h.streak ? `, ${h.streak}-${h.unit} streak` : ''}. ${h.domainLabel}.`}>
              <div className="relative shrink-0" aria-hidden="true">
                <Ring value={h.consistency} />
                <span className="absolute inset-0 grid place-items-center text-xs font-semibold text-[var(--hub-ink)] tabular-nums">{pct}%</span>
              </div>
              <div className="min-w-0" aria-hidden="true">
                <p className="text-sm text-[var(--hub-ink)] truncate">{h.title}</p>
                <p className="text-[11px] text-[var(--hub-muted)] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: h.color }} />
                  {h.streak ? `${h.streak}-${h.unit} streak` : 'No streak yet'}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Goal progress arcs (also the readable twin of the constellation's planets)
// ---------------------------------------------------------------------------

export interface ArcGoal {
  id: string;
  title: string;
  progress: number;
  done: number;
  total: number;
  color: string;
  domainLabel: string;
  paceLabel: string;
}

const MiniArc: React.FC<{ value: number; color: string }> = ({ value, color }) => (
  <svg viewBox="0 0 48 48" className="w-11 h-11" aria-hidden="true">
    <path d={arcPath(24, 24, 18, -135, 135)} fill="none" stroke="rgba(154,171,200,0.18)" strokeWidth="4" strokeLinecap="round" />
    {value > 0 && <path d={arcPath(24, 24, 18, -135, -135 + 270 * Math.min(1, value))} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />}
  </svg>
);

export const GoalArcs: React.FC<{ goals: ArcGoal[]; selectedId: string | null; onSelect: (id: string) => void; hovered?: string | null }> = ({ goals, selectedId, onSelect, hovered }) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-base font-bold text-[var(--hub-ink)]">Goals in the constellation</h3>
      <p className="text-xs text-[var(--hub-muted)]">Choose one to highlight its planet</p>
    </div>
    {goals.length === 0 ? (
      <p className="text-sm text-[var(--hub-muted)] py-4">No goals yet. Add one in Goals &amp; Habits and it appears as a planet.</p>
    ) : (
      <ul className="space-y-1.5" aria-label="Goals in the constellation">
        {goals.map((g) => {
          const on = selectedId === g.id;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onSelect(g.id)}
                aria-pressed={on}
                className={`w-full flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left cursor-pointer transition-colors ${
                  on ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10' : hovered === g.title ? 'border-[var(--hub-line)] bg-[var(--hub-surface-hover)]' : 'border-transparent hover:bg-[var(--hub-surface-hover)]'
                }`}
              >
                <span className="relative shrink-0">
                  <MiniArc value={g.progress} color={g.color} />
                  <span className="absolute inset-0 grid place-items-center text-[10px] font-semibold text-[var(--hub-ink)] tabular-nums">{Math.round(g.progress * 100)}%</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--hub-ink)] truncate">{g.title}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-[var(--hub-muted)]">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: g.color }} aria-hidden="true" />
                    {g.domainLabel} · {g.paceLabel} · {g.done}/{g.total}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Life balance radar (one series in the accent; empty domains marked hollow)
// ---------------------------------------------------------------------------

export const BalanceRadar: React.FC<{ balance: DomainBalance[] }> = ({ balance }) => {
  // Wider than tall: side labels ("Relationships") need horizontal room.
  const VW = 400;
  const VH = 300;
  const cx = VW / 2;
  const c = VH / 2;
  const R = 88;
  const n = balance.length;
  const angle = (i: number) => (-90 + (360 / n) * i) * (Math.PI / 180);
  const pt = (i: number, v: number) => ({ x: cx + R * v * Math.cos(angle(i)), y: c + R * v * Math.sin(angle(i)) });
  const values = balance.map((b) => (b.score ?? 0) / 100);
  const poly = values.map((v, i) => pt(i, v)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const hasAny = balance.some((b) => b.score !== null);

  return (
    <ChartCard
      bare
      title="Life balance"
      subtitle="Goal progress and habit consistency by area of life"
      tableColumns={['Area', 'Balance', 'Goals', 'Habits']}
      tableRows={balance.map((b) => ({ label: b.domain.label, cells: [b.score === null ? 'No data' : String(b.score), String(b.goals), String(b.habits)] }))}
      empty={hasAny ? undefined : 'Add goals or habits and your balance across life areas appears here.'}
    >
      <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full max-w-[400px] mx-auto" role="img" aria-label={`Life balance: ${balance.map((b) => `${b.domain.label} ${b.score ?? 'no data'}`).join(', ')}`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={balance.map((_, i) => pt(i, f)).map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="var(--viz-grid)"
            strokeWidth="1"
          />
        ))}
        {balance.map((_, i) => {
          const p = pt(i, 1);
          return <line key={i} x1={cx} y1={c} x2={p.x} y2={p.y} stroke="var(--viz-grid)" strokeWidth="1" />;
        })}
        <polygon points={poly} fill="var(--hub-accent)" fillOpacity="0.12" stroke="var(--hub-accent)" strokeWidth="2" strokeLinejoin="round" />
        {balance.map((b, i) => {
          const p = pt(i, values[i]);
          return b.score === null ? (
            <circle key={b.domain.id} cx={cx} cy={c} r="0" />
          ) : (
            <circle key={b.domain.id} cx={p.x} cy={p.y} r="4" fill="var(--hub-accent)" stroke="var(--hub-surface)" strokeWidth="2" />
          );
        })}
        {balance.map((b, i) => {
          const p = pt(i, 1.3);
          const dx = p.x - cx;
          const dy = p.y - c;
          const anchor = Math.abs(dx) < 8 ? 'middle' : dx > 0 ? 'start' : 'end';
          // Stack the label and value away from the chart: upward at the top, downward at the bottom.
          const labelY = Math.abs(dy) < 10 ? p.y - 6 : dy < 0 ? p.y - 12 : p.y;
          const dot = pt(i, 1.12);
          return (
            <g key={b.domain.id}>
              <circle cx={dot.x} cy={dot.y} r="3" fill={b.domain.color} />
              <text x={p.x} y={labelY} textAnchor={anchor} dominantBaseline="middle" fontSize="12" fill="var(--hub-ink)">
                {b.domain.label.replace(' & focus', '')}
              </text>
              <text x={p.x} y={labelY + 14} textAnchor={anchor} dominantBaseline="middle" fontSize="11" fill="var(--hub-muted)">
                {b.score === null ? 'no data' : b.score}
              </text>
            </g>
          );
        })}
      </svg>
    </ChartCard>
  );
};
