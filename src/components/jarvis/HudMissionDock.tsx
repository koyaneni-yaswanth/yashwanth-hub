import React from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  FolderKanban,
  Heart,
  IndianRupee,
  Star,
  Trash2,
  Wind,
} from 'lucide-react';
import type { Area, NavigationTab, Note, Project, Task } from '../../types';
import type { HudDeadlineItem } from '../../lib/jarvisHud';
import { formatINR, formatShortDate, isOverdue } from '../../lib/utils';
import { StatCard } from '../common/StatCard';
import { Badge } from '../common/Badge';
import { Neo1DeviceCard } from '../neo/Neo1DeviceCard';

interface HudMissionDockProps {
  expanded: boolean;
  onToggleExpand: () => void;
  dueAndOverdueTasks: Task[];
  openTasks: Task[];
  completedTasksCount: number;
  deadlines: HudDeadlineItem[];
  projects: Project[];
  pinnedNotes: Note[];
  monthExpenses: number;
  scheduleCount: number;
  upcomingMeetingsCount: number;
  upcomingEventsCount: number;
  today: string;
  areas: Area[];
  onToggleTask: (task: Task) => void;
  onToggleStar: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onNavigate: (tab: NavigationTab) => void;
}

export const HudMissionDock: React.FC<HudMissionDockProps> = ({
  expanded,
  onToggleExpand,
  dueAndOverdueTasks,
  openTasks,
  completedTasksCount,
  deadlines,
  projects,
  pinnedNotes,
  monthExpenses,
  scheduleCount,
  upcomingMeetingsCount,
  upcomingEventsCount,
  today,
  onToggleTask,
  onToggleStar,
  onDeleteTask,
  onNavigate,
}) => {
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planning');
  const pawanProject = projects.find((p) => p.area === 'PAWAN SHAKTI');

  return (
    <section
      aria-label="Mission Dock"
      className={`hud-enter-dock hud-glass relative z-20 flex flex-col transition-all duration-300 ease-out overflow-hidden ${
        expanded ? 'max-h-[42vh]' : 'min-h-[120px] md:h-[136px]'
      }`}
    >
      {/* Dock Header */}
      <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-[rgba(59,232,255,0.14)] shrink-0">
        <div className="flex items-center gap-3 text-[10px] hud-tabular uppercase tracking-[0.14em] text-[#7A8BA6]">
          <span className="text-[#3BE8FF] font-semibold">Mission Dock</span>
          <span className="hidden sm:inline">Today {dueAndOverdueTasks.length}</span>
          <span className="hidden sm:inline">• Deadlines {deadlines.length}</span>
          <span className="hidden sm:inline">• Projects {activeProjects.length}</span>
        </div>

        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#E6F1FF] hover:bg-white/5 hover:text-[#3BE8FF] transition-colors cursor-pointer"
        >
          <span>{expanded ? 'Collapse dock' : 'Show full overview'}</span>
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Horizontal Snap Track Row */}
      <div
        className={`flex gap-3 p-2.5 overflow-x-auto snap-x snap-mandatory ${
          expanded ? 'shrink-0' : 'flex-1'
        }`}
      >
        {/* Track 1: Today's Tasks (inline checkable -> TaskService -> Dexie + sync_queue) */}
        <div className="snap-start shrink-0 w-[86vw] sm:w-[320px] md:flex-1 md:min-w-[260px] rounded-xl bg-[rgba(5,7,13,0.6)] border border-[rgba(59,232,255,0.14)] p-2.5 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-heading font-semibold text-[#E6F1FF] flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3BE8FF]" />
              <span>Today&apos;s Tasks</span>
              <span className="hud-tabular text-[10px] px-1.5 py-0.2 rounded-full bg-[#3BE8FF]/15 text-[#3BE8FF]">
                {dueAndOverdueTasks.length}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('tasks')}
              className="text-[10px] font-medium text-[#3BE8FF] hover:underline cursor-pointer"
            >
              All ({openTasks.length}) →
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 max-h-[84px] pr-1">
            {dueAndOverdueTasks.length === 0 ? (
              <p className="text-[11px] text-[#7A8BA6] flex items-center gap-1.5 py-1.5">
                <Check className="w-3.5 h-3.5 text-[#3BE8FF]" />
                <span>All caught up for today.</span>
              </p>
            ) : (
              dueAndOverdueTasks.slice(0, 3).map((task) => {
                const overdue = isOverdue(task.due_date, task.done);
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 py-1 px-1.5 rounded-lg hover:bg-white/5 text-xs group"
                  >
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => onToggleTask(task)}
                      aria-label={`Mark ${task.text} complete`}
                      className="w-3.5 h-3.5 rounded accent-[#3BE8FF] cursor-pointer shrink-0"
                    />
                    <span className="flex-1 min-w-0 truncate text-[#E6F1FF]">{task.text}</span>
                    {overdue && (
                      <span className="text-[9px] font-mono text-[#FF4D6D] shrink-0">OVERDUE</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleStar(task)}
                      aria-label={task.starred ? 'Unstar task' : 'Star task'}
                      className="p-0.5 text-[#FFB547] opacity-60 group-hover:opacity-100 cursor-pointer"
                    >
                      <Star className={`w-3 h-3 ${task.starred ? 'fill-[#FFB547]' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task)}
                      aria-label={`Delete task: ${task.text}`}
                      className="p-0.5 text-[#7A8BA6] hover:text-[#FF4D6D] opacity-60 group-hover:opacity-100 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Track 2: Deadlines (Next 7 days, countdown chips, red under 24h) */}
        <div className="snap-start shrink-0 w-[86vw] sm:w-[320px] md:flex-1 md:min-w-[260px] rounded-xl bg-[rgba(5,7,13,0.6)] border border-[rgba(59,232,255,0.14)] p-2.5 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-heading font-semibold text-[#E6F1FF] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#FFB547]" />
              <span>Deadlines (7d)</span>
              <span className="hud-tabular text-[10px] px-1.5 py-0.2 rounded-full bg-[#FFB547]/15 text-[#FFB547]">
                {deadlines.length}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="text-[10px] font-medium text-[#3BE8FF] hover:underline cursor-pointer"
            >
              Calendar →
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 max-h-[84px] pr-1">
            {deadlines.length === 0 ? (
              <p className="text-[11px] text-[#7A8BA6] py-1.5">
                No deadlines in the next 7 days.
              </p>
            ) : (
              deadlines.slice(0, 3).map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onNavigate(d.targetTab)}
                  className="w-full flex items-center justify-between gap-2 py-1 px-1.5 rounded-lg hover:bg-white/5 text-left text-xs cursor-pointer"
                >
                  <span className="flex-1 min-w-0 truncate text-[#E6F1FF]">
                    {d.title}
                    <span className="text-[10px] text-[#7A8BA6] ml-1.5">
                      {formatShortDate(d.dateKey)}
                    </span>
                  </span>
                  <span
                    className={`hud-tabular text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${
                      d.urgentUnder24h
                        ? 'bg-[#FF4D6D]/20 text-[#FF4D6D] border border-[#FF4D6D]/40'
                        : 'bg-[#3BE8FF]/12 text-[#3BE8FF] border border-[#3BE8FF]/25'
                    }`}
                  >
                    {d.countdownLabel}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Track 3: Active Projects */}
        <div className="snap-start shrink-0 w-[86vw] sm:w-[320px] md:flex-1 md:min-w-[260px] rounded-xl bg-[rgba(5,7,13,0.6)] border border-[rgba(59,232,255,0.14)] p-2.5 flex flex-col">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-heading font-semibold text-[#E6F1FF] flex items-center gap-1.5">
              <FolderKanban className="w-3.5 h-3.5 text-[#7C5CFF]" />
              <span>Active Projects</span>
              <span className="hud-tabular text-[10px] px-1.5 py-0.2 rounded-full bg-[#7C5CFF]/20 text-[#E6F1FF]">
                {activeProjects.length}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="text-[10px] font-medium text-[#3BE8FF] hover:underline cursor-pointer"
            >
              Projects →
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[84px] pr-1">
            {activeProjects.length === 0 ? (
              <p className="text-[11px] text-[#7A8BA6] py-1.5">
                No active projects yet.
              </p>
            ) : (
              activeProjects.slice(0, 5).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onNavigate('projects')}
                  className="w-full text-left py-1 px-1.5 rounded-lg hover:bg-white/5 space-y-1 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 min-w-0">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          p.status === 'active'
                            ? 'bg-[#3BE8FF] shadow-[0_0_6px_#3BE8FF]'
                            : 'bg-[#FFB547]'
                        }`}
                      />
                      <span className="truncate text-[#E6F1FF] font-medium">{p.title}</span>
                    </span>
                    <span className="hud-tabular text-[10px] text-[#3BE8FF] shrink-0">
                      {p.progress}%
                    </span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#3BE8FF] to-[#7C5CFF]"
                      style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }}
                    />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Expanded Full Overview Drawer (reuses KPI Stats, Workspace Cards, Neo 1 & Pinned Notes) */}
      {expanded && (
        <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2 border-t border-[rgba(59,232,255,0.14)] space-y-4">
          <div data-agent-target="stats-grid" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard
              label="Due & Overdue"
              value={dueAndOverdueTasks.length}
              subtext={dueAndOverdueTasks.length === 0 ? 'All caught up' : 'Action needed today'}
              icon={
                <AlertCircle
                  className={`w-5 h-5 ${dueAndOverdueTasks.length > 0 ? 'text-[#FF4D6D]' : 'text-[#3BE8FF]'}`}
                />
              }
              onClick={() => onNavigate('tasks')}
            />
            <StatCard
              label="Open Tasks"
              value={openTasks.length}
              subtext={`${completedTasksCount} completed`}
              icon={<CheckCircle2 className="w-5 h-5 text-[#3BE8FF]" />}
              onClick={() => onNavigate('tasks')}
            />
            <StatCard
              label="Spent This Month"
              value={monthExpenses === 0 ? '₹0' : formatINR(monthExpenses)}
              subtext={monthExpenses === 0 ? 'Manually logged only' : `Cycle ${today.slice(0, 7)}`}
              icon={<IndianRupee className="w-5 h-5 text-[#FFB547]" />}
              onClick={() => onNavigate('finance')}
            />
            <StatCard
              label="Schedule (7 Days)"
              value={scheduleCount}
              subtext={`${upcomingMeetingsCount} meetings, ${upcomingEventsCount} events`}
              icon={<Calendar className="w-5 h-5 text-[#7C5CFF]" />}
              onClick={() => onNavigate('calendar')}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="rounded-xl p-4 bg-[rgba(5,7,13,0.6)] border border-[rgba(59,232,255,0.16)] flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[#3BE8FF]">
                    <Wind className="w-4 h-4" /> Pawan Shakti
                  </span>
                  {pawanProject && (
                    <span className="hud-tabular text-[#3BE8FF] font-semibold">
                      {pawanProject.target_date ? `${pawanProject.target_date} · ` : ''}{pawanProject.progress}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#7A8BA6]">
                  Milestones, prototypes, tasks and documents for the wind-turbine programme.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('startup-command')}
                className="mt-3 flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#E6F1FF] cursor-pointer"
              >
                <span>Open Pawan Shakti</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="rounded-xl p-4 bg-[rgba(5,7,13,0.6)] border border-[rgba(124,92,255,0.22)] flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#7C5CFF]">
                  <Bot className="w-4 h-4" /> Robotics Lab
                </span>
                <p className="text-xs text-[#7A8BA6]">
                  Robotics records, experiment logs and hardware build notes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('robotics-lab')}
                className="mt-3 flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#E6F1FF] cursor-pointer"
              >
                <span>Open Robotics Lab</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="rounded-xl p-4 bg-[rgba(5,7,13,0.6)] border border-[rgba(255,107,157,0.22)] flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#FF6B9D]">
                  <Heart className="w-4 h-4" /> Routine &amp; Health
                </span>
                <p className="text-xs text-[#7A8BA6]">
                  Track sleep, focus sessions and daily habits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('health-routine')}
                className="mt-3 flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-[#E6F1FF] cursor-pointer"
              >
                <span>Open Routine Tracker</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div data-agent-target="automations-card">
            <Neo1DeviceCard />
          </div>

          {pinnedNotes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#E6F1FF] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[#FFB547]" /> Pinned Notes
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('notes')}
                  className="text-xs font-semibold text-[#3BE8FF] hover:underline cursor-pointer"
                >
                  Manage notes →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {pinnedNotes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 rounded-xl bg-[rgba(5,7,13,0.6)] border border-[rgba(59,232,255,0.16)] border-l-2 border-l-[#FFB547]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-[#E6F1FF] truncate">{note.title}</span>
                      {note.area && <Badge variant="amber">{note.area}</Badge>}
                    </div>
                    <p className="text-[11px] text-[#7A8BA6] line-clamp-2">{note.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
