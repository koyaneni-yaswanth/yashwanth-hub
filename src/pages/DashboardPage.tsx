import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  AlertCircle,
  Calendar,
  IndianRupee,
  Plus,
  Star,
  Trash2,
  MapPin,
  FileText,
  Wind,
  Check,
  RefreshCw,
  Sparkles,
  Bot,
  Heart,
  ArrowRight,
  Clock,
  FolderKanban,
  Sun,
  Target,
  Play,
  Eye,
  SkipForward,
  CalendarCheck,
  Trophy,
  X,
  Mic,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Undo2,
} from 'lucide-react';
import { db } from '../db';
import type { Task, Area, Priority } from '../types';
import {
  formatINR,
  formatShortDate,
  getGreeting,
  getTodayISO,
  isOverdue,
  generateId,
} from '../lib/utils';
import { StatCard } from '../components/common/StatCard';
import { Badge } from '../components/common/Badge';
import { Neo1DeviceCard } from '../components/neo/Neo1DeviceCard';
import { IntegrationVaultService } from '../services/integrationVaultService';
import { handOffFocusTask } from '../lib/focusHandoff';
import { MomentumChip } from '../components/momentum/MomentumChip';
import { TaskService } from '../services/sync/taskService';
import { TodayProgress } from '../components/home/TodayProgress';

