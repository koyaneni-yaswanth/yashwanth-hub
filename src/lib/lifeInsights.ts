/**
 * Life insights: pure helpers for the Momentum command deck, the Weekly Time
 * Machine and project orbits. No database or React.
 */
import type { DailyPlan, FocusSession, Goal, GoalMilestone, Habit, HabitLog, Note, Project, Task } from '../types';
import { addDays, parseDateKey } from './habits.ts';
import type { GoalForecast } from './momentum.ts';

export interface LifeData {
  habits: Habit[];
  logs: HabitLog[];
  goals: Goal[];
  milestones: GoalMilestone[];
  sessions: FocusSession[];
  tasks: Task[];
  notes: Note[];
  plans: DailyPlan[];
}

const dayOf = (iso: string | undefined) => (iso ?? '').slice(0, 10);

/**
 * The data as it stood at the end of `day`, for the Weekly Time Machine:
 * anything created later is hidden, and completions after `day` are undone.
 * Task completion time isn't stored, so a done task counts as done from the
 * last time it was updated (a close approximation).
 */
export function snapshotAt(data: LifeData, day: string): LifeData {
  return {
    habits: data.habits.filter((h) => dayOf(h.created_at) <= day),
    logs: data.logs.filter((l) => l.date <= day),
    goals: data.goals.filter((g) => dayOf(g.created_at) <= day),
    milestones: data.milestones
      .filter((m) => dayOf(m.created_at) <= day)
      .map((m) => (m.done && (!m.done_at || dayOf(m.done_at) > day) ? { ...m, done: false, done_at: undefined } : m)),
    sessions: data.sessions.filter((s) => s.date <= day),
    tasks: data.tasks
      .filter((t) => dayOf(t.created_at) <= day)
      .map((t) => (t.done && dayOf(t.updated_at) > day ? { ...t, done: false } : t)),
    notes: data.notes.filter((n) => dayOf(n.created_at) <= day),
    plans: data.plans.filter((p) => p.id <= day),
  };
}

// ---------------------------------------------------------------------------
// Insight cards
// ---------------------------------------------------------------------------

export interface Insight {
  id: string;
  text: string;
  tone: 'positive' | 'neutral' | 'attention';
}

const PART_OF_DAY: [number, number, string][] = [
  [5, 12, 'mornings'],
  [12, 17, 'afternoons'],
  [17, 22, 'evenings'],
];
function partOfDay(hour: number): string {
  return PART_OF_DAY.find(([a, b]) => hour >= a && hour < b)?.[2] ?? 'late nights';
}

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}

