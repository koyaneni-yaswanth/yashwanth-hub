import React from 'react';
import {
  Calendar,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  FileText,
  Mic,
  Play,
  Plus,
  SkipForward,
  Sparkles,
  Target,
  Trophy,
  ArrowRight,
  X,
} from 'lucide-react';
import type { NavigationTab, Task } from '../../types';
import type { HudWorkspaceSummary } from '../../lib/jarvisHud';
import { TodayProgress } from '../home/TodayProgress';
import { renderWorkspaceGlyph } from './workspaceGlyph';

interface HudRightPanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  mobileSheetOpen: boolean;
  onToggleMobileSheet: () => void;
  activeWorkspace: HudWorkspaceSummary | null;
  onClearSelectedWorkspace: () => void;
  activeRecommendation: { task: Task; label: string } | null;
  onSkipRecommendation: () => void;
  onStartFocus: (task: Task) => void;
  onCompleteTask: (task: Task) => void;
  onCompleteTaskById: (taskId: string) => void;
  onOpenPlanDay: () => void;
  onOpenWeeklyReview: () => void;
  onOpenQuickTask: () => void;
  onOpenQuickCapture?: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onSelectArea?: (area: string) => void;
  onPanelMouseEnter?: () => void;
  onPanelMouseLeave?: () => void;
  tasks: Task[];
  today: string;
  currentArea: string;
}

