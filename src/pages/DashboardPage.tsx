import React, { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { JarvisCommandCenter } from '../components/jarvis/JarvisCommandCenter';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  Clock,
  RefreshCw,
  Star,
  Trash2,
  Trophy,
  X,
  CalendarCheck,
  Undo2,
  Check,
} from 'lucide-react';
import { db } from '../db';
import type { Task, Area, Priority } from '../types';
import {
  formatShortDate,
  getGreeting,
  getTodayISO,
  toDueKey,
  dueStatus,
  generateId,
} from '../lib/utils';
import { IntegrationVaultService } from '../services/integrationVaultService';
import { handOffFocusTask } from '../lib/focusHandoff';
import { MomentumChip } from '../components/momentum/MomentumChip';
import { TaskService } from '../services/sync/taskService';
import {
  buildHudWorkspaceNodes,
  collectDeadlines,
  deriveCoreState,
} from '../lib/jarvisHud';
import { getAiActivityPhase, subscribeAiActivity } from '../lib/aiActivity';
import { JarvisHudProvider } from '../context/JarvisHudContext';
import { useJarvisHud } from '../context/jarvisHudStore';
import { HudFrameOverlay } from '../components/jarvis/HudFrameOverlay';
import { HudRightPanel } from '../components/jarvis/HudRightPanel';
import { HudMissionDock } from '../components/jarvis/HudMissionDock';
import { HudAiCaptureBar } from '../components/jarvis/HudAiCaptureBar';

interface DashboardPageProps {
  currentArea: string;
  areas: Area[];
  onNavigate: (tab: any) => void;
  onOpenQuickCapture?: () => void;
  onTurbineSpeedChange?: (duration: number) => void;
  /** Sets the global area filter (used by area nodes in the command centre). */
  onSelectArea?: (area: string) => void;
}

const NO_ARR: never[] = [];

