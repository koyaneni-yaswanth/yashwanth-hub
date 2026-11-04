import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Video,
  Plus,
  Clock,
  ExternalLink,
  Users,
  CheckCircle2,
  Trash2,
  Edit2,
  Calendar,
  ListTodo,
} from 'lucide-react';
import { db } from '../db';
import type { Meeting, Area } from '../types';
import { formatShortDate, getTodayISO, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface MeetingsPageProps {
  currentArea: string;
  areas: Area[];
}

export const MeetingsPage: React.FC<MeetingsPageProps> = ({ currentArea, areas }) => {
  const today = getTodayISO();

  // State
  const [statusTab, setStatusTab] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [meetingToDelete, setMeetingToDelete] = useState<string | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(today);
  const [formStartTime, setFormStartTime] = useState('11:00');
  const [formEndTime, setFormEndTime] = useState('12:00');
  const [formAttendees, setFormAttendees] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formAgenda, setFormAgenda] = useState('');
  const [formActionItems, setFormActionItems] = useState('');
  const [formStatus, setFormStatus] = useState<'scheduled' | 'completed' | 'cancelled'>('scheduled');

  // Live Query
  const allMeetings = useLiveQuery(() => db.meetings.toArray(), []) || [];
  const meetings = currentArea === 'All' ? allMeetings : allMeetings.filter((m) => m.area === currentArea);

  // Filter meetings by statusTab
  const filteredMeetings = meetings.filter((m) => {
    if (statusTab === 'upcoming') {
      return m.status === 'scheduled' && m.date >= today;
    }
    if (statusTab === 'past') {
      return m.status === 'completed' || m.date < today;
    }
    return true;
  });

  const sortedMeetings = [...filteredMeetings].sort((a, b) =>
    (b.date + b.start_time).localeCompare(a.date + a.start_time)
  );

  const openCreateModal = () => {
    setEditingMeeting(null);
    setFormTitle('');
    setFormDate(today);
    setFormStartTime('11:00');
    setFormEndTime('12:00');
    setFormAttendees('');
    setFormLocation('https://meet.google.com/');
    setFormArea(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
    setFormAgenda('');
    setFormActionItems('');
    setFormStatus('scheduled');
    setIsModalOpen(true);
  };

  const openEditModal = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    setFormTitle(meeting.title);
    setFormDate(meeting.date);
    setFormStartTime(meeting.start_time);
    setFormEndTime(meeting.end_time || '');
    setFormAttendees(meeting.attendees);
    setFormLocation(meeting.location_or_link);
    setFormArea(meeting.area);
    setFormAgenda(meeting.agenda_and_notes);
    setFormActionItems(meeting.action_items || '');
    setFormStatus(meeting.status);
    setIsModalOpen(true);
  };

  const handleSaveMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const now = new Date().toISOString();

    if (editingMeeting) {
      await db.meetings.update(editingMeeting.id, {
        title: formTitle.trim(),
        date: formDate,
        start_time: formStartTime,
        end_time: formEndTime || undefined,
        attendees: formAttendees.trim(),
        location_or_link: formLocation.trim(),
        area: formArea,
        agenda_and_notes: formAgenda.trim(),
        action_items: formActionItems.trim() || undefined,
        status: formStatus,
        updated_at: now,
      });
    } else {
      const newMeeting: Meeting = {
        id: generateId(),
        title: formTitle.trim(),
        date: formDate,
        start_time: formStartTime,
        end_time: formEndTime || undefined,
        attendees: formAttendees.trim(),
        location_or_link: formLocation.trim(),
        area: formArea,
        agenda_and_notes: formAgenda.trim(),
        action_items: formActionItems.trim() || undefined,
        status: formStatus,
        created_at: now,
        updated_at: now,
      };
      await db.meetings.add(newMeeting);
    }

    setIsModalOpen(false);
  };

  const handleToggleCompleted = async (meeting: Meeting) => {
    const nextStatus = meeting.status === 'completed' ? 'scheduled' : 'completed';
    await db.meetings.update(meeting.id, {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    });
  };

  const handleConfirmDelete = async () => {
    if (meetingToDelete) {
      await db.meetings.delete(meetingToDelete);
      setMeetingToDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Meetings & Check-ins
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Coordinate founder updates, advisor reviews, vendor syncs and sprint check-ins
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Meeting</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-[var(--hub-surface)] border border-[var(--hub-line)] p-1.5 rounded-xl w-fit">
        {(
          [
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'past', label: 'Past & Done' },
            { id: 'all', label: `All (${meetings.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              statusTab === tab.id
                ? 'bg-[var(--hub-accent)] text-white'
                : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Meeting Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedMeetings.length === 0 ? (
          <div className="col-span-full bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-12 text-center text-sm text-[var(--hub-muted)]">
            <Video className="w-10 h-10 mx-auto text-blue-500 mb-3 opacity-60" />
            <h3 className="text-base font-bold text-[var(--hub-ink)]">No meetings in this view</h3>
            <p className="text-xs mt-1">Schedule your next professor sync or investor review.</p>
          </div>
        ) : (
          sortedMeetings.map((meeting) => {
            const isToday = meeting.date === today;
            const isCompleted = meeting.status === 'completed';
            return (
              <div
                key={meeting.id}
                className={`flex flex-col justify-between p-5 rounded-xl border transition-all ${
                  isCompleted
                    ? 'bg-[var(--hub-surface-subtle)] border-[var(--hub-line)] opacity-80'
                    : isToday
                    ? 'bg-blue-500/5 border-blue-500/30 shadow-sm'
                    : 'bg-[var(--hub-surface)] border-[var(--hub-line)] hover:border-[var(--hub-accent)] shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Badge variant={isCompleted ? 'gray' : 'purple'} dot>
                      {meeting.status.toUpperCase()}
                    </Badge>
                    <Badge variant="teal">{meeting.area}</Badge>
                  </div>

                  <h3 className="text-base font-bold font-heading text-[var(--hub-ink)] leading-snug">
                    {meeting.title}
                  </h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--hub-muted)] mt-2">
                    <span className="flex items-center gap-1 font-semibold text-[var(--hub-ink)]">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      {formatShortDate(meeting.date)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {meeting.start_time} {meeting.end_time ? `- ${meeting.end_time}` : ''}
                    </span>
                  </div>

                  {meeting.attendees && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--hub-muted)] mt-2">
                      <Users className="w-3.5 h-3.5 flex-none" />
                      <span className="truncate">{meeting.attendees}</span>
                    </div>
                  )}

                  {meeting.agenda_and_notes && (
                    <div className="mt-3 p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] whitespace-pre-wrap">
                      <p className="font-bold text-[11px] uppercase tracking-wider text-[var(--hub-muted)] mb-1">
                        Agenda & Notes
                      </p>
                      {meeting.agenda_and_notes}
                    </div>
                  )}

                  {meeting.action_items && (
                    <div className="mt-2.5 p-2.5 rounded-lg bg-teal-500/5 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200">
                      <div className="flex items-center gap-1 font-bold text-[11px] uppercase tracking-wider mb-1 text-teal-700 dark:text-teal-300">
                        <ListTodo className="w-3 h-3" />
                        <span>Action Items</span>
                      </div>
                      <p className="whitespace-pre-wrap">{meeting.action_items}</p>
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-[var(--hub-line)]">
                  {meeting.location_or_link ? (
                    <a
                      href={
                        meeting.location_or_link.startsWith('http')
                          ? meeting.location_or_link
                          : `https://${meeting.location_or_link}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Join Call / Open</span>
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--hub-muted)]">No link set</span>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleCompleted(meeting)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isCompleted
                          ? 'text-emerald-600 hover:bg-emerald-500/10'
                          : 'text-[var(--hub-muted)] hover:text-emerald-600 hover:bg-[var(--hub-bg)]'
                      }`}
                      title={isCompleted ? 'Mark scheduled' : 'Mark completed'}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(meeting)}
                      className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                      title="Edit meeting"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setMeetingToDelete(meeting.id)}
                      className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                      title="Delete meeting"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingMeeting ? 'Edit Meeting' : 'Schedule Meeting'}
      >
        <form onSubmit={handleSaveMeeting} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Meeting Title *
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Professor Fortnightly Review: TRL Gap Analysis"
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
                Start Time *
              </label>
              <input
                type="time"
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
                required
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
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as any)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Attendees
            </label>
            <input
              type="text"
              value={formAttendees}
              onChange={(e) => setFormAttendees(e.target.value)}
              placeholder="e.g. Dr. Rao, Vendor Rep, Yaswanth"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Meeting Link or Location
            </label>
            <input
              type="text"
              value={formLocation}
              onChange={(e) => setFormLocation(e.target.value)}
              placeholder="e.g. https://meet.google.com/abc-def-ghi"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Agenda & Discussion Notes
            </label>
            <textarea
              value={formAgenda}
              onChange={(e) => setFormAgenda(e.target.value)}
              rows={3}
              placeholder="1-page update, ask for one lab slot or grant intro..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Action Items Generated
            </label>
            <textarea
              value={formActionItems}
              onChange={(e) => setFormActionItems(e.target.value)}
              rows={2}
              placeholder="Deliverables and follow-up tasks assigned..."
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
              {editingMeeting ? 'Save Changes' : 'Schedule Meeting'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(meetingToDelete)}
        onClose={() => setMeetingToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Meeting"
        message="Are you sure you want to remove this meeting record?"
      />
    </div>
  );
};