export function lifeInsights(
  data: LifeData,
  today: string,
  forecasts: GoalForecast[],
  habitConsistency: { title: string; consistency: number }[],
  limit = 4
): Insight[] {
  const out: Insight[] = [];

  // 1. When deep work happens most (last 28 days, needs a few sessions).
  const from28 = addDays(today, -27);
  const recent = data.sessions.filter((s) => s.date >= from28 && s.date <= today && s.actual_minutes > 0);
  if (recent.length >= 3) {
    const buckets = new Map<string, number>();
    for (const s of recent) {
      const start = new Date(s.started_at);
      const key = `${start.toLocaleDateString('en-US', { weekday: 'long' })}|${partOfDay(start.getHours())}`;
      buckets.set(key, (buckets.get(key) ?? 0) + s.actual_minutes);
    }
    const [key, minutes] = [...buckets.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    const [weekday, part] = key.split('|');
    out.push({
      id: 'focus-peak',
      text: `Your deep work peaked on ${weekday} ${part} (${fmtMin(minutes)} over the last 4 weeks). Protect that slot for your hardest task.`,
      tone: 'positive',
    });
  }

  // 2. Goals ahead / behind pace.
  const ahead = forecasts.find((f) => f.pace === 'ahead');
  if (ahead) out.push({ id: `ahead-${ahead.goal.id}`, text: `“${ahead.goal.title}” is ahead of pace — ${Math.round(ahead.progress * 100)}% done.`, tone: 'positive' });
  const behind = forecasts.find((f) => f.pace === 'at-risk');
  if (behind) {
    out.push({
      id: `behind-${behind.goal.id}`,
      text: `“${behind.goal.title}” is behind pace (${Math.round(behind.progress * 100)}% vs ${Math.round((behind.expected ?? 0) * 100)}% expected). One small milestone this week closes the gap.`,
      tone: 'attention',
    });
  }

  // 3. Most consistent habit.
  const best = [...habitConsistency].sort((a, b) => b.consistency - a.consistency)[0];
  if (best && best.consistency >= 0.7) {
    out.push({ id: 'habit-best', text: `“${best.title}” is your most consistent habit at ${Math.round(best.consistency * 100)}% over the last 14 days.`, tone: 'positive' });
  }

  // 4. A recurring journal theme (last 30 days).
  const from30 = addDays(today, -29);
  const tagCounts = new Map<string, number>();
  for (const n of data.notes) {
    if (!['reflection', 'lesson', 'decision'].includes(n.kind ?? '')) continue;
    if (dayOf(n.created_at) < from30 || dayOf(n.created_at) > today) continue;
    for (const t of n.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  }
  const theme = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (theme && theme[1] >= 2) out.push({ id: 'journal-theme', text: `“${theme[0]}” came up in ${theme[1]} journal entries this month.`, tone: 'neutral' });

  // 5. Tasks finished this week vs last week.
  const doneIn = (from: string, to: string) => data.tasks.filter((t) => t.done && dayOf(t.updated_at) >= from && dayOf(t.updated_at) <= to).length;
  const thisWeek = doneIn(addDays(today, -6), today);
  const lastWeek = doneIn(addDays(today, -13), addDays(today, -7));
  if (thisWeek || lastWeek) {
    const d = thisWeek - lastWeek;
    out.push({
      id: 'tasks-trend',
      text:
        d === 0
          ? `You finished ${thisWeek} task${thisWeek === 1 ? '' : 's'} this week — same as last week.`
          : `You finished ${thisWeek} task${thisWeek === 1 ? '' : 's'} this week, ${Math.abs(d)} ${d > 0 ? 'more' : 'fewer'} than last week.`,
      tone: d >= 0 ? 'positive' : 'neutral',
    });
  }

  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectSystem {
  id: string;
  title: string;
  /** 0–1: milestones if any, else tasks, else the project's own progress figure. */
  progress: number;
  source: 'milestones' | 'tasks' | 'manual';
  openTasks: number;
  doneTasks: number;
  milestones: { title: string; done: boolean }[];
  status: Project['status'];
}

export function projectSystem(project: Project, tasks: Task[]): ProjectSystem {
  const own = tasks.filter((t) => t.project_id === project.id);
  const doneTasks = own.filter((t) => t.done).length;
  const ms = (project.milestones ?? []).map((m) => ({ title: m.title, done: m.done }));
  let progress: number;
  let source: ProjectSystem['source'];
  if (ms.length) {
    progress = ms.filter((m) => m.done).length / ms.length;
    source = 'milestones';
  } else if (own.length) {
    progress = doneTasks / own.length;
    source = 'tasks';
  } else {
    progress = Math.max(0, Math.min(1, (project.progress ?? 0) / 100));
    source = 'manual';
  }
  return { id: project.id, title: project.title, progress, source, openTasks: own.length - doneTasks, doneTasks, milestones: ms, status: project.status };
}

// ---------------------------------------------------------------------------
// Week labels for the Time Machine
// ---------------------------------------------------------------------------

export function weekLabel(weeksAgo: number, endDay: string): string {
  if (weeksAgo === 0) return 'This week';
  if (weeksAgo === 1) return 'Last week';
  const start = parseDateKey(addDays(endDay, -6));
  return `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}