export const HudRightPanel: React.FC<HudRightPanelProps> = ({
  isOpen,
  onToggleOpen,
  mobileSheetOpen,
  onToggleMobileSheet,
  activeWorkspace,
  onClearSelectedWorkspace,
  activeRecommendation,
  onSkipRecommendation,
  onStartFocus,
  onCompleteTask,
  onCompleteTaskById,
  onOpenPlanDay,
  onOpenWeeklyReview,
  onOpenQuickTask,
  onOpenQuickCapture,
  onNavigate,
  onSelectArea,
  onPanelMouseEnter,
  onPanelMouseLeave,
  tasks,
  today,
  currentArea,
}) => {
  const openWorkspace = (ws: HudWorkspaceSummary) => {
    if (ws.target.area) onSelectArea?.(ws.target.area);
    onNavigate(ws.target.tab);
  };

  const askAboutWorkspace = (ws: HudWorkspaceSummary) => {
    localStorage.setItem(
      'yash_ai_prefill_prompt',
      `Give me a concise status update and the top priority next actions for ${ws.label}.`
    );
    onNavigate('ai-assistant');
  };

  const panelBody = activeWorkspace ? (
    /* Contextual Workspace Preview */
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2 border-b border-[rgba(59,232,255,0.14)] pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              color: activeWorkspace.color,
              background: `${activeWorkspace.color}1e`,
              border: `1px solid ${activeWorkspace.color}44`,
            }}
          >
            {renderWorkspaceGlyph(activeWorkspace.glyph, 'w-4 h-4')}
          </div>
          <div className="min-w-0">
            <span className="text-[10px] hud-tabular uppercase tracking-[0.14em] text-[#7A8BA6]">
              Workspace Preview
            </span>
            <h3 className="font-heading text-sm font-bold text-[#E6F1FF] truncate">
              {activeWorkspace.label}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClearSelectedWorkspace}
          aria-label="Return to default brief"
          className="p-1.5 rounded-lg text-[#7A8BA6] hover:text-[#E6F1FF] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Key Metric + Next Milestone */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="p-3 rounded-xl bg-[rgba(5,7,13,0.65)] border border-[rgba(59,232,255,0.16)]">
          <div className="text-[10px] uppercase tracking-wider text-[#7A8BA6]">
            {activeWorkspace.keyMetric.label}
          </div>
          <div className="hud-tabular text-xl font-bold text-[#3BE8FF] mt-0.5">
            {activeWorkspace.keyMetric.value}
          </div>
        </div>
        <div className="p-3 rounded-xl bg-[rgba(5,7,13,0.65)] border border-[rgba(59,232,255,0.16)]">
          <div className="text-[10px] uppercase tracking-wider text-[#7A8BA6]">
            Due / Open
          </div>
          <div className="hud-tabular text-xl font-bold text-[#E6F1FF] mt-0.5">
            {activeWorkspace.dueTodayCount}
            <span className="text-xs font-normal text-[#7A8BA6]"> / {activeWorkspace.openTasks}</span>
          </div>
        </div>
      </div>

      {activeWorkspace.nextMilestone && (
        <div className="p-3 rounded-xl bg-[rgba(124,92,255,0.1)] border border-[rgba(124,92,255,0.28)] space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#7C5CFF]">
            Next Milestone
          </div>
          <div className="text-xs font-semibold text-[#E6F1FF]">
            {activeWorkspace.nextMilestone.title}
          </div>
          {activeWorkspace.nextMilestone.date && (
            <div className="hud-tabular text-[10px] text-[#7A8BA6]">
              Target: {activeWorkspace.nextMilestone.date}
            </div>
          )}
        </div>
      )}

      {/* Top 3 Open Tasks */}
      <div className="space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#7A8BA6]">
          Top Priority Tasks
        </div>
        {activeWorkspace.topTasks.length === 0 ? (
          <p className="text-xs text-[#7A8BA6] p-3 rounded-xl bg-[rgba(5,7,13,0.45)] border border-white/5">
            No open tasks logged in {activeWorkspace.label}.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {activeWorkspace.topTasks.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-[rgba(5,7,13,0.55)] border border-[rgba(59,232,255,0.14)] text-xs"
              >
                <button
                  type="button"
                  onClick={() => onCompleteTaskById(t.id)}
                  aria-label={`Complete task ${t.text}`}
                  className="group/chk w-4 h-4 rounded border border-[#3BE8FF]/50 hover:bg-[#3BE8FF]/20 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  <Check className="w-2.5 h-2.5 text-[#3BE8FF] opacity-0 group-hover/chk:opacity-100 transition-opacity" />
                </button>
                <span className="flex-1 min-w-0 truncate text-[#E6F1FF]">{t.text}</span>
                {t.priority === 'urgent' && (
                  <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-[#FF4D6D]/20 text-[#FF4D6D]">
                    Urgent
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Contextual Actions */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={() => openWorkspace(activeWorkspace)}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#3BE8FF] text-[#05070D] text-xs font-bold hover:bg-[#70f0ff] transition-colors cursor-pointer"
        >
          <span>Open workspace</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => askAboutWorkspace(activeWorkspace)}
          className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#7C5CFF]/20 border border-[#7C5CFF]/45 text-[#E6F1FF] text-xs font-semibold hover:bg-[#7C5CFF]/30 transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#3BE8FF]" />
          <span>Ask AI</span>
        </button>
      </div>
    </div>
  ) : (
    /* Default Chief-of-Staff Brief */
    <div className="space-y-3.5">
      {/* Up Next Focus Card */}
      {activeRecommendation ? (
        <div className="p-3.5 rounded-xl bg-[rgba(5,7,13,0.68)] border border-[rgba(59,232,255,0.26)] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-[#3BE8FF]">
              <Target className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Up Next</span>
            </span>
            <span className="hud-tabular text-[10px] text-[#7A8BA6]">
              {activeRecommendation.label} • {activeRecommendation.task.area}
            </span>
          </div>
          <h3 className="font-heading text-sm font-bold text-[#E6F1FF] leading-snug">
            {activeRecommendation.task.text}
          </h3>
          <div className="flex items-center gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => onStartFocus(activeRecommendation.task)}
              aria-label={`Start a focus session: ${activeRecommendation.task.text}`}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#3BE8FF] text-[#05070D] text-xs font-bold hover:bg-[#70f0ff] transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start focus</span>
            </button>
            <button
              type="button"
              onClick={() => onCompleteTask(activeRecommendation.task)}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-[#3BE8FF] hover:bg-[#3BE8FF]/15 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Done</span>
            </button>
            <button
              type="button"
              onClick={onSkipRecommendation}
              aria-label="Next candidate task"
              title="Skip to next task"
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-[#7A8BA6] hover:text-[#E6F1FF] cursor-pointer"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-[rgba(5,7,13,0.55)] border border-[rgba(59,232,255,0.16)] text-xs text-[#7A8BA6]">
          No pending focus task. Add one to launch Deep Work.
        </div>
      )}

      {/* Existing TodayProgress (task ring + habit check-ins) */}
      <TodayProgress tasks={tasks} today={today} currentArea={currentArea} onNavigate={onNavigate} />

      {/* Plan Day + Weekly Review */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenPlanDay}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[rgba(5,7,13,0.65)] border border-[rgba(59,232,255,0.18)] text-xs font-semibold text-[#E6F1FF] hover:border-[#3BE8FF]/50 transition-colors cursor-pointer"
        >
          <CalendarCheck className="w-3.5 h-3.5 text-[#3BE8FF]" />
          <span>Plan Day</span>
        </button>
        <button
          type="button"
          onClick={onOpenWeeklyReview}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[rgba(5,7,13,0.65)] border border-[rgba(124,92,255,0.28)] text-xs font-semibold text-[#E6F1FF] hover:border-[#7C5CFF]/60 transition-colors cursor-pointer"
        >
          <Trophy className="w-3.5 h-3.5 text-[#7C5CFF]" />
          <span>Weekly Review</span>
        </button>
      </div>

      {/* Quick Actions Row */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#7A8BA6]">
          Quick Actions
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={onOpenQuickTask}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-[rgba(5,7,13,0.65)] border border-[rgba(59,232,255,0.16)] hover:border-[#3BE8FF]/50 text-[11px] font-medium text-[#E6F1FF] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#3BE8FF]" />
            <span>Task</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('calendar')}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-[rgba(5,7,13,0.65)] border border-[rgba(59,232,255,0.16)] hover:border-[#3BE8FF]/50 text-[11px] font-medium text-[#E6F1FF] cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-[#7C5CFF]" />
            <span>Schedule</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('notes')}
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-[rgba(5,7,13,0.65)] border border-[rgba(59,232,255,0.16)] hover:border-[#3BE8FF]/50 text-[11px] font-medium text-[#E6F1FF] cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-[#FFB547]" />
            <span>Note</span>
          </button>
          <button
            type="button"
            onClick={() => (onOpenQuickCapture ? onOpenQuickCapture() : onOpenQuickTask())}
            title="Capture (Ctrl+Q)"
            className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl bg-[rgba(5,7,13,0.65)] border border-[rgba(59,232,255,0.16)] hover:border-[#3BE8FF]/50 text-[11px] font-medium text-[#E6F1FF] cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5 text-[#3BE8FF]" />
            <span>Capture</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Collapsible Right Panel (340px) */}
      <div
        onMouseEnter={onPanelMouseEnter}
        onMouseLeave={onPanelMouseLeave}
        className="hud-enter-panel hidden md:flex items-stretch z-20 shrink-0"
      >
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Collapse context panel' : 'Expand context panel'}
          className="self-center -mr-2 z-10 w-5 h-12 rounded-l-lg hud-glass-pill flex items-center justify-center text-[#7A8BA6] hover:text-[#3BE8FF] cursor-pointer"
        >
          {isOpen ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {isOpen && (
          <aside
            aria-label="Contextual Intelligence Panel"
            className="hud-glass w-[320px] xl:w-[350px] p-4 overflow-y-auto max-h-full"
          >
            {panelBody}
          </aside>
        )}
      </div>

      {/* Mobile Bottom Sheet Trigger & Sheet (<768px) */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={onToggleMobileSheet}
          aria-expanded={mobileSheetOpen}
          className="w-full hud-glass px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-[#E6F1FF] cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <Target className="w-3.5 h-3.5 text-[#3BE8FF] shrink-0" />
            <span className="truncate">
              {activeWorkspace
                ? `${activeWorkspace.label} · ${activeWorkspace.keyMetric.value}`
                : activeRecommendation
                ? `Up Next: ${activeRecommendation.task.text}`
                : 'Today Brief & Quick Actions'}
            </span>
          </span>
          {mobileSheetOpen ? <ChevronDown className="w-4 h-4 text-[#7A8BA6]" /> : <ChevronUp className="w-4 h-4 text-[#7A8BA6]" />}
        </button>

        {mobileSheetOpen && (
          <div className="hud-glass mt-2 p-4 space-y-3">{panelBody}</div>
        )}
      </div>
    </>
  );
};
