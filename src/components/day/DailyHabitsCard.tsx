import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CheckCircle2, Circle, Flame } from 'lucide-react';
import { db } from '../../db';
import type { NavigationTab } from '../../types';

interface DailyHabitsCardProps {
  today: string;
  onNavigate?: (tab: NavigationTab) => void;
  onStatus?: (message: string) => void;
}

/**
 * Compact Daily Habits check-in card for My Day, reading/writing Dexie `habits` and `habit_logs`.
 */
export const DailyHabitsCard: React.FC<DailyHabitsCardProps> = ({ today, onNavigate, onStatus }) => {
  const habits = useLiveQuery(() => db.habits.filter((h) => !h.archived).toArray(), []) || [];
  const todayLogs = useLiveQuery(() => db.habit_logs.where('date').equals(today).toArray(), [today]) || [];

  const doneSet = new Set(todayLogs.map((l) => l.habit_id));
  const doneCount = habits.filter((h) => doneSet.has(h.id)).length;

  const toggleHabit = async (habitId: string, title: string) => {
    const id = `${habitId}:${today}`;
    const existing = await db.habit_logs.get(id);
    if (existing) {
      await db.habit_logs.delete(id);
      onStatus?.(`Unchecked habit: ${title}`);
    } else {
      await db.habit_logs.put({
        id,
        habit_id: habitId,
        date: today,
        created_at: new Date().toISOString(),
      });
      onStatus?.(`Checked off habit: ${title}`);
    }
  };

  return (
    <section
      className="rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] p-5 shadow-xs space-y-3"
      aria-labelledby="daily-habits-title"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="daily-habits-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
          <Flame className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
          Today's habits
          {habits.length > 0 && (
            <span className="text-xs font-normal text-[var(--hub-muted)]">
              ({doneCount}/{habits.length})
            </span>
          )}
        </h2>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('learning-career')}
            className="text-sm font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            Habits <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {habits.length === 0 ? (
        <div className="space-y-2 text-sm text-[var(--hub-muted)]">
          <p>No active habits yet. Add daily engineering or health habits in Goals & Habits to check them off right here.</p>
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('learning-career')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              Set up a habit <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {habits.map((h) => {
            const done = doneSet.has(h.id);
            return (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => void toggleHabit(h.id, h.title)}
                  aria-pressed={done}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    done
                      ? 'bg-[var(--hub-done)] border-[var(--hub-done-border)] text-[var(--hub-ink)]'
                      : 'bg-[var(--hub-bg)] border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {done ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--hub-accent)]" aria-hidden="true" />
                    ) : (
                      <Circle className="w-4 h-4 shrink-0 text-[var(--hub-muted)]" aria-hidden="true" />
                    )}
                    <span className={`text-sm font-medium truncate ${done ? 'line-through text-[var(--hub-muted)]' : ''}`}>
                      {h.title}
                    </span>
                  </span>
                  <span className="text-[11px] font-medium text-[var(--hub-muted)] shrink-0">
                    {h.weekly_target >= 7 ? 'Daily' : `${h.weekly_target}x/wk`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
