import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FileText,
  Plus,
  Search,
  Pin,
  Trash2,
  Edit2,
  Tag,
  Clock,
  Sparkles,
} from 'lucide-react';
import { db } from '../db';
import type { Note, Area } from '../types';
import { formatShortDate, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface NotesPageProps {
  currentArea: string;
  areas: Area[];
}

export const NotesPage: React.FC<NotesPageProps> = ({ currentArea, areas }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<string | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formTags, setFormTags] = useState('');
  const [formPinned, setFormPinned] = useState(false);

  // Live Query
  const allNotes = useLiveQuery(() => db.notes.toArray(), []) || [];

  // Filter notes
  const filteredNotes = allNotes.filter((note) => {
    if (selectedAreaFilter !== 'All' && note.area !== selectedAreaFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = note.title.toLowerCase().includes(q);
      const matchBody = note.body.toLowerCase().includes(q);
      const matchTags = note.tags?.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchBody && !matchTags) return false;
    }
    return true;
  });

  // Sort: Pinned first, then newest
  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });

  const openCreateModal = () => {
    setEditingNote(null);
    setFormTitle('');
    setFormBody('');
    setFormArea(selectedAreaFilter !== 'All' ? selectedAreaFilter : 'PAWAN SHAKTI');
    setFormTags('');
    setFormPinned(false);
    setIsModalOpen(true);
  };

  const openEditModal = (note: Note) => {
    setEditingNote(note);
    setFormTitle(note.title);
    setFormBody(note.body);
    setFormArea(note.area || 'Personal');
    setFormTags(note.tags ? note.tags.join(', ') : '');
    setFormPinned(note.pinned);
    setIsModalOpen(true);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const now = new Date().toISOString();
    const tagArray = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingNote) {
      await db.notes.update(editingNote.id, {
        title: formTitle.trim(),
        body: formBody.trim(),
        area: formArea,
        tags: tagArray.length > 0 ? tagArray : undefined,
        pinned: formPinned,
        updated_at: now,
      });
    } else {
      const newNote: Note = {
        id: generateId(),
        title: formTitle.trim(),
        body: formBody.trim(),
        area: formArea,
        tags: tagArray.length > 0 ? tagArray : undefined,
        pinned: formPinned,
        created_at: now,
        updated_at: now,
      };
      await db.notes.add(newNote);
    }

    setIsModalOpen(false);
  };

  const handleTogglePin = async (note: Note) => {
    await db.notes.update(note.id, {
      pinned: !note.pinned,
      updated_at: new Date().toISOString(),
    });
  };

  const handleConfirmDelete = async () => {
    if (noteToDelete) {
      await db.notes.delete(noteToDelete);
      setNoteToDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Notes & Directives
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Capture founder thoughts, engineering specs, lab data and meeting notes
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Note</span>
        </button>
      </div>

      {/* Search & Area Filter */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search note titles, content or tags..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] placeholder:text-[var(--hub-muted)]"
          />
        </div>

        <select
          value={selectedAreaFilter}
          onChange={(e) => setSelectedAreaFilter(e.target.value)}
          className="w-full sm:w-auto py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm font-medium cursor-pointer"
        >
          <option value="All">All Areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Notes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedNotes.length === 0 ? (
          <div className="col-span-full bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-12 text-center text-sm text-[var(--hub-muted)]">
            <FileText className="w-10 h-10 mx-auto text-amber-500 mb-3 opacity-60" />
            <h3 className="text-base font-bold text-[var(--hub-ink)]">No notes found</h3>
            <p className="text-xs mt-1">Capture your first engineering note or founder principle.</p>
          </div>
        ) : (
          sortedNotes.map((note) => (
            <div
              key={note.id}
              className={`flex flex-col justify-between p-4 rounded-xl border transition-all ${
                note.pinned
                  ? 'border-l-4 border-l-[var(--hub-amber)] bg-[var(--hub-surface)] border-[var(--hub-line)] shadow-xs'
                  : 'bg-[var(--hub-surface)] border-[var(--hub-line)] hover:border-[var(--hub-accent)] shadow-xs'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold font-heading text-[var(--hub-ink)] leading-snug">
                    {note.title}
                  </h3>
                  <button
                    onClick={() => handleTogglePin(note)}
                    className={`p-1 rounded-md transition-colors cursor-pointer flex-none ${
                      note.pinned
                        ? 'text-amber-500 bg-amber-500/10'
                        : 'text-[var(--hub-muted)] hover:text-amber-500 hover:bg-[var(--hub-bg)]'
                    }`}
                    title={note.pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
                  >
                    <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-amber-500' : ''}`} />
                  </button>
                </div>

                <p className="text-xs text-[var(--hub-ink)] opacity-90 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {note.body}
                </p>

                {note.tags && note.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-3">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-line)]"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-[var(--hub-line)] text-[11px] text-[var(--hub-muted)]">
                <div className="flex items-center gap-2">
                  {note.area && <Badge variant="teal">{note.area}</Badge>}
                  <span>{formatShortDate(note.updated_at.slice(0, 10))}</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditModal(note)}
                    className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                    title="Edit note"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setNoteToDelete(note.id)}
                    className="p-1 rounded text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingNote ? 'Edit Note' : 'Create Note'}
      >
        <form onSubmit={handleSaveNote} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Title *
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Axial Flux Generator Rotor Balancing Notes"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
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
                Tags (Comma separated)
              </label>
              <input
                type="text"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                placeholder="TRL, Generator, Lab"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Note Content *
            </label>
            <textarea
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              rows={8}
              placeholder="Write your note, formulas, data findings, or plan..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] font-mono text-xs leading-relaxed"
              required
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--hub-ink)]">
            <input
              type="checkbox"
              checked={formPinned}
              onChange={(e) => setFormPinned(e.target.checked)}
              className="w-4 h-4 rounded text-[var(--hub-accent)] focus:ring-[var(--hub-accent)]"
            />
            <span>Pin this note to Command Dashboard</span>
          </label>

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
              {editingNote ? 'Save Changes' : 'Save Note'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(noteToDelete)}
        onClose={() => setNoteToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Note"
        message="Are you sure you want to permanently delete this note?"
      />
    </div>
  );
};
