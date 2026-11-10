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
  const pinnedNotes = useLiveQuery(
    () => db.notes.filter((n) => n.pinned).toArray(),
    []
  ) || [];

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

  // Priority sorted tasks for next recommendation
  const candidateTasks = [...openTasks].sort((a, b) => {
    const aDueToday = a.due_date && a.due_date <= today;
    const bDueToday = b.due_date && b.due_date <= today;
    if (aDueToday && !bDueToday) return -1;
    if (!aDueToday && bDueToday) return 1;
    if ((a.starred || a.priority === 'urgent') && !(b.starred || b.priority === 'urgent')) return -1;
    if (!(a.starred || a.priority === 'urgent') && (b.starred || b.priority === 'urgent')) return 1;
    return 0;
  });

  const activeRecommendation = candidateTasks.length > 0
    ? candidateTasks[recommendationSkipIndex % candidateTasks.length]
    : null;

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
      {!isFocusMode && activeRecommendation && (
        <div className="rounded-2xl p-4 sm:p-5 bg-gradient-to-r from-teal-500/10 via-[var(--hub-surface)] to-[var(--hub-surface)] border border-teal-500/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 shrink-0">
              <Target className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-400">
                  What To Do Next
                </span>
                <span className="text-xs text-[var(--hub-muted)]">
                  • High Conviction ({activeRecommendation.area})
                </span>
              </div>
              <h3 className="text-base font-bold text-[var(--hub-ink)] mt-1 font-heading">
                {activeRecommendation.text}
              </h3>
              <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                Rationale: {activeRecommendation.priority === 'urgent' ? 'Flagged as urgent priority' : activeRecommendation.due_date && activeRecommendation.due_date <= today ? 'Scheduled for today' : 'High impact project milestone'} • Est: 30-45 mins
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
    </div>
  );
};
