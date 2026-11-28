import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles, Target, AlertTriangle, TrendingUp, ArrowRight, Timer, BookOpen, Compass, ChevronDown } from 'lucide-react';
import { db } from '../db';
import type { NavigationTab, Task } from '../types';
import { getTodayISO } from '../lib/utils';
import { addDays, computeHabitStats, parseDateKey } from '../lib/habits';
import { handOffFocusTask } from '../lib/focusHandoff';
import {
  COMPONENT_META,
  forecastGoal,
  formatDay,
  momentumScore,
  nextActions,
  scoreHistory,
  weeklyNarrative,
  weeklySignals,
  type GoalForecast,
  type NextAction,
} from '../lib/momentum';
import { DOMAINS, domainBalance, domainById, domainOf, goalDomain, habitDomain } from '../lib/lifeDomains';
import { lifeInsights, projectSystem, snapshotAt, weekLabel } from '../lib/lifeInsights';
import { bestFocusWindow, describeRunningFocus, FOCUS_RUN_KEY, formatClock, formatHour, type RunningFocusInfo } from '../lib/focus';
import { TourCard, type TourStep } from '../components/momentum/Tour';
import { markTourSeen, tourSeen } from '../lib/tour';
import { openUniverseStation } from '../lib/universeConfig';
import { TaskService } from '../services/sync/taskService';
import { CompassPanel, InsightCards, MemoryList, MemoryPanel, ProjectList, ProjectPanel, TimeMachineBar, type CompassHabit } from '../components/momentum/CommandDeck';
import type { SceneGoal, SceneHabit, SceneMemory, SceneProject } from '../components/momentum/LifeConstellation';
import { BalanceRadar, GoalArcs, HabitRings, LifeScoreGauge, ScoreSparkline, type ArcGoal, type RingHabit } from '../components/momentum/Hud';
import { ChartCard } from '../components/charts/ChartCard';
import { ColumnChart, type ColumnDatum } from '../components/charts/ColumnChart';
import { formatMinutes } from '../lib/dailyCompass';

// Three.js is only downloaded when this page opens.
const LifeConstellation = lazy(() => import('../components/momentum/LifeConstellation').then((m) => ({ default: m.LifeConstellation })));

interface MomentumPageProps {
  onNavigate: (tab: NavigationTab) => void;
}

const PACE: Record<GoalForecast['pace'], { label: string; tone: string }> = {
  ahead: { label: 'Ahead', tone: 'var(--hub-accent)' },
  'on-track': { label: 'On track', tone: 'var(--hub-accent)' },
  'at-risk': { label: 'Behind pace', tone: 'var(--hub-amber)' },
  'no-plan': { label: 'No milestones yet', tone: 'var(--hub-muted)' },
  'no-deadline': { label: 'No deadline', tone: 'var(--hub-muted)' },
};

const JOURNAL_KINDS = ['reflection', 'lesson', 'decision'];

