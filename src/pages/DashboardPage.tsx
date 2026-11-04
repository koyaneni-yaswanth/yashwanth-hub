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
} from 'lucide-react';
import { db } from '../db';
import type { Task, Area, Priority } from '../types';
import { formatINR, formatShortDate, getGreeting, getTodayISO, isOverdue, generateId } from '../lib/utils';
import { StatCard } from '../components/common/StatCard';
import { Badge } from '../components/common/Badge';
import { Neo1DeviceCard } from '../components/neo/Neo1DeviceCard';

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
        {planTasks.length > 0 && (
          <button
            onClick={() => onNavigate('wind-plan')}
            className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-800 dark:text-teal-200 text-xs font-semibold hover:bg-teal-500/20 transition-all cursor-pointer"
          >
            <Wind className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>90-Day Plan: {planPercentage}% TRL Progress</span>
          </button>
        )}
      </div>

      {/* Real-time KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
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
          value={formatINR(monthExpenses)}
          subtext={`Current cycle (${today.slice(0, 7)})`}
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
      <Neo1DeviceCard />

      {/* Quick Add Task Box */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 shadow-xs">
        <form onSubmit={handleQuickAdd} className="space-y-3">
          <div className="flex items-center gap-2">
            <input
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
