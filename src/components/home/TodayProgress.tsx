import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, Circle, Target, ArrowRight, AlertCircle } from 'lucide-react';
import { db } from '../../db';
import type { NavigationTab, Task } from '../../types';
import { computeHabitStats } from '../../lib/habits';

interface TodayProgressProps {
  /** Tasks already filtered to the current workspace area. */
  tasks: Task[];
  today: string;
  currentArea: string;
  onNavigate: (tab: NavigationTab) => void;
}

/** Concise "how is today going" card: task progress, overdue count and one-tap habit check-ins. */
export const TodayProgress: React.FC<TodayProgressProps> = ({ tasks, today, currentArea, onNavigate }) => {
  const habits =
    useLiveQuery(
      () => db.habits.filter((h) => !h.archived && (currentArea === 'All' || h.area === currentArea)).toArray(),
      [currentArea]
    ) || [];
  const todaysLogs = useLiveQuery(() => db.habit_logs.where('date').equals(today).toArray(), [today]) || [];
  const recentLogs =
    useLiveQuery(() => db.habit_logs.where('date').aboveOrEqual(`${today.slice(0, 4)}-01-01`).toArray(), [today]) || [];
  const activeGoalCount =
    useLiveQuery(
      () => db.goals.filter((g) => g.status === 'active' && (currentArea === 'All' || g.area === currentArea)).count(),
      [currentArea]
    ) ?? 0;

  const doneToday = tasks.filter((t) => t.done && t.updated_at.slice(0, 10) === today).length;
  const dueOpen = tasks.filter((t) => !t.done && t.due_date && t.due_date <= today);
  const overdue = dueOpen.filter((t) => (t.due_date as string) < today).length;
  const planned = doneToday + dueOpen.length;
  const pct = planned === 0 ? 0 : Math.round((doneToday / planned) * 100);

  const loggedToday = new Set(todaysLogs.map((l) => l.habit_id));
  const habitsDone = habits.filter((h) => loggedToday.has(h.id)).length;

  const toggleHabit = async (habitId: string) => {
    const id = `${habitId}:${today}`;
    if (loggedToday.has(habitId)) await db.habit_logs.delete(id);
    else await db.habit_logs.put({ id, habit_id: habitId, date: today, created_at: new Date().toISOString() });
  };

  const summary =
    planned === 0
      ? 'Nothing scheduled for today yet.'
      : pct === 100
        ? `All ${planned} planned task${planned === 1 ? '' : 's'} done — great work.`
        : `${doneToday} of ${planned} task${planned === 1 ? '' : 's'} done today.`;

  return (
    <section
      aria-labelledby="today-progress-heading"
      className="rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)] shadow-[var(--hub-card-shadow)] p-4 sm:p-5"
    >
      <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-6">
        {/* Task progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h2 id="today-progress-heading" className="text-sm font-bold text-[var(--hub-ink)]">
              Today&apos;s progress
            </h2>
            {overdue > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('tasks')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[var(--hub-red)]/10 text-[var(--hub-red)] hover:underline cursor-pointer"
              >
                <AlertCircle className="w-3 h-3" />
                {overdue} overdue
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--hub-muted)] mt-1">{summary}</p>
          <div
            role="progressbar"
            aria-label="Tasks completed today"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={summary}
            className="mt-2.5 h-2 rounded-full bg-[var(--hub-line)] overflow-hidden"
          >
            <div
              className="h-full rounded-full bg-[var(--hub-accent)] transition-[width] duration-500 motion-reduce:transition-none"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Habits */}
        <div className="md:w-[45%] min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--hub-ink)]">
              Habits{habits.length > 0 && <span className="font-medium text-[var(--hub-muted)]"> · {habitsDone}/{habits.length}</span>}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('goals')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              Goals &amp; habits <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {habits.length === 0 ? (
            <p className="text-xs text-[var(--hub-muted)] mt-1">
              {activeGoalCount > 0
                ? 'Add a small daily habit to move your goals forward.'
                : 'Set a goal and a daily habit to turn plans into steady progress.'}
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {habits.slice(0, 6).map((h) => {
                const done = loggedToday.has(h.id);
                const stats = computeHabitStats(
                  recentLogs.filter((l) => l.habit_id === h.id).map((l) => l.date),
                  today,
                  h.weekly_target
                );
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => toggleHabit(h.id)}
                      aria-pressed={done}
                      aria-label={`${done ? 'Undo check-in' : 'Check in'}: ${h.title}${stats.current >= 2 ? `, ${stats.current}-${stats.unit} streak` : ''}`}
                      className={`inline-flex items-center gap-1.5 max-w-[14rem] px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer active:scale-95 motion-reduce:active:scale-100 ${
                        done
                          ? 'bg-[var(--hub-accent)] border-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                          : 'border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)]'
                      }`}
                    >
                      {done ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">{h.title}</span>
                      {stats.current >= 2 && <span className="opacity-80 tabular-nums">{stats.current}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {habits.length === 0 && (
            <button
              type="button"
              onClick={() => onNavigate('goals')}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
            >
              <Target className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
              {activeGoalCount > 0 ? 'Add a habit' : 'Set a goal'}
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