export const MomentumPage: React.FC<MomentumPageProps> = ({ onNavigate }) => {
  const today = getTodayISO();
  // Read once per visit: suggestions depend on the time of day.
  const [hour] = useState(() => new Date().getHours());
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedMemory, setSelectedMemory] = useState<string | null>(null);
  // Weekly Time Machine: 0 = now, 1 = last week, ...
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [pulse, setPulse] = useState<{ habitId: string; key: number } | null>(null);
  const [tourIndex, setTourIndex] = useState<number | null>(null);
  const [showTourOffer, setShowTourOffer] = useState(() => !tourSeen());
  // A deep-work session running on the Deep Work page puts the scene into its focus field.
  const [running, setRunning] = useState<RunningFocusInfo | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        setRunning(describeRunningFocus(localStorage.getItem(FOCUS_RUN_KEY), Date.now()));
      } catch {
        setRunning(null);
      }
    };
    read();
    const id = window.setInterval(read, 1000);
    window.addEventListener('storage', read);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', read);
    };
  }, []);

  const raw = useLiveQuery(async () => {
    const [habits, logs, goals, milestones, sessions, tasks, notes, plans, projects] = await Promise.all([
      db.habits.toArray(),
      db.habit_logs.toArray(),
      db.goals.toArray(),
      db.goal_milestones.toArray(),
      db.focus_sessions.toArray(),
      db.tasks.toArray(),
      db.notes.toArray(),
      db.daily_plans.toArray(),
      db.projects.toArray(),
    ]);
    return { habits, logs, goals, milestones, sessions, tasks, notes, plans, projects };
  }, []);

  const d = useMemo(() => {
    if (!raw) return null;
    const realToday = today;
    // Time machine: everything below is computed as of the end of the chosen week.
    const viewDay = addDays(realToday, -7 * weeksAgo);
    const data = weeksAgo ? snapshotAt(raw, viewDay) : raw;
    const input = { today: viewDay, ...data };
    const score = momentumScore(input);
    const prev = momentumScore({ ...input, today: addDays(viewDay, -7) });
    const history = scoreHistory(input, 8);
    const goalsById = new Map(data.goals.map((g) => [g.id, g]));
    const forecasts = data.goals
      .filter((g) => g.status !== 'achieved')
      .map((g) => forecastGoal(g, data.milestones, viewDay))
      .sort((a, b) => (a.goal.target_date || '9999').localeCompare(b.goal.target_date || '9999'));
    const todayPlan = data.plans.find((p) => p.id === viewDay) ?? null;
    const actions = nextActions({ ...input, hour, todayPlan });
    const signals = weeklySignals(input, forecasts);
    const narrative = weeklyNarrative(input);

    // Goals → planets & arcs
    const soon = addDays(viewDay, 60);
    const sceneGoals: SceneGoal[] = forecasts.map((f) => {
      const dom = domainById(goalDomain(f.goal));
      return {
        id: f.goal.id,
        title: f.goal.title,
        color: dom.color,
        progress: f.progress,
        importance: Math.min(1, f.total * 0.08 + (f.goal.target_date && f.goal.target_date <= soon ? 0.3 : 0) + 0.1),
        atRisk: f.pace === 'at-risk',
        paused: f.goal.status === 'paused',
      };
    });
    const arcGoals: ArcGoal[] = forecasts.map((f) => {
      const dom = domainById(goalDomain(f.goal));
      return { id: f.goal.id, title: f.goal.title, progress: f.progress, done: f.done, total: f.total, color: dom.color, domainLabel: dom.label, paceLabel: PACE[f.pace].label };
    });

    // Habits → satellites & rings
    const from14 = addDays(viewDay, -13);
    const activeHabits = data.habits.filter((h) => !h.archived);
    const habitInfo = activeHabits.map((h) => {
      const dates = data.logs.filter((l) => l.habit_id === h.id).map((l) => l.date);
      const s = computeHabitStats(dates, viewDay, h.weekly_target);
      const recent = dates.filter((x) => x >= from14 && x <= viewDay).length;
      const consistency = Math.min(1, recent / ((h.weekly_target * 14) / 7));
      const dom = domainById(habitDomain(h, goalsById));
      return { h, s, consistency, dom };
    });
    const sceneHabits: SceneHabit[] = habitInfo.map(({ h, s, consistency, dom }) => ({
      id: h.id,
      title: h.title,
      goalId: h.goal_id,
      color: dom.color,
      consistency,
      streak: s.current,
      streakRing: s.unit === 'day' ? s.current >= 7 : s.current >= 3,
    }));
    const ringHabits: RingHabit[] = habitInfo
      .map(({ h, s, consistency, dom }) => ({ id: h.id, title: h.title, consistency, streak: s.current, unit: s.unit, color: dom.color, domainLabel: dom.label }))
      .sort((a, b) => b.consistency - a.consistency);

    // Deep work → streams (goal-linked) and ring (unlinked)
    const from7 = addDays(viewDay, -6);
    const week = data.sessions.filter((s) => s.date >= from7 && s.date <= viewDay);
    const byGoal = new Map<string, number>();
    let unlinked = 0;
    for (const s of week) {
      if (s.goal_id && goalsById.has(s.goal_id)) byGoal.set(s.goal_id, (byGoal.get(s.goal_id) ?? 0) + s.actual_minutes);
      else unlinked += s.actual_minutes;
    }
    const streams = [...byGoal.entries()].map(([goalId, minutes]) => ({ goalId, minutes }));
    const focus7 = week.reduce((a, s) => a + s.actual_minutes, 0);
    const timeline: ColumnDatum[] = Array.from({ length: 14 }, (_, i) => {
      const day = addDays(viewDay, i - 13);
      const dt = parseDateKey(day);
      return {
        key: day,
        label: dt.toLocaleDateString('en-US', { weekday: 'narrow' }),
        longLabel: dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
        value: data.sessions.filter((s) => s.date === day).reduce((a, s) => a + s.actual_minutes, 0),
        current: day === viewDay,
      };
    });

    // Journal → memory nodes
    const memories: SceneMemory[] = data.notes
      .filter((n) => JOURNAL_KINDS.includes(n.kind ?? ''))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((n) => ({ id: n.id, date: n.created_at.slice(0, 10), tags: n.tags ?? [] }));

    const balance = domainBalance(
      forecasts.map((f) => ({ goal: f.goal, progress: f.progress, total: f.total })),
      habitInfo.map(({ h, consistency }) => ({ habit: h, consistency })),
      goalsById
    );

    // Projects as outer orbital systems (created by the viewed week).
    const projSystems = raw.projects
      .filter((p) => p.status !== 'completed' && p.created_at.slice(0, 10) <= viewDay)
      .slice(0, 8)
      .map((p) => ({ ...projectSystem(p, data.tasks), color: domainById(domainOf(`${p.title} ${(p.tags ?? []).join(' ')}`, p.area)).color }));
    const sceneProjects: SceneProject[] = projSystems.map((p) => ({ id: p.id, title: p.title, color: p.color, progress: p.progress, openTasks: p.openTasks, doneTasks: p.doneTasks, milestones: p.milestones }));
    const insights = lifeInsights(data, viewDay, forecasts, habitInfo.map((x) => ({ title: x.h.title, consistency: x.consistency })));
    const notesById = new Map(data.notes.map((n) => [n.id, n]));

    // Today's compass always shows the real today (it's where you act), whatever week is viewed.
    const planToday = raw.plans.find((p) => p.id === realToday) ?? null;
    const rawTasksById = new Map(raw.tasks.map((t) => [t.id, t]));
    const rawGoalsById = new Map(raw.goals.map((g) => [g.id, g]));
    const compassTop = (planToday?.items ?? []).slice(0, 3).map((i) => rawTasksById.get(i.task_id)).filter((t): t is Task => Boolean(t));
    const compassHabits: CompassHabit[] = raw.habits
      .filter((h) => !h.archived)
      .map((h) => ({ id: h.id, title: h.title, doneToday: raw.logs.some((l) => l.habit_id === h.id && l.date === realToday), color: domainById(habitDomain(h, rawGoalsById)).color }));
    const nextFocus = compassTop.find((t) => !t.done) ?? null;
    const win = bestFocusWindow(raw.sessions);
    const focusHint = win ? `Your best focus window so far is ${formatHour(win.startHour)}–${formatHour(win.endHour)}.` : null;

    return {
      score, prev, history, forecasts, actions, signals, narrative, sceneGoals, arcGoals, sceneHabits, ringHabits, streams, unlinked, focus7, timeline, memories, balance,
      projSystems, sceneProjects, insights, notesById,
      recentNotes: data.notes.filter((n) => JOURNAL_KINDS.includes(n.kind ?? '')).sort((x, y) => y.created_at.localeCompare(x.created_at)), compassTop, hasPlan: Boolean(planToday), compassHabits, nextFocus, focusHint,
      label: weekLabel(weeksAgo, viewDay),
    };
  }, [raw, today, hour, weeksAgo]);

  const runAction = (a: NextAction) => {
    if (a.taskId) handOffFocusTask(a.taskId);
    onNavigate(a.tab);
  };
  // One selection at a time: choosing a goal, project or memory clears the others.
  const toggleGoal = (id: string) => {
    setSelectedProject(null);
    setSelectedMemory(null);
    setSelectedGoal((cur) => (cur === id ? null : id));
  };
  const selectProject = (id: string) => {
    setSelectedGoal(null);
    setSelectedMemory(null);
    setSelectedProject((cur) => (cur === id ? null : id));
  };
  const selectMemory = (id: string) => {
    setSelectedGoal(null);
    setSelectedProject(null);
    setSelectedMemory((cur) => (cur === id ? null : id));
  };
  // Same log ids as Goals & Habits (`habitId:date`), so check-ins show up in both places.
  const toggleHabitToday = async (h: CompassHabit) => {
    const id = `${h.id}:${today}`;
    if (h.doneToday) {
      await db.habit_logs.delete(id);
    } else {
      await db.habit_logs.put({ id, habit_id: h.id, date: today, created_at: new Date().toISOString() });
      setPulse({ habitId: h.id, key: Date.now() });
    }
  };

  if (!d) {
    return (
      <div className="hub-os dark -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 lg:-mt-8 px-4 sm:px-6 lg:px-8 pt-6 pb-12 min-h-[80vh]" aria-busy="true">
        <div className="max-w-7xl mx-auto space-y-4">
          <div className="h-8 w-56 rounded-lg hub-skeleton" />
          <div className="h-[520px] rounded-3xl hub-skeleton" />
        </div>
      </div>
    );
  }

  const delta = d.score.score !== null && d.prev.score !== null ? d.score.score - d.prev.score : null;
  const [primary, ...alternatives] = d.actions;
  const actionPanel =
    weeksAgo === 0 ? (
      <NextActionPanel primary={primary} alternatives={alternatives} onRun={runAction} />
    ) : (
      <section className="os-glass p-4 space-y-2" aria-label="Viewing a past week">
        <h2 className="text-[11px] uppercase tracking-[0.18em] text-[var(--hub-accent)]">Time machine</h2>
        <p className="text-base font-semibold text-[var(--hub-ink)]">{d.label}</p>
        <p className="text-xs text-[var(--hub-muted)]">The scene and panels show this week as it was. Recommendations come back when you return to now.</p>
        <button type="button" onClick={() => setWeeksAgo(0)} className="text-sm font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer">
          Back to now
        </button>
      </section>
    );
  const selectedNote = selectedMemory ? d.notesById.get(selectedMemory) : undefined;
  const relatedGoals = selectedNote
    ? d.forecasts
        .map((f) => f.goal)
        .filter((g) => {
          const hay = `${g.title} ${g.why ?? ''}`.toLowerCase();
          const noteDomain = domainOf(`${selectedNote.title} ${(selectedNote.tags ?? []).join(' ')}`, selectedNote.area);
          // Match word stems so #testing finds "bench test" and #blades finds "blade".
          const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '');
          return (selectedNote.tags ?? []).some((t) => stem(t).length >= 3 && hay.includes(stem(t))) || (noteDomain !== 'career' && goalDomain(g) === noteDomain);
        })
        .map((g) => g.title)
        .slice(0, 4)
    : [];
  const selectedProjectSys = selectedProject ? d.projSystems.find((p) => p.id === selectedProject) : undefined;
  // ---------------- Onboarding tour ----------------
  const firstGoal = d.forecasts[0];
  const habitGoalId = d.sceneHabits.find((h) => h.goalId && d.sceneGoals.some((g) => g.id === h.goalId))?.goalId;
  const tourSteps: TourStep[] = [
    { id: 'welcome', title: 'Welcome to Yashwanth OS', body: 'Your goals, habits, deep work and reflections as one living system. This short tour shows how to read it. Press Escape any time to leave.', stop: { kind: 'home' } },
    { id: 'core', title: 'Your Life Score', body: `The glowing core is your Life Score${d.score.score !== null ? ` (${d.score.score})` : ''}. It blends habit consistency, deep work, goal milestones, tasks on time and reflection, and grows as they do.`, stop: { kind: 'core' } },
    ...(firstGoal
      ? [{ id: 'goal', title: 'Goals are planets', body: `Each planet is a goal, coloured by life area. Its ring fills with progress, and an amber glow means behind pace. This is “${firstGoal.goal.title}”: ${PACE[firstGoal.pace].label.toLowerCase()}, ${Math.round(firstGoal.progress * 100)}% done.`, stop: { kind: 'goal' as const, id: firstGoal.goal.id } }]
      : []),
    { id: 'habits', title: 'Habits orbit their goals', body: 'Satellites are habits. Consistent ones leave bright trails, long streaks draw a visible ring, and missed ones dim and drift. Checking one off sends out a pulse of light.', stop: habitGoalId ? { kind: 'goal', id: habitGoalId } : { kind: 'core' } },
    { id: 'focus', title: 'Deep work flows as light', body: 'Focus sessions linked to a goal stream light from the core to its planet; the rest feed the ring around the core. While a session runs, the scene settles into a calm focus field.', stop: { kind: 'home' } },
    ...(d.memories.length
      ? [{ id: 'journal', title: 'Your journal, connected', body: 'The outer nodes are journal entries, linked when they share a theme. Click one, or pick it from Memory nodes, to read it next to related goals.', stop: { kind: 'memories' as const } }]
      : []),
    ...(d.sceneProjects.length
      ? [{ id: 'projects', title: 'Projects orbit outside', body: `Diamonds are projects: tasks circle as satellites and milestones sit on a ring, bright when done. This is “${d.sceneProjects[0].title}”.`, stop: { kind: 'project' as const, id: d.sceneProjects[0].id } }]
      : []),
    { id: 'deck', title: 'Your command deck', body: 'Today’s compass, insights and the Next Best Action turn all of this into one clear next step. You can tick off tasks and habits right here.', stop: { kind: 'home' }, scrollTo: 'compass-title' },
    { id: 'time', title: 'Travel through time', body: 'Slide back through the last 12 weeks to see your whole system as it was, handy for a weekly review.', stop: { kind: 'home' }, scrollTo: 'tm-title' },
  ];
  const goToStep = (i: number) => {
    setTourIndex(i);
    const st = tourSteps[i];
    const target = st?.scrollTo ? document.getElementById(st.scrollTo) : document.getElementById('constellation-title')?.parentElement;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  };
  const startTour = () => {
    markTourSeen();
    setShowTourOffer(false);
    setSelectedGoal(null);
    setSelectedProject(null);
    setSelectedMemory(null);
    goToStep(0);
  };
  const tourStop = tourIndex !== null ? (tourSteps[tourIndex]?.stop ?? null) : null;

  const domainsInUse = DOMAINS.filter((dom) => d.arcGoals.some((g) => g.color === dom.color) || d.ringHabits.some((h) => h.color === dom.color));

  return (
    <div className="hub-os dark -mx-4 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-6 lg:-mt-8 px-4 sm:px-6 lg:px-8 pt-6 pb-14">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--hub-accent)]">Momentum</p>
            <h1 className="text-3xl font-semibold font-heading tracking-tight text-[var(--hub-ink)] flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-[var(--hub-accent)]" aria-hidden="true" />
              Yashwanth OS
            </h1>
            <p className="text-sm text-[var(--hub-muted)]">Plan → act → reflect → learn. Your goals, habits, deep work and reflections as one living system.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid="momentum-open-universe-btn"
              onClick={() => openUniverseStation('overview', onNavigate)}
              className="os-chip px-3.5 py-2 text-sm font-medium cursor-pointer inline-flex items-center gap-2 text-[#E8D5B0] border-[#C6A46B]/35 hover:border-[#C6A46B]"
            >
              <Compass className="w-4 h-4 text-[#C6A46B]" aria-hidden="true" />
              3D Studio
            </button>
            <button type="button" onClick={startTour} className="os-chip px-3.5 py-2 text-sm font-medium cursor-pointer inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--hub-accent)]" aria-hidden="true" />
              Take the tour
            </button>
          </div>
        </header>

        {showTourOffer && tourIndex === null && (
          <section className="os-glass px-4 py-3 flex flex-wrap items-center gap-3" aria-label="Tour offer">
            <p className="text-sm text-[var(--hub-ink)] flex-1 min-w-[12rem]">New here? Take a short guided tour of how to read your constellation.</p>
            <button type="button" onClick={startTour} className="px-3.5 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer">
              Start the tour
            </button>
            <button
              type="button"
              onClick={() => {
                markTourSeen();
                setShowTourOffer(false);
              }}
              className="text-sm font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
            >
              Not now
            </button>
          </section>
        )}

        <TimeMachineBar weeksAgo={weeksAgo} maxWeeks={12} label={d.label} score={d.score.score} onChange={setWeeksAgo} />

        {/* ---------------- Hero: the constellation with HUD overlays ---------------- */}
        <section aria-labelledby="constellation-title" className="relative">
          <h2 id="constellation-title" className="sr-only">
            Life Constellation
          </h2>
          <div className="relative rounded-3xl overflow-hidden border border-[rgba(140,180,255,0.12)] h-[380px] sm:h-[460px] lg:h-[540px] xl:h-[660px] bg-[#04060d]">
            <Suspense fallback={<div className="absolute inset-0 hub-skeleton" aria-hidden="true" />}>
              <LifeConstellation
                score={d.score.score}
                goals={d.sceneGoals}
                habits={d.sceneHabits}
                streams={d.streams}
                unlinkedFocusMinutes={d.unlinked}
                memories={d.memories}
                projects={d.sceneProjects}
                selectedGoalId={selectedGoal}
                selectedProjectId={selectedProject}
                selectedMemoryId={selectedMemory}
                onSelectGoal={toggleGoal}
                onSelectProject={selectProject}
                onSelectMemory={selectMemory}
                pulse={pulse}
                focusField={running ? { goalId: running.goalId } : null}
                tourStop={tourStop}
                onHover={setHovered}
              />
            </Suspense>

            {running && (
              <div className="absolute top-3 xl:top-4 left-1/2 -translate-x-1/2 z-10">
                <button
                  type="button"
                  onClick={() => onNavigate('focus')}
                  className="os-chip px-3 py-1.5 text-xs text-[var(--hub-ink)] cursor-pointer inline-flex items-center gap-2 whitespace-nowrap"
                  aria-label={`Deep work in progress: ${running.label}. ${running.paused ? 'Paused' : `${Math.ceil(running.remainingMs / 60000)} minutes left`}. Return to the session`}
                >
                  <span className="w-2 h-2 rounded-full bg-[var(--hub-accent)] hub-breathe" aria-hidden="true" />
                  <span aria-hidden="true">
                    Focus field · {running.paused ? 'paused' : `${formatClock(running.remainingMs)} left`} · Back to session
                  </span>
                </button>
              </div>
            )}

            {/* Wide-screen overlays (below 1280px these panels sit under the scene) */}
            <div className="hidden xl:block absolute top-4 left-4 w-72 os-glass p-4 space-y-3">
              <LifeScoreGauge score={d.score.score} band={d.score.band} delta={delta} />
              <ScoreBreakdown components={d.score.components} />
            </div>
            <div className="hidden xl:block absolute top-4 right-4 w-80">
              {actionPanel}
            </div>
            <div className="absolute left-3 bottom-3 right-28 flex flex-wrap items-center gap-x-3 gap-y-1 pointer-events-none" aria-hidden="true">
              <span className="os-chip px-2.5 py-1 text-[11px] text-[var(--hub-ink)]">
                {hovered ? <strong className="font-semibold">{hovered}</strong> : 'Drag to orbit · click a planet, project or memory'}
              </span>
              {domainsInUse.map((dom) => (
                <span key={dom.id} className="os-chip px-2 py-1 text-[11px] text-[var(--hub-ink)] hidden sm:flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: dom.color }} />
                  {dom.label}
                </span>
              ))}
            </div>
          </div>
          {/* Phones: the life-area legend sits under the scene instead of over it */}
          <div className="sm:hidden mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
            {domainsInUse.map((dom) => (
              <span key={dom.id} className="os-chip px-2 py-1 text-[11px] text-[var(--hub-ink)] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: dom.color }} />
                {dom.label}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--hub-muted)]">
            Core = Life Score · planets = goals (colour = life area, ring = progress, amber glow = behind pace) · satellites = habits (trails when consistent, drifting when missed) ·
            streams = deep work on a goal · diamonds = projects (tasks as satellites, milestones as waypoints) · outer nodes = journal entries linked by shared tags. Click anything to focus it.
          </p>
        </section>

        {/* Below 1280px: the overlay panels, stacked under the scene */}
        <div className="grid sm:grid-cols-2 gap-4 xl:hidden">
          <div className="os-glass p-4 space-y-3">
            <LifeScoreGauge score={d.score.score} band={d.score.band} delta={delta} />
            <ScoreBreakdown components={d.score.components} />
          </div>
          {actionPanel}
        </div>

        {selectedNote && (
          <MemoryPanel note={selectedNote} relatedGoals={relatedGoals} onClose={() => setSelectedMemory(null)} onOpenVault={() => onNavigate('knowledge-memory')} />
        )}
        {selectedProjectSys && <ProjectPanel project={selectedProjectSys} onClose={() => setSelectedProject(null)} onOpenProjects={() => onNavigate('projects')} />}

        <CompassPanel
          top={d.compassTop}
          hasPlan={d.hasPlan}
          habits={d.compassHabits}
          nextFocus={d.nextFocus}
          focusHint={d.focusHint}
          readOnly={weeksAgo > 0}
          onToggleTask={(t) => void TaskService.toggleDone(t)}
          onToggleHabit={(h) => void toggleHabitToday(h)}
          onStartFocus={(t) => {
            if (t) handOffFocusTask(t.id);
            onNavigate('focus');
          }}
          onPlanDay={() => onNavigate('my-day')}
        />

        <InsightCards insights={d.insights} />

        {/* ---------------- HUD deck ---------------- */}
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="os-glass p-5">
            <ScoreSparkline history={d.history} />
          </div>
          <div className="os-glass p-5">
            <ChartCard
              bare
              title="Deep work, last 14 days"
              subtitle={`${formatMinutes(d.focus7)} in the last 7 days${d.streams.length ? ` · ${d.streams.length} goal stream${d.streams.length === 1 ? '' : 's'}` : ''}`}
              tableColumns={['Day', 'Focus minutes']}
              tableRows={d.timeline.map((t) => ({ label: t.longLabel ?? t.label, cells: [String(t.value)] }))}
              empty={d.timeline.every((t) => t.value === 0) ? 'No focus sessions in the last 14 days.' : undefined}
            >
              <ColumnChart data={d.timeline} label="Focus minutes per day, last 14 days" format={(v) => formatMinutes(v)} height={110} />
            </ChartCard>
          </div>
          <div className="os-glass p-5 md:col-span-2 xl:col-span-1">
            <BalanceRadar balance={d.balance} />
          </div>
          <div className="os-glass p-5 xl:col-span-2">
            <HabitRings habits={d.ringHabits} />
          </div>
          <div className="os-glass p-5">
            <GoalArcs goals={d.arcGoals} selectedId={selectedGoal} onSelect={toggleGoal} hovered={hovered} />
          </div>
          <div className="os-glass p-5 md:col-span-2">
            <ProjectList projects={d.projSystems} selectedId={selectedProject} onSelect={selectProject} />
          </div>
          <div className="os-glass p-5 md:col-span-2 xl:col-span-1">
            <MemoryList notes={d.recentNotes} selectedId={selectedMemory} onSelect={selectMemory} />
          </div>
        </div>

        {/* ---------------- Signals ---------------- */}
        <div className="grid md:grid-cols-3 gap-4">
          {(
            [
              ['What matters today', Compass, d.signals.matters, 'Nothing due today.'],
              ['What’s slipping', AlertTriangle, d.signals.slipping, 'Nothing slipping. Nice.'],
              ['What’s compounding', TrendingUp, d.signals.compounding, 'Streaks and rising focus show up here.'],
            ] as const
          ).map(([title, Icon, items, emptyText]) => (
            <section key={title} className="os-glass p-4 space-y-2" aria-label={title}>
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

        {/* ---------------- Goal pace & forecast ---------------- */}
        <section className="os-glass p-5 sm:p-6 space-y-4" aria-labelledby="forecast-title">
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
          {d.forecasts.length === 0 ? (
            <p className="text-sm text-[var(--hub-muted)]">No active goals yet. Add one in Goals &amp; Habits to see its pace and forecast here.</p>
          ) : (
            <ul className="space-y-4">
              {d.forecasts.map((f) => {
                const p = PACE[f.pace];
                const isSel = selectedGoal === f.goal.id;
                return (
                  <li key={f.goal.id} className={`rounded-xl p-3 -mx-3 transition-colors ${isSel ? 'bg-[var(--hub-accent)]/10' : ''}`} aria-current={isSel ? 'true' : undefined}>
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
        </section>

        {/* ---------------- Weekly narrative ---------------- */}
        <section className="os-glass p-5 sm:p-6 space-y-2" aria-labelledby="narrative-title">
          <h2 id="narrative-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
            Your week in brief
          </h2>
          {d.narrative.map((line) => (
            <p key={line} className="text-sm text-[var(--hub-ink)]">
              {line}
            </p>
          ))}
        </section>
      </div>
      {tourIndex !== null && <TourCard steps={tourSteps} index={tourIndex} onIndex={goToStep} onClose={() => setTourIndex(null)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------

const ScoreBreakdown: React.FC<{ components: ReturnType<typeof momentumScore>['components'] }> = ({ components }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
      >
        What makes up the score
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="mt-2 space-y-2" aria-label="What makes up the score">
          {components.map((c) => (
            <li key={c.key} title={COMPONENT_META[c.key].hint}>
              <div className="flex justify-between gap-2 text-xs">
                <span className="text-[var(--hub-ink)]">
                  {c.label} <span className="text-[var(--hub-muted)]">· {COMPONENT_META[c.key].weight}%</span>
                </span>
                <span className="tabular-nums font-semibold text-[var(--hub-ink)]">{c.value ?? '—'}</span>
              </div>
              <div
                className="mt-1 h-1.5 rounded-full bg-[rgba(125,211,252,0.14)] overflow-hidden"
                role="progressbar"
                aria-label={`${c.label}: ${c.value === null ? 'no data yet' : `${c.value} out of 100`}. ${c.detail}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={c.value ?? 0}
              >
                <div className="h-full rounded-full bg-[var(--hub-accent)]" style={{ width: `${c.value ?? 0}%` }} />
              </div>
              <p className="text-[11px] text-[var(--hub-muted)] mt-0.5">{c.detail}</p>
            </li>
          ))}
          <li className="text-[11px] text-[var(--hub-muted)]">Areas with no data yet are left out rather than counted as zero.</li>
        </ul>
      )}
    </div>
  );
};

const NextActionPanel: React.FC<{ primary?: NextAction; alternatives: NextAction[]; onRun: (a: NextAction) => void }> = ({ primary, alternatives, onRun }) => (
  <section className="os-glass p-4 space-y-3" aria-labelledby="next-title">
    <h2 id="next-title" className="text-[11px] uppercase tracking-[0.18em] text-[var(--hub-accent)]">
      Next best action
    </h2>
    {primary ? (
      <>
        <p className="text-base font-semibold text-[var(--hub-ink)] break-words leading-snug">{primary.title}</p>
        <p className="text-xs text-[var(--hub-muted)]">{primary.reason}</p>
        <button
          type="button"
          onClick={() => onRun(primary)}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
        >
          {primary.tab === 'focus' ? <Timer className="w-4 h-4" aria-hidden="true" /> : <ArrowRight className="w-4 h-4" aria-hidden="true" />}
          {primary.tab === 'focus' ? 'Start a focus block' : 'Go'}
        </button>
        {alternatives.length > 0 && (
          <div className="pt-2 border-t border-[var(--hub-line)]">
            <p className="text-[11px] font-semibold text-[var(--hub-muted)] mb-1">Or instead</p>
            <ul className="space-y-0.5">
              {alternatives.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onRun(a)}
                    className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
                  >
                    <ArrowRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--hub-muted)]" aria-hidden="true" />
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
);
