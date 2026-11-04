import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Trash2,
  Edit2,
  CalendarDays,
} from 'lucide-react';
import { db } from '../db';
import type { EventItem, EventKind, Area } from '../types';
import { formatFullDate, getTodayISO, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { SyncQueueService } from '../services/sync/syncQueueService';

interface CalendarPageProps {
  currentArea: string;
  areas: Area[];
}

export const CalendarPage: React.FC<CalendarPageProps> = ({ currentArea, areas }) => {
  const today = getTodayISO();

  // Calendar View State: Month | Week | Day
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

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

  // Live Query
  const allEvents = useLiveQuery(() => db.events.toArray(), []) || [];
  const events = currentArea === 'All' ? allEvents : allEvents.filter((e) => e.area === currentArea);

  // Month calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getTime() - 7 * 86400000));
    } else {
      setCurrentDate(new Date(currentDate.getTime() - 86400000));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getTime() + 7 * 86400000));
    } else {
      setCurrentDate(new Date(currentDate.getTime() + 86400000));
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
    if (!formTitle.trim()) return;

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

  // Helper for kind badge color
  const getKindVariant = (kind: EventKind) => {
    switch (kind) {
      case 'Meeting':
        return 'purple';
      case 'Deadline':
        return 'red';
      case 'Travel':
        return 'blue';
      case 'Milestone':
        return 'emerald';
      default:
        return 'teal';
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

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* View mode toggle */}
          <div className="flex items-center bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-1 text-xs font-semibold">
            {(['month', 'week', 'day'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-colors cursor-pointer ${
                  viewMode === mode
                    ? 'bg-[var(--hub-accent)] text-white'
                    : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={() => openCreateModal()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs"
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

        <h3 className="font-heading font-bold text-base sm:text-lg text-[var(--hub-ink)]">
          {currentDate.toLocaleDateString('en-IN', {
            month: 'long',
            year: 'numeric',
            ...(viewMode === 'day' ? { day: 'numeric', weekday: 'long' } : {}),
          })}
        </h3>

        <div className="text-xs text-[var(--hub-muted)] hidden sm:block">
          {events.length} total events
        </div>
      </div>

      {/* Google Calendar Cloud Sync Status Notice */}
      <div className="bg-[var(--hub-surface)] border border-dashed border-[var(--hub-line)] rounded-xl p-3 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-[var(--hub-muted)]">
          <CalendarDays className="w-4 h-4 text-blue-500" />
          <span>
            Google Calendar Sync: <strong className="text-[var(--hub-ink)]">Local-First Ready</strong> (Connect in Settings when deploying live)
          </span>
        </div>
      </div>

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
                          ? 'bg-[var(--hub-accent)] text-white'
                          : 'text-[var(--hub-ink)]'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {cell.dayEvents.length > 0 && (
                      <span className="text-[10px] font-bold text-[var(--hub-muted)] sm:hidden">
                        {cell.dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 overflow-y-auto max-h-[70px]">
                    {cell.dayEvents.slice(0, 3).map((ev) => (
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
                            ev.kind === 'Deadline'
                              ? 'bg-red-500'
                              : ev.kind === 'Meeting'
                              ? 'bg-purple-500'
                              : 'bg-teal-500'
                          }`}
                        />
                        <span className="truncate text-[var(--hub-ink)]">{ev.title}</span>
                      </div>
                    ))}
                    {cell.dayEvents.length > 3 && (
                      <div className="text-[10px] text-[var(--hub-muted)] font-medium pl-1">
                        +{cell.dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Week / Day View List */}
      {(viewMode === 'week' || viewMode === 'day') && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl divide-y divide-[var(--hub-line)] shadow-xs">
          {events.length === 0 ? (
            <div className="p-12 text-center text-sm text-[var(--hub-muted)]">
              <CalendarIcon className="w-10 h-10 mx-auto text-[var(--hub-muted)] mb-3 opacity-60" />
              <p className="font-medium text-[var(--hub-ink)]">No events scheduled</p>
              <p className="text-xs mt-1">Click "Add Event" to schedule an event or meeting.</p>
            </div>
          ) : (
            events
              .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')))
              .map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start justify-between gap-4 p-4 hover:bg-[var(--hub-bg)]/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getKindVariant(ev.kind)} dot>
                        {ev.kind}
                      </Badge>
                      {ev.area && <Badge variant="teal">{ev.area}</Badge>}
                      <span className="text-xs font-medium text-[var(--hub-muted)] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatFullDate(ev.date)} {ev.start_time ? `at ${ev.start_time}` : ''}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-[var(--hub-ink)]">{ev.title}</h4>

                    {ev.place && (
                      <p className="text-xs text-[var(--hub-muted)] flex items-center gap-1 mt-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{ev.place}</span>
                      </p>
                    )}

                    {ev.notes && (
                      <p className="text-xs text-[var(--hub-muted)] mt-1.5 whitespace-pre-wrap">
                        {ev.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-none">
                    <button
                      onClick={() => openEditModal(ev)}
                      className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                      title="Edit event"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEventToDelete(ev.id)}
                      className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                      title="Delete event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
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
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

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
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-accent)] text-white hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
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
