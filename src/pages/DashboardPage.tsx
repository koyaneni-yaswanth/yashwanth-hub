import React, { useState } from 'react';
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
  Zap,
  Brain,
  ArrowRight,
  Clock,
  ShieldCheck,
  Layers,
  FolderKanban,
  Sun,
  Target,
  Play,
  Pause,
  RotateCcw,
  Eye,
  EyeOff,
  SkipForward,
  CalendarCheck,
  Trophy,
  X,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { db } from '../db';
import type { Task, Area, Priority, NavigationTab } from '../types';
import { formatINR, formatShortDate, getGreeting, getTodayISO, isOverdue, generateId } from '../lib/utils';
import { StatCard } from '../components/common/StatCard';
import { Badge } from '../components/common/Badge';
import { Neo1DeviceCard } from '../components/neo/Neo1DeviceCard';
import { IntegrationVaultService } from '../services/integrationVaultService';

interface DashboardPageProps {
  currentArea: string;
  areas: Area[];
  onNavigate: (tab: any) => void;
  onTurbineSpeedChange?: (duration: number) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  currentArea,
  areas,
  onNavigate,
}) => {
  const today = getTodayISO();
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const currentMonthStr = today.slice(0, 7);

  // V3F Target Calculation (15 November 2026)
  const v3fTargetDate = new Date('2026-11-15T23:59:59+05:30').getTime();
  const daysToV3F = Math.max(0, Math.ceil((v3fTargetDate - Date.now()) / (1000 * 60 * 60 * 24)));
  const taskInputRef = React.useRef<HTMLInputElement>(null);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Quick Task Form State
  const [quickText, setQuickText] = useState('');
  const [quickArea, setQuickArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [quickDate, setQuickDate] = useState(today);
  const [quickPriority, setQuickPriority] = useState<Priority>('medium');

  // Live queries from IndexedDB
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allEvents = useLiveQuery(() => db.events.toArray(), []) || [];
  const allMeetings = useLiveQuery(() => db.meetings.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const pinnedNotes = useLiveQuery(
    () => db.notes.filter((n) => n.pinned).toArray(),
    []
  ) || [];

  // Planning & Review Modal States
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

  // Calculate wind plan progress
  const planTasks = allTasks.filter((t) => t.plan !== undefined);
  const planCompleted = planTasks.filter((t) => t.done).length;
  const planPercentage = planTasks.length > 0 ? Math.round((planCompleted / planTasks.length) * 100) : 0;

  // "What should I do next?" Recommendation & Focus Mode state
  const [recommendationSkipIndex, setRecommendationSkipIndex] = useState(0);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  React.useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && focusSeconds > 0) {
      interval = setInterval(() => setFocusSeconds((s) => s - 1), 1000);
    } else if (focusSeconds === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, focusSeconds]);

  // Multi-dimensional Task Recommendation Engine
  interface ScoredTask {
    task: Task;
    score: number;
    reasons: string[];
  }

  const scoredCandidateTasks: ScoredTask[] = React.useMemo(() => {
    return openTasks
      .map((t) => {
        let score = 0;
        const reasons: string[] = [];

        // 1. Deadline Urgency
        if (t.due_date) {
          if (t.due_date < today) {
            score += 50;
            reasons.push('Overdue (+50)');
          } else if (t.due_date === today) {
            score += 35;
            reasons.push('Due today (+35)');
          } else if (t.due_date <= nextWeek) {
            score += 15;
            reasons.push('Approaching (+15)');
          } else {
            score += 5;
          }
        }

        // 2. Priority Weight
        if (t.priority === 'urgent') {
          score += 40;
          reasons.push('Urgent priority (+40)');
        } else if (t.priority === 'high') {
          score += 25;
          reasons.push('High priority (+25)');
        } else if (t.priority === 'medium') {
          score += 10;
        }

        // 3. Starred / Focus Flag
        if (t.starred) {
          score += 20;
          reasons.push('Starred focus (+20)');
        }

        // 4. Milestone / Plan Association
        if (t.plan !== undefined) {
          score += 15;
          reasons.push('Milestone deliverable (+15)');
        }

        // 5. Active Workspace Alignment
        if (currentArea !== 'All' && t.area === currentArea) {
          score += 10;
          reasons.push(`${currentArea} workspace (+10)`);
        }

        return { task: t, score, reasons };
      })
      .sort((a, b) => b.score - a.score);
  }, [openTasks, today, nextWeek, currentArea]);

  const candidateTasks = scoredCandidateTasks.map((s) => s.task);
  const activeRecommendationItem = scoredCandidateTasks.length > 0
    ? scoredCandidateTasks[recommendationSkipIndex % scoredCandidateTasks.length]
    : null;
  const activeRecommendation = activeRecommendationItem ? activeRecommendationItem.task : null;

  const sevenDaysAgo = React.useMemo(() => {
    return new Date(Date.now() - 7 * 86400000).toISOString();
  }, []);

  const overdueTasks = React.useMemo(() => {
    return openTasks.filter((t) => t.due_date && t.due_date < today);
  }, [openTasks, today]);

  const completedPastWeek = React.useMemo(() => {
    return allTasks.filter((t) => t.done && (t.updated_at || '') >= sevenDaysAgo);
  }, [allTasks, sevenDaysAgo]);

  const todayEvents = React.useMemo(() => {
    return allEvents.filter((e) => e.date === today);
  }, [allEvents, today]);

  const todayMeetings = React.useMemo(() => {
    return allMeetings.filter((m) => m.date === today && m.status === 'scheduled');
  }, [allMeetings, today]);

  const handleMoveToToday = async (task: Task) => {
    await db.tasks.update(task.id, {
      due_date: today,
      updated_at: new Date().toISOString(),
    });
  };

  const handleFinishDailyPlan = () => {
    setDailyPlanNotice('Daily Plan locked in! Top focus priorities configured for today.');
    setIsDailyPlanningOpen(false);
    setTimeout(() => setDailyPlanNotice(null), 5000);
  };

  const handleFinishWeeklyReview = async () => {
    try {
      await db.notes.add({
        id: generateId(),
        title: `Weekly Review — ${today}`,
        body: `Weekly Founder Retrospective (${today}):\n• Completed tasks this week: ${completedPastWeek.length}\n• Open backlog items: ${openTasks.length}\n• Active projects tracked: ${allProjects.filter((p) => p.status === 'active' || p.status === 'planning').length}\n\nStrategic alignment verified across Pawan Shakti, Robotics, and Personal areas.`,
        area: currentArea !== 'All' ? currentArea : 'FOUNDER STRATEGY',
        pinned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setWeeklyReviewNotice('Weekly Review recorded to Notes successfully!');
    } catch (err) {
      console.warn('Could not record review note:', err);
    }
    setIsWeeklyReviewOpen(false);
    setTimeout(() => setWeeklyReviewNotice(null), 5000);
  };

  // Next 7 days upcoming events & meetings
  const upcomingEvents = (currentArea === 'All' ? allEvents : allEvents.filter((e) => e.area === currentArea))
    .filter((e) => e.date >= today && e.date <= nextWeek)
    .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')));

  const upcomingMeetings = (currentArea === 'All' ? allMeetings : allMeetings.filter((m) => m.area === currentArea))
    .filter((m) => m.date >= today && m.date <= nextWeek && m.status === 'scheduled')
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));

  // Current month expenses
  const monthExpenses = (currentArea === 'All' ? allExpenses : allExpenses.filter((e) => e.area === currentArea))
    .filter((e) => e.date.startsWith(currentMonthStr))
    .reduce((sum, e) => sum + e.amount, 0);

  // Quick Task Submit
  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickText.trim()) return;

    const now = new Date().toISOString();
    const newTask: Task = {
      id: generateId(),
      text: quickText.trim(),
      area: quickArea,
      priority: quickPriority,
      due_date: quickDate || undefined,
      starred: false,
      done: false,
      created_at: now,
      updated_at: now,
    };

    await db.tasks.add(newTask);
    setQuickText('');
  };

  const handleToggleTask = async (task: Task) => {
    await db.tasks.update(task.id, {
      done: !task.done,
      updated_at: new Date().toISOString(),
    });
  };

  const handleToggleStar = async (task: Task) => {
    await db.tasks.update(task.id, {
      starred: !task.starred,
      updated_at: new Date().toISOString(),
    });
  };

  const handleDeleteTask = async (id: string) => {
    await db.tasks.delete(id);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome & Command Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            {getGreeting('Yaswanth')}
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-1">
            Founder command dashboard • {currentArea === 'All' ? 'All Workspaces' : currentArea}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => onNavigate('my-day')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-all cursor-pointer"
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>My Day</span>
          </button>
          <button
            onClick={() => setIsDailyPlanningOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-500/20 transition-all cursor-pointer"
            title="Open interactive Daily Planning workflow"
          >
            <CalendarCheck className="w-3.5 h-3.5 text-indigo-500" />
            <span>Plan My Day</span>
          </button>
          <button
            onClick={() => setIsWeeklyReviewOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-semibold hover:bg-purple-500/20 transition-all cursor-pointer"
            title="Open interactive Weekly Review workflow"
          >
            <Trophy className="w-3.5 h-3.5 text-purple-500" />
            <span>Weekly Review</span>
          </button>
          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              isFocusMode
                ? 'bg-[var(--hub-accent)] text-white border-[var(--hub-accent)]'
                : 'bg-[var(--hub-surface)] border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-surface-subtle)]'
            }`}
          >
            {isFocusMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{isFocusMode ? 'Exit Focus' : 'Focus'}</span>
          </button>
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[var(--hub-ink)] text-xs font-semibold hover:bg-[var(--hub-surface-subtle)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Sync tasks with Google Tasks and NeoSapien"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[var(--hub-accent)]' : 'text-[var(--hub-muted)]'}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
          </button>
          {planTasks.length > 0 && (
            <button
              onClick={() => onNavigate('wind-plan')}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-800 dark:text-teal-200 text-xs font-semibold hover:bg-teal-500/20 transition-all cursor-pointer"
            >
              <Wind className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span>90-Day Plan: {planPercentage}% TRL Progress</span>
            </button>
          )}
        </div>
      </div>

      {/* Workflow Notice Banners */}
      {dailyPlanNotice && (
        <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>{dailyPlanNotice}</span>
          </span>
          <button onClick={() => setDailyPlanNotice(null)} className="text-xs hover:underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {weeklyReviewNotice && (
        <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-purple-500 shrink-0" />
            <span>{weeklyReviewNotice}</span>
          </span>
          <button onClick={() => setWeeklyReviewNotice(null)} className="text-xs hover:underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Focus Mode Distraction-Free Workspace */}
      {isFocusMode && (
        <div className="rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-[var(--hub-surface)] to-[var(--hub-card-hover)] border-2 border-[var(--hub-accent)] shadow-xl space-y-4 animate-scale-up">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--hub-accent)] flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              <span>Distraction-Free Focus Workspace</span>
            </span>
            <button
              onClick={() => setIsFocusMode(false)}
              className="text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)]"
            >
              Close Focus View
            </button>
          </div>

          <div className="text-center py-4 space-y-3">
            <div className="text-4xl sm:text-6xl font-extrabold font-mono text-[var(--hub-ink)] tracking-wider">
              {String(Math.floor(focusSeconds / 60)).padStart(2, '0')}:
              {String(focusSeconds % 60).padStart(2, '0')}
            </div>

            {activeRecommendation ? (
              <div className="max-w-md mx-auto">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-[var(--hub-bg)] border border-[var(--hub-line)] text-teal-400">
                  {activeRecommendation.area}
                </span>
                <h3 className="text-lg font-bold text-[var(--hub-ink)] mt-2">
                  {activeRecommendation.text}
                </h3>
              </div>
            ) : (
              <p className="text-sm text-[var(--hub-muted)]">No active task selected • Deep Work in progress</p>
            )}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setIsTimerRunning(!isTimerRunning)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer shadow-sm"
              >
                {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isTimerRunning ? 'Pause' : 'Start Focus'}</span>
              </button>
              <button
                onClick={() => {
                  setIsTimerRunning(false);
                  setFocusSeconds(25 * 60);
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-surface-subtle)] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset (25m)</span>
              </button>
              {activeRecommendation && (
                <button
                  onClick={() => {
                    handleToggleTask(activeRecommendation);
                    setRecommendationSkipIndex((p) => p + 1);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Mark Done</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* "What Should I Do Next?" Intelligent Recommendation Card */}
      {!isFocusMode && activeRecommendation && activeRecommendationItem && (
        <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-teal-500/10 via-[var(--hub-surface)] to-[var(--hub-surface)] border border-teal-500/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-400">
                  What To Do Next
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  Score: {activeRecommendationItem.score} pts
                </span>
                <span className="text-xs text-[var(--hub-muted)]">
                  • {activeRecommendation.area}
                </span>
              </div>
              <h3 className="text-base font-bold text-[var(--hub-ink)] mt-1 font-heading">
                {activeRecommendation.text}
              </h3>
              <p className="text-xs text-[var(--hub-muted)] mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-teal-500 dark:text-teal-400">Factors:</span>
                <span>
                  {activeRecommendationItem.reasons.length > 0
                    ? activeRecommendationItem.reasons.join(' • ')
                    : 'Standard backlog order'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setIsFocusMode(true);
                setIsTimerRunning(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start Focus</span>
            </button>
            <button
              onClick={() => handleToggleTask(activeRecommendation)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
            <button
              onClick={() => setRecommendationSkipIndex((prev) => prev + 1)}
              title="Next candidate recommendation"
              className="p-2 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)] transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Real-time KPI Stats Grid */}
      <div data-agent-target="stats-grid" className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Due & Overdue"
          value={dueAndOverdueTasks.length}
          subtext={dueAndOverdueTasks.length === 0 ? 'All caught up' : `${dueAndOverdueTasks.length} require action today`}
          icon={<AlertCircle className={`w-5 h-5 ${dueAndOverdueTasks.length > 0 ? 'text-red-500' : 'text-teal-500'}`} />}
          onClick={() => onNavigate('tasks')}
        />
        <StatCard
          label="Open Tasks"
          value={openTasks.length}
          subtext={`${tasks.filter((t) => t.done).length} completed`}
          icon={<CheckCircle2 className="w-5 h-5 text-teal-600" />}
          onClick={() => onNavigate('tasks')}
        />
        <StatCard
          label="Spent This Month"
          value={monthExpenses === 0 ? '₹0' : formatINR(monthExpenses)}
          subtext={monthExpenses === 0 ? 'No expenses logged yet • Manually entered only' : `Current cycle (${today.slice(0, 7)})`}
          icon={<IndianRupee className="w-5 h-5 text-amber-600" />}
          onClick={() => onNavigate('expenses')}
        />
        <StatCard
          label="Schedule (7 Days)"
          value={upcomingEvents.length + upcomingMeetings.length}
          subtext={`${upcomingMeetings.length} meetings, ${upcomingEvents.length} events`}
          icon={<Calendar className="w-5 h-5 text-blue-600" />}
          onClick={() => onNavigate('calendar')}
        />
      </div>
 
      {/* Real-time Neo 1 & Ecosystem Telemetry Card */}
      <div data-agent-target="automations-card">
        <Neo1DeviceCard />
      </div>

      {/* Universal Quick-Action Bar */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-4 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--hub-accent)]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)] font-heading">
              Universal Quick Actions
            </span>
          </div>
          <span className="text-[11px] text-[var(--hub-muted)]">
            One-click execution across all 14 operating hubs
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <button
            type="button"
            onClick={() => onNavigate('ai-assistant')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-xs font-medium transition-all group cursor-pointer"
          >
            <Sparkles className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span>Ask AI</span>
          </button>
          <button
            type="button"
            onClick={() => {
              taskInputRef.current?.focus();
              taskInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 text-xs font-medium transition-all group cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span>Create Task</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/20 text-xs font-medium transition-all group cursor-pointer"
          >
            <Calendar className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span>Schedule Event</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('automations')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-xs font-medium transition-all group cursor-pointer"
          >
            <Zap className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span>Automation</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 text-xs font-medium transition-all group cursor-pointer"
          >
            <FolderKanban className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span>Add Update</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/20 text-xs font-medium transition-all group cursor-pointer"
          >
            <IndianRupee className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span>Record Expense</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('knowledge-memory')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/20 text-xs font-medium transition-all group cursor-pointer"
          >
            <Brain className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span>Capture Note</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('health-routine')}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20 text-xs font-medium transition-all group cursor-pointer"
          >
            <Clock className="w-4 h-4 mb-1 group-hover:scale-110 transition-transform" />
            <span>Work Session</span>
          </button>
        </div>
      </div>

      {/* Strategic Founder Workspaces Hub */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pawan Shakti Card */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-teal-500/50 transition-all">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                <Wind className="w-4 h-4" />
                <span>Pawan Shakti</span>
              </span>
              <Badge variant="teal">TRL 4 Prototype</Badge>
            </div>
            <h4 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              Low-Wind Planetary Gearbox System
            </h4>
            <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
              Verified TRL 4 benchtop prototype with published Indian patent ("Compact Wind Turbine with Planetary Gears"). Closed-loop P-v testing toward TRL 5 target in progress.
            </p>
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-between text-xs">
              <span className="font-semibold text-teal-800 dark:text-teal-200">V3F Assessment</span>
              <span className="font-mono font-bold text-teal-700 dark:text-teal-300">
                {daysToV3F} days left (15 Nov)
              </span>
            </div>
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
              <span className="flex items-center gap-1.5 text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                <Bot className="w-4 h-4" />
                <span>Robotics Lab</span>
              </span>
              <Badge variant="purple">Experiment Logbook</Badge>
            </div>
            <h4 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              PiPER, Drone Swarm & mmWave Radar
            </h4>
            <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
              Persistent hardware & software experiment workspace for AgileX PiPER, 3-drone swarm coordination, and TI AWR2944 mmWave perception.
            </p>
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--hub-bg)] border border-[var(--hub-line)] font-mono">
                ROS 2 / CAN
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--hub-bg)] border border-[var(--hub-line)] font-mono">
                Swarm Notes
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--hub-bg)] border border-[var(--hub-line)] font-mono">
                mmWave Spec
              </span>
            </div>
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

        {/* Founder Routine & Health Card */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:border-rose-500/50 transition-all">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                <Heart className="w-4 h-4" />
                <span>Founder Routine</span>
              </span>
              <Badge variant="gray">Daily Check-In</Badge>
            </div>
            <h4 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              Sleep, Energy & Deep Work Log
            </h4>
            <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
              Log your daily sleep hours, deep engineering blocks, and operating checklist cleanly across sessions.
            </p>
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs">
              <span className="font-semibold text-rose-800 dark:text-rose-200">Check-In Status</span>
              <span className="font-mono font-bold text-rose-700 dark:text-rose-300">
                Open Daily Tracker
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('health-routine')}
            className="mt-4 flex items-center justify-between w-full px-3.5 py-2 rounded-xl bg-[var(--hub-bg)] hover:bg-[var(--hub-surface-subtle)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] transition-colors cursor-pointer group"
          >
            <span>View Routine Protocol</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Quick Add Task Box */}
      <div data-agent-target="quick-actions" className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 shadow-xs">
        <form onSubmit={handleQuickAdd} className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={taskInputRef}
              type="text"
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder="Quick add a task or founder action..."
              className="flex-1 px-3.5 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] placeholder:text-[var(--hub-muted)]"
              required
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer flex-none shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Task</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            {/* Area select */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--hub-muted)] font-medium">Area:</span>
              <select
                value={quickArea}
                onChange={(e) => setQuickArea(e.target.value)}
                className="py-1 px-2 rounded-md border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Due date */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--hub-muted)] font-medium">Due:</span>
              <input
                type="date"
                value={quickDate}
                onChange={(e) => setQuickDate(e.target.value)}
                className="py-1 px-2 rounded-md border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
              />
            </div>

            {/* Priority */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--hub-muted)] font-medium">Priority:</span>
              <select
                value={quickPriority}
                onChange={(e) => setQuickPriority(e.target.value as Priority)}
                className="py-1 px-2 rounded-md border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
        </form>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Tasks Due Today & Overdue */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-lg text-[var(--hub-ink)] flex items-center gap-2">
              <span>Due Today & Overdue</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-bold border border-red-500/20">
                {dueAndOverdueTasks.length}
              </span>
            </h3>
            <button
              onClick={() => onNavigate('tasks')}
              className="text-xs font-semibold text-[var(--hub-accent)] hover:underline"
            >
              View all tasks →
            </button>
          </div>

          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl divide-y divide-[var(--hub-line)] overflow-hidden shadow-xs">
            {dueAndOverdueTasks.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--hub-muted)]">
                <Check className="w-8 h-8 mx-auto text-teal-600 mb-2 opacity-80" />
                <p className="font-medium text-[var(--hub-ink)]">Nothing due or overdue!</p>
                <p className="text-xs mt-1">Pick a task from your task list and make progress.</p>
              </div>
            ) : (
              dueAndOverdueTasks.map((task) => {
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
                      className="mt-1 w-4 h-4 rounded text-[var(--hub-accent)] focus:ring-[var(--hub-accent)] cursor-pointer flex-none"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--hub-ink)] break-words">
                          {task.text}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <Badge variant="teal">{task.area}</Badge>
                        {task.priority === 'urgent' && <Badge variant="red">Urgent</Badge>}
                        {task.priority === 'high' && <Badge variant="amber">High</Badge>}
                        {task.due_date && (
                          <span
                            className={`text-xs font-medium ${
                              overdue ? 'text-red-600 dark:text-red-400 font-bold' : 'text-[var(--hub-muted)]'
                            }`}
                          >
                            {overdue ? 'Overdue: ' : 'Due: '}
                            {formatShortDate(task.due_date)}
                          </span>
                        )}
                        {task.google_task_id ? (
                          <Badge variant="blue" dot>Google Tasks</Badge>
                        ) : task.synced ? (
                          <Badge variant="emerald" dot>Cloud</Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={() => handleToggleStar(task)}
                        className="p-1 rounded text-amber-500 hover:bg-[var(--hub-bg)] cursor-pointer"
                        title={task.starred ? 'Unstar' : 'Star'}
                      >
                        <Star className={`w-4 h-4 ${task.starred ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Delete task"
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

        {/* Right Column: Upcoming Schedule (Next 7 Days) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-lg text-[var(--hub-ink)] flex items-center gap-2">
              <span>Upcoming in 7 Days</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-bold border border-blue-500/20">
                {upcomingEvents.length + upcomingMeetings.length}
              </span>
            </h3>
            <button
              onClick={() => onNavigate('calendar')}
              className="text-xs font-semibold text-[var(--hub-accent)] hover:underline"
            >
              Open calendar →
            </button>
          </div>

          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl divide-y divide-[var(--hub-line)] overflow-hidden shadow-xs">
            {upcomingEvents.length === 0 && upcomingMeetings.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--hub-muted)]">
                <Calendar className="w-8 h-8 mx-auto text-blue-500 mb-2 opacity-80" />
                <p className="font-medium text-[var(--hub-ink)]">No events scheduled this week</p>
                <p className="text-xs mt-1">Add a meeting, field test, or deadline from the Calendar.</p>
              </div>
            ) : (
              <>
                {/* Meetings */}
                {upcomingMeetings.map((m) => (
                  <div key={m.id} className="p-3.5 hover:bg-[var(--hub-bg)]/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                            Meeting
                          </span>
                          <span className="text-xs text-[var(--hub-muted)]">
                            {formatShortDate(m.date)} at {m.start_time}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-[var(--hub-ink)] mt-0.5">
                          {m.title}
                        </h4>
                        {m.attendees && (
                          <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                            With: {m.attendees}
                          </p>
                        )}
                      </div>
                      <Badge variant="purple">{m.area}</Badge>
                    </div>
                  </div>
                ))}

                {/* Events */}
                {upcomingEvents.map((e) => (
                  <div key={e.id} className="p-3.5 hover:bg-[var(--hub-bg)]/50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
                            {e.kind}
                          </span>
                          <span className="text-xs text-[var(--hub-muted)]">
                            {formatShortDate(e.date)} {e.start_time ? `at ${e.start_time}` : ''}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-[var(--hub-ink)] mt-0.5">
                          {e.title}
                        </h4>
                        {e.place && (
                          <p className="text-xs text-[var(--hub-muted)] flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-[var(--hub-muted)]" />
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

      {/* Pinned Notes Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-lg text-[var(--hub-ink)] flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            <span>Pinned Notes & Directives</span>
          </h3>
          <button
            onClick={() => onNavigate('notes')}
            className="text-xs font-semibold text-[var(--hub-accent)] hover:underline"
          >
            Manage notes →
          </button>
        </div>

        {pinnedNotes.length === 0 ? (
          <div className="p-6 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl text-center text-sm text-[var(--hub-muted)]">
            Pin important notes in the Notes module to keep key founder principles here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pinnedNotes.map((note) => (
              <div
                key={note.id}
                className="bg-[var(--hub-surface)] border-l-4 border-l-[var(--hub-amber)] border border-[var(--hub-line)] rounded-xl p-4 shadow-xs hover:border-[var(--hub-accent)] transition-all"
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
        )}
      </div>

      {/* Interactive Daily Planning Modal */}
      {isDailyPlanningOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--hub-line)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                    <CalendarCheck className="w-5 h-5" />
                  </span>
                  <h3 className="text-lg font-bold font-heading text-[var(--hub-ink)]">
                    Daily Planning — Founder Execution Cadence
                  </h3>
                </div>
                <p className="text-xs text-[var(--hub-muted)] mt-1">
                  Triage overdue tasks, confirm your top daily focus targets, and inspect commitments.
                </p>
              </div>
              <button
                onClick={() => setIsDailyPlanningOpen(false)}
                className="p-1 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-subtle)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Overdue Triage Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)] flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span>1. Overdue Tasks Triage ({overdueTasks.length})</span>
                </h4>
                {overdueTasks.length === 0 && (
                  <span className="text-xs font-semibold text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> All clean
                  </span>
                )}
              </div>

              {overdueTasks.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {overdueTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[var(--hub-ink)] truncate">{t.text}</div>
                        <div className="text-[10px] text-red-400">Due {t.due_date} • {t.area}</div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleMoveToToday(t)}
                          className="px-2.5 py-1 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-indigo-400 hover:bg-indigo-500/10 font-medium cursor-pointer"
                        >
                          Move to Today
                        </button>
                        <button
                          onClick={() => handleToggleTask(t)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 font-medium cursor-pointer"
                        >
                          Mark Done
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--hub-muted)] p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                  No overdue items pending. Your operational velocity is on schedule.
                </p>
              )}
            </div>

            {/* Top Focus Selection */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)] flex items-center gap-1.5">
                <Target className="w-4 h-4 text-indigo-500" />
                <span>2. Recommended Focus Priorities</span>
              </h4>
              <p className="text-xs text-[var(--hub-muted)]">
                Star tasks to anchor them as your top founder focus priorities for today.
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {candidateTasks.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        onClick={() => handleToggleStar(t)}
                        className={`p-1 rounded-md cursor-pointer ${t.starred ? 'text-amber-400' : 'text-[var(--hub-muted)] hover:text-amber-400'}`}
                        title={t.starred ? 'Starred focus' : 'Click to star'}
                      >
                        <Star className={`w-4 h-4 ${t.starred ? 'fill-amber-400' : ''}`} />
                      </button>
                      <span className="text-[var(--hub-ink)] font-medium truncate">{t.text}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--hub-surface)] text-[var(--hub-muted)]">
                        {t.area}
                      </span>
                      <button
                        onClick={() => handleToggleTask(t)}
                        className="p-1 rounded-md text-[var(--hub-muted)] hover:text-emerald-400 cursor-pointer"
                        title="Mark Done"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Today's Agenda Preview */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-500" />
                <span>3. Today's Agenda & Commitments</span>
              </h4>
              {todayMeetings.length === 0 && todayEvents.length === 0 ? (
                <p className="text-xs text-[var(--hub-muted)] p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                  Clear schedule today! Uninterrupted deep work blocks available.
                </p>
              ) : (
                <div className="space-y-1.5 text-xs">
                  {todayMeetings.map((m) => (
                    <div key={m.id} className="p-2.5 rounded-lg bg-[var(--hub-bg)] flex items-center justify-between">
                      <span className="font-medium text-[var(--hub-ink)]">Meeting: {m.title}</span>
                      <span className="text-[var(--hub-muted)]">{m.start_time}</span>
                    </div>
                  ))}
                  {todayEvents.map((e) => (
                    <div key={e.id} className="p-2.5 rounded-lg bg-[var(--hub-bg)] flex items-center justify-between">
                      <span className="font-medium text-[var(--hub-ink)]">{e.kind}: {e.title}</span>
                      <span className="text-[var(--hub-muted)]">{e.start_time || 'All day'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--hub-line)]">
              <button
                onClick={() => setIsDailyPlanningOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-surface-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleFinishDailyPlan}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Lock Daily Plan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Weekly Review Modal */}
      {isWeeklyReviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--hub-line)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                    <Trophy className="w-5 h-5" />
                  </span>
                  <h3 className="text-lg font-bold font-heading text-[var(--hub-ink)]">
                    Weekly Strategic Review — Retrospective
                  </h3>
                </div>
                <p className="text-xs text-[var(--hub-muted)] mt-1">
                  Celebrate execution velocity, verify active project milestones, and triage backlog risks.
                </p>
              </div>
              <button
                onClick={() => setIsWeeklyReviewOpen(false)}
                className="p-1 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-subtle)] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Wins Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)] flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-purple-500" />
                  <span>1. Execution Wins (Past 7 Days: {completedPastWeek.length} Completed)</span>
                </h4>
              </div>
              {completedPastWeek.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {completedPastWeek.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl bg-purple-500/5 border border-purple-500/20 flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-[var(--hub-ink)] line-through opacity-80">{t.text}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--hub-surface)] text-purple-400 font-semibold">
                        {t.area}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--hub-muted)] p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                  No completed items recorded in the last 7 days. Focus on moving open tasks to done!
                </p>
              )}
            </div>

            {/* Project Progress Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)] flex items-center gap-1.5">
                <FolderKanban className="w-4 h-4 text-teal-500" />
                <span>2. Active Projects & Milestones ({allProjects.filter((p) => p.status === 'active' || p.status === 'planning').length})</span>
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {allProjects.filter((p) => p.status === 'active' || p.status === 'planning').map((p) => (
                  <div key={p.id} className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--hub-ink)]">{p.title}</span>
                      <span className="text-[10px] text-teal-400 font-bold">{p.progress}% Complete</span>
                    </div>
                    <div className="w-full bg-[var(--hub-line)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-teal-500 h-1.5 rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-[var(--hub-muted)] flex items-center justify-between">
                      <span>Area: {p.area}</span>
                      <span>Target: {p.target_date || 'Ongoing'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--hub-line)]">
              <button
                onClick={() => setIsWeeklyReviewOpen(false)}
                className="px-4 py-2 rounded-xl border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-surface-subtle)] cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={handleFinishWeeklyReview}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Log Retrospective & Finish</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
