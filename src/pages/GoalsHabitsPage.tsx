import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Target,
  Plus,
  CheckCircle2,
  Circle,
  Flame,
  Pencil,
  Trash2,
  Trophy,
  Pause,
  Play,
  Repeat,
  X,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  HardDrive,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { db } from '../db';
import { useSync } from '../context/SyncContext';
import type { Area, Goal, GoalMilestone, Habit, HabitLog, GoalStatus } from '../types';
import { generateId, getTodayISO } from '../lib/utils';
import {
  addDays,
  computeHabitStats,
  habitEncouragement,
  milestoneProgress,
  parseDateKey,
  weekStart,
} from '../lib/habits';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { toast } from '../lib/toast';

interface GoalsHabitsPageProps {
  currentArea: string;
  areas: Area[];
  onOpenSyncAccount?: () => void;
}

const nowIso = () => new Date().toISOString();

const fieldClass =
  'w-full px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-sm text-[var(--hub-ink)] focus:outline-none focus:border-[var(--hub-accent)]';
const labelClass = 'block text-xs font-semibold text-[var(--hub-muted)] mb-1';
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer disabled:opacity-50';
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-sm font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer';
const iconBtn =
  'p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer';
const card = 'rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)] shadow-[var(--hub-card-shadow)]';