export const DashboardPage: React.FC<DashboardPageProps> = ({
  currentArea,
  areas,
  onNavigate,
  onOpenQuickCapture,
  onSelectArea,
}) => {
  const today = getTodayISO();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);
  const nextWeek = React.useMemo(
    () => new Date(nowMs + 7 * 86400000).toISOString().slice(0, 10),
    [nowMs]
  );
  const sevenDaysAgo = React.useMemo(
    () => new Date(nowMs - 7 * 86400000).toISOString(),
    [nowMs]
  );
  const currentMonthStr = today.slice(0, 7);

  // Live Dexie Queries (real local-first stores + sync_queue)
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NO_ARR;
  const allEvents = useLiveQuery(() => db.events.toArray(), []) ?? NO_ARR;
  const allMeetings = useLiveQuery(() => db.meetings.toArray(), []) ?? NO_ARR;
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) ?? NO_ARR;
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) ?? NO_ARR;
  const allNotes = useLiveQuery(() => db.notes.toArray(), []) ?? NO_ARR;
  const allHabits = useLiveQuery(() => db.habits.toArray(), []) ?? NO_ARR;
  const allHabitLogs = useLiveQuery(() => db.habit_logs.toArray(), []) ?? NO_ARR;
  const roboticsRecords = useLiveQuery(() => db.robotics_records.count(), []) ?? 0;
  const neoMemoriesCount = useLiveQuery(() => db.neo_memories.count(), []) ?? 0;

  const pinnedNotes = React.useMemo(() => allNotes.filter((n) => n.pinned), [allNotes]);
  const aiPhase = useSyncExternalStore(subscribeAiActivity, getAiActivityPhase, () => 'idle' as const);

  const tasks = React.useMemo(
    () => (currentArea === 'All' ? allTasks : allTasks.filter((t) => t.area === currentArea)),
    [allTasks, currentArea]
  );
  const openTasks = React.useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const dueAndOverdueTasks = React.useMemo(
    () =>
      openTasks
        .filter((t) => {
          const st = dueStatus(t.due_date, t.done, today);
          return st === 'overdue' || st === 'today';
        })
        .sort((a, b) => {
          if (a.starred && !b.starred) return -1;
          if (!a.starred && b.starred) return 1;
          return toDueKey(a.due_date).localeCompare(toDueKey(b.due_date));
        }),
    [openTasks, today]
  );
  const overdueCount = React.useMemo(
    () => dueAndOverdueTasks.filter((t) => dueStatus(t.due_date, t.done, today) === 'overdue').length,
    [dueAndOverdueTasks, today]
  );
  const dueTodayCount = dueAndOverdueTasks.length - overdueCount;

  const hudNodes = React.useMemo(
    () =>
      buildHudWorkspaceNodes({
        today,
        recentCutoffISO: sevenDaysAgo,
        tasks: allTasks,
        projects: allProjects,
        notes: allNotes,
        expenses: allExpenses,
        habits: allHabits,
        habitLogs: allHabitLogs,
        roboticsRecords,
        neoMemoriesCount,
      }),
    [
      today,
      sevenDaysAgo,
      allTasks,
      allProjects,
      allNotes,
      allExpenses,
      allHabits,
      allHabitLogs,
      roboticsRecords,
      neoMemoriesCount,
    ]
  );

  const coreState = React.useMemo(
    () => deriveCoreState({ aiPhase, overdueCount, dueTodayCount }),
    [aiPhase, overdueCount, dueTodayCount]
  );

  const deadlines = React.useMemo(
    () =>
      collectDeadlines({
        tasks,
        events: currentArea === 'All' ? allEvents : allEvents.filter((e) => e.area === currentArea),
        meetings: currentArea === 'All' ? allMeetings : allMeetings.filter((m) => m.area === currentArea),
        nowMs,
        todayISO: today,
        nextWeekISO: nextWeek,
      }),
    [tasks, allEvents, allMeetings, currentArea, nowMs, today, nextWeek]
  );

  return (
    <JarvisHudProvider hudNodes={hudNodes} coreState={coreState}>
      <DashboardHudShell
        currentArea={currentArea}
        areas={areas}
        onNavigate={onNavigate}
        onOpenQuickCapture={onOpenQuickCapture}
        onSelectArea={onSelectArea}
        today={today}
        nextWeek={nextWeek}
        sevenDaysAgo={sevenDaysAgo}
        currentMonthStr={currentMonthStr}
        allTasks={allTasks}
        tasks={tasks}
        openTasks={openTasks}
        dueAndOverdueTasks={dueAndOverdueTasks}
        overdueCount={overdueCount}
        dueTodayCount={dueTodayCount}
        allEvents={allEvents}
        allMeetings={allMeetings}
        allExpenses={allExpenses}
        allProjects={allProjects}
        pinnedNotes={pinnedNotes}
        deadlines={deadlines}
      />
    </JarvisHudProvider>
  );
};

interface ShellProps {
  currentArea: string;
  areas: Area[];
  onNavigate: (tab: any) => void;
  onOpenQuickCapture?: () => void;
  onSelectArea?: (area: string) => void;
  today: string;
  nextWeek: string;
  sevenDaysAgo: string;
  currentMonthStr: string;
  allTasks: Task[];
  tasks: Task[];
  openTasks: Task[];
  dueAndOverdueTasks: Task[];
  overdueCount: number;
  dueTodayCount: number;
  allEvents: any[];
  allMeetings: any[];
  allExpenses: any[];
  allProjects: any[];
  pinnedNotes: any[];
  deadlines: ReturnType<typeof collectDeadlines>;
}

