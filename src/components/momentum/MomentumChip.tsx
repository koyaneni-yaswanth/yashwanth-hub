import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles } from 'lucide-react';
import { db } from '../../db';
import { getTodayISO } from '../../lib/utils';
import { momentumScore } from '../../lib/momentum';

/** Compact Momentum score for Home's header; opens the Momentum page. */
export const MomentumChip: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const result = useLiveQuery(async () => {
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
    return momentumScore({ today: getTodayISO(), habits, logs, goals, milestones, sessions, tasks, notes, plans });
  }, []);

  if (!result) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Momentum ${result.score ?? 'not enough data yet'}, ${result.band}. Open Momentum`}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer bg-[var(--hub-surface)] border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)]/50"
    >
      <Sparkles className="w-3.5 h-3.5 text-[var(--hub-accent)]" aria-hidden="true" />
      <span>Momentum</span>
      <span className="tabular-nums">{result.score ?? '—'}</span>
    </button>
  );
};
