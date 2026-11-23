import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  CalendarDays,
  RefreshCw,
  AlertTriangle,
  ListTodo,
  Square,
  CheckSquare,
} from 'lucide-react';
import { db } from '../db';
import type { EventItem, EventKind, Area } from '../types';
import { getTodayISO, generateId, toDueKey } from '../lib/utils';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { SyncQueueService } from '../services/sync/syncQueueService';
import { getSupabaseClient } from '../lib/supabase';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { GoogleCalendarService } from '../services/google/googleCalendarService';
import { TaskService } from '../services/sync/taskService';
import { CalendarDayList } from '../components/calendar/CalendarDayList';
import {
  clashesWith,
  endsNextDay,
  findClashes,
  sameStartEnd,
  formatTimeRange,
  fromDateKey,
  itemKey,
  rangeFor,
  type CalItem,
} from '../lib/calendarModel';

type CalView = 'month' | 'week' | 'day' | 'agenda';
const SHOW_TASKS_KEY = 'yash_calendar_show_tasks';
const readShowTasks = () => {
  try {
    return localStorage.getItem(SHOW_TASKS_KEY) !== '0';
  } catch {
    return true;
  }
};

interface CalendarPageProps {
  currentArea: string;
  areas: Area[];
}

export const CalendarPage: React.FC<CalendarPageProps> = ({ currentArea, areas }) => {
  const today = getTodayISO();

  // Calendar View State: Month | Week | Day
  const [viewMode, setViewMode] = useState<CalView>('month');
  const [showTasks, setShowTasksState] = useState(readShowTasks);
  const setShowTasks = (v: boolean) => {
    setShowTasksState(v);
    try {
      localStorage.setItem(SHOW_TASKS_KEY, v ? '1' : '0');
    } catch {
      // Remembering this is a convenience only.
    }
  };
  const [currentDate, setCurrentDate] = useState(new Date());

  // Sync & Loading State
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; success: boolean } | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(() => GoogleAuthService.isConnected());

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(today);
  const [formStartTime, setFormStartTime] = useState('10:00');
  const [formEndTime, setFormEndTime] = useState('11:00');
  const [formKind, setFormKind] = useState<EventKind>('Meeting');
  const [formPlace, setFormPlace] = useState('');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formNotes, setFormNotes] = useState('');

  // Delete State
  const [eventToDelete, setEventToDelete] = useState<string | null>(null);

  // Purge legacy mock data & load live Supabase events on mount
  useEffect(() => {
    const purgeMockEvents = async () => {
      const mockTitles = [
        'Professor Lab Review',
        'MG Automation On-site Client Commissioning',
        'DST Startup Grant',
      ];
      const localEvents = await db.events.toArray();
      for (const ev of localEvents) {
        if (mockTitles.some((t) => ev.title.includes(t))) {
          await db.events.delete(ev.id);
        }
      }
    };
    purgeMockEvents();

    const loadRemoteEvents = async () => {
      setIsLoading(true);
      try {
        const client = getSupabaseClient();
        if (client) {
          const { data, error } = await client
            .from('events')
            .select('*')
            .order('start_time', { ascending: true });

          if (!error && Array.isArray(data)) {
            for (const ev of data) {
              await db.events.put({
                id: ev.id,
                title: ev.title,
                date: ev.date,
                start_time: ev.start_time || undefined,
                end_time: ev.end_time || undefined,
                kind: ev.kind || 'Other',
                place: ev.place || undefined,
                area: ev.area || 'PAWAN SHAKTI',
                notes: ev.notes || undefined,
                google_event_id: ev.google_event_id || undefined,
                created_at: ev.created_at || new Date().toISOString(),
                updated_at: ev.updated_at || new Date().toISOString(),
              });
            }
          }
        }
      } catch (err) {
        console.warn('[CalendarPage] Remote event sync notice:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadRemoteEvents();
  }, []);

  // Live Query from IndexedDB (Dexie) - Clean local-first reactive source
  const allEvents = useLiveQuery(() => db.events.toArray(), []) || [];
  const events = currentArea === 'All' ? allEvents : allEvents.filter((e) => e.area === currentArea);
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allMeetings = useLiveQuery(() => db.meetings.toArray(), []) || [];

  // One timeline: events, meetings (not cancelled) and, optionally, tasks with a due date.
  const inArea = (area?: string) => currentArea === 'All' || area === currentArea;
  const eventItem = (e: EventItem): CalItem => ({ id: e.id, source: 'event', title: e.title, date: e.date, start: e.start_time, end: e.end_time });
  const activeMeetings = allMeetings.filter((m) => m.status !== 'cancelled');
  const meetingItem = (m: (typeof activeMeetings)[number]): CalItem => ({
    id: m.id,
    source: 'meeting',
    title: m.title,
    date: m.date,
    start: m.start_time,
    end: m.end_time,
  });
  const calItems: CalItem[] = [
    ...events.map(eventItem),
    ...activeMeetings.filter((m) => inArea(m.area)).map(meetingItem),
    ...(showTasks
      ? allTasks
          // Due dates are normalised: some integrations store timestamps rather than plain dates.
          .map((t) => ({ t, key: toDueKey(t.due_date) }))
          .filter(({ t, key }) => key && inArea(t.area))
          .map(({ t, key }) => ({ id: t.id, source: 'task' as const, title: t.text, date: key, done: t.done }))
      : []),
  ];
  // Clashes are checked against your whole schedule, whichever area is being viewed.
  const scheduleItems: CalItem[] = [...allEvents.map(eventItem), ...activeMeetings.map(meetingItem)];
  const clashes = findClashes(scheduleItems);

  // Live checks for the event form. An end before the start means the event ends the next day;
  // only a zero-length time range is refused (and never for an event saved that way before).
  const formTimesUnchanged = !!editingEvent && formStartTime === (editingEvent.start_time || '') && formEndTime === (editingEvent.end_time || '');
  const formEndInvalid = sameStartEnd(formStartTime, formEndTime) && !formTimesUnchanged;
  const formEndsNextDay = endsNextDay(formStartTime, formEndTime);
  const formClashes = isModalOpen
    ? clashesWith({ id: editingEvent?.id, source: 'event', date: formDate, start: formStartTime || undefined, end: formEndTime || undefined }, scheduleItems)
    : [];

  const toggleTaskFromCalendar = async (taskId: string) => {
    const task = allTasks.find((t) => t.id === taskId);
    if (task) await TaskService.update(task, { done: !task.done });
  };

  // Month calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Clashing items on the dates currently on screen (for the header count).
  const visibleDays = new Set(
    viewMode === 'month'
      ? Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`)
      : rangeFor(viewMode, currentDate)
  );
  const visibleClashCount = calItems.filter((it) => visibleDays.has(it.date) && clashes.has(itemKey(it))).length;

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'agenda') {
      setCurrentDate(new Date(year, month, currentDate.getDate() - 14));
    } else if (viewMode === 'week') {
      setCurrentDate(new Date(year, month, currentDate.getDate() - 7));
    } else {
      setCurrentDate(new Date(year, month, currentDate.getDate() - 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'agenda') {
      setCurrentDate(new Date(year, month, currentDate.getDate() + 14));
    } else if (viewMode === 'week') {
      setCurrentDate(new Date(year, month, currentDate.getDate() + 7));
    } else {
      setCurrentDate(new Date(year, month, currentDate.getDate() + 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const openCreateModal = (dateStr?: string) => {
    setEditingEvent(null);
    setFormTitle('');
    setFormDate(dateStr || today);
    setFormStartTime('10:00');
    setFormEndTime('11:00');
    setFormKind('Meeting');
    setFormPlace('');
    setFormArea(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
    setFormNotes('');
    setIsModalOpen(true);
  };

  const openEditModal = (event: EventItem) => {
    setEditingEvent(event);
    setFormTitle(event.title);
    setFormDate(event.date);
    setFormStartTime(event.start_time || '');
    setFormEndTime(event.end_time || '');
    setFormKind(event.kind);
    setFormPlace(event.place || '');
    setFormArea(event.area || 'Personal');
    setFormNotes(event.notes || '');
    setIsModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || formEndInvalid) return;

    const now = new Date().toISOString();

    if (editingEvent) {
      const updateData = {
        title: formTitle.trim(),
        date: formDate,
        start_time: formStartTime || undefined,
        end_time: formEndTime || undefined,
        kind: formKind,
        place: formPlace.trim() || undefined,
        area: formArea,
        notes: formNotes.trim() || undefined,
        updated_at: now,
      };
      await db.events.update(editingEvent.id, updateData);
      SyncQueueService.enqueueChange('events', editingEvent.id, 'UPDATE', { ...editingEvent, ...updateData });
    } else {
      const newEvent: EventItem = {
        id: generateId(),
        title: formTitle.trim(),
        date: formDate,
        start_time: formStartTime || undefined,
        end_time: formEndTime || undefined,
        kind: formKind,
        place: formPlace.trim() || undefined,
        area: formArea,
        notes: formNotes.trim() || undefined,
        created_at: now,
        updated_at: now,
      };
      await db.events.add(newEvent);
      SyncQueueService.enqueueChange('events', newEvent.id, 'INSERT', newEvent);
    }

    setIsModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (eventToDelete) {
      await db.events.delete(eventToDelete);
      SyncQueueService.enqueueChange('events', eventToDelete, 'DELETE', { id: eventToDelete });
      setEventToDelete(null);
    }
  };

  const handleSyncGoogleCalendar = async () => {
    setIsSyncingGoogle(true);
    setSyncStatusMsg(null);
    try {
      const res = await GoogleCalendarService.syncFromGoogle();
      setSyncStatusMsg({
        text: `Calendar synced: ${res.imported} new events imported, ${res.updated} updated from Google Calendar.`,
        success: true,
      });
    } catch (err: any) {
      setSyncStatusMsg({
        text: `Calendar sync: ${err.message || 'Requires Google Workspace connection in Settings.'}`,
        success: false,
      });
    } finally {
      setIsSyncingGoogle(false);
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  // Generate calendar grid cells for month view
  const calendarCells = [];
  // Empty leading days
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarCells.push(null);
  }
  // Month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({
      dayNumber: d,
      dateStr: dStr,
      isToday: dStr === today,
      dayEvents: events.filter((e) => e.date === dStr),
      dayTasks: showTasks ? calItems.filter((it) => it.source === 'task' && it.date === dStr) : [],
      dayMeetings: calItems.filter((it) => it.source === 'meeting' && it.date === dStr),
      hasClash: calItems.some((it) => it.date === dStr && clashes.has(itemKey(it))),
    });
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header with Navigation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Calendar & Schedules
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Coordinate milestones, lab slots, client visits, and deadlines
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* View mode toggle */}
          <div className="flex items-center bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-1 text-xs font-semibold">
            {(['month', 'week', 'day', 'agenda'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={`px-3 py-1.5 rounded-lg capitalize transition-colors cursor-pointer ${
                  viewMode === mode
                    ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                    : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowTasks(!showTasks)}
            aria-pressed={showTasks}
            title="Show tasks with a due date on the calendar"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-semibold cursor-pointer transition-colors ${
              showTasks
                ? 'border-[var(--hub-accent)] text-[var(--hub-accent)] bg-[var(--hub-accent)]/10'
                : 'border-[var(--hub-line)] text-[var(--hub-muted)] bg-[var(--hub-surface)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <ListTodo className="w-4 h-4" aria-hidden="true" />
            <span>Tasks</span>
          </button>

          <button
            onClick={() => openCreateModal()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Event</span>
          </button>
        </div>
      </div>

      {/* Date Navigation Bar */}
      <div className="flex items-center justify-between bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded-lg border border-[var(--hub-line)] hover:bg-[var(--hub-bg)] text-[var(--hub-ink)] cursor-pointer"
            aria-label="Previous"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={handleToday}
            className="px-3 py-1 rounded-lg border border-[var(--hub-line)] text-xs font-semibold hover:bg-[var(--hub-bg)] text-[var(--hub-ink)] cursor-pointer"
          >
            Today
          </button>
          <button
            onClick={handleNext}
            className="p-1.5 rounded-lg border border-[var(--hub-line)] hover:bg-[var(--hub-bg)] text-[var(--hub-ink)] cursor-pointer"
            aria-label="Next"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <h3 className="font-heading font-bold text-base sm:text-lg text-[var(--hub-ink)] text-center">
          {viewMode === 'week' || viewMode === 'agenda'
            ? (() => {
                const r = rangeFor(viewMode, currentDate);
                const a = fromDateKey(r[0]);
                const b = fromDateKey(r[r.length - 1]);
                return `${a.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
              })()
            : currentDate.toLocaleDateString('en-IN', {
                month: 'long',
                year: 'numeric',
                ...(viewMode === 'day' ? { day: 'numeric', weekday: 'long' } : {}),
              })}
        </h3>

        <div className="text-xs text-[var(--hub-muted)] hidden sm:block">
          {visibleClashCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              {visibleClashCount} clashing {visibleClashCount === 1 ? 'item' : 'items'} here
            </span>
          ) : (
            `${events.length} events`
          )}
        </div>
      </div>

      {/* Google Calendar Cloud Sync Status Notice */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-2 text-[var(--hub-muted)]">
          <CalendarDays className="w-4 h-4 text-blue-700 dark:text-blue-300 flex-none" />
          <span>
            Google Calendar Sync:{' '}
            <strong className={isGoogleConnected ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-[var(--hub-ink)] font-semibold'}>
              {isGoogleConnected ? 'Connected' : 'Ready to Connect'}
            </strong>{' '}
            ({isGoogleConnected ? 'Two-way sync active with Google Calendar' : 'Connect Google Workspace in Settings to enable two-way sync'})
          </span>
        </div>
        {isGoogleConnected && (
          <button
            onClick={handleSyncGoogleCalendar}
            disabled={isSyncingGoogle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGoogle ? 'animate-spin' : ''}`} />
            <span>{isSyncingGoogle ? 'Syncing...' : 'Sync Calendar'}</span>
          </button>
        )}
      </div>

      {syncStatusMsg && (
        <div className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
          syncStatusMsg.success
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
        }`}>
          <span>{syncStatusMsg.text}</span>
          <button onClick={() => setSyncStatusMsg(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Month View Grid */}
      {viewMode === 'month' && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl overflow-hidden shadow-xs">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 border-b border-[var(--hub-line)] bg-[var(--hub-bg)] text-center text-xs font-bold text-[var(--hub-muted)] py-2.5">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          {/* Calendar Day Cells */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-[var(--hub-line)]">
            {calendarCells.map((cell, index) => {
              if (!cell) {
                return (
                  <div
                    key={`empty-${index}`}
                    className="min-h-[90px] sm:min-h-[110px] bg-[var(--hub-bg)]/30 p-2"
                  />
                );
              }

              return (
                <div
                  key={cell.dateStr}
                  onClick={() => openCreateModal(cell.dateStr)}
                  className={`min-h-[90px] sm:min-h-[110px] p-1.5 sm:p-2 cursor-pointer transition-colors hover:bg-[var(--hub-bg)]/60 ${
                    cell.isToday ? 'bg-teal-500/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                        cell.isToday
                          ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                          : 'text-[var(--hub-ink)]'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    <span className="flex items-center gap-1">
                      {cell.hasClash && (
                        <span title="Overlapping times on this day" className="text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span className="sr-only">Overlapping times on this day</span>
                        </span>
                      )}
                      {cell.dayEvents.length + cell.dayMeetings.length + cell.dayTasks.length > 0 && (
                        <span className="text-[10px] font-bold text-[var(--hub-muted)] sm:hidden">
                          {cell.dayEvents.length + cell.dayMeetings.length + cell.dayTasks.length}
                        </span>
                      )}
                    </span>
                  </div>

                  {(() => {
                    // At most 3 lines per day (events, then meetings, then tasks), then "+N more".
                    const MAX = 3;
                    const shownEvents = cell.dayEvents.slice(0, MAX);
                    const shownMeetings = cell.dayMeetings.slice(0, MAX - shownEvents.length);
                    const shownTasks = cell.dayTasks.slice(0, MAX - shownEvents.length - shownMeetings.length);
                    const hidden = cell.dayEvents.length + cell.dayMeetings.length + cell.dayTasks.length - shownEvents.length - shownMeetings.length - shownTasks.length;
                    return (
                      <div className="space-y-1">
                        {shownEvents.map((ev) => (
                          <div
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(ev);
                            }}
                            className="text-[11px] p-1 rounded font-medium truncate bg-[var(--hub-bg)] border border-[var(--hub-line)] hover:border-[var(--hub-accent)] transition-all flex items-center gap-1"
                            title={`${ev.title} (${ev.kind})`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full flex-none ${
                                ev.kind === 'Deadline' ? 'bg-red-500' : ev.kind === 'Meeting' ? 'bg-purple-500' : 'bg-teal-500'
                              }`}
                            />
                            <span className="truncate text-[var(--hub-ink)]">{ev.title}</span>
                          </div>
                        ))}
                        {shownMeetings.map((m) => (
                          <div
                            key={`m-${m.id}`}
                            // Meetings are managed on the Meetings page; a click here must not start a new event.
                            onClick={(e) => e.stopPropagation()}
                            className="text-[11px] p-1 rounded font-medium truncate bg-purple-500/5 border border-purple-500/20 flex items-center gap-1 cursor-default"
                            title={`${m.title} (meeting, ${formatTimeRange(m)})`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full flex-none bg-purple-500" />
                            <span className="truncate text-[var(--hub-ink)]">{m.title}</span>
                          </div>
                        ))}
                        {shownTasks.map((t) => (
                          <button
                            key={`t-${t.id}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void toggleTaskFromCalendar(t.id);
                            }}
                            aria-label={`${t.done ? 'Reopen' : 'Complete'} task: ${t.title}`}
                            className={`w-full text-left text-[11px] px-1 truncate flex items-center gap-1 rounded hover:bg-[var(--hub-surface-hover)] cursor-pointer ${t.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}
                            title={`Task due: ${t.title}${t.done ? ' (done)' : ''}`}
                          >
                            {t.done ? (
                              <CheckSquare className="w-3 h-3 flex-none text-[var(--hub-accent)]" aria-hidden="true" />
                            ) : (
                              <Square className="w-3 h-3 flex-none text-[var(--hub-muted)]" aria-hidden="true" />
                            )}
                            <span className="truncate">{t.title}</span>
                          </button>
                        ))}
                        {hidden > 0 && <div className="text-[10px] text-[var(--hub-muted)] font-medium pl-1">+{hidden} more</div>}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {events.length === 0 && (
            <div className="p-8 text-center border-t border-[var(--hub-line)] bg-[var(--hub-bg)]/30">
              <CalendarIcon className="w-8 h-8 mx-auto text-[var(--hub-muted)] mb-2 opacity-50" />
              <p className="text-sm font-semibold text-[var(--hub-ink)]">No events scheduled for this month</p>
              <p className="text-xs text-[var(--hub-muted)] mt-0.5">Click any date block or "Schedule Event" above to schedule an event or meeting.</p>
            </div>
          )}
        </div>
      )}

      {/* Day / Week / Agenda: one section per day, with clashes flagged */}
      {viewMode !== 'month' && (
        <CalendarDayList
          days={rangeFor(viewMode, currentDate)}
          items={calItems}
          clashes={clashes}
          today={today}
          hideEmptyDays={viewMode === 'agenda'}
          onOpenEvent={(id) => {
            const ev = allEvents.find((e) => e.id === id);
            if (ev) openEditModal(ev);
          }}
          onToggleTask={toggleTaskFromCalendar}
          onAdd={(date) => openCreateModal(date)}
        />
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEvent ? 'Edit Event' : 'Schedule Event'}
      >
        <form onSubmit={handleSaveEvent} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Event Title *
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Aerodynamic wind tunnel test session..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Date *
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Start Time
              </label>
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                End Time
              </label>
              <input
                type="time"
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                aria-invalid={formEndInvalid}
                aria-describedby={formEndInvalid ? 'event-time-error' : undefined}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

          {formEndInvalid && (
            <p id="event-time-error" role="alert" className="text-xs font-semibold text-[var(--hub-red)]">
              The end time is the same as the start time. Change one of them, or clear the end time.
            </p>
          )}
          {!formEndInvalid && formEndsNextDay && (
            <p className="text-xs text-[var(--hub-muted)]">Ends the next day ({formEndTime}).</p>
          )}
          {!formEndInvalid && formClashes.length > 0 && (
            <div role="status" className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
              <span>
                Overlaps with {formClashes.map((c) => `“${c.title}” (${formatTimeRange(c)}${c.source === 'meeting' ? ', meeting' : ''})`).join(', ')}. You can still save it.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Category
              </label>
              <select
                value={formKind}
                onChange={(e) => setFormKind(e.target.value as EventKind)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                <option value="Meeting">Meeting</option>
                <option value="Deadline">Deadline</option>
                <option value="Travel">Travel</option>
                <option value="Milestone">Milestone</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Workspace Area
              </label>
              <select
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Location / Video Link
            </label>
            <input
              type="text"
              value={formPlace}
              onChange={(e) => setFormPlace(e.target.value)}
              placeholder="e.g. IvLabs Room 204 or meet.google.com/xyz"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Notes & Agenda
            </label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="Points to discuss or preparation notes..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--hub-line)]">
            {editingEvent && (
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEventToDelete(editingEvent.id);
                }}
                className="mr-auto inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg text-[var(--hub-red)] hover:bg-red-500/10 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formEndInvalid}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingEvent ? 'Save Changes' : 'Schedule Event'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(eventToDelete)}
        onClose={() => setEventToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Event"
        message="Are you sure you want to delete this event?"
      />
    </div>
  );
};
