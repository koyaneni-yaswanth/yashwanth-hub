import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Timer, Pause, Play, Square, Zap, BellOff, Lightbulb, Plus, CheckCircle2, Coffee, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../db';
import type { FocusDistraction, FocusPresetId, FocusSession, Goal, Task } from '../types';
import { generateId, getTodayISO } from '../lib/utils';
import { TaskService } from '../services/sync/taskService';
import { takeFocusTask } from '../lib/focusHandoff';
import { FocusField } from '../components/focus/FocusField';
import {
  FOCUS_PRESETS,
  FOCUS_RUN_KEY,
  bestFocusWindow,
  clampMinutes,
  elapsedMs,
  formatClock,
  formatHour,
  pause,
  remainingMs,
  resume,
  weekdayLabel,
  weeklyFocus,
  type RunningTimer,
} from '../lib/focus';
import { formatMinutes } from '../lib/dailyCompass';
import { addDays, parseDateKey, toDateKey } from '../lib/habits';
import { ChartCard } from '../components/charts/ChartCard';
import { ColumnChart, type ColumnDatum } from '../components/charts/ColumnChart';

/** Survives reloads and tab switches, so a running session is never lost. */
const RUN_KEY = FOCUS_RUN_KEY;

// Stable fallbacks so memoised values don't recompute while queries load.
const NO_TASKS: Task[] = [];
const NO_GOALS: Goal[] = [];
const NO_SESSIONS: FocusSession[] = [];

interface ActiveSession {
  id: string;
  preset: FocusPresetId;
  planned_minutes: number;
  break_minutes: number;
  task_id?: string;
  goal_id?: string;
  label: string;
  started_at: string;
  timer: RunningTimer;
  interruptions: number;
  distractions: FocusDistraction[];
}

type Phase = 'setup' | 'running' | 'reflect' | 'break';

/** Circumference of the progress ring (r = 54 in a 120 viewBox). */
const RING_CIRCUMFERENCE = 2 * Math.PI * 54;

function loadActive(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}

function saveActive(s: ActiveSession | null) {
  try {
    if (s) localStorage.setItem(RUN_KEY, JSON.stringify(s));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage blocked: the session still runs for this page view */
  }
}

const card = 'rounded-2xl p-5 sm:p-6 bg-[var(--hub-surface)] border border-[var(--hub-line)] shadow-xs';
const input =
  'w-full px-3 py-2.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-sm text-[var(--hub-ink)] placeholder:text-[var(--hub-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)]';
const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-sm font-medium text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] transition-colors cursor-pointer';