const formatDate = (key: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(parseDateKey(key));

const daysBetween = (fromKey: string, toKey: string) =>
  Math.round((parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / 86_400_000);

const targetLabel = (n: number) => (n >= 7 ? 'Every day' : `${n}× a week`);

// ─────────────────────────────────────────────────────────────────────────────

export const GoalsHabitsPage: React.FC<GoalsHabitsPageProps> = ({ currentArea, areas, onOpenSyncAccount }) => {
  const { status: syncStatus, signedIn, cloudConfigured, queueCount, syncNow } = useSync();
  const today = getTodayISO();
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);
  const historyFrom = addDays(today, -120);

  const goals = useLiveQuery(() => db.goals.toArray(), []);
  const milestones = useLiveQuery(() => db.goal_milestones.toArray(), []) || [];
  const habits = useLiveQuery(() => db.habits.filter((h) => !h.archived).toArray(), []) || [];
  const logs = useLiveQuery(() => db.habit_logs.where('date').aboveOrEqual(historyFrom).toArray(), [historyFrom]) || [];

  const [goalForm, setGoalForm] = useState<{ open: boolean; goal?: Goal }>({ open: false });
  const [habitForm, setHabitForm] = useState<{ open: boolean; habit?: Habit; goalId?: string }>({ open: false });
  const [goalToDelete, setGoalToDelete] = useState<Goal | null>(null);
  const [habitToArchive, setHabitToArchive] = useState<Habit | null>(null);
  const [showAchieved, setShowAchieved] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const inArea = <T extends { area: string }>(item: T) => currentArea === 'All' || item.area === currentArea;

  // Plain derivations: these lists are small, so memoising buys nothing.
  const visibleGoals = (goals || []).filter(inArea);
  const activeGoals = visibleGoals.filter((g) => g.status !== 'achieved');
  const achievedGoals = visibleGoals.filter((g) => g.status === 'achieved');
  const visibleHabits = habits.filter(inArea);

  const logsByHabit = new Map<string, string[]>();
  for (const l of logs) logsByHabit.set(l.habit_id, [...(logsByHabit.get(l.habit_id) || []), l.date]);

  const milestonesByGoal = new Map<string, GoalMilestone[]>();
  for (const m of milestones) milestonesByGoal.set(m.goal_id, [...(milestonesByGoal.get(m.goal_id) || []), m]);

  // Summary
  const weekMilestones = milestones.filter(
    (m) => m.week_start === thisWeek && activeGoals.some((g) => g.id === m.goal_id)
  );
  const habitsDoneToday = visibleHabits.filter((h) => (logsByHabit.get(h.id) || []).includes(today)).length;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const toggleHabitDay = async (habit: Habit, date: string) => {
    const id = `${habit.id}:${date}`;
    const existing = await db.habit_logs.get(id);
    if (existing) {
      await db.habit_logs.delete(id);
      setAnnouncement(`${habit.title}: check-in removed for ${date === today ? 'today' : formatDate(date)}.`);
    } else {
      const log: HabitLog = { id, habit_id: habit.id, date, created_at: nowIso() };
      await db.habit_logs.put(log);
      setAnnouncement(`${habit.title}: checked in for ${date === today ? 'today' : formatDate(date)}.`);
    }
  };

  const setGoalStatus = async (goal: Goal, status: GoalStatus) => {
    await db.goals.update(goal.id, { status, updated_at: nowIso() });
    setAnnouncement(status === 'achieved' ? `Goal achieved: ${goal.title}. Well done.` : `${goal.title} is now ${status}.`);
  };

  const deleteGoal = async (goal: Goal) => {
    // Milestones belong to the goal; habits are the user's own routines, so they are kept and just unlinked.
    await db.transaction('rw', db.goals, db.goal_milestones, db.habits, async () => {
      await db.goal_milestones.where('goal_id').equals(goal.id).delete();
      await db.habits.where('goal_id').equals(goal.id).modify({ goal_id: undefined, updated_at: nowIso() });
      await db.goals.delete(goal.id);
    });
    setAnnouncement(`Deleted goal ${goal.title}. Linked habits were kept.`);
  };

  const archiveHabit = async (habit: Habit) => {
    // Archive rather than delete so check-in history is preserved.
    await db.habits.update(habit.id, { archived: true, updated_at: nowIso() });
    setAnnouncement(`Archived habit ${habit.title}. Its history is kept.`);
  };

  const isLoading = goals === undefined;

  return (
    <div className="space-y-6 pb-12 max-w-5xl mx-auto">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <Target className="w-6 h-6 text-[var(--hub-accent)] shrink-0" />
            Goals &amp; Habits
          </h1>
          <p className="text-sm text-[var(--hub-muted)] mt-1">
            Turn long-term goals into weekly milestones and small daily actions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cloudConfigured && signedIn && (
            <button
              type="button"
              onClick={() => void syncNow()}
              className={secondaryBtn}
              title="Sync goals and habits across mobile and laptop"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin text-[var(--hub-accent)]' : ''}`} />
              <span>{syncStatus === 'syncing' ? 'Syncing…' : queueCount > 0 ? `Sync (${queueCount})` : 'Synced'}</span>
            </button>
          )}
          <button type="button" className={secondaryBtn} onClick={() => setHabitForm({ open: true })}>
            <Repeat className="w-4 h-4" />
            New habit
          </button>
          <button type="button" className={primaryBtn} onClick={() => setGoalForm({ open: true })}>
            <Plus className="w-4 h-4" />
            New goal
          </button>
        </div>
      </div>

      {cloudConfigured && !signedIn && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[var(--hub-ink)]">
            <Cloud className="w-4 h-4 text-amber-600 dark:text-amber-300 shrink-0" />
            <span>
              Goals created right now are saved only on this device. Sign in to sync them automatically across mobile, tablet, and laptop.
            </span>
          </div>
          {onOpenSyncAccount && (
            <button
              type="button"
              onClick={onOpenSyncAccount}
              className="px-3 py-1.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer shrink-0"
            >
              Sign in to sync
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      <dl className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: 'Active goals', value: String(activeGoals.length) },
          {
            label: 'Milestones this week',
            value: `${weekMilestones.filter((m) => m.done).length}/${weekMilestones.length}`,
          },
          { label: 'Habits today', value: `${habitsDoneToday}/${visibleHabits.length}` },
        ].map((s) => (
          <div key={s.label} className={`${card} p-3 sm:p-4 min-w-0`}>
            <dt className="text-[11px] sm:text-xs font-semibold text-[var(--hub-muted)] leading-tight">{s.label}</dt>
            <dd className="mt-1 text-xl sm:text-2xl font-bold text-[var(--hub-ink)] tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      {isLoading ? (
        <div className="space-y-3" aria-hidden="true">
          <div className="hub-skeleton h-24 rounded-2xl" />
          <div className="hub-skeleton h-40 rounded-2xl" />
        </div>
      ) : (
        <>
          {/* Today's habits */}
          <section aria-labelledby="habits-heading" className="space-y-3">
            <h2 id="habits-heading" className="text-lg font-bold text-[var(--hub-ink)] flex items-center gap-2">
              <Flame className="w-5 h-5 text-[var(--hub-amber)]" />
              Today&apos;s habits
            </h2>
            {visibleHabits.length === 0 ? (
              <div className={`${card} p-5 text-sm text-[var(--hub-muted)]`}>
                Habits are the small repeatable actions behind a goal — like “Read 20 pages” or “30-minute workout”.{' '}
                <button
                  type="button"
                  className="font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
                  onClick={() => setHabitForm({ open: true })}
                >
                  Add your first habit
                </button>
              </div>
            ) : (
              <ul className={`${card} divide-y divide-[var(--hub-line)]`}>
                {visibleHabits.map((habit) => (
                  <HabitRow
                    key={habit.id}
                    habit={habit}
                    dates={logsByHabit.get(habit.id) || []}
                    today={today}
                    goal={(goals || []).find((g) => g.id === habit.goal_id)}
                    onToggle={(date) => toggleHabitDay(habit, date)}
                    onEdit={() => setHabitForm({ open: true, habit })}
                    onArchive={() => setHabitToArchive(habit)}
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Goals */}
          <section aria-labelledby="goals-heading" className="space-y-3">
            <h2 id="goals-heading" className="text-lg font-bold text-[var(--hub-ink)] flex items-center gap-2">
              <Target className="w-5 h-5 text-[var(--hub-accent)]" />
              Goals
            </h2>
            {activeGoals.length === 0 ? (
              <div className={`${card} p-6 sm:p-8 text-center`}>
                <div className="mx-auto w-12 h-12 rounded-2xl bg-[var(--hub-accent)]/10 text-[var(--hub-accent)] flex items-center justify-center mb-3">
                  <Target className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-[var(--hub-ink)]">
                  {achievedGoals.length > 0 ? 'All current goals achieved' : 'Set a goal worth working toward'}
                </h3>
                <p className="text-sm text-[var(--hub-muted)] mt-1 max-w-md mx-auto">
                  Pick one outcome for the next few months, then plan a small milestone for this week.
                  {currentArea !== 'All' && ` Showing goals in ${currentArea}.`}
                </p>
                <button type="button" className={`${primaryBtn} mt-4`} onClick={() => setGoalForm({ open: true })}>
                  <Plus className="w-4 h-4" />
                  Create a goal
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    milestones={milestonesByGoal.get(goal.id) || []}
                    habits={habits.filter((h) => h.goal_id === goal.id)}
                    today={today}
                    thisWeek={thisWeek}
                    nextWeek={nextWeek}
                    onEdit={() => setGoalForm({ open: true, goal })}
                    onDelete={() => setGoalToDelete(goal)}
                    onStatus={(s) => setGoalStatus(goal, s)}
                    onAddHabit={() => setHabitForm({ open: true, goalId: goal.id })}
                    onAnnounce={setAnnouncement}
                  />
                ))}
              </div>
            )}

            {achievedGoals.length > 0 && (
              <div className={card}>
                <button
                  type="button"
                  onClick={() => setShowAchieved((v) => !v)}
                  aria-expanded={showAchieved}
                  aria-controls="achieved-goals"
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-[var(--hub-ink)] cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-[var(--hub-amber)]" />
                    Achieved ({achievedGoals.length})
                  </span>
                  {showAchieved ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showAchieved && (
                  <ul id="achieved-goals" className="divide-y divide-[var(--hub-line)] border-t border-[var(--hub-line)]">
                    {achievedGoals.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--hub-ink)] truncate">{g.title}</div>
                          <div className="text-xs text-[var(--hub-muted)]">
                            {g.area} · {milestoneProgress(milestonesByGoal.get(g.id) || [])}% of milestones
                          </div>
                        </div>
                        <button type="button" className={secondaryBtn} onClick={() => setGoalStatus(g, 'active')}>
                          Reopen
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          <p className="flex items-center gap-1.5 text-xs text-[var(--hub-muted)]">
            <HardDrive className="w-3.5 h-3.5 shrink-0" />
            {signedIn
              ? 'Goals, milestones, and habits save offline first and sync automatically across your signed-in devices.'
              : 'Goals and habits are saved on this device for offline use. Sign in to sync automatically across mobile, tablet, and laptop.'}
          </p>
        </>
      )}

      {goalForm.open && (
        <GoalFormModal
          goal={goalForm.goal}
          areas={areas}
          defaultArea={currentArea !== 'All' ? currentArea : areas[0]?.name || 'Personal'}
          onClose={() => setGoalForm({ open: false })}
          onSaved={(title, isNew) => {
            const msg = isNew ? `Goal created: ${title}.` : `Goal updated: ${title}.`;
            setAnnouncement(msg);
            toast(
              signedIn ? `${msg} Syncing to cloud…` : `${msg} Sign in to sync across devices.`,
              signedIn ? 'success' : 'info'
            );
          }}
        />
      )}

      {habitForm.open && (
        <HabitFormModal
          habit={habitForm.habit}
          goals={(goals || []).filter((g) => g.status !== 'achieved')}
          areas={areas}
          defaultGoalId={habitForm.goalId}
          defaultArea={currentArea !== 'All' ? currentArea : areas[0]?.name || 'Personal'}
          onClose={() => setHabitForm({ open: false })}
          onSaved={(title, isNew) => setAnnouncement(isNew ? `Habit added: ${title}.` : `Habit updated: ${title}.`)}
        />
      )}

      <ConfirmDialog
        isOpen={!!goalToDelete}
        onClose={() => setGoalToDelete(null)}
        onConfirm={() => {
          if (goalToDelete) deleteGoal(goalToDelete);
          setGoalToDelete(null);
        }}
        title="Delete this goal?"
        message={`"${goalToDelete?.title ?? ''}" and its milestones will be permanently deleted. Habits linked to it are kept.`}
      />

      <ConfirmDialog
        isOpen={!!habitToArchive}
        onClose={() => setHabitToArchive(null)}
        onConfirm={() => {
          if (habitToArchive) archiveHabit(habitToArchive);
          setHabitToArchive(null);
        }}
        title="Archive this habit?"
        message={`"${habitToArchive?.title ?? ''}" will be hidden from your daily list. Its check-in history is kept.`}
        confirmLabel="Archive"
        danger={false}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const HabitRow: React.FC<{
  habit: Habit;
  dates: string[];
  today: string;
  goal?: Goal;
  onToggle: (date: string) => void;
  onEdit: () => void;
  onArchive: () => void;
}> = ({ habit, dates, today, goal, onToggle, onEdit, onArchive }) => {
  const stats = computeHabitStats(dates, today, habit.weekly_target);
  const yesterday = addDays(today, -1);
  const doneYesterday = dates.includes(yesterday);
  const set = new Set(dates);
  const last28 = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));

  return (
    <li className="p-3 sm:p-4 flex items-start gap-3">
      <button
        type="button"
        onClick={() => onToggle(today)}
        aria-pressed={stats.doneToday}
        aria-label={`${stats.doneToday ? 'Undo check-in' : 'Check in'} for ${habit.title} today`}
        className={`mt-0.5 shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
          stats.doneToday
            ? 'bg-[var(--hub-accent)] border-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
            : 'border-[var(--hub-line)] text-[var(--hub-muted)] hover:border-[var(--hub-accent)] hover:text-[var(--hub-accent)]'
        }`}
      >
        {stats.doneToday ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-[var(--hub-ink)] break-words">{habit.title}</span>
          <span className="text-[11px] font-medium text-[var(--hub-muted)]">{targetLabel(habit.weekly_target)}</span>
          {goal && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-[var(--hub-accent)]/10 text-[var(--hub-accent)] truncate max-w-[12rem]">
              {goal.title}
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--hub-muted)] mt-0.5">{habitEncouragement(stats, habit.weekly_target)}</p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div
            role="img"
            aria-label={`${habit.title}: checked in on ${stats.last30} of the last 30 days. Best streak ${stats.best} ${stats.unit}${stats.best === 1 ? '' : 's'}.`}
            className="grid grid-flow-col grid-rows-1 gap-[3px]"
          >
            {last28.map((d) => (
              <span
                key={d}
                className={`w-[7px] h-[14px] sm:w-2 sm:h-4 rounded-[2px] ${
                  set.has(d) ? 'bg-[var(--hub-accent)]' : 'bg-[var(--hub-line)]'
                } ${d === today ? 'ring-1 ring-[var(--hub-ink)]/40' : ''}`}
              />
            ))}
          </div>
          {stats.best > 0 && (
            <span className="text-[11px] text-[var(--hub-muted)] tabular-nums">
              Best: {stats.best} {stats.unit}
              {stats.best === 1 ? '' : 's'}
            </span>
          )}
          {!doneYesterday && (
            <button
              type="button"
              onClick={() => onToggle(yesterday)}
              className="text-[11px] font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              Log yesterday
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0">
        <button type="button" className={iconBtn} onClick={onEdit} aria-label={`Edit habit ${habit.title}`} title="Edit">
          <Pencil className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={iconBtn}
          onClick={onArchive}
          aria-label={`Archive habit ${habit.title}`}
          title="Archive"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const GoalCard: React.FC<{
  goal: Goal;
  milestones: GoalMilestone[];
  habits: Habit[];
  today: string;
  thisWeek: string;
  nextWeek: string;
  onEdit: () => void;
  onDelete: () => void;
  onStatus: (s: GoalStatus) => void;
  onAddHabit: () => void;
  onAnnounce: (msg: string) => void;
}> = ({ goal, milestones, habits, today, thisWeek, nextWeek, onEdit, onDelete, onStatus, onAddHabit, onAnnounce }) => {
  const [newMilestone, setNewMilestone] = useState('');
  const [milestoneWeek, setMilestoneWeek] = useState<'this' | 'next'>('this');
  const progress = milestoneProgress(milestones);
  const thisWeekItems = milestones.filter((m) => m.week_start === thisWeek).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const nextWeekItems = milestones.filter((m) => m.week_start === nextWeek);
  const carryOver = milestones.filter((m) => m.week_start < thisWeek && !m.done);
  const inputId = `milestone-${goal.id}`;

  // 8-week history of completed milestones
  const history = Array.from({ length: 8 }, (_, i) => {
    const wk = addDays(thisWeek, (i - 7) * 7);
    const items = milestones.filter((m) => m.week_start === wk);
    return { wk, total: items.length, done: items.filter((m) => m.done).length };
  });
  const maxTotal = Math.max(1, ...history.map((h) => h.total));

  const daysLeft = goal.target_date ? daysBetween(today, goal.target_date) : null;

  const addMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newMilestone.trim();
    if (!title) return;
    const ts = nowIso();
    await db.goal_milestones.add({
      id: generateId(),
      goal_id: goal.id,
      title,
      week_start: milestoneWeek === 'this' ? thisWeek : nextWeek,
      done: false,
      created_at: ts,
      updated_at: ts,
    });
    setNewMilestone('');
    onAnnounce(`Milestone added for ${milestoneWeek === 'this' ? 'this' : 'next'} week: ${title}.`);
  };

  const toggleMilestone = async (m: GoalMilestone) => {
    const done = !m.done;
    await db.goal_milestones.update(m.id, { done, done_at: done ? nowIso() : undefined, updated_at: nowIso() });
    onAnnounce(`${m.title}: ${done ? 'done' : 'not done'}.`);
  };

  const moveToThisWeek = async (m: GoalMilestone) => {
    await db.goal_milestones.update(m.id, { week_start: thisWeek, updated_at: nowIso() });
    onAnnounce(`Moved to this week: ${m.title}.`);
  };

  const removeMilestone = async (m: GoalMilestone) => {
    await db.goal_milestones.delete(m.id);
    onAnnounce(`Removed milestone ${m.title}.`);
  };

  const renderMilestone = (m: GoalMilestone, carried = false) => (
    <li key={m.id} className="group flex items-start gap-2.5 py-1.5">
      <input
        type="checkbox"
        checked={m.done}
        onChange={() => toggleMilestone(m)}
        aria-label={`Mark ${m.done ? 'not done' : 'done'}: ${m.title}`}
        className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--hub-accent)] cursor-pointer"
      />
      <span className={`flex-1 min-w-0 text-sm break-words ${m.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>
        {m.title}
      </span>
      {carried && (
        <button
          type="button"
          onClick={() => moveToThisWeek(m)}
          className="shrink-0 text-[11px] font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
        >
          Move to this week
        </button>
      )}
      <button
        type="button"
        onClick={() => removeMilestone(m)}
        aria-label={`Remove milestone ${m.title}`}
        className={`${iconBtn} -my-1 opacity-60 group-hover:opacity-100 focus:opacity-100`}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );

  return (
    <article className={`${card} p-4 sm:p-5`} aria-labelledby={`goal-title-${goal.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)]">
              {goal.area}
            </span>
            {goal.status === 'paused' && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[var(--hub-amber)]/10 text-[var(--hub-amber)]">
                Paused
              </span>
            )}
            {goal.target_date && (
              <span className="text-[11px] text-[var(--hub-muted)] flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                by {formatDate(goal.target_date)}
                {daysLeft !== null && daysLeft >= 0 && ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
              </span>
            )}
          </div>
          <h3 id={`goal-title-${goal.id}`} className="text-base sm:text-lg font-bold text-[var(--hub-ink)] break-words">
            {goal.title}
          </h3>
          {goal.why && <p className="text-sm text-[var(--hub-muted)] mt-0.5 italic break-words">{goal.why}</p>}
        </div>
        <div className="flex shrink-0 -mr-1">
          <button type="button" className={iconBtn} onClick={onEdit} aria-label={`Edit goal ${goal.title}`} title="Edit">
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            onClick={() => onStatus(goal.status === 'paused' ? 'active' : 'paused')}
            aria-label={`${goal.status === 'paused' ? 'Resume' : 'Pause'} goal ${goal.title}`}
            title={goal.status === 'paused' ? 'Resume' : 'Pause'}
          >
            {goal.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button type="button" className={iconBtn} onClick={onDelete} aria-label={`Delete goal ${goal.title}`} title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-semibold text-[var(--hub-muted)]">
            {milestones.filter((m) => m.done).length} of {milestones.length} milestones
          </span>
          <span className="font-bold text-[var(--hub-ink)] tabular-nums">{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={`${goal.title} progress`}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 rounded-full bg-[var(--hub-line)] overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-[var(--hub-accent)] transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
        {/* This week */}
        <div className="min-w-0">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--hub-muted)]">This week</h4>
          {thisWeekItems.length === 0 && carryOver.length === 0 ? (
            <p className="text-sm text-[var(--hub-muted)] mt-1.5">
              No milestone planned yet. What&apos;s one step you can finish by Sunday?
            </p>
          ) : (
            <ul className="mt-1">
              {thisWeekItems.map((m) => renderMilestone(m))}
              {carryOver.map((m) => renderMilestone(m, true))}
            </ul>
          )}
          {nextWeekItems.length > 0 && (
            <p className="text-xs text-[var(--hub-muted)] mt-1">
              {nextWeekItems.length} planned for next week: {nextWeekItems.map((m) => m.title).join(', ')}
            </p>
          )}

          <form onSubmit={addMilestone} className="mt-2 flex flex-col sm:flex-row gap-2">
            <label htmlFor={inputId} className="sr-only">
              New milestone for {goal.title}
            </label>
            <input
              id={inputId}
              value={newMilestone}
              onChange={(e) => setNewMilestone(e.target.value)}
              placeholder="Add a milestone…"
              className={`${fieldClass} flex-1 min-w-0`}
            />
            <div className="flex gap-2">
              <label htmlFor={`${inputId}-week`} className="sr-only">
                Week
              </label>
              <select
                id={`${inputId}-week`}
                value={milestoneWeek}
                onChange={(e) => setMilestoneWeek(e.target.value as 'this' | 'next')}
                className={`${fieldClass} w-auto`}
              >
                <option value="this">This week</option>
                <option value="next">Next week</option>
              </select>
              <button type="submit" className={primaryBtn} disabled={!newMilestone.trim()}>
                Add
              </button>
            </div>
          </form>
        </div>

        {/* History */}
        <div className="md:w-44">
          <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--hub-muted)]">Last 8 weeks</h4>
          <div
            role="img"
            aria-label={`Milestones completed per week over the last 8 weeks: ${history.map((h) => `${h.done} of ${h.total}`).join(', ')}.`}
            className="mt-2 flex items-end gap-1.5 h-14"
          >
            {history.map((h) => (
              <div key={h.wk} className="flex-1 h-full flex flex-col justify-end rounded-sm bg-[var(--hub-bg)] overflow-hidden">
                <div
                  className="bg-[var(--hub-line)]"
                  style={{ height: `${((h.total - h.done) / maxTotal) * 100}%` }}
                />
                <div className="bg-[var(--hub-accent)]" style={{ height: `${(h.done / maxTotal) * 100}%` }} />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[var(--hub-muted)] mt-1">Filled = completed</p>
        </div>
      </div>

      {/* Linked habits + actions */}
      <div className="mt-4 pt-3 border-t border-[var(--hub-line)] flex flex-wrap items-center gap-2">
        {habits.length > 0 && (
          <span className="text-xs text-[var(--hub-muted)]">
            Daily actions: {habits.map((h) => h.title).join(' · ')}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" className="text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer px-1" onClick={onAddHabit}>
            + Link a habit
          </button>
          <button
            type="button"
            className="text-xs font-semibold text-[var(--hub-ink)] hover:underline cursor-pointer px-1 inline-flex items-center gap-1"
            onClick={() => onStatus('achieved')}
          >
            <Trophy className="w-3.5 h-3.5 text-[var(--hub-amber)]" />
            Mark achieved
          </button>
        </div>
      </div>
    </article>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const GoalFormModal: React.FC<{
  goal?: Goal;
  areas: Area[];
  defaultArea: string;
  onClose: () => void;
  onSaved: (title: string, isNew: boolean) => void;
}> = ({ goal, areas, defaultArea, onClose, onSaved }) => {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [why, setWhy] = useState(goal?.why ?? '');
  const [area, setArea] = useState(goal?.area ?? defaultArea);
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? '');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const ts = nowIso();
    if (goal) {
      await db.goals.update(goal.id, { title: t, why: why.trim() || undefined, area, target_date: targetDate || undefined, updated_at: ts });
    } else {
      await db.goals.add({
        id: generateId(),
        title: t,
        why: why.trim() || undefined,
        area,
        target_date: targetDate || undefined,
        status: 'active',
        created_at: ts,
        updated_at: ts,
      });
    }
    onSaved(t, !goal);
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={goal ? 'Edit goal' : 'New goal'}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="goal-title" className={labelClass}>
            Goal
          </label>
          <input
            id="goal-title"
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Reach TRL 5 integrated bench test"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="goal-why" className={labelClass}>
            Why it matters <span className="font-normal">(optional)</span>
          </label>
          <textarea
            id="goal-why"
            rows={2}
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="A sentence to come back to on hard days"
            className={fieldClass}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="goal-area" className={labelClass}>
              Workspace area
            </label>
            <select id="goal-area" value={area} onChange={(e) => setArea(e.target.value)} className={fieldClass}>
              {areas.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="goal-date" className={labelClass}>
              Target date <span className="font-normal">(optional)</span>
            </label>
            <input id="goal-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className={fieldClass} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn} disabled={!title.trim()}>
            {goal ? 'Save changes' : 'Create goal'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const HabitFormModal: React.FC<{
  habit?: Habit;
  goals: Goal[];
  areas: Area[];
  defaultGoalId?: string;
  defaultArea: string;
  onClose: () => void;
  onSaved: (title: string, isNew: boolean) => void;
}> = ({ habit, goals, areas, defaultGoalId, defaultArea, onClose, onSaved }) => {
  const initialGoal = goals.find((g) => g.id === (habit?.goal_id ?? defaultGoalId));
  const [title, setTitle] = useState(habit?.title ?? '');
  const [goalId, setGoalId] = useState(habit?.goal_id ?? defaultGoalId ?? '');
  const [area, setArea] = useState(habit?.area ?? initialGoal?.area ?? defaultArea);
  const [target, setTarget] = useState(habit?.weekly_target ?? 7);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const ts = nowIso();
    const fields = { title: t, goal_id: goalId || undefined, area, weekly_target: target, updated_at: ts };
    if (habit) {
      await db.habits.update(habit.id, fields);
    } else {
      await db.habits.add({ id: generateId(), ...fields, archived: false, created_at: ts });
    }
    onSaved(t, !habit);
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={habit ? 'Edit habit' : 'New habit'}>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label htmlFor="habit-title" className={labelClass}>
            Habit
          </label>
          <input
            id="habit-title"
            autoFocus
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 45 minutes of focused CAD work"
            className={fieldClass}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="habit-target" className={labelClass}>
              How often
            </label>
            <select id="habit-target" value={target} onChange={(e) => setTarget(Number(e.target.value))} className={fieldClass}>
              <option value={7}>Every day</option>
              {[6, 5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n}× a week
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="habit-goal" className={labelClass}>
              Supports goal <span className="font-normal">(optional)</span>
            </label>
            <select
              id="habit-goal"
              value={goalId}
              onChange={(e) => {
                setGoalId(e.target.value);
                const g = goals.find((x) => x.id === e.target.value);
                if (g) setArea(g.area);
              }}
              className={fieldClass}
            >
              <option value="">No goal</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="habit-area" className={labelClass}>
            Workspace area
          </label>
          <select id="habit-area" value={area} onChange={(e) => setArea(e.target.value)} className={fieldClass}>
            {areas.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className={secondaryBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={primaryBtn} disabled={!title.trim()}>
            {habit ? 'Save changes' : 'Add habit'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
