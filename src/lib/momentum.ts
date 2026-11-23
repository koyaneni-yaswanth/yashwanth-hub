/**
 * Momentum: pure maths that turns goals, habits, focus sessions, tasks and
 * journal entries into one score, per-goal forecasts, a next best action and a
 * plain-language weekly summary. No database or React — everything is passed in,
 * so it is testable and works offline.
 *
 * Honesty rules:
 * - A component with no data is left out (weights renormalise), never scored 0.
 * - Forecasts only cover milestones already planned, and say so.
 * - Wording never shames; every "slipping" item comes with a recovery step.
 */
import type { DailyPlan, FocusSession, Goal, GoalMilestone, Habit, HabitLog, Note, Task } from '../types';
import { addDays, computeHabitStats, parseDateKey, weekStart } from './habits.ts';
import { isBlocked } from './taskModel.ts';

export type ComponentKey = 'habits' | 'focus' | 'goals' | 'tasks' | 'reflection';

export const COMPONENT_META: Record<ComponentKey, { label: string; weight: number; hint: string }> = {
  habits: { label: 'Habit consistency', weight: 30, hint: 'Check-ins vs. each habit’s target, last 14 days' },
  focus: { label: 'Deep work', weight: 25, hint: 'Focus minutes in the last 7 days vs. your weekly target' },
  goals: { label: 'Goal milestones', weight: 20, hint: 'Milestones done out of those planned, last 4 weeks' },
  tasks: { label: 'Tasks on time', weight: 15, hint: 'Tasks due in the last 7 days that are done' },
  reflection: { label: 'Reflection', weight: 10, hint: 'Days with a journal entry or wrap-up, last 7 days (target 4)' },
};

export const DEFAULT_FOCUS_TARGET_MIN = 600; // 10 h / week
const REFLECTION_TARGET_DAYS = 4;
const JOURNAL_KINDS = new Set(['reflection', 'lesson', 'decision']);

export interface MomentumInput {
  today: string;
  habits: Habit[];
  logs: HabitLog[];
  goals: Goal[];
  milestones: GoalMilestone[];
  sessions: FocusSession[];
  tasks: Task[];
  notes: Note[];
  plans?: DailyPlan[];
  focusTargetMinutes?: number;
}

export interface MomentumComponent {
  key: ComponentKey;
  label: string;
  /** 0–100, or null when there is nothing to measure yet. */
  value: number | null;
  detail: string;
}

