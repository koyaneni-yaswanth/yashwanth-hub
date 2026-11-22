import React, { lazy, Suspense, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles, Target, AlertTriangle, TrendingUp, ArrowRight, Timer, BookOpen, Compass } from 'lucide-react';
import { db } from '../db';
import type { NavigationTab } from '../types';
import { getTodayISO } from '../lib/utils';
import { addDays, computeHabitStats } from '../lib/habits';
import { handOffFocusTask } from '../lib/focusHandoff';
import {
  COMPONENT_META,
  forecastGoal,
  formatDay,
  momentumScore,
  nextActions,
  weeklyNarrative,
  weeklySignals,
  type GoalForecast,
  type NextAction,
} from '../lib/momentum';
import type { ConstellationHabit } from '../components/momentum/LifeConstellation';

// Three.js is only downloaded when this page opens.
const LifeConstellation = lazy(() => import('../components/momentum/LifeConstellation').then((m) => ({ default: m.LifeConstellation })));

interface MomentumPageProps {
  onNavigate: (tab: NavigationTab) => void;
}

const card = 'rounded-2xl p-5 sm:p-6 bg-[var(--hub-surface)] border border-[var(--hub-line)] shadow-xs';

const PACE: Record<GoalForecast['pace'], { label: string; tone: string }> = {
  ahead: { label: 'Ahead', tone: 'var(--viz-series-1)' },
  'on-track': { label: 'On track', tone: 'var(--viz-series-1)' },
  'at-risk': { label: 'Behind pace', tone: 'var(--hub-amber)' },
  'no-plan': { label: 'No milestones yet', tone: 'var(--hub-muted)' },
  'no-deadline': { label: 'No deadline', tone: 'var(--hub-muted)' },
};