const DashboardHudShell: React.FC<ShellProps> = ({
  currentArea,
  areas,
  onNavigate,
  onOpenQuickCapture,
  onSelectArea,
  today,
  nextWeek,
  sevenDaysAgo,
  currentMonthStr,
  allTasks,
  tasks,
  openTasks,
  dueAndOverdueTasks,
  overdueCount,
  dueTodayCount,
  allEvents,
  allMeetings,
  allExpenses,
  allProjects,
  pinnedNotes,
  deadlines,
}) => {
  const hud = useJarvisHud()!;
  const taskInputRef = useRef<HTMLInputElement>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [showQuickOptions, setShowQuickOptions] = useState(false);

  // Quick Task / Ask AI Unified Bar State (backed by context draft so prefill works synchronously)
  const quickText = hud.pendingAiPrompt;
  const setQuickText = hud.setPendingAiPrompt;
  const [quickArea, setQuickArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [quickDate, setQuickDate] = useState(today);
  const [quickPriority, setQuickPriority] = useState<Priority>('medium');
  const [quickAddedToast, setQuickAddedToast] = useState<string | null>(null);

  // Modals & Notices
  const [isDailyPlanningOpen, setIsDailyPlanningOpen] = useState(false);
  const [isWeeklyReviewOpen, setIsWeeklyReviewOpen] = useState(false);
  const [dailyPlanNotice, setDailyPlanNotice] = useState<string | null>(null);
  const [weeklyReviewNotice, setWeeklyReviewNotice] = useState<string | null>(null);
  const [recommendationSkipIndex, setRecommendationSkipIndex] = useState(0);

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

  const scoredCandidateTasks = React.useMemo(() => {
    return openTasks
      .map((t) => {
        let score = 0;
        let label = 'Next up';
        const dueKey = toDueKey(t.due_date);
        if (dueKey) {
          if (dueKey < today) {
            score += 50;
            label = 'Overdue';
          } else if (dueKey === today) {
            score += 35;
            label = 'Due today';
          } else if (dueKey <= nextWeek) {
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
  const activeRecommendation =
    scoredCandidateTasks.length > 0
      ? scoredCandidateTasks[recommendationSkipIndex % scoredCandidateTasks.length]
      : null;

  const overdueTasks = React.useMemo(
    () => openTasks.filter((t) => dueStatus(t.due_date, t.done, today) === 'overdue'),
    [openTasks, today]
  );

  const completedPastWeek = React.useMemo(
    () => allTasks.filter((t) => t.done && (t.updated_at || '') >= sevenDaysAgo),
    [allTasks, sevenDaysAgo]
  );

  const todayEvents = React.useMemo(() => allEvents.filter((e) => e.date === today), [allEvents, today]);
  const todayMeetings = React.useMemo(
    () => allMeetings.filter((m) => m.date === today && m.status === 'scheduled'),
    [allMeetings, today]
  );

  const upcomingEvents = (currentArea === 'All' ? allEvents : allEvents.filter((e) => e.area === currentArea)).filter(
    (e) => e.date >= today && e.date <= nextWeek
  );
  const upcomingMeetings = (
    currentArea === 'All' ? allMeetings : allMeetings.filter((m) => m.area === currentArea)
  ).filter((m) => m.date >= today && m.date <= nextWeek && m.status === 'scheduled');
  const scheduleCount = upcomingEvents.length + upcomingMeetings.length;

  const monthExpenses = (currentArea === 'All' ? allExpenses : allExpenses.filter((e) => e.area === currentArea))
    .filter((e) => e.date.startsWith(currentMonthStr))
    .reduce((sum, e) => sum + e.amount, 0);

  const activeWorkspace = React.useMemo(() => {
    const id = hud.hoveredNodeId || hud.selectedNodeId;
    return id ? hud.hudNodes.find((n) => n.id === id) || null : null;
  }, [hud.hoveredNodeId, hud.selectedNodeId, hud.hudNodes]);

  const handleToggleTask = (task: Task) => TaskService.toggleDone(task);
  const handleToggleStar = (task: Task) => TaskService.toggleStar(task);
  const handleMoveToToday = (task: Task) => TaskService.scheduleFor(task, today);

  const handleCompleteTaskById = async (taskId: string) => {
    const t = allTasks.find((x) => x.id === taskId);
    if (t) await TaskService.toggleDone(t);
  };

  // Delete with undo
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

  useEffect(() => {
    window.addEventListener('pagehide', commitPendingDelete);
    return () => {
      window.removeEventListener('pagehide', commitPendingDelete);
      commitPendingDelete();
    };
  }, [commitPendingDelete]);

  const handleDeleteTask = async (task: Task) => {
    commitPendingDelete();
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

  const handleSendToAI = () => {
    if (quickText.trim()) {
      localStorage.setItem('yash_ai_prefill_prompt', quickText.trim());
    }
    onNavigate('ai-assistant');
  };

  const handleFinishDailyPlan = () => {
    setDailyPlanNotice('Daily plan saved — top focus priorities ready.');
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

  return (
    <div className="relative flex-1 flex flex-col gap-3 min-h-[calc(100vh-88px)] lg:h-[calc(100vh-84px)] lg:overflow-hidden">
      {/* Decorative HUD Frame Overlay (Corner brackets, live clock, SYSTEMS NOMINAL line) */}
      <HudFrameOverlay coreState={hud.coreState} perf={hud.perf} is3DEnabled={hud.is3DEnabled} />

      {/* Top Greeting & Status Strip */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-1 sm:pt-7">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold font-heading text-[#E6F1FF] tracking-tight truncate">
            {getGreeting('Yaswanth')}
          </h2>
          <p className="text-xs text-[#7A8BA6] hud-tabular">
            {dueAndOverdueTasks.length === 0
              ? `ALL CLEAR · ${openTasks.length} OPEN`
              : [
                  overdueCount ? `${overdueCount} OVERDUE` : '',
                  dueTodayCount ? `${dueTodayCount} DUE TODAY` : '',
                  `${scheduleCount} UPCOMING`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <MomentumChip onOpen={() => onNavigate('momentum')} />
          <button
            type="button"
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="p-2 rounded-xl hud-glass-pill text-[#7A8BA6] hover:text-[#3BE8FF] transition-colors cursor-pointer disabled:opacity-50"
            title="Sync workspace"
            aria-label="Sync now"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[#3BE8FF]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notices */}
      {(dailyPlanNotice || weeklyReviewNotice || quickAddedToast) && (
        <div
          role="status"
          aria-live="polite"
          className="relative z-20 p-2.5 rounded-xl bg-[#3BE8FF]/12 border border-[#3BE8FF]/40 text-[#E6F1FF] text-xs font-semibold flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#3BE8FF] shrink-0" />
            <span>{dailyPlanNotice || weeklyReviewNotice || quickAddedToast}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setDailyPlanNotice(null);
              setWeeklyReviewNotice(null);
              setQuickAddedToast(null);
            }}
            className="text-xs text-[#3BE8FF] hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Middle Row: Center 3D/2D Stage + Right Contextual Panel */}
      <div className="relative z-20 flex-1 min-h-0 flex flex-col md:flex-row gap-3">
        {/* Center Jarvis Core Stage (top ~40vh on mobile, flex-1 on desktop) */}
        <div className="relative flex-1 min-h-[260px] md:min-h-0 flex flex-col gap-2">
          <div className="relative flex-1 min-h-[240px] md:min-h-0">
            <JarvisCommandCenter areas={areas} onNavigate={onNavigate} onSelectArea={onSelectArea} />
          </div>

          {/* Core-Click Unified AI / Task / Voice Input Bar */}
          <HudAiCaptureBar
            isOpen={hud.isAiBarOpen}
            onClose={() => hud.setIsAiBarOpen(false)}
            quickText={quickText}
            onQuickTextChange={setQuickText}
            quickArea={quickArea}
            onQuickAreaChange={setQuickArea}
            quickDate={quickDate}
            onQuickDateChange={setQuickDate}
            quickPriority={quickPriority}
            onQuickPriorityChange={setQuickPriority}
            showOptions={showQuickOptions}
            onToggleOptions={() => setShowQuickOptions((v) => !v)}
            areas={areas}
            inputRef={taskInputRef}
            onSubmitTask={handleQuickAdd}
            onSendToAI={handleSendToAI}
            onOpenQuickCapture={onOpenQuickCapture}
          />
        </div>

        {/* Right Contextual Panel (Desktop 320-350px, Mobile bottom sheet) */}
        <HudRightPanel
          isOpen={hud.rightPanelOpen}
          onToggleOpen={() => hud.setRightPanelOpen(!hud.rightPanelOpen)}
          mobileSheetOpen={mobileSheetOpen}
          onToggleMobileSheet={() => setMobileSheetOpen((v) => !v)}
          activeWorkspace={activeWorkspace}
          onClearSelectedWorkspace={() => hud.clearWorkspacePreview()}
          onPanelMouseEnter={() => hud.setRightPanelPointerInside(true)}
          onPanelMouseLeave={() => hud.setRightPanelPointerInside(false)}
          activeRecommendation={activeRecommendation}
          onSkipRecommendation={() => setRecommendationSkipIndex((p) => p + 1)}
          onStartFocus={(task) => {
            handOffFocusTask(task.id);
            onNavigate('focus');
          }}
          onCompleteTask={handleToggleTask}
          onCompleteTaskById={handleCompleteTaskById}
          onOpenPlanDay={() => setIsDailyPlanningOpen(true)}
          onOpenWeeklyReview={() => setIsWeeklyReviewOpen(true)}
          onOpenQuickTask={() => {
            hud.openAiBar();
            setTimeout(() => taskInputRef.current?.focus(), 60);
          }}
          onOpenQuickCapture={onOpenQuickCapture}
          onNavigate={onNavigate}
          onSelectArea={onSelectArea}
          tasks={tasks}
          today={today}
          currentArea={currentArea}
        />
      </div>

      {/* Bottom Mission Dock (3 Snap Tracks + Expandable Overview Drawer) */}
      <HudMissionDock
        expanded={hud.dockExpanded}
        onToggleExpand={() => hud.setDockExpanded(!hud.dockExpanded)}
        dueAndOverdueTasks={dueAndOverdueTasks}
        openTasks={openTasks}
        completedTasksCount={tasks.filter((t) => t.done).length}
        deadlines={deadlines}
        projects={allProjects}
        pinnedNotes={pinnedNotes}
        monthExpenses={monthExpenses}
        scheduleCount={scheduleCount}
        upcomingMeetingsCount={upcomingMeetings.length}
        upcomingEventsCount={upcomingEvents.length}
        today={today}
        areas={areas}
        onToggleTask={handleToggleTask}
        onToggleStar={handleToggleStar}
        onDeleteTask={handleDeleteTask}
        onNavigate={onNavigate}
      />

      {/* Interactive Daily Planning Modal */}
      {isDailyPlanningOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="hud-glass max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[rgba(59,232,255,0.16)] pb-4">
              <div>
                <h3 className="text-lg font-bold font-heading text-[#E6F1FF] flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-[#3BE8FF]" />
                  <span>Plan Your Day</span>
                </h3>
                <p className="text-xs text-[#7A8BA6] mt-1">
                  Handle overdue items, star your top priorities, and check today&apos;s schedule.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDailyPlanningOpen(false)}
                className="p-1 rounded-lg text-[#7A8BA6] hover:text-[#E6F1FF] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#E6F1FF]">
                  1. Overdue ({overdueTasks.length})
                </h4>
                {overdueTasks.length === 0 && (
                  <span className="text-xs font-semibold text-[#3BE8FF]">All clear</span>
                )}
              </div>
              {overdueTasks.length > 0 && (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {overdueTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl bg-[#FF4D6D]/10 border border-[#FF4D6D]/30 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-[#E6F1FF] truncate">{t.text}</div>
                        <div className="text-[10px] text-[#FF4D6D]">
                          Due {t.due_date} • {t.area}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveToToday(t)}
                          className="px-2.5 py-1 rounded-lg bg-[#05070D] border border-[#3BE8FF]/30 text-[#3BE8FF] font-medium cursor-pointer"
                        >
                          Today
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleTask(t)}
                          className="px-2.5 py-1 rounded-lg bg-[#3BE8FF]/15 border border-[#3BE8FF]/40 text-[#3BE8FF] font-medium cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#E6F1FF]">
                2. Star Your Top Focus Tasks
              </h4>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {candidateTasks.slice(0, 5).map((t) => (
                  <div
                    key={t.id}
                    className="p-2.5 rounded-xl bg-[#05070D]/60 border border-[rgba(59,232,255,0.16)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => handleToggleStar(t)}
                        className={`p-1 rounded-md cursor-pointer ${
                          t.starred ? 'text-[#FFB547]' : 'text-[#7A8BA6] hover:text-[#FFB547]'
                        }`}
                      >
                        <Star className={`w-4 h-4 ${t.starred ? 'fill-[#FFB547]' : ''}`} />
                      </button>
                      <span className="text-[#E6F1FF] font-medium truncate">{t.text}</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#7A8BA6] shrink-0">
                      {t.area}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#E6F1FF] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#3BE8FF]" />
                <span>3. Today&apos;s Schedule</span>
              </h4>
              {todayMeetings.length === 0 && todayEvents.length === 0 ? (
                <p className="text-xs text-[#7A8BA6] p-3 rounded-xl bg-[#05070D]/50">
                  No meetings or events today.
                </p>
              ) : (
                <div className="space-y-1.5 text-xs">
                  {todayMeetings.map((m) => (
                    <div key={m.id} className="p-2.5 rounded-lg bg-[#05070D]/50 flex items-center justify-between">
                      <span className="font-medium text-[#E6F1FF]">{m.title}</span>
                      <span className="hud-tabular text-[#7A8BA6]">{m.start_time}</span>
                    </div>
                  ))}
                  {todayEvents.map((e) => (
                    <div key={e.id} className="p-2.5 rounded-lg bg-[#05070D]/50 flex items-center justify-between">
                      <span className="font-medium text-[#E6F1FF]">{e.title}</span>
                      <span className="hud-tabular text-[#7A8BA6]">{e.start_time || 'All day'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[rgba(59,232,255,0.14)]">
              <button
                type="button"
                onClick={() => setIsDailyPlanningOpen(false)}
                className="px-4 py-2 rounded-xl border border-white/15 text-xs font-semibold text-[#E6F1FF] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinishDailyPlan}
                className="px-5 py-2 rounded-xl bg-[#3BE8FF] text-[#05070D] text-xs font-bold cursor-pointer"
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
          <div className="hud-glass max-w-2xl w-full p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 border-b border-[rgba(59,232,255,0.16)] pb-4">
              <div>
                <h3 className="text-lg font-bold font-heading text-[#E6F1FF] flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#7C5CFF]" />
                  <span>Weekly Review</span>
                </h3>
                <p className="text-xs text-[#7A8BA6] mt-1">
                  Review your completed tasks and check active project progress.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWeeklyReviewOpen(false)}
                className="p-1 rounded-lg text-[#7A8BA6] hover:text-[#E6F1FF] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#E6F1FF]">
                1. Completed This Week ({completedPastWeek.length})
              </h4>
              {completedPastWeek.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {completedPastWeek.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl bg-[#7C5CFF]/10 border border-[#7C5CFF]/30 flex items-center justify-between text-xs"
                    >
                      <span className="font-medium text-[#E6F1FF] line-through opacity-80">
                        {t.text}
                      </span>
                      <span className="text-[10px] text-[#7C5CFF] font-semibold">{t.area}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#7A8BA6] p-3 rounded-xl bg-[#05070D]/50">
                  No tasks completed in the last 7 days yet.
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#E6F1FF]">
                2. Active Projects ({allProjects.filter((p) => p.status === 'active' || p.status === 'planning').length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {allProjects
                  .filter((p) => p.status === 'active' || p.status === 'planning')
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-xl bg-[#05070D]/60 border border-[rgba(59,232,255,0.16)] space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#E6F1FF]">{p.title}</span>
                        <span className="hud-tabular text-[10px] text-[#3BE8FF] font-bold">
                          {p.progress}%
                        </span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-[#3BE8FF] to-[#7C5CFF] h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[rgba(59,232,255,0.14)]">
              <button
                type="button"
                onClick={() => setIsWeeklyReviewOpen(false)}
                className="px-4 py-2 rounded-xl border border-white/15 text-xs font-semibold text-[#E6F1FF] cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleFinishWeeklyReview}
                className="px-5 py-2 rounded-xl bg-[#7C5CFF] hover:bg-[#8e74ff] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save to Notes</span>
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
            className="hub-toast-enter pointer-events-auto relative overflow-hidden flex items-center gap-3 max-w-md w-full sm:w-auto pl-4 pr-2 py-2.5 rounded-2xl hud-glass-pill text-[#E6F1FF] shadow-xl"
          >
            <Trash2 className="w-4 h-4 shrink-0 opacity-70" />
            <span className="text-sm min-w-0 flex-1">
              Deleted{' '}
              <span className="font-semibold truncate inline-block max-w-[12rem] sm:max-w-[16rem] align-bottom">
                "{pendingDelete.text}"
              </span>
            </span>
            <button
              type="button"
              onClick={handleUndoDelete}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold bg-[#3BE8FF] text-[#05070D] hover:bg-[#70f0ff] transition-colors cursor-pointer"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
              Undo
            </button>
            <span
              aria-hidden="true"
              className="hub-toast-timer absolute left-0 bottom-0 h-0.5 bg-[#3BE8FF]"
              style={{ animationDuration: `${UNDO_WINDOW_MS}ms` }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