export const FocusPage: React.FC = () => {
  const today = getTodayISO();
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NO_TASKS;
  const goals = useLiveQuery(() => db.goals.toArray(), []) ?? NO_GOALS;
  const sessions = useLiveQuery(() => db.focus_sessions.orderBy('started_at').reverse().toArray(), []) ?? NO_SESSIONS;

  const openTasks = useMemo(() => tasks.filter((t) => !t.done).sort((a, b) => a.text.localeCompare(b.text)), [tasks]);
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals]);

  // --- setup state ---
  const [preset, setPreset] = useState<FocusPresetId>('25-5');
  const [customFocus, setCustomFocus] = useState(45);
  const [customRest, setCustomRest] = useState(10);
  const [target, setTarget] = useState<string>(''); // 'task:<id>' | 'goal:<id>' | ''
  const [freeLabel, setFreeLabel] = useState('');

  // --- running state ---
  const [active, setActive] = useState<ActiveSession | null>(() => loadActive());
  const [phase, setPhase] = useState<Phase>(() => (loadActive() ? 'running' : 'setup'));
  const [now, setNow] = useState(() => Date.now());
  const [distractionText, setDistractionText] = useState('');
  const [announce, setAnnounce] = useState('');

  // --- reflection state ---
  const [finished, setFinished] = useState<FocusSession | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [markTaskDone, setMarkTaskDone] = useState(false);

  // --- break state ---
  const [breakEndsAt, setBreakEndsAt] = useState<number | null>(null);

  const distractionRef = useRef<HTMLInputElement>(null);

  // Preselect a task handed over from Home or the Daily Compass.
  useEffect(() => {
    const handed = takeFocusTask();
    if (handed) setTarget(`task:${handed}`);
  }, []);

  useEffect(() => saveActive(active), [active]);

  // One clock for the whole page; recomputed from timestamps so sleep/lock can't drift it.
  useEffect(() => {
    if (phase !== 'running' && phase !== 'break') return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [phase]);

  const remaining = active ? remainingMs(active.timer, now) : 0;
  const isPaused = Boolean(active?.timer.pausedAt);

  // Announce sparingly (not every second) for screen readers.
  const lastAnnounced = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== 'running' || !active) return;
    const mins = Math.ceil(remaining / 60000);
    if ((mins === 5 || mins === 1) && lastAnnounced.current !== mins) {
      lastAnnounced.current = mins;
      setAnnounce(`${mins} minute${mins === 1 ? '' : 's'} left in this focus session.`);
    }
    if (remaining <= 0) void finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, phase]);

  const breakRemaining = breakEndsAt ? Math.max(0, breakEndsAt - now) : 0;
  useEffect(() => {
    if (phase === 'break' && breakEndsAt && breakRemaining <= 0) {
      setAnnounce('Break is over. Ready for the next session when you are.');
      setBreakEndsAt(null);
      setPhase('setup');
    }
  }, [phase, breakEndsAt, breakRemaining]);

  const chosenPreset = FOCUS_PRESETS.find((p) => p.id === preset);
  const focusMinutes = chosenPreset ? chosenPreset.focus : clampMinutes(customFocus);
  const restMinutes = chosenPreset ? chosenPreset.rest : clampMinutes(customRest, 1, 60);

  const labelFor = (t: string): { label: string; task_id?: string; goal_id?: string } => {
    if (t.startsWith('task:')) {
      const task = tasks.find((x) => x.id === t.slice(5));
      if (task) return { label: task.text, task_id: task.id };
    }
    if (t.startsWith('goal:')) {
      const goal = goals.find((x) => x.id === t.slice(5));
      if (goal) return { label: goal.title, goal_id: goal.id };
    }
    return { label: freeLabel.trim() || 'Focus session' };
  };

  const start = () => {
    const link = labelFor(target);
    const startedAt = Date.now();
    const s: ActiveSession = {
      id: generateId(),
      preset,
      planned_minutes: focusMinutes,
      break_minutes: restMinutes,
      ...link,
      started_at: new Date(startedAt).toISOString(),
      timer: { startedAt, plannedMs: focusMinutes * 60000, pausedMs: 0 },
      interruptions: 0,
      distractions: [],
    };
    lastAnnounced.current = null;
    setActive(s);
    setNow(startedAt);
    setPhase('running');
    setAnnounce(`Focus session started: ${focusMinutes} minutes on ${link.label}.`);
  };

  // Functional updates: quick successive clicks must each apply to the latest state.
  const togglePause = () => {
    if (!active) return;
    const t = Date.now();
    setActive((prev) => prev && { ...prev, timer: prev.timer.pausedAt ? resume(prev.timer, t) : pause(prev.timer, t) });
    setAnnounce(isPaused ? 'Resumed.' : 'Paused. The clock is stopped.');
  };

  const addInterruption = () => {
    if (!active) return;
    setActive((prev) => prev && { ...prev, interruptions: prev.interruptions + 1 });
    setAnnounce(`Interruption noted (${active.interruptions + 1}). Back to it when you can.`);
  };

  const parkDistraction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !distractionText.trim()) return;
    const d: FocusDistraction = { id: generateId(), text: distractionText.trim(), at: new Date().toISOString() };
    setActive((prev) => prev && { ...prev, distractions: [...prev.distractions, d] });
    setDistractionText('');
    setAnnounce('Thought parked. It will be here after the session.');
    distractionRef.current?.focus();
  };

  // The clock effect can fire again before state settles; save each session once.
  const finishingRef = useRef(false);

  async function finish(completedFully: boolean) {
    if (!active || finishingRef.current) return;
    finishingRef.current = true;
    const endedAt = Date.now();
    const minutes = Math.round(elapsedMs(active.timer, endedAt) / 60000);
    const session: FocusSession = {
      id: active.id,
      // The day it started, so a session crossing midnight counts for its start day.
      date: toDateKey(new Date(active.started_at)),
      preset: active.preset,
      planned_minutes: active.planned_minutes,
      break_minutes: active.break_minutes,
      task_id: active.task_id,
      goal_id: active.goal_id,
      label: active.label,
      started_at: active.started_at,
      ended_at: new Date(endedAt).toISOString(),
      actual_minutes: completedFully ? active.planned_minutes : minutes,
      completed: completedFully,
      interruptions: active.interruptions,
      distractions: active.distractions,
    };
    try {
      await db.focus_sessions.put(session);
    } finally {
      finishingRef.current = false;
    }
    setActive(null);
    setFinished(session);
    setRating(null);
    setNote('');
    setMarkTaskDone(false);
    setPhase('reflect');
    setAnnounce(
      completedFully
        ? `Session complete: ${session.actual_minutes} minutes of focus.`
        : `Session ended early after ${session.actual_minutes} minutes. Every focused minute counts.`
    );
  }

  const linkedTask: Task | undefined = finished?.task_id ? tasks.find((t) => t.id === finished.task_id) : undefined;

  const saveReflection = async (takeBreak: boolean) => {
    if (!finished) return;
    await db.focus_sessions.update(finished.id, {
      focus_rating: rating ?? undefined,
      reflection: note.trim() || undefined,
    });
    if (markTaskDone && linkedTask && !linkedTask.done) await TaskService.toggleDone(linkedTask);
    if (takeBreak) {
      setBreakEndsAt(Date.now() + finished.break_minutes * 60000);
      setNow(Date.now());
      setPhase('break');
      setAnnounce(`Break started: ${finished.break_minutes} minutes.`);
    } else {
      setPhase('setup');
    }
    setFinished(null);
  };

  const distractionToTask = async (sessionId: string, d: FocusDistraction) => {
    const { task } = await TaskService.create({
      text: d.text,
      area: 'Personal',
      priority: 'medium',
      starred: false,
      done: false,
    });
    const s = await db.focus_sessions.get(sessionId);
    if (s) {
      await db.focus_sessions.update(sessionId, {
        distractions: s.distractions.map((x) => (x.id === d.id ? { ...x, task_id: task.id } : x)),
      });
    }
    if (finished?.id === sessionId) {
      setFinished({ ...finished, distractions: finished.distractions.map((x) => (x.id === d.id ? { ...x, task_id: task.id } : x)) });
    }
    setAnnounce(`Added to Tasks: ${d.text}`);
  };

  // --- insights ---
  // 0 = this week, -1 = last week, ...
  const [weekOffset, setWeekOffset] = useState(0);
  const weekAnchor = addDays(today, weekOffset * 7);
  const week = useMemo(() => weeklyFocus(sessions, weekAnchor), [sessions, weekAnchor]);
  const prevWeek = useMemo(() => weeklyFocus(sessions, addDays(weekAnchor, -7)), [sessions, weekAnchor]);
  const window3h = useMemo(() => bestFocusWindow(sessions), [sessions]);
  const focusDelta = week.totalMinutes - prevWeek.totalMinutes;
  const weekTitle =
    weekOffset === 0
      ? 'This week'
      : weekOffset === -1
        ? 'Last week'
        : `Week of ${parseDateKey(week.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  const dayData: ColumnDatum[] = week.days.map((d) => ({
    key: d.date,
    label: weekdayLabel(d.date),
    longLabel: parseDateKey(d.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    value: d.minutes,
    current: d.date === today,
  }));
  const recent = sessions.slice(0, 8);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="sr-only" role="status" aria-live="polite">
        {announce}
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold font-heading text-[var(--hub-ink)] flex items-center gap-2">
          <Timer className="w-6 h-6 text-[var(--hub-accent)]" aria-hidden="true" />
          Deep Work
        </h1>
        <p className="text-sm text-[var(--hub-muted)]">
          One thing at a time. Park stray thoughts, note interruptions, and see how your focus adds up.
        </p>
      </header>

      {/* ---------------- Setup ---------------- */}
      {phase === 'setup' && (
        <section className={`${card} space-y-5`} aria-labelledby="focus-setup-title">
          <h2 id="focus-setup-title" className="text-base font-bold text-[var(--hub-ink)]">
            Start a session
          </h2>

          <fieldset>
            <legend className="text-sm font-semibold text-[var(--hub-ink)] mb-2">Session length</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[...FOCUS_PRESETS, { id: 'custom' as const, label: 'Custom', hint: 'Choose your own' }].map((p) => (
                <label
                  key={p.id}
                  className={`cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--hub-accent)] ${
                    preset === p.id
                      ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10 text-[var(--hub-ink)]'
                      : 'border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="focus-preset"
                    value={p.id}
                    checked={preset === p.id}
                    onChange={() => setPreset(p.id)}
                    className="sr-only"
                  />
                  <span className="block font-semibold font-mono">{p.label}</span>
                  <span className="block text-xs text-[var(--hub-muted)]">{p.hint}</span>
                </label>
              ))}
            </div>
            {preset === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <label className="text-sm text-[var(--hub-ink)]">
                  Focus minutes
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={customFocus}
                    onChange={(e) => setCustomFocus(Number(e.target.value))}
                    className={`${input} mt-1`}
                  />
                </label>
                <label className="text-sm text-[var(--hub-ink)]">
                  Break minutes
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={customRest}
                    onChange={(e) => setCustomRest(Number(e.target.value))}
                    className={`${input} mt-1`}
                  />
                </label>
              </div>
            )}
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm font-semibold text-[var(--hub-ink)]">
              Working on
              <select value={target} onChange={(e) => setTarget(e.target.value)} className={`${input} mt-1 font-normal`}>
                <option value="">Something else (type below)</option>
                {openTasks.length > 0 && (
                  <optgroup label="Tasks">
                    {openTasks.map((t) => (
                      <option key={t.id} value={`task:${t.id}`}>
                        {t.text}
                      </option>
                    ))}
                  </optgroup>
                )}
                {activeGoals.length > 0 && (
                  <optgroup label="Goals">
                    {activeGoals.map((g) => (
                      <option key={g.id} value={`goal:${g.id}`}>
                        {g.title}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            {target === '' && (
              <label className="text-sm font-semibold text-[var(--hub-ink)]">
                What will you focus on?
                <input
                  value={freeLabel}
                  onChange={(e) => setFreeLabel(e.target.value)}
                  placeholder="e.g. Draft the blade test report"
                  className={`${input} mt-1 font-normal`}
                />
              </label>
            )}
          </div>

          <button type="button" onClick={start} className={primaryBtn}>
            <Play className="w-4 h-4" aria-hidden="true" />
            Start {focusMinutes}-minute focus
          </button>
        </section>
      )}

      {/* ---------------- Running ---------------- */}
      {phase === 'running' && active && (
        <section className={`${card} space-y-5`} aria-labelledby="focus-running-title">
          <div className="text-center space-y-2">
            <h2 id="focus-running-title" className="text-sm font-semibold text-[var(--hub-muted)]">
              Focusing on
            </h2>
            <p className="text-lg font-bold text-[var(--hub-ink)] break-words">{active.label}</p>
            <div className="relative mx-auto my-6 sm:my-8 w-64 h-64 sm:w-72 sm:h-72 grid place-items-center">
              {/* Focus field: particles gather around the ring as the session progresses. */}
              <FocusField progress={1 - remaining / Math.max(1, active.timer.plannedMs)} paused={isPaused} />
              {/* Decorative: soft halo that breathes while the clock runs. */}
              {!isPaused && (
                <div
                  className="hub-breathe absolute inset-6 rounded-full"
                  style={{ background: 'radial-gradient(circle, var(--hub-glow) 0%, transparent 70%)' }}
                  aria-hidden="true"
                />
              )}
              <svg
                viewBox="0 0 120 120"
                className={`hub-focus-ring absolute inset-0 w-full h-full${isPaused ? ' is-paused' : ''}`}
                aria-hidden="true"
              >
                <circle className="hub-ring-track" cx="60" cy="60" r="54" fill="none" strokeWidth="5" />
                <circle
                  className="hub-ring-value"
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  strokeWidth="5"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (remaining / Math.max(1, active.timer.plannedMs))}
                />
              </svg>
              <p
                className="relative font-mono font-bold text-5xl sm:text-6xl tabular-nums text-[var(--hub-ink)]"
                role="timer"
                aria-label={`${formatClock(remaining)} remaining`}
              >
                {formatClock(remaining)}
              </p>
            </div>
            <p className="text-xs text-[var(--hub-muted)]">
              {isPaused ? 'Paused' : `${active.planned_minutes} min session`} · {active.interruptions} interruption
              {active.interruptions === 1 ? '' : 's'}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={togglePause} className={ghostBtn}>
              {isPaused ? <Play className="w-4 h-4" aria-hidden="true" /> : <Pause className="w-4 h-4" aria-hidden="true" />}
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" onClick={addInterruption} className={ghostBtn}>
              <BellOff className="w-4 h-4" aria-hidden="true" />I got interrupted
            </button>
            <button type="button" onClick={() => void finish(false)} className={ghostBtn}>
              <Square className="w-4 h-4" aria-hidden="true" />
              End session
            </button>
          </div>

          <form onSubmit={parkDistraction} className="space-y-2">
            <label htmlFor="park-thought" className="text-sm font-semibold text-[var(--hub-ink)] flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-[var(--hub-amber)]" aria-hidden="true" />
              Park a stray thought
            </label>
            <div className="flex gap-2">
              <input
                id="park-thought"
                ref={distractionRef}
                value={distractionText}
                onChange={(e) => setDistractionText(e.target.value)}
                placeholder="Write it down and get back to work"
                className={input}
              />
              <button type="submit" className={`${ghostBtn} shrink-0`} disabled={!distractionText.trim()}>
                Park
              </button>
            </div>
            {active.distractions.length > 0 && (
              <ul className="text-sm text-[var(--hub-muted)] list-disc pl-5 space-y-0.5" aria-label="Parked thoughts">
                {active.distractions.map((d) => (
                  <li key={d.id} className="break-words">
                    {d.text}
                  </li>
                ))}
              </ul>
            )}
          </form>
        </section>
      )}

      {/* ---------------- Reflection ---------------- */}
      {phase === 'reflect' && finished && (
        <section className={`${card} space-y-4 hub-rise`} aria-labelledby="focus-reflect-title">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-[var(--hub-accent)] shrink-0" aria-hidden="true" />
            <div>
              <h2 id="focus-reflect-title" className="text-base font-bold text-[var(--hub-ink)]">
                {finished.completed ? 'Session complete' : 'Session ended'} — {formatMinutes(finished.actual_minutes)} of focus
              </h2>
              <p className="text-sm text-[var(--hub-muted)]">{finished.label}</p>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold text-[var(--hub-ink)] mb-2">How focused were you?</legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className={`cursor-pointer min-w-11 text-center rounded-xl border px-3 py-2 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--hub-accent)] ${
                    rating === n
                      ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10 font-semibold text-[var(--hub-ink)]'
                      : 'border-[var(--hub-line)] text-[var(--hub-ink)]'
                  }`}
                >
                  <input type="radio" name="focus-rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
                  <span aria-hidden="true">{n}</span>
                  <span className="sr-only">{['Scattered', 'Distracted', 'Okay', 'Focused', 'Deep focus'][n - 1]}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-[var(--hub-muted)] mt-1">1 = scattered, 5 = deep focus</p>
          </fieldset>

          <label className="block text-sm font-semibold text-[var(--hub-ink)]">
            Anything to remember? <span className="font-normal text-[var(--hub-muted)]">(optional)</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What helped, what got in the way, where to pick up"
              className={`${input} mt-1 font-normal`}
            />
          </label>

          {linkedTask && !linkedTask.done && (
            <label className="flex items-center gap-2 text-sm text-[var(--hub-ink)] cursor-pointer">
              <input type="checkbox" checked={markTaskDone} onChange={(e) => setMarkTaskDone(e.target.checked)} className="w-4 h-4" />
              Mark “{linkedTask.text}” done
            </label>
          )}

          {finished.distractions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--hub-ink)]">Thoughts you parked</h3>
              <ul className="space-y-1.5">
                {finished.distractions.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm rounded-xl border border-[var(--hub-line)] px-3 py-2">
                    <span className="break-words min-w-0 text-[var(--hub-ink)]">{d.text}</span>
                    {d.task_id ? (
                      <span className="text-xs text-[var(--hub-muted)] shrink-0">Added to Tasks</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void distractionToTask(finished.id, d)}
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
                        aria-label={`Make a task: ${d.text}`}
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        Make task
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void saveReflection(true)} className={primaryBtn}>
              <Coffee className="w-4 h-4" aria-hidden="true" />
              Save and take a {finished.break_minutes}-minute break
            </button>
            <button type="button" onClick={() => void saveReflection(false)} className={ghostBtn}>
              Save, skip the break
            </button>
          </div>
        </section>
      )}

      {/* ---------------- Break ---------------- */}
      {phase === 'break' && (
        <section className={`${card} text-center space-y-3 hub-rise`} aria-labelledby="focus-break-title">
          <h2 id="focus-break-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center justify-center gap-2">
            <Coffee className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
            Break time
          </h2>
          <p className="font-mono font-bold text-5xl tabular-nums text-[var(--hub-ink)]" role="timer" aria-label={`${formatClock(breakRemaining)} of break left`}>
            {formatClock(breakRemaining)}
          </p>
          <p className="text-sm text-[var(--hub-muted)]">Stand up, stretch, drink water. Screens can wait.</p>
          <button
            type="button"
            onClick={() => {
              setBreakEndsAt(null);
              setPhase('setup');
            }}
            className={ghostBtn}
          >
            End break early
          </button>
        </section>
      )}

      {/* ---------------- Insights ---------------- */}
      <section className={`${card} space-y-4`} aria-labelledby="focus-week-title">
        <h2 id="focus-week-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
          <span className="flex-1">{weekTitle}</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
              aria-label="Show previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
              disabled={weekOffset === 0}
              className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Show next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </span>
        </h2>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ['Focus time', formatMinutes(week.totalMinutes)],
            ['Sessions', `${week.sessions}`],
            ['Finished in full', week.sessions ? `${Math.round((week.completedSessions / week.sessions) * 100)}%` : '—'],
            ['Avg. focus rating', week.averageRating ? `${week.averageRating.toFixed(1)} / 5` : '—'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] p-3">
              <dt className="text-xs text-[var(--hub-muted)]">{k}</dt>
              <dd className="text-lg font-semibold text-[var(--hub-ink)]">{v}</dd>
              {k === 'Focus time' && (week.totalMinutes > 0 || prevWeek.totalMinutes > 0) && (
                <dd className="text-xs text-[var(--hub-muted)] mt-0.5">
                  {focusDelta === 0
                    ? 'Same as the week before'
                    : `${focusDelta > 0 ? '▲' : '▼'} ${formatMinutes(Math.abs(focusDelta))} vs the week before`}
                </dd>
              )}
            </div>
          ))}
        </dl>

        <ChartCard
          bare
          title="Focus minutes per day"
          subtitle={weekOffset === 0 ? 'Today is highlighted' : undefined}
          tableColumns={['Day', 'Focus minutes']}
          tableRows={dayData.map((d) => ({ label: d.longLabel ?? d.label, cells: [String(d.value)] }))}
          empty={week.totalMinutes === 0 ? 'No focus sessions this week yet.' : undefined}
        >
          <ColumnChart data={dayData} label={`Focus minutes per day, ${weekTitle.toLowerCase()}`} format={(v) => formatMinutes(v)} />
        </ChartCard>

        <p className="text-sm text-[var(--hub-ink)] flex items-start gap-2">
          <Zap className="w-4 h-4 mt-0.5 shrink-0 text-[var(--hub-amber)]" aria-hidden="true" />
          {window3h
            ? `Your best focus window so far is ${formatHour(window3h.startHour)}–${formatHour(window3h.endHour)}. Try protecting it for your hardest task.`
            : `After ${Math.max(0, 5 - sessions.length)} more session${5 - sessions.length === 1 ? '' : 's'}, you'll see your best time of day to focus.`}
          {week.interruptions > 0 && ` ${week.interruptions} interruption${week.interruptions === 1 ? '' : 's'} logged this week.`}
        </p>

        {recent.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-[var(--hub-ink)] mb-2">Recent sessions</h3>
            <ul className="divide-y divide-[var(--hub-line)] border border-[var(--hub-line)] rounded-xl">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-[var(--hub-ink)]">{s.label}</span>
                  <span className="shrink-0 text-xs text-[var(--hub-muted)] font-mono">
                    {new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {s.actual_minutes} min
                    {s.completed ? '' : ' (ended early)'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
};
