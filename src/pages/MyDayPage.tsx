import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Task, EventItem, Area, NavigationTab } from '../types';
import { getTodayISO, generateId } from '../lib/utils';
import {
  Sun,
  Moon,
  Clock,
  CheckCircle2,
  Circle,
  Calendar as CalendarIcon,
  Plus,
  ArrowRight,
  Flame,
  Zap,
  Target,
  Sparkles,
  Timer,
  ChevronRight,
  RotateCcw,
  Check,
  AlertCircle,
  Compass,
} from 'lucide-react';

interface MyDayPageProps {
  onNavigate: (tab: NavigationTab) => void;
  areas?: Area[];
}

interface DailyOutcome {
  id: string;
  text: string;
  done: boolean;
}

export const MyDayPage: React.FC<MyDayPageProps> = ({ onNavigate, areas = [] }) => {
  const todayStr = getTodayISO();
  const [newOutcomeText, setNewOutcomeText] = useState('');
  const [quickTaskText, setQuickTaskText] = useState('');
  const [reflectionText, setReflectionText] = useState('');
  const [reflectionSaved, setReflectionSaved] = useState(false);
  const [isEveningOpen, setIsEveningOpen] = useState(false);

  // Load Daily Outcomes from localStorage
  const outcomeStorageKey = `my_day_outcomes_${todayStr}`;
  const reflectionStorageKey = `my_day_reflection_${todayStr}`;

  const [outcomes, setOutcomes] = useState<DailyOutcome[]>(() => {
    try {
      const saved = localStorage.getItem(outcomeStorageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    return [
      { id: '1', text: 'Finalize V3F submission documentation for Pawan Shakti', done: false },
      { id: '2', text: 'Validate AgileX PiPER ROS 2 inverse kinematics test run', done: false },
      { id: '3', text: 'Complete 4.5 hours deep work block without interruptions', done: false },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem(outcomeStorageKey, JSON.stringify(outcomes));
    } catch {}
  }, [outcomes, outcomeStorageKey]);

  useEffect(() => {
    try {
      const savedRef = localStorage.getItem(reflectionStorageKey);
      if (savedRef) setReflectionText(savedRef);
    } catch {}
  }, [reflectionStorageKey]);

  // Live queries
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allEvents = useLiveQuery(() => db.events.toArray(), []) || [];
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];

  // Filter tasks due today or urgent
  const todayTasks = allTasks.filter(
    (t) => t.due_date === todayStr || (!t.done && (t.priority === 'urgent' || t.starred))
  );

  const completedTodayTasks = allTasks.filter(
    (t) => t.done && t.updated_at && t.updated_at.startsWith(todayStr)
  );

  // Filter events for today
  const todayEvents = allEvents
    .filter((e) => e.date === todayStr)
    .sort((a, b) => (a.start_time || '00:00').localeCompare(b.start_time || '00:00'));

  // Toggle outcome done
  const toggleOutcome = (id: string) => {
    setOutcomes((prev) =>
      prev.map((o) => (o.id === id ? { ...o, done: !o.done } : o))
    );
  };

  // Add custom outcome
  const handleAddOutcome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOutcomeText.trim()) return;
    if (outcomes.length >= 3) {
      alert('Morning Planning is designed for your Top 3 critical outcomes to maintain peak focus.');
      return;
    }
    const newOutcome: DailyOutcome = {
      id: generateId(),
      text: newOutcomeText.trim(),
      done: false,
    };
    setOutcomes((prev) => [...prev, newOutcome]);
    setNewOutcomeText('');
  };

  // Quick Task add for Today
  const handleAddQuickTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskText.trim()) return;

    const newTask: Task = {
      id: generateId(),
      text: quickTaskText.trim(),
      area: areas[0]?.name || 'Pawan Shakti',
      priority: 'high',
      due_date: todayStr,
      starred: true,
      done: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.tasks.add(newTask);
    setQuickTaskText('');
  };

  // Toggle task done in Dexie
  const toggleTask = async (task: Task) => {
    const updatedDone = !task.done;
    await db.tasks.update(task.id, {
      done: updatedDone,
      updated_at: new Date().toISOString(),
    });
  };

  // Carry forward uncompleted tasks to tomorrow
  const handleCarryForward = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const uncompleted = todayTasks.filter((t) => !t.done);
    if (uncompleted.length === 0) {
      alert('All tasks for today are completed! Nothing to carry forward.');
      return;
    }

    for (const t of uncompleted) {
      await db.tasks.update(t.id, {
        due_date: tomorrowStr,
        updated_at: new Date().toISOString(),
      });
    }

    alert(`Successfully carried forward ${uncompleted.length} task(s) to tomorrow (${tomorrowStr}).`);
  };

  // Save evening reflection
  const handleSaveReflection = () => {
    try {
      localStorage.setItem(reflectionStorageKey, reflectionText);
      setReflectionSaved(true);
      setTimeout(() => setReflectionSaved(false), 3000);
    } catch {}
  };

  // Date formatting
  const todayDateObj = new Date();
  const dateFormatted = todayDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const hourNow = todayDateObj.getHours();
  const dayProgressPct = Math.min(100, Math.round((hourNow / 24) * 100));

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fade-in">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-[var(--hub-card)] to-[var(--hub-card-hover)] border border-[var(--hub-line)] shadow-sm">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--hub-accent)]">
              <Sun className="w-4 h-4 text-amber-500 animate-spin-slow" />
              <span>Personal AI Operating System • My Day</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--hub-ink)] font-heading mt-1">
              {dateFormatted}
            </h1>
            <p className="text-xs sm:text-sm text-[var(--hub-muted)] mt-1">
              Prioritize, execute deep work, and synchronize your founder day with zero distractions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('health-routine')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors shadow-sm cursor-pointer"
            >
              <Timer className="w-4 h-4" />
              <span>4.5h Deep Work Timer</span>
            </button>
            <button
              onClick={() => setIsEveningOpen(!isEveningOpen)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[var(--hub-card)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-card-hover)] transition-colors cursor-pointer"
            >
              <Moon className="w-4 h-4 text-indigo-400" />
              <span>Evening Review</span>
            </button>
          </div>
        </div>

        {/* Day Progress Indicator */}
        <div className="mt-6 pt-4 border-t border-[var(--hub-line)] flex items-center justify-between text-xs text-[var(--hub-muted)]">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-teal-400" />
            <span>Day Progress: {hourNow}:00 hrs ({dayProgressPct}% elapsed)</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {completedTodayTasks.length} tasks completed today
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Morning Planning Top 3 & Deep Work Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Morning Planning: Top 3 Core Outcomes */}
        <div className="lg:col-span-2 rounded-2xl p-5 sm:p-6 bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Target className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--hub-ink)] font-heading">
                  Morning Ritual: Top 3 Core Outcomes
                </h2>
                <p className="text-xs text-[var(--hub-muted)]">
                  The three non-negotiable milestones that define success today.
                </p>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-accent)]">
              {outcomes.filter((o) => o.done).length} / {outcomes.length} Done
            </span>
          </div>

          <div className="space-y-2.5 pt-1">
            {outcomes.map((outcome, idx) => (
              <div
                key={outcome.id}
                onClick={() => toggleOutcome(outcome.id)}
                className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                  outcome.done
                    ? 'bg-emerald-500/5 border-emerald-500/30 text-[var(--hub-muted)]'
                    : 'bg-[var(--hub-bg)] border-[var(--hub-line)] hover:border-[var(--hub-accent)] text-[var(--hub-ink)]'
                }`}
              >
                <button
                  type="button"
                  className={`mt-0.5 shrink-0 rounded transition-colors ${
                    outcome.done ? 'text-emerald-500' : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                  }`}
                >
                  {outcome.done ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--hub-card)] border border-[var(--hub-line)] text-[var(--hub-muted)]">
                      Outcome #{idx + 1}
                    </span>
                  </div>
                  <p
                    className={`text-sm mt-1 leading-snug font-medium ${
                      outcome.done ? 'line-through opacity-70' : ''
                    }`}
                  >
                    {outcome.text}
                  </p>
                </div>
              </div>
            ))}

            {outcomes.length < 3 && (
              <form onSubmit={handleAddOutcome} className="flex gap-2 pt-1">
                <input
                  type="text"
                  placeholder="Define your next critical outcome..."
                  value={newOutcomeText}
                  onChange={(e) => setNewOutcomeText(e.target.value)}
                  className="flex-1 px-3.5 py-2.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] placeholder-[var(--hub-muted)] focus:outline-none focus:border-[var(--hub-accent)]"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer shrink-0"
                >
                  Add
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Deep Work & Circadian Health Snapshot */}
        <div className="rounded-2xl p-5 sm:p-6 bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-teal-500/10 text-teal-500 border border-teal-500/20">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--hub-ink)] font-heading">
                  Founder Energy & Discipline
                </h3>
                <p className="text-xs text-[var(--hub-muted)]">Daily cognitive performance</p>
              </div>
            </div>

            <div className="space-y-3 mt-4">
              <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-[var(--hub-muted)]">Deep Work Block</div>
                  <div className="text-base font-extrabold text-teal-400 font-mono mt-0.5">4.5h Target</div>
                </div>
                <button
                  onClick={() => onNavigate('health-routine')}
                  className="p-2 rounded-lg bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold text-[var(--hub-muted)]">Sleep Rhythm</div>
                  <div className="text-base font-extrabold text-indigo-400 font-mono mt-0.5">7.2h Circadian</div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
                  Optimal
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => onNavigate('health-routine')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] transition-colors cursor-pointer"
            >
              <span>View Health & Discipline Hub</span>
              <ChevronRight className="w-4 h-4 text-[var(--hub-muted)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid: Daily Timeline & Priority Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Merged Daily Timeline */}
        <div className="rounded-2xl p-5 sm:p-6 bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--hub-ink)] font-heading">
                  Today's Schedule & Appointments
                </h3>
                <p className="text-xs text-[var(--hub-muted)]">
                  {todayEvents.length > 0 ? `${todayEvents.length} scheduled event(s)` : 'No meetings scheduled today'}
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs font-semibold text-[var(--hub-accent)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              Calendar <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {todayEvents.length === 0 ? (
              <div className="p-6 rounded-xl bg-[var(--hub-bg)] border border-dashed border-[var(--hub-line)] text-center space-y-2">
                <Compass className="w-6 h-6 text-[var(--hub-muted)] mx-auto opacity-60" />
                <p className="text-xs font-medium text-[var(--hub-muted)]">
                  Clear calendar today! Open block for high-velocity deep engineering and R&D.
                </p>
                <button
                  onClick={() => onNavigate('calendar')}
                  className="px-3 py-1.5 rounded-lg bg-[var(--hub-card)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                >
                  Schedule Event
                </button>
              </div>
            ) : (
              todayEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-3.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-start gap-3"
                >
                  <div className="px-2.5 py-1 rounded-lg bg-[var(--hub-card)] border border-[var(--hub-line)] font-mono text-xs font-bold text-teal-400 shrink-0">
                    {event.start_time || 'All Day'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-bold text-[var(--hub-ink)] truncate">
                      {event.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-[var(--hub-muted)]">
                      <span className="capitalize">{event.kind || 'Meeting'}</span>
                      {event.place && <span>• {event.place}</span>}
                      {event.area && (
                        <span className="px-1.5 py-0.5 rounded bg-[var(--hub-card)] border border-[var(--hub-line)] text-[10px]">
                          {event.area}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Priority Action Items for Today */}
        <div className="rounded-2xl p-5 sm:p-6 bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--hub-ink)] font-heading">
                  Priority Tasks for Today
                </h3>
                <p className="text-xs text-[var(--hub-muted)]">
                  {todayTasks.filter((t) => !t.done).length} pending • {completedTodayTasks.length} done
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate('tasks')}
              className="text-xs font-semibold text-[var(--hub-accent)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              All Tasks <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Task Capture */}
          <form onSubmit={handleAddQuickTask} className="flex gap-2">
            <input
              type="text"
              placeholder="Quick capture a task for today..."
              value={quickTaskText}
              onChange={(e) => setQuickTaskText(e.target.value)}
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] placeholder-[var(--hub-muted)] focus:outline-none focus:border-[var(--hub-accent)]"
            />
            <button
              type="submit"
              className="px-3.5 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer shrink-0 flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>Capture</span>
            </button>
          </form>

          {/* Task List */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {todayTasks.length === 0 ? (
              <div className="p-6 rounded-xl bg-[var(--hub-bg)] border border-dashed border-[var(--hub-line)] text-center">
                <Check className="w-6 h-6 text-emerald-400 mx-auto" />
                <p className="text-xs font-medium text-[var(--hub-muted)] mt-1">
                  Zero pending tasks for today! Enjoy your evening or pick a strategic project milestone.
                </p>
              </div>
            ) : (
              todayTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => toggleTask(task)}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                    task.done
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-[var(--hub-muted)]'
                      : 'bg-[var(--hub-bg)] border-[var(--hub-line)] hover:border-[var(--hub-accent)] text-[var(--hub-ink)]'
                  }`}
                >
                  <button
                    type="button"
                    className={`mt-0.5 shrink-0 transition-colors ${
                      task.done ? 'text-emerald-500' : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                    }`}
                  >
                    {task.done ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium leading-snug truncate ${
                          task.done ? 'line-through opacity-70' : ''
                        }`}
                      >
                        {task.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--hub-muted)]">
                      <span className="px-1.5 py-0.2 rounded bg-[var(--hub-card)] border border-[var(--hub-line)]">
                        {task.area}
                      </span>
                      {task.priority === 'urgent' && (
                        <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 font-bold">
                          Urgent
                        </span>
                      )}
                      {task.priority === 'high' && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-bold">
                          High
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Evening Review Workflow Panel */}
      {isEveningOpen && (
        <div className="rounded-2xl p-6 bg-gradient-to-br from-indigo-950/20 to-[var(--hub-card)] border border-indigo-500/30 shadow-lg space-y-4 animate-slide-down">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Moon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--hub-ink)] font-heading">
                  Evening Reflection & Carry-Forward Ritual
                </h3>
                <p className="text-xs text-[var(--hub-muted)]">
                  Reflect on accomplishments, clear cognitive residue, and prepare tomorrow.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCarryForward}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Carry Forward Incomplete</span>
              </button>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <textarea
              rows={3}
              placeholder="What went well today? What lessons did you learn from testing or engineering?"
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] placeholder-[var(--hub-muted)] focus:outline-none focus:border-[var(--hub-accent)]"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--hub-muted)]">
                {reflectionSaved ? '✔ Reflection saved locally' : 'Auto-saved to your personal founder journal'}
              </span>
              <button
                onClick={handleSaveReflection}
                className="px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer"
              >
                Save Reflection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