export interface MomentumScore {
  score: number | null;
  band: 'Rebuilding' | 'Building' | 'Strong' | 'Compounding' | 'Getting started';
  components: MomentumComponent[];
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const pct = (n: number) => Math.round(clamp01(n) * 100);
const dayKey = (iso: string) => iso.slice(0, 10);
const inWindow = (key: string, from: string, to: string) => key >= from && key <= to;

export function bandFor(score: number | null): MomentumScore['band'] {
  if (score === null) return 'Getting started';
  if (score >= 85) return 'Compounding';
  if (score >= 70) return 'Strong';
  if (score >= 40) return 'Building';
  return 'Rebuilding';
}

/** The score for the 7 days ending `today` (habits look back 14, goals 4 weeks). */
export function momentumScore(input: MomentumInput): MomentumScore {
  const { today } = input;
  const from7 = addDays(today, -6);
  const from14 = addDays(today, -13);
  const components: MomentumComponent[] = [];

  // Habits: per active habit, check-ins in 14 days vs 2 weeks of its target.
  const active = input.habits.filter((h) => !h.archived && dayKey(h.created_at) <= today);
  if (active.length) {
    const ratios = active.map((h) => {
      const done = input.logs.filter((l) => l.habit_id === h.id && inWindow(l.date, from14, today)).length;
      // A habit younger than 14 days is judged on the days it has existed.
      const ageDays = Math.min(14, Math.max(1, Math.round((parseDateKey(today).getTime() - parseDateKey(dayKey(h.created_at)).getTime()) / 86400000) + 1));
      return clamp01(done / ((h.weekly_target * ageDays) / 7));
    });
    const v = pct(ratios.reduce((a, b) => a + b, 0) / ratios.length);
    components.push({ key: 'habits', label: COMPONENT_META.habits.label, value: v, detail: `${active.length} active habit${active.length === 1 ? '' : 's'}` });
  } else {
    components.push({ key: 'habits', label: COMPONENT_META.habits.label, value: null, detail: 'No habits yet' });
  }

  // Deep work: minutes in 7 days vs weekly target.
  const target = input.focusTargetMinutes ?? DEFAULT_FOCUS_TARGET_MIN;
  const focusMin = input.sessions.filter((s) => inWindow(s.date, from7, today)).reduce((a, s) => a + (s.actual_minutes || 0), 0);
  const anyFocusEver = input.sessions.length > 0;
  components.push({
    key: 'focus',
    label: COMPONENT_META.focus.label,
    value: anyFocusEver ? pct(focusMin / target) : null,
    detail: anyFocusEver ? `${Math.round(focusMin / 6) / 10} h of ${target / 60} h` : 'No focus sessions yet',
  });

  // Goals: milestones planned in the last 4 weeks (through this week) that are done.
  const activeGoalIds = new Set(input.goals.filter((g) => g.status === 'active').map((g) => g.id));
  const wk = weekStart(today);
  const from4w = addDays(wk, -21);
  const planned = input.milestones.filter((m) => activeGoalIds.has(m.goal_id) && inWindow(m.week_start, from4w, wk));
  components.push({
    key: 'goals',
    label: COMPONENT_META.goals.label,
    value: planned.length ? pct(planned.filter((m) => m.done).length / planned.length) : null,
    detail: planned.length ? `${planned.filter((m) => m.done).length} of ${planned.length} planned` : 'No milestones planned',
  });

  // Tasks: due in the last 7 days → share done.
  const due = input.tasks.filter((t) => t.due_date && inWindow(t.due_date, from7, today));
  components.push({
    key: 'tasks',
    label: COMPONENT_META.tasks.label,
    value: due.length ? pct(due.filter((t) => t.done).length / due.length) : null,
    detail: due.length ? `${due.filter((t) => t.done).length} of ${due.length} due` : 'Nothing was due',
  });

  // Reflection: distinct days with a journal entry or a day wrap-up.
  const days = new Set<string>();
  for (const n of input.notes) {
    if (JOURNAL_KINDS.has(n.kind ?? '') && inWindow(dayKey(n.created_at), from7, today)) days.add(dayKey(n.created_at));
  }
  for (const p of input.plans ?? []) if (p.wrap_up && inWindow(p.id, from7, today)) days.add(p.id);
  const anyJournalEver = input.notes.some((n) => JOURNAL_KINDS.has(n.kind ?? '')) || (input.plans ?? []).some((p) => p.wrap_up);
  components.push({
    key: 'reflection',
    label: COMPONENT_META.reflection.label,
    value: anyJournalEver ? pct(days.size / REFLECTION_TARGET_DAYS) : null,
    detail: anyJournalEver ? `${days.size} of ${REFLECTION_TARGET_DAYS} days` : 'No journal entries yet',
  });

  const scored = components.filter((c) => c.value !== null);
  const weight = scored.reduce((a, c) => a + COMPONENT_META[c.key].weight, 0);
  const score = weight ? Math.round(scored.reduce((a, c) => a + (c.value as number) * COMPONENT_META[c.key].weight, 0) / weight) : null;
  return { score, band: bandFor(score), components };
}

// ---------------------------------------------------------------------------
// Goals: velocity and forecast
// ---------------------------------------------------------------------------

export type GoalPace = 'ahead' | 'on-track' | 'at-risk' | 'no-plan' | 'no-deadline';

export interface GoalForecast {
  goal: Goal;
  done: number;
  total: number;
  /** done / total planned milestones, 0–1. */
  progress: number;
  /** Where progress "should" be by today given created → target date, 0–1 (null without a deadline). */
  expected: number | null;
  pace: GoalPace;
  /** Milestones finished per week over the last 4 weeks. */
  weeklyRate: number;
  /** When the planned milestones would all be done at the current rate (null if rate is 0). */
  projectedDate: string | null;
}

export function forecastGoal(goal: Goal, milestones: GoalMilestone[], today: string): GoalForecast {
  const ms = milestones.filter((m) => m.goal_id === goal.id);
  const done = ms.filter((m) => m.done).length;
  const total = ms.length;
  const progress = total ? done / total : 0;

  const fromRate = addDays(today, -27);
  const recentDone = ms.filter((m) => m.done && m.done_at && inWindow(dayKey(m.done_at), fromRate, today)).length;
  const weeklyRate = recentDone / 4;
  const remaining = total - done;
  const projectedDate =
    remaining <= 0 ? today : weeklyRate > 0 ? addDays(today, Math.ceil((remaining / weeklyRate) * 7)) : null;

  let expected: number | null = null;
  let pace: GoalPace;
  if (!total) pace = 'no-plan';
  else if (!goal.target_date) pace = 'no-deadline';
  else {
    const start = parseDateKey(dayKey(goal.created_at)).getTime();
    const end = parseDateKey(goal.target_date).getTime();
    const now = parseDateKey(today).getTime();
    expected = end > start ? clamp01((now - start) / (end - start)) : 1;
    const gap = progress - expected;
    pace = gap >= 0.1 ? 'ahead' : gap >= -0.1 ? 'on-track' : 'at-risk';
    // Even if behind the straight line, a projection that lands on time is on track.
    if (pace === 'at-risk' && projectedDate && projectedDate <= goal.target_date) pace = 'on-track';
  }
  return { goal, done, total, progress, expected, pace, weeklyRate, projectedDate };
}

// ---------------------------------------------------------------------------
// Next best action
// ---------------------------------------------------------------------------

export interface NextAction {
  id: string;
  title: string;
  reason: string;
  /** Where the action happens. */
  tab: 'focus' | 'goals' | 'tasks' | 'my-day' | 'knowledge-memory';
  /** Task to hand to Deep Work, when the action is a focus block. */
  taskId?: string;
  priority: number;
}

export interface NextActionInput extends MomentumInput {
  /** Hour of day 0–23, for evening-only suggestions. */
  hour: number;
  todayPlan?: DailyPlan | null;
}

export function nextActions(input: NextActionInput, limit = 3): NextAction[] {
  const { today } = input;
  const out: NextAction[] = [];
  const tasksById = new Map(input.tasks.map((t) => [t.id, t]));

  // 1. A habit with a streak worth protecting, not yet done today.
  for (const h of input.habits.filter((x) => !x.archived)) {
    const dates = input.logs.filter((l) => l.habit_id === h.id).map((l) => l.date);
    const s = computeHabitStats(dates, today, h.weekly_target);
    if (!s.doneToday && s.current >= 2 && h.weekly_target >= 5) {
      out.push({
        id: `habit-${h.id}`,
        title: `Keep your ${s.current}-${s.unit} streak: ${h.title}`,
        reason: 'Not checked in today yet. A small version still counts.',
        tab: 'goals',
        priority: 70 + Math.min(20, s.current),
      });
    }
  }

  // 2. Overdue tasks, most urgent first.
  // Tasks still waiting on another open task go last: they can't be finished yet.
  const overdue = input.tasks
    .filter((t) => !t.done && t.due_date && t.due_date < today)
    .sort(
      (a, b) =>
        Number(isBlocked(a, tasksById)) - Number(isBlocked(b, tasksById)) ||
        ['urgent', 'high', 'medium', 'low'].indexOf(a.priority) - ['urgent', 'high', 'medium', 'low'].indexOf(b.priority)
    );
  if (overdue[0]) {
    const t = overdue[0];
    out.push({
      id: `overdue-${t.id}`,
      title: `Clear an overdue task: ${t.text}`,
      reason: `${overdue.length} overdue${overdue.length > 1 ? ' — starting with the most urgent' : ''}. A 25-minute block is enough to make a dent.`,
      tab: 'focus',
      taskId: t.id,
      priority: t.priority === 'urgent' ? 90 : 75,
    });
  }

  // 3. The first open item on today's plan.
  const firstPlanned = input.todayPlan?.items.map((i) => tasksById.get(i.task_id)).find((t) => t && !t.done);
  if (firstPlanned) {
    out.push({
      id: `plan-${firstPlanned.id}`,
      title: `Start your Top 3: ${firstPlanned.text}`,
      reason: 'It’s next on today’s plan.',
      tab: 'focus',
      taskId: firstPlanned.id,
      priority: 80,
    });
  } else if (!input.todayPlan && input.hour < 14 && input.tasks.some((t) => !t.done)) {
    out.push({ id: 'plan-day', title: 'Plan your day', reason: 'Two minutes now picks your Top 3 for the time you have.', tab: 'my-day', priority: 72 });
  }

  // 4. An active goal with nothing planned this week.
  const wk = weekStart(today);
  for (const g of input.goals.filter((x) => x.status === 'active')) {
    if (!input.milestones.some((m) => m.goal_id === g.id && m.week_start === wk)) {
      out.push({
        id: `goal-${g.id}`,
        title: `Set this week’s step for “${g.title}”`,
        reason: 'Goals move when each week has one concrete milestone.',
        tab: 'goals',
        priority: 60,
      });
      break;
    }
  }

  // 5. No focus yet today, during working hours.
  if (input.hour >= 6 && input.hour < 18 && !input.sessions.some((s) => s.date === today)) {
    out.push({ id: 'focus-block', title: 'Do one 25-minute focus block', reason: 'No deep work logged today yet.', tab: 'focus', priority: 55 });
  }

  // 6. Evening: wrap up.
  if (input.hour >= 19 && input.todayPlan && !input.todayPlan.wrap_up) {
    out.push({ id: 'wrap-up', title: 'Wrap up your day', reason: 'Note one win and pick tomorrow’s first action.', tab: 'my-day', priority: 85 });
  }

  // De-duplicate by task (a planned task that's also overdue appears once, at the higher priority).
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.priority - a.priority)
    .filter((a) => {
      const k = a.taskId ?? a.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Signals and weekly summary
// ---------------------------------------------------------------------------

export interface Signal {
  text: string;
  /** A recovery or keep-going step. */
  action?: string;
}

export interface WeeklySignals {
  matters: Signal[];
  slipping: Signal[];
  compounding: Signal[];
}

export function weeklySignals(input: MomentumInput, forecasts: GoalForecast[]): WeeklySignals {
  const { today } = input;
  const matters: Signal[] = [];
  const slipping: Signal[] = [];
  const compounding: Signal[] = [];

  const dueToday = input.tasks.filter((t) => !t.done && t.due_date === today);
  const urgent = input.tasks.filter((t) => !t.done && t.priority === 'urgent');
  if (dueToday.length) matters.push({ text: `${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today` });
  if (urgent.length) matters.push({ text: `${urgent.length} urgent task${urgent.length === 1 ? '' : 's'} open` });
  const soonest = forecasts
    .filter((f) => f.goal.target_date && f.goal.status === 'active')
    .sort((a, b) => (a.goal.target_date as string).localeCompare(b.goal.target_date as string))[0];
  if (soonest) matters.push({ text: `Nearest goal deadline: “${soonest.goal.title}” on ${formatDay(soonest.goal.target_date as string)}` });

  const overdue = input.tasks.filter((t) => !t.done && t.due_date && t.due_date < today);
  if (overdue.length) slipping.push({ text: `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'}`, action: 'Move what can wait to a later date; do one now.' });
  for (const f of forecasts.filter((x) => x.pace === 'at-risk')) {
    slipping.push({ text: `“${f.goal.title}” is behind pace (${Math.round(f.progress * 100)}% vs ${Math.round((f.expected ?? 0) * 100)}% expected)`, action: 'Plan one small milestone this week.' });
  }
  for (const h of input.habits.filter((x) => !x.archived)) {
    const s = computeHabitStats(input.logs.filter((l) => l.habit_id === h.id).map((l) => l.date), today, h.weekly_target);
    if (s.best >= 3 && s.current === 0) slipping.push({ text: `${h.title}: streak paused (best was ${s.best} ${s.unit}s)`, action: 'Restart with the smallest version today.' });
    if (s.current >= 7 || (s.unit === 'week' && s.current >= 2)) compounding.push({ text: `${h.title}: ${s.current}-${s.unit} streak`, action: 'Keep it light — consistency beats intensity.' });
  }

  const thisWeek = sumFocus(input.sessions, addDays(today, -6), today);
  const lastWeek = sumFocus(input.sessions, addDays(today, -13), addDays(today, -7));
  if (thisWeek > 0 && thisWeek >= lastWeek) compounding.push({ text: `Deep work up: ${fmtMin(thisWeek)} this week vs ${fmtMin(lastWeek)} the week before` });
  else if (lastWeek > 0 && thisWeek < lastWeek * 0.7) slipping.push({ text: `Deep work down: ${fmtMin(thisWeek)} vs ${fmtMin(lastWeek)} last week`, action: 'Protect one focus block tomorrow morning.' });
  for (const f of forecasts.filter((x) => x.pace === 'ahead')) compounding.push({ text: `“${f.goal.title}” is ahead of pace` });

  return { matters, slipping, compounding };
}

/** A short, deterministic summary of the last 7 days compared with the 7 before. */
export function weeklyNarrative(input: MomentumInput): string[] {
  const now = momentumScore(input);
  const before = momentumScore({ ...input, today: addDays(input.today, -7) });
  const scored = now.components.filter((c) => c.value !== null) as (MomentumComponent & { value: number })[];
  if (!scored.length) return ['Not enough activity yet for a weekly summary. Log a habit, a focus session or a journal entry and this fills in.'];

  const lines: string[] = [];
  if (now.score !== null && before.score !== null) {
    const d = now.score - before.score;
    lines.push(
      d === 0
        ? `Your momentum held steady at ${now.score}.`
        : `Your momentum is ${d > 0 ? 'up' : 'down'} ${Math.abs(d)} point${Math.abs(d) === 1 ? '' : 's'} to ${now.score} (${now.band.toLowerCase()}).`
    );
  } else if (now.score !== null) lines.push(`Your momentum this week is ${now.score} (${now.band.toLowerCase()}).`);

  const best = [...scored].sort((a, b) => b.value - a.value)[0];
  const worst = [...scored].sort((a, b) => a.value - b.value)[0];
  if (best) lines.push(`Strongest area: ${best.label.toLowerCase()} (${best.value}).`);
  if (worst && worst.key !== best?.key && worst.value < 70) lines.push(`Most room to grow: ${worst.label.toLowerCase()} (${worst.value}) — one small step there lifts the whole score.`);

  // Which weekday did most of the work?
  const byDay = new Map<string, number>();
  for (const s of input.sessions.filter((x) => inWindow(x.date, addDays(input.today, -6), input.today))) {
    byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.actual_minutes);
  }
  const peak = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (peak && peak[1] >= 25) lines.push(`Your best focus day was ${parseDateKey(peak[0]).toLocaleDateString('en-US', { weekday: 'long' })} (${fmtMin(peak[1])}).`);
  return lines;
}

function sumFocus(sessions: FocusSession[], from: string, to: string): number {
  return sessions.filter((s) => inWindow(s.date, from, to)).reduce((a, s) => a + (s.actual_minutes || 0), 0);
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}

export function formatDay(key: string): string {
  return parseDateKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Momentum score at the end of each of the last `weeks` weeks, oldest first (for the sparkline). */
export function scoreHistory(input: MomentumInput, weeks = 8): { end: string; score: number | null }[] {
  return Array.from({ length: weeks }, (_, i) => {
    const end = addDays(input.today, -(weeks - 1 - i) * 7);
    return { end, score: momentumScore({ ...input, today: end }).score };
  });
}