interface DashboardPageProps {
  currentArea: string;
  areas: Area[];
  onNavigate: (tab: any) => void;
  onOpenQuickCapture?: () => void;
  onTurbineSpeedChange?: (duration: number) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  currentArea,
  areas,
  onNavigate,
  onOpenQuickCapture,
}) => {
  const today = getTodayISO();
  const nextWeek = React.useMemo(
    () => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    []
  );
  const currentMonthStr = today.slice(0, 7);
  const taskInputRef = React.useRef<HTMLInputElement>(null);

  // Sync & View Preferences
  const [isSyncing, setIsSyncing] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yash_home_show_details') === 'true';
    } catch {
      return false;
    }
  });
  const [showQuickOptions, setShowQuickOptions] = useState(false);

  const toggleMoreDetails = () => {
    setShowMoreDetails((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('yash_home_show_details', String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      await IntegrationVaultService.triggerSyncNow();
    } catch (err) {
      console.warn('[DashboardPage] Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Quick Task / Ask AI Unified Bar State
  const [quickText, setQuickText] = useState('');
  const [quickArea, setQuickArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [quickDate, setQuickDate] = useState(today);
  const [quickPriority, setQuickPriority] = useState<Priority>('medium');
  const [quickAddedToast, setQuickAddedToast] = useState<string | null>(null);

  // Live queries from IndexedDB
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allEvents = useLiveQuery(() => db.events.toArray(), []) || [];
  const allMeetings = useLiveQuery(() => db.meetings.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const pinnedNotes =
    useLiveQuery(() => db.notes.filter((n) => n.pinned).toArray(), []) || [];

  // Planning & Review Modals
  const [isDailyPlanningOpen, setIsDailyPlanningOpen] = useState(false);
  const [isWeeklyReviewOpen, setIsWeeklyReviewOpen] = useState(false);
  const [dailyPlanNotice, setDailyPlanNotice] = useState<string | null>(null);
  const [weeklyReviewNotice, setWeeklyReviewNotice] = useState<string | null>(null);

  // Filter based on selected area
  const tasks = currentArea === 'All' ? allTasks : allTasks.filter((t) => t.area === currentArea);
  const openTasks = tasks.filter((t) => !t.done);
  const dueAndOverdueTasks = openTasks
    .filter((t) => t.due_date && t.due_date <= today)
    .sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      return (a.due_date || '').localeCompare(b.due_date || '');
    });

  // Focus Mode state
  const [recommendationSkipIndex, setRecommendationSkipIndex] = useState(0);

  // Smart Task Recommendation (clean human reasons, no jargon)
  interface ScoredTask {
    task: Task;
    score: number;
    label: string;
  }

  const scoredCandidateTasks: ScoredTask[] = React.useMemo(() => {
    return openTasks
      .map((t) => {
        let score = 0;
        let label = 'Next up';

        if (t.due_date) {
          if (t.due_date < today) {
            score += 50;
            label = 'Overdue';
          } else if (t.due_date === today) {
            score += 35;
            label = 'Due today';
          } else if (t.due_date <= nextWeek) {
            score += 15;
            label = `Due ${formatShortDate(t.due_date)}`;
          } else {
            score += 5;
          }
        }

        if (t.priority === 'urgent') {
          score += 40;
          if (label === 'Next up') label = 'Urgent';
        } else if (t.priority === 'high') {
          score += 25;
          if (label === 'Next up') label = 'High priority';
        } else if (t.priority === 'medium') {
          score += 10;
        }

        if (t.starred) {
          score += 20;
          if (label === 'Next up') label = 'Starred focus';
        }

        if (t.plan !== undefined) score += 15;
        if (currentArea !== 'All' && t.area === currentArea) score += 10;

        return { task: t, score, label };
      })
      .sort((a, b) => b.score - a.score);
  }, [openTasks, today, nextWeek, currentArea]);

  const candidateTasks = scoredCandidateTasks.map((s) => s.task);
  const activeRecommendationItem =
    scoredCandidateTasks.length > 0
      ? scoredCandidateTasks[recommendationSkipIndex % scoredCandidateTasks.length]
      : null;
  const activeRecommendation = activeRecommendationItem ? activeRecommendationItem.task : null;

  const sevenDaysAgo = React.useMemo(
    () => new Date(Date.now() - 7 * 86400000).toISOString(),
    []
  );

  const overdueTasks = React.useMemo(
    () => openTasks.filter((t) => t.due_date && t.due_date < today),
    [openTasks, today]
  );

  const completedPastWeek = React.useMemo(
    () => allTasks.filter((t) => t.done && (t.updated_at || '') >= sevenDaysAgo),
    [allTasks, sevenDaysAgo]
  );

  const todayEvents = React.useMemo(
    () => allEvents.filter((e) => e.date === today),
    [allEvents, today]
  );

  const todayMeetings = React.useMemo(
    () => allMeetings.filter((m) => m.date === today && m.status === 'scheduled'),
    [allMeetings, today]
  );

  const upcomingEvents = (
    currentArea === 'All' ? allEvents : allEvents.filter((e) => e.area === currentArea)
  )
    .filter((e) => e.date >= today && e.date <= nextWeek)
    .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')));

  const upcomingMeetings = (
    currentArea === 'All' ? allMeetings : allMeetings.filter((m) => m.area === currentArea)
  )
    .filter((m) => m.date >= today && m.date <= nextWeek && m.status === 'scheduled')
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));

  const monthExpenses = (
    currentArea === 'All' ? allExpenses : allExpenses.filter((e) => e.area === currentArea)
  )
    .filter((e) => e.date.startsWith(currentMonthStr))
    .reduce((sum, e) => sum + e.amount, 0);

  const pawanProject = allProjects.find((p) => p.area === 'PAWAN SHAKTI');

  // Every Home task edit goes through the same persistence + cloud-sync path as the Tasks page.
  const handleMoveToToday = (task: Task) => TaskService.scheduleFor(task, today);

  const handleFinishDailyPlan = () => {
    setDailyPlanNotice('Daily plan saved — your top focus priorities are ready.');
    setIsDailyPlanningOpen(false);
    setTimeout(() => setDailyPlanNotice(null), 4000);
  };

  const handleFinishWeeklyReview = async () => {
    try {
      await db.notes.add({
        id: generateId(),
        title: `Weekly Review — ${today}`,
        body: `Weekly Review (${today}):\n• Completed this week: ${completedPastWeek.length}\n• Open tasks: ${openTasks.length}\n• Active projects: ${allProjects.filter((p) => p.status === 'active' || p.status === 'planning').length}`,
        area: currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI',
        pinned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setWeeklyReviewNotice('Weekly review saved to Notes.');
    } catch (err) {
      console.warn('Could not record review note:', err);
    }
    setIsWeeklyReviewOpen(false);
    setTimeout(() => setWeeklyReviewNotice(null), 4000);
  };

  // Quick Task Submit
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickText.trim()) return;

    await TaskService.create({
      text: quickText.trim(),
      area: quickArea,
      priority: quickPriority,
      due_date: quickDate || undefined,
      starred: false,
      done: false,
    });
    setQuickText('');
    setShowQuickOptions(false);
    setQuickAddedToast('Task added!');
    setTimeout(() => setQuickAddedToast(null), 2500);
  };

  // Send directly to Ask AI from Home bar
  const handleSendToAI = () => {
    if (quickText.trim()) {
      localStorage.setItem('yash_ai_prefill_prompt', quickText.trim());
    }
    onNavigate('ai-assistant');
  };

  const handleToggleTask = (task: Task) => TaskService.toggleDone(task);

  const handleToggleStar = (task: Task) => TaskService.toggleStar(task);

  // Delete with undo: the task leaves the list at once, but the cloud delete is held
  // until the undo window closes, so undoing never races an already-synced delete.
  const UNDO_WINDOW_MS = 6000;
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const pendingDeleteRef = useRef<{ task: Task; timer: number } | null>(null);

  const commitPendingDelete = useCallback(() => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    TaskService.commitRemove(pending.task.id);
  }, []);

  // Finalize a pending delete if the user leaves Home or closes the app mid-window.
  useEffect(() => {
    window.addEventListener('pagehide', commitPendingDelete);
    return () => {
      window.removeEventListener('pagehide', commitPendingDelete);
      commitPendingDelete();
    };
  }, [commitPendingDelete]);

  const handleDeleteTask = async (task: Task) => {
    commitPendingDelete(); // a second delete finalizes the first
    await TaskService.removeLocally(task);
    const timer = window.setTimeout(() => {
      commitPendingDelete();
      setPendingDelete(null);
    }, UNDO_WINDOW_MS);
    pendingDeleteRef.current = { task, timer };
    setPendingDelete(task);
  };

  const handleUndoDelete = useCallback(async () => {
    const pending = pendingDeleteRef.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingDeleteRef.current = null;
    setPendingDelete(null);
    await TaskService.restore(pending.task);
  }, []);

  // Ctrl/Cmd+Z undoes while the toast is showing (but not while typing in a field).
  useEffect(() => {
    if (!pendingDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault();
      handleUndoDelete();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingDelete, handleUndoDelete]);

  const scheduleCount = upcomingEvents.length + upcomingMeetings.length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* 1. Calm Greeting & Clean Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            {getGreeting('Yaswanth')}
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            {dueAndOverdueTasks.length === 0
              ? `All clear today • ${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}`
              : `${dueAndOverdueTasks.length} task${dueAndOverdueTasks.length === 1 ? '' : 's'} due today • ${scheduleCount} upcoming`}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              if (activeRecommendation) handOffFocusTask(activeRecommendation.id);
              onNavigate('focus');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer bg-[var(--hub-surface)] border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)]/50"
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Focus Mode</span>
          </button>

          <MomentumChip onOpen={() => onNavigate('momentum')} />

          <button
            onClick={() => setIsDailyPlanningOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[var(--hub-ink)] text-xs font-semibold hover:border-[var(--hub-accent)]/50 transition-all cursor-pointer"
          >
            <CalendarCheck className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
            <span>Plan Day</span>
          </button>

          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="p-2 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] transition-all cursor-pointer disabled:opacity-50"
            title="Sync now"
            aria-label="Sync now"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[var(--hub-accent)]' : ''}`} />
          </button>
        </div>
      </div>

      <TodayProgress tasks={tasks} today={today} currentArea={currentArea} onNavigate={onNavigate} />

      {/* Notices */}
      <div role="status" aria-live="polite">
      {(dailyPlanNotice || weeklyReviewNotice || quickAddedToast) && (
        <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-700 dark:text-teal-300 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{dailyPlanNotice || weeklyReviewNotice || quickAddedToast}</span>
          </span>
          <button
            onClick={() => {
              setDailyPlanNotice(null);
              setWeeklyReviewNotice(null);
              setQuickAddedToast(null);
            }}
            className="text-xs hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}
      </div>

      {/* 2. Unified "Do Anything" Bar — Add Task, Ask AI, or Voice Capture in One Place */}
      <div
        data-agent-target="quick-actions"
        className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-3 sm:p-4 shadow-xs focus-within:border-[var(--hub-accent)] transition-colors"
      >
        <form onSubmit={handleQuickAdd} className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={taskInputRef}
              type="text"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              aria-label="Add a task, capture a thought, or ask AI"
              placeholder="Add a task, capture a thought, or ask Jarvis AI..."
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[var(--hub-bg)]/70 border border-transparent focus:border-[var(--hub-accent)]/40 text-[var(--hub-ink)] text-sm focus:outline-none placeholder:text-[var(--hub-muted)]"
            />

            {onOpenQuickCapture && (
              <button
                type="button"
                onClick={onOpenQuickCapture}
                title="Voice & Smart Capture"
                aria-label="Voice Capture"
                className="p-2.5 rounded-xl bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:text-[var(--hub-accent)] transition-colors cursor-pointer flex-none"
              >
                <Mic className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowQuickOptions(!showQuickOptions)}
              title="Due date, area & priority"
              aria-label="Task options"
              className={`p-2.5 rounded-xl transition-colors cursor-pointer flex-none ${
                showQuickOptions
                  ? 'bg-[var(--hub-accent)]/15 text-[var(--hub-accent)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleSendToAI}
              title="Ask Jarvis AI"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 text-xs font-semibold transition-colors cursor-pointer flex-none"
            >
              <Sparkles className="w-4 h-4" />
              <span>Ask AI</span>
            </button>

            <button
              type="submit"
              disabled={!quickText.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs sm:text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer flex-none shadow-xs disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>

          {showQuickOptions && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[var(--hub-line)]/70 text-xs">
              <label className="flex items-center gap-1.5 text-[var(--hub-muted)]">
                <span>Area:</span>
                <select
                  value={quickArea}
                  onChange={(e) => setQuickArea(e.target.value)}
                  className="py-1 px-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
                >
                  {areas.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-[var(--hub-muted)]">
                <span>Due:</span>
                <input
                  type="date"
                  value={quickDate}
                  onChange={(e) => setQuickDate(e.target.value)}
                  className="py-1 px-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
                />
              </label>

              <label className="flex items-center gap-1.5 text-[var(--hub-muted)]">
                <span>Priority:</span>
                <select
                  value={quickPriority}
                  onChange={(e) => setQuickPriority(e.target.value as Priority)}
                  className="py-1 px-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
            </div>
          )}
        </form>
      </div>

      {/* 4. Clean "Up Next" Single Focus Card */}
      {activeRecommendation && activeRecommendationItem && (
        <div className="rounded-2xl p-4 sm:p-5 bg-[var(--hub-surface)] border border-teal-500/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-400 shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
                  Up Next
                </span>
                <span className="text-xs text-[var(--hub-muted)]">
                  • {activeRecommendationItem.label} • {activeRecommendation.area}
                </span>
              </div>
              <h3 className="text-base font-bold text-[var(--hub-ink)] mt-1 font-heading break-words">
                {activeRecommendation.text}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                handOffFocusTask(activeRecommendation.id);
                onNavigate('focus');
              }}
              aria-label={`Start a focus session: ${activeRecommendation.text}`}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Focus</span>
            </button>
            <button
              onClick={() => handleToggleTask(activeRecommendation)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
            <button
              onClick={() => setRecommendationSkipIndex((prev) => prev + 1)}
              title="Show another task"
              aria-label="Next task"
              className="p-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 5. Core 2-Column Everyday Workspace: Today's Tasks + Upcoming Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Today & Overdue Tasks */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base sm:text-lg text-[var(--hub-ink)] flex items-center gap-2">
              <span>Today&apos;s Tasks</span>
              {dueAndOverdueTasks.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-teal-500/10 text-[var(--hub-accent)] font-bold">
                  {dueAndOverdueTasks.length}
                </span>
              )}
            </h3>
            <button
              onClick={() => onNavigate('tasks')}
              className="text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              All tasks ({openTasks.length}) →
            </button>
          </div>

          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl divide-y divide-[var(--hub-line)] overflow-hidden shadow-xs">
            {dueAndOverdueTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--hub-muted)]">
                <Check className="w-7 h-7 mx-auto text-teal-700 dark:text-teal-300 mb-2 opacity-80" />
                <p className="font-semibold text-[var(--hub-ink)]">All caught up for today</p>
                <p className="text-xs mt-1">Use the bar above to add a task or ask AI what to work on.</p>
              </div>
            ) : (
              dueAndOverdueTasks.slice(0, 8).map((task) => {
                const overdue = isOverdue(task.due_date, task.done);
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 p-3.5 hover:bg-[var(--hub-bg)]/50 transition-colors group"
                  >
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => handleToggleTask(task)}
                      aria-label={`Mark ${task.text} complete`}
                      className="mt-0.5 w-4 h-4 rounded text-[var(--hub-accent)] focus:ring-[var(--hub-accent)] cursor-pointer flex-none"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-[var(--hub-ink)] break-words block">
                        {task.text}
                      </span>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-[11px] font-medium text-[var(--hub-muted)]">
                          {task.area}
                        </span>
                        {task.priority === 'urgent' && <Badge variant="red">Urgent</Badge>}
                        {task.priority === 'high' && <Badge variant="amber">High</Badge>}
                        {task.due_date && overdue && (
                          <span className="text-[11px] font-semibold text-red-700 dark:text-red-400">
                            Overdue • {formatShortDate(task.due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100">
                      <button
                        onClick={() => handleToggleStar(task)}
                        className="p-1 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-[var(--hub-bg)] cursor-pointer"
                        title={task.starred ? 'Unstar' : 'Star'}
                      >
                        <Star className={`w-4 h-4 ${task.starred ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task)}
                        className="p-1 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Delete task"
                        aria-label={`Delete task: ${task.text}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Upcoming Schedule */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base sm:text-lg text-[var(--hub-ink)] flex items-center gap-2">
              <span>Upcoming</span>
              {scheduleCount > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 font-bold">
                  {scheduleCount}
                </span>
              )}
            </h3>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              Calendar →
            </button>
          </div>

          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl divide-y divide-[var(--hub-line)] overflow-hidden shadow-xs">
            {scheduleCount === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--hub-muted)]">
                <Calendar className="w-7 h-7 mx-auto text-blue-700 dark:text-blue-300 mb-2 opacity-80" />
                <p className="font-semibold text-[var(--hub-ink)]">Clear schedule this week</p>
                <p className="text-xs mt-1">Great window for deep engineering work.</p>
              </div>
            ) : (
              <>
                {upcomingMeetings.slice(0, 4).map((m) => (
                  <div key={m.id} className="p-3.5 hover:bg-[var(--hub-bg)]/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                          {formatShortDate(m.date)} • {m.start_time}
                        </span>
                        <h4 className="text-sm font-semibold text-[var(--hub-ink)] mt-0.5">
                          {m.title}
                        </h4>
                        {m.attendees && (
                          <p className="text-xs text-[var(--hub-muted)] mt-0.5">{m.attendees}</p>
                        )}
                      </div>
                      <Badge variant="purple">{m.area}</Badge>
                    </div>
                  </div>
                ))}

                {upcomingEvents.slice(0, 4).map((e) => (
                  <div key={e.id} className="p-3.5 hover:bg-[var(--hub-bg)]/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                          {formatShortDate(e.date)} {e.start_time ? `• ${e.start_time}` : ''}
                        </span>
                        <h4 className="text-sm font-semibold text-[var(--hub-ink)] mt-0.5">
                          {e.title}
                        </h4>
                        {e.place && (
                          <p className="text-xs text-[var(--hub-muted)] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3" />
                            <span>{e.place}</span>
                          </p>
                        )}
                      </div>
                      {e.area && <Badge variant="teal">{e.area}</Badge>}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 6. Simple Shortcut Pills Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button
          type="button"
          onClick={() => onNavigate('ai-assistant')}
          className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] hover:border-teal-500/50 text-xs font-semibold text-[var(--hub-ink)] transition-all cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-teal-700 dark:text-teal-300 shrink-0" />
          <span>Ask AI</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('projects')}
          className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] hover:border-indigo-500/50 text-xs font-semibold text-[var(--hub-ink)] transition-all cursor-pointer"
        >
          <FolderKanban className="w-4 h-4 text-indigo-700 dark:text-indigo-300 shrink-0" />
          <span>Projects</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('my-day')}
          className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] hover:border-amber-500/50 text-xs font-semibold text-[var(--hub-ink)] transition-all cursor-pointer"
        >
          <Sun className="w-4 h-4 text-amber-800 dark:text-amber-300 shrink-0" />
          <span>My Day</span>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('knowledge-memory')}
          className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] hover:border-rose-500/50 text-xs font-semibold text-[var(--hub-ink)] transition-all cursor-pointer"
        >
          <FileText className="w-4 h-4 text-rose-700 dark:text-rose-300 shrink-0" />
          <span>Memory Vault</span>
        </button>
        <button
          type="button"
          onClick={() => setIsWeeklyReviewOpen(true)}
          className="col-span-2 sm:col-span-1 flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] hover:border-purple-500/50 text-xs font-semibold text-[var(--hub-ink)] transition-all cursor-pointer"
        >
          <Trophy className="w-4 h-4 text-purple-700 dark:text-purple-300 shrink-0" />
          <span>Weekly Review</span>
        </button>
      </div>

      {/* 7. Progressive Disclosure: Expandable Full Overview (Stats, Workspaces, Neo 1, Pinned Notes) */}
      <div className="pt-1">
        <button
          type="button"
          onClick={toggleMoreDetails}
          aria-expanded={showMoreDetails}
          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-[var(--hub-surface)]/70 border border-[var(--hub-line)] hover:border-[var(--hub-accent)]/40 text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)] transition-all cursor-pointer"
        >
          <span>
            {showMoreDetails
              ? 'Hide detailed stats, workspaces & pinned notes'
              : 'Show full overview (stats, Pawan Shakti, Robotics Lab, Neo 1 & pinned notes)'}
          </span>
          {showMoreDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showMoreDetails && (
          <div className="mt-5 space-y-6">
            {/* KPI Stats Grid */}
            <div data-agent-target="stats-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <StatCard
                label="Due & Overdue"
                value={dueAndOverdueTasks.length}
                subtext={dueAndOverdueTasks.length === 0 ? 'All caught up' : 'Action needed today'}
                icon={
                  <AlertCircle
                    className={`w-5 h-5 ${dueAndOverdueTasks.length > 0 ? 'text-red-700 dark:text-red-300' : 'text-teal-700 dark:text-teal-300'}`}
                  />
                }
                onClick={() => onNavigate('tasks')}
              />
              <StatCard
                label="Open Tasks"
                value={openTasks.length}
                subtext={`${tasks.filter((t) => t.done).length} completed`}
                icon={<CheckCircle2 className="w-5 h-5 text-teal-700 dark:text-teal-300" />}
                onClick={() => onNavigate('tasks')}
              />
              <StatCard
                label="Spent This Month"
                value={monthExpenses === 0 ? '₹0' : formatINR(monthExpenses)}
                subtext={monthExpenses === 0 ? 'Manually logged only' : `Cycle ${today.slice(0, 7)}`}
                icon={<IndianRupee className="w-5 h-5 text-amber-800 dark:text-amber-300" />}
                onClick={() => onNavigate('expenses')}
              />
              <StatCard
                label="Schedule (7 Days)"
                value={scheduleCount}
                subtext={`${upcomingMeetings.length} meetings, ${upcomingEvents.length} events`}
                icon={<Calendar className="w-5 h-5 text-blue-700 dark:text-blue-300" />}
                onClick={() => onNavigate('calendar')}
              />
            </div>

            {/* Workspaces Hub */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Pawan Shakti Card */}
              <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-teal-500/50 transition-all">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
                      <Wind className="w-4 h-4" />
                      <span>Pawan Shakti</span>
                    </span>
                    <Badge variant="teal">TRL 4 Baseline</Badge>
                  </div>
                  <h4 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                    Low-Wind Planetary Gearbox
                  </h4>
                  <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                    TRL 4 benchtop prototype with published Indian patent. Closed-loop bench testing toward TRL 5 in progress.
                  </p>
                  {pawanProject && (
                    <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-between text-xs">
                      <span className="font-semibold text-teal-800 dark:text-teal-200">
                        Target Date
                      </span>
                      <span className="font-mono font-bold text-teal-700 dark:text-teal-300">
                        {pawanProject.target_date || '2027-01-03'} • {pawanProject.progress}%
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('startup-command')}
                  className="mt-4 flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-[var(--hub-bg)] hover:bg-[var(--hub-surface-subtle)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] transition-colors cursor-pointer group"
                >
                  <span>Open Startup Command</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Robotics Lab Card */}
              <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-purple-500/50 transition-all">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">
                      <Bot className="w-4 h-4" />
                      <span>Robotics Lab</span>
                    </span>
                    <Badge variant="purple">Experiment Log</Badge>
                  </div>
                  <h4 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                    PiPER, Swarm & mmWave Radar
                  </h4>
                  <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                    Hardware experiment workspace for AgileX PiPER, 3-drone swarm coordination, and TI AWR2944 radar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('robotics-lab')}
                  className="mt-4 flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-[var(--hub-bg)] hover:bg-[var(--hub-surface-subtle)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] transition-colors cursor-pointer group"
                >
                  <span>Launch Robotics Lab</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* Routine & Health Card */}
              <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-rose-500/50 transition-all">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                      <Heart className="w-4 h-4" />
                      <span>Routine & Health</span>
                    </span>
                    <Badge variant="gray">Daily Check-In</Badge>
                  </div>
                  <h4 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                    Sleep, Energy & Deep Work
                  </h4>
                  <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                    Track sleep hours, deep engineering sessions, and daily habits across sessions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('health-routine')}
                  className="mt-4 flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-[var(--hub-bg)] hover:bg-[var(--hub-surface-subtle)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] transition-colors cursor-pointer group"
                >
                  <span>Open Routine Tracker</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>

            {/* Neo 1 Card */}
            <div data-agent-target="automations-card">
              <Neo1DeviceCard />
            </div>

            {/* Pinned Notes */}
            {pinnedNotes.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-800 dark:text-amber-300" />
                    <span>Pinned Notes</span>
                  </h3>
                  <button
                    onClick={() => onNavigate('notes')}
                    className="text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
                  >
                    Manage notes →
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pinnedNotes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-[var(--hub-surface)] border-l-4 border-l-[var(--hub-amber)] border border-[var(--hub-line)] rounded-xl p-4 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h4 className="text-sm font-bold font-heading text-[var(--hub-ink)]">
                          {note.title}
                        </h4>
                        {note.area && <Badge variant="amber">{note.area}</Badge>}
                      </div>
                      <p className="text-xs text-[var(--hub-muted)] whitespace-pre-wrap leading-relaxed">
                        {note.body}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interactive Daily Planning Modal */}
      {isDailyPlanningOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--hub-line)] pb-4">
              <div>
                <h3 className="text-lg font-bold font-heading text-[var(--hub-ink)] flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-indigo-700 dark:text-indigo-300" />
                  <span>Plan Your Day</span>
                </h3>
                <p className="text-xs text-[var(--hub-muted)] mt-1">
                  Handle overdue items, star your top priorities, and check today&apos;s schedule.
                </p>
              </div>
              <button
                onClick={() => setIsDailyPlanningOpen(false)}
                className="p-1 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overdue */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)]">
                  1. Overdue ({overdueTasks.length})
                </h4>
                {overdueTasks.length === 0 && (
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">All clear</span>
                )}
              </div>

              {overdueTasks.length > 0 && (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {overdueTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--hub-ink)] truncate">{t.text}</div>
                        <div className="text-[10px] text-red-700 dark:text-red-300">
                          Due {t.due_date} • {t.area}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleMoveToToday(t)}
                          className="px-2.5 py-1 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-indigo-700 dark:text-indigo-300 font-medium cursor-pointer"
                        >
                          Today
                        </button>
                        <button
                          onClick={() => handleToggleTask(t)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-medium cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Focus */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)]">
                2. Star Your Top Focus Tasks
              </h4>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {candidateTasks.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => handleToggleStar(t)}
                        className={`p-1 rounded-md cursor-pointer ${
                          t.starred ? 'text-amber-800 dark:text-amber-300' : 'text-[var(--hub-muted)] hover:text-amber-400'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${t.starred ? 'fill-amber-400' : ''}`} />
                      </button>
                      <span className="text-[var(--hub-ink)] font-medium truncate">{t.text}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--hub-surface)] text-[var(--hub-muted)] shrink-0">
                      {t.area}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Today's Agenda */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-700 dark:text-teal-300" />
                <span>3. Today&apos;s Schedule</span>
              </h4>
              {todayMeetings.length === 0 && todayEvents.length === 0 ? (
                <p className="text-xs text-[var(--hub-muted)] p-3 rounded-xl bg-[var(--hub-bg)]">
                  No meetings or events today.
                </p>
              ) : (
                <div className="space-y-1.5 text-xs">
                  {todayMeetings.map((m) => (
                    <div key={m.id} className="p-2.5 rounded-lg bg-[var(--hub-bg)] flex items-center justify-between">
                      <span className="font-medium text-[var(--hub-ink)]">{m.title}</span>
                      <span className="text-[var(--hub-muted)]">{m.start_time}</span>
                    </div>
                  ))}
                  {todayEvents.map((e) => (
                    <div key={e.id} className="p-2.5 rounded-lg bg-[var(--hub-bg)] flex items-center justify-between">
                      <span className="font-medium text-[var(--hub-ink)]">{e.title}</span>
                      <span className="text-[var(--hub-muted)]">{e.start_time || 'All day'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--hub-line)]">
              <button
                onClick={() => setIsDailyPlanningOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleFinishDailyPlan}
                className="px-5 py-2 rounded-xl bg-[var(--hub-accent)] hover:bg-[var(--hub-accent-hover)] text-[var(--hub-accent-ink)] text-xs font-semibold cursor-pointer"
              >
                Save Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Weekly Review Modal */}
      {isWeeklyReviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--hub-line)] pb-4">
              <div>
                <h3 className="text-lg font-bold font-heading text-[var(--hub-ink)] flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-purple-700 dark:text-purple-300" />
                  <span>Weekly Review</span>
                </h3>
                <p className="text-xs text-[var(--hub-muted)] mt-1">
                  Review your completed tasks and check active project progress.
                </p>
              </div>
              <button
                onClick={() => setIsWeeklyReviewOpen(false)}
                className="p-1 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)]">
                1. Completed This Week ({completedPastWeek.length})
              </h4>
              {completedPastWeek.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {completedPastWeek.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl bg-purple-500/5 border border-purple-500/20 flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-[var(--hub-ink)] line-through opacity-80">
                        {t.text}
                      </span>
                      <span className="text-[10px] text-purple-700 dark:text-purple-300 font-semibold">{t.area}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--hub-muted)] p-3 rounded-xl bg-[var(--hub-bg)]">
                  No tasks completed in the last 7 days yet.
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)]">
                2. Active Projects ({allProjects.filter((p) => p.status === 'active' || p.status === 'planning').length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {allProjects
                  .filter((p) => p.status === 'active' || p.status === 'planning')
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[var(--hub-ink)]">{p.title}</span>
                        <span className="text-[10px] text-teal-700 dark:text-teal-300 font-bold">{p.progress}%</span>
                      </div>
                      <div className="w-full bg-[var(--hub-line)] rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-teal-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--hub-line)]">
              <button
                onClick={() => setIsWeeklyReviewOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleFinishWeeklyReview}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold cursor-pointer"
              >
                Save to Notes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast for deleted tasks */}
      <div
        role="status"
        aria-live="polite"
        className="fixed inset-x-0 bottom-24 lg:bottom-6 z-50 flex justify-center px-4 pointer-events-none"
      >
        {pendingDelete && (
          <div
            key={pendingDelete.id}
            className="hub-toast-enter pointer-events-auto relative overflow-hidden flex items-center gap-3 max-w-md w-full sm:w-auto pl-4 pr-2 py-2.5 rounded-2xl bg-[var(--hub-ink)] text-[var(--hub-bg)] shadow-xl"
          >
            <Trash2 className="w-4 h-4 shrink-0 opacity-70" />
            <span className="text-sm min-w-0 flex-1">
              Deleted <span className="font-semibold truncate inline-block max-w-[12rem] sm:max-w-[16rem] align-bottom">"{pendingDelete.text}"</span>
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
              Undo
            </button>
            <span
              aria-hidden="true"
              className="hub-toast-timer absolute left-0 bottom-0 h-0.5 bg-[var(--hub-accent)]"
              style={{ animationDuration: `${UNDO_WINDOW_MS}ms` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