export const MomentumPage: React.FC<MomentumPageProps> = ({ onNavigate }) => {
  const today = getTodayISO();
  // Read once per visit: suggestions depend on the time of day.
  const [hour] = useState(() => new Date().getHours());

  const data = useLiveQuery(async () => {
    const [habits, logs, goals, milestones, sessions, tasks, notes, plans] = await Promise.all([
      db.habits.toArray(),
      db.habit_logs.toArray(),
      db.goals.toArray(),
      db.goal_milestones.toArray(),
      db.focus_sessions.toArray(),
      db.tasks.toArray(),
      db.notes.toArray(),
      db.daily_plans.toArray(),
    ]);
    return { habits, logs, goals, milestones, sessions, tasks, notes, plans };
  }, []);

  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);

  const derived = useMemo(() => {
    if (!data) return null;
    const input = { today, ...data };
    const score = momentumScore(input);
    const forecasts = data.goals
      .filter((g) => g.status !== 'achieved')
      .map((g) => forecastGoal(g, data.milestones, today))
      .sort((a, b) => (a.goal.target_date || '9999').localeCompare(b.goal.target_date || '9999'));
    const todayPlan = data.plans.find((p) => p.id === today) ?? null;
    const actions = nextActions({ ...input, hour, todayPlan });
    const signals = weeklySignals(input, forecasts);
    const narrative = weeklyNarrative(input);
    const prev = momentumScore({ ...input, today: addDays(today, -7) });
    const from14 = addDays(today, -13);
    const constellationHabits: ConstellationHabit[] = data.habits
      .filter((h) => !h.archived)
      .map((h) => {
        const dates = data.logs.filter((l) => l.habit_id === h.id).map((l) => l.date);
        const s = computeHabitStats(dates, today, h.weekly_target);
        const recent = dates.filter((d) => d >= from14 && d <= today).length;
        return { id: h.id, title: h.title, goalId: h.goal_id, consistency: Math.min(1, recent / ((h.weekly_target * 14) / 7)), streak: s.current };
      });
    const focus7 = data.sessions.filter((s) => s.date >= addDays(today, -6) && s.date <= today).reduce((a, s) => a + s.actual_minutes, 0);
    const memories = data.notes.filter((n) => ['reflection', 'lesson', 'decision'].includes(n.kind ?? '')).length;
    return { score, prev, forecasts, actions, signals, narrative, constellationHabits, focus7, memories };
  }, [data, today, hour]);

  const runAction = (a: NextAction) => {
    if (a.taskId) handOffFocusTask(a.taskId);
    onNavigate(a.tab);
  };

  if (!derived) {
    return (
      <div className="max-w-6xl mx-auto space-y-4" aria-busy="true">
        <div className="h-8 w-48 rounded-lg hub-skeleton" />
        <div className="h-80 rounded-2xl hub-skeleton" />
      </div>
    );
  }

  const { score, prev, forecasts, actions, signals, narrative } = derived;
  const delta = score.score !== null && prev.score !== null ? score.score - prev.score : null;
  const [primary, ...alternatives] = actions;
  const focusGoal = forecasts.find((f) => f.goal.id === selectedGoal);

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold font-heading text-[var(--hub-ink)] flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-[var(--hub-accent)]" aria-hidden="true" />
          Momentum
        </h1>
        <p className="text-sm text-[var(--hub-muted)]">Plan → act → reflect → learn. One score, one next step, and how your goals are really moving.</p>
      </header>

      {/* Score + next best action */}
      <div className="grid lg:grid-cols-[minmax(0,20rem)_1fr] gap-6">
        <section className={`${card} space-y-4`} aria-labelledby="score-title">
          <h2 id="score-title" className="text-sm font-semibold text-[var(--hub-muted)]">
            Momentum score
          </h2>
          <div className="flex items-end gap-3">
            <p className="text-6xl font-semibold leading-none text-[var(--hub-ink)]">{score.score ?? '—'}</p>
            <div className="pb-1">
              <p className="text-sm font-semibold text-[var(--hub-ink)]">{score.band}</p>
              {delta !== null && (
                <p className="text-xs text-[var(--hub-muted)]">
                  {delta === 0 ? 'Same as last week' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs last week`}
                </p>
              )}
            </div>
          </div>
          <ul className="space-y-2.5" aria-label="What makes up the score">
            {score.components.map((c) => (
              <li key={c.key} title={COMPONENT_META[c.key].hint}>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="text-[var(--hub-ink)]">
                    {c.label} <span className="text-[var(--hub-muted)]">· {COMPONENT_META[c.key].weight}%</span>
                  </span>
                  <span className="tabular-nums font-semibold text-[var(--hub-ink)]">{c.value ?? '—'}</span>
                </div>
                <div
                  className="mt-1 h-1.5 rounded-full bg-[var(--viz-grid)] overflow-hidden"
                  role="progressbar"
                  aria-label={`${c.label}: ${c.value === null ? 'no data yet' : `${c.value} out of 100`}. ${c.detail}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={c.value ?? 0}
                >
                  <div className="h-full rounded-full" style={{ width: `${c.value ?? 0}%`, background: 'var(--viz-series-1)' }} />
                </div>
                <p className="text-[11px] text-[var(--hub-muted)] mt-0.5">{c.detail}</p>
              </li>
            ))}
          </ul>
          {score.components.some((c) => c.value === null) && (
            <p className="text-[11px] text-[var(--hub-muted)]">Areas with no data yet are left out rather than counted as zero.</p>
          )}
        </section>

        <div className="space-y-6 min-w-0">
          <section className={`${card} space-y-3`} aria-labelledby="next-title">
            <h2 id="next-title" className="text-sm font-semibold text-[var(--hub-muted)]">
              Next best action
            </h2>
            {primary ? (
              <>
                <p className="text-lg font-semibold text-[var(--hub-ink)] break-words">{primary.title}</p>
                <p className="text-sm text-[var(--hub-muted)]">{primary.reason}</p>
                <button
                  type="button"
                  onClick={() => runAction(primary)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
                >
                  {primary.tab === 'focus' ? <Timer className="w-4 h-4" aria-hidden="true" /> : <ArrowRight className="w-4 h-4" aria-hidden="true" />}
                  {primary.tab === 'focus' ? 'Start a focus block' : 'Go'}
                </button>
                {alternatives.length > 0 && (
                  <div className="pt-3 border-t border-[var(--hub-line)]">
                    <p className="text-xs font-semibold text-[var(--hub-muted)] mb-1.5">Or instead</p>
                    <ul className="space-y-1">
                      {alternatives.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => runAction(a)}
                            className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
                          >
                            <ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-[var(--hub-muted)]" aria-hidden="true" />
                            <span className="break-words">{a.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--hub-muted)]">Nothing pressing. Enjoy the space — or plan tomorrow on the Daily Compass.</p>
            )}
          </section>

        </div>
      </div>

      {/* Matters / slipping / compounding */}
      <div className="grid md:grid-cols-3 gap-4">
        {(
          [
            ['What matters today', Compass, signals.matters, 'Nothing due today.'],
            ['What’s slipping', AlertTriangle, signals.slipping, 'Nothing slipping. Nice.'],
            ['What’s compounding', TrendingUp, signals.compounding, 'Streaks and rising focus show up here.'],
          ] as const
        ).map(([title, Icon, items, emptyText]) => (
          <section key={title} className={`${card} !p-4 space-y-2`} aria-label={title}>
            <h2 className="text-sm font-semibold text-[var(--hub-ink)] flex items-center gap-1.5">
              <Icon className="w-4 h-4 text-[var(--hub-accent)]" aria-hidden="true" />
              {title}
            </h2>
            {items.length === 0 ? (
              <p className="text-xs text-[var(--hub-muted)]">{emptyText}</p>
            ) : (
              <ul className="space-y-2">
                {items.slice(0, 4).map((s) => (
                  <li key={s.text} className="text-xs">
                    <p className="text-[var(--hub-ink)] break-words">{s.text}</p>
                    {s.action && <p className="text-[var(--hub-muted)] mt-0.5">{s.action}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {/* Life Constellation */}
      <section className={`${card} space-y-4`} aria-labelledby="constellation-title">
        <div>
          <h2 id="constellation-title" className="text-base font-bold text-[var(--hub-ink)]">
            Life Constellation
          </h2>
          <p className="text-xs text-[var(--hub-muted)]">Your momentum at the centre, goals as planets, habits as moons, deep work as the energy ring.</p>
        </div>
        <Suspense fallback={<div className="h-80 rounded-2xl hub-skeleton" aria-hidden="true" />}>
          <LifeConstellation
            score={score.score}
            forecasts={forecasts}
            habits={derived.constellationHabits}
            focusMinutes={derived.focus7}
            memories={derived.memories}
            onSelectGoal={(id) => setSelectedGoal((cur) => (cur === id ? null : id))}
            selectedGoalId={selectedGoal}
          />
        </Suspense>
      </section>

      {/* Goal forecasts */}
      <section className={`${card} space-y-4`} aria-labelledby="forecast-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="forecast-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
              <Target className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
              Goal pace &amp; forecast
            </h2>
            <p className="text-xs text-[var(--hub-muted)]">Forecasts use your last 4 weeks of milestones and cover only milestones you’ve planned.</p>
          </div>
          <button type="button" onClick={() => onNavigate('goals')} className="shrink-0 text-sm font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer">
            Goals
          </button>
        </div>
        {forecasts.length === 0 ? (
          <p className="text-sm text-[var(--hub-muted)]">No active goals yet. Add one in Goals &amp; Habits to see its pace and forecast here.</p>
        ) : (
          <ul className="space-y-4">
            {forecasts.map((f) => {
              const p = PACE[f.pace];
              const isSel = selectedGoal === f.goal.id;
              return (
                <li
                  key={f.goal.id}
                  className={`rounded-xl p-3 -mx-3 transition-colors ${isSel ? 'bg-[var(--hub-accent)]/10' : ''}`}
                  aria-current={isSel ? 'true' : undefined}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-[var(--hub-ink)] break-words">{f.goal.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--hub-ink)]">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.tone }} aria-hidden="true" />
                      {p.label}
                    </span>
                  </div>
                  <div className="relative mt-2 h-2 rounded-full bg-[var(--viz-grid)]">
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.round(f.progress * 100)}%`, background: p.tone }} />
                    {f.expected !== null && (
                      <div
                        className="absolute -top-1 -bottom-1 w-0.5 rounded bg-[var(--hub-ink)]"
                        style={{ left: `calc(${Math.round(f.expected * 100)}% - 1px)` }}
                        aria-hidden="true"
                        title="Where you'd be on a straight line to the deadline"
                      />
                    )}
                  </div>
                  {f.total > 0 && (
                  <p className="mt-1.5 text-xs text-[var(--hub-muted)]">
                    {f.done} of {f.total} milestones ({Math.round(f.progress * 100)}%)
                    {f.expected !== null && <> · expected by now {Math.round(f.expected * 100)}%</>}
                    {f.goal.target_date && <> · due {formatDay(f.goal.target_date)}</>}
                  </p>
                  )}
                  <p className="text-xs text-[var(--hub-ink)] mt-0.5">
                    {f.total === 0
                      ? 'Plan a first milestone to start the forecast.'
                      : f.done >= f.total
                        ? 'All planned milestones done — plan the next ones.'
                        : f.projectedDate
                          ? `At this pace (${f.weeklyRate.toFixed(1)}/week), planned milestones finish around ${formatDay(f.projectedDate)}.`
                          : 'No milestones finished in the last 4 weeks, so there’s no forecast yet.'}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {focusGoal && <p className="sr-only" aria-live="polite">Selected goal: {focusGoal.goal.title}</p>}
      </section>

      {/* Weekly narrative */}
      <section className={`${card} space-y-2`} aria-labelledby="narrative-title">
        <h2 id="narrative-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
          Your week in brief
        </h2>
        {narrative.map((line) => (
          <p key={line} className="text-sm text-[var(--hub-ink)]">
            {line}
          </p>
        ))}
      </section>
    </div>
  );
};
