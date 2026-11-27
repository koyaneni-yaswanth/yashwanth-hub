import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FileText,
  Plus,
  Search,
  Pin,
  Trash2,
  Edit2,
  CheckSquare,
  Copy,
  Download,
  Eye,
  Sparkles,
} from 'lucide-react';
import { db } from '../db';
import type { Note, Area } from '../types';
import { SafeMarkdown } from '../components/common/SafeMarkdown';
import { TaskService } from '../services/sync/taskService';
import { toast } from '../lib/toast';
import {
  buildNoteAiPrompt,
  buildNoteMarkdown,
  buildNoteTaskInput,
  filterNotesList,
  noteToFilename,
} from '../lib/noteActions';
import { formatShortDate, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface NotesPageProps {
  currentArea: string;
  areas: Area[];
}

export const NotesPage: React.FC<NotesPageProps> = ({ currentArea, areas }) => {
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [previewNote, setPreviewNote] = useState<Note | null>(null);
  const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write');

  const triggerMarkdownDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopyNote = async (note: Note) => {
    try {
      await navigator.clipboard.writeText(buildNoteMarkdown(note));
      toast(`Copied "${note.title}" as Markdown`, 'success');
    } catch {
      toast('Clipboard permission unavailable in this browser context', 'error');
    }
  };

  const handleConvertToTask = async (note: Note) => {
    const fallbackArea = currentArea && currentArea !== 'All' ? currentArea : areas[0]?.name || 'General';
    const payload = buildNoteTaskInput(note, fallbackArea);
    await TaskService.create(payload);
    toast(`Created task: ${payload.text}`, 'success');
  };

  const handleStageForJarvis = async (note: Note) => {
    const prompt = buildNoteAiPrompt(note);
    localStorage.setItem('yash_ai_prefill_prompt', prompt);
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      // Clipboard optional; localStorage prefill is primary.
    }
    toast('Prompt staged & copied — open JARVIS or Ask AI in the top bar to continue', 'success');
  };

  const handleExportVisibleNotes = () => {
    const visible = filterNotesList(sortedNotes, { pinnedOnly });
    if (visible.length === 0) return;
    const bundle = visible.map((n) => buildNoteMarkdown(n)).join('\n---\n\n');
    triggerMarkdownDownload(`yashwanth-hub-notes-${new Date().toISOString().slice(0, 10)}.md`, bundle);
    toast(`Exported ${visible.length} note${visible.length === 1 ? '' : 's'} as Markdown`, 'success');
  };
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
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
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
            aria-label="Search notes"
            placeholder="Search note titles, content or tags..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] placeholder:text-[var(--hub-muted)]"
          />
        </div>

        <select
          value={selectedAreaFilter}
          onChange={(e) => setSelectedAreaFilter(e.target.value)}
          aria-label="Filter by workspace area"
          className="w-full sm:w-auto py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm font-medium cursor-pointer"
        >
          <option value="All">All Areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setPinnedOnly((p) => !p)}
          aria-pressed={pinnedOnly}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
            pinnedOnly
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300'
              : 'bg-[var(--hub-bg)] border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <Pin className="w-3.5 h-3.5" />
          Pinned only
        </button>

        <button
          type="button"
          onClick={handleExportVisibleNotes}
          disabled={filterNotesList(sortedNotes, { pinnedOnly }).length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer disabled:opacity-45 whitespace-nowrap"
          title="Export currently filtered notes as a single Markdown file"
        >
          <Download className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
          Export .md ({filterNotesList(sortedNotes, { pinnedOnly }).length})
        </button>
      </div>

      {/* Notes Grid */}
      {(() => {
        const displayNotes = filterNotesList(sortedNotes, { pinnedOnly });
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayNotes.length === 0 ? (
              <div className="col-span-full bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-12 text-center text-sm text-[var(--hub-muted)]">
                <FileText className="w-10 h-10 mx-auto text-amber-800 dark:text-amber-300 mb-3 opacity-60" />
                <h3 className="text-base font-bold text-[var(--hub-ink)]">
                  {pinnedOnly ? 'No pinned notes match your filter' : 'No notes found'}
                </h3>
                <p className="text-xs mt-1">
                  {pinnedOnly
                    ? 'Pin an important engineering note or turn off the Pinned only filter.'
                    : 'Capture your first engineering note or founder principle.'}
                </p>
              </div>
            ) : (
              displayNotes.map((note) => (
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
                        type="button"
                        onClick={() => handleTogglePin(note)}
                        className={`p-1 rounded-md transition-colors cursor-pointer flex-none ${
                          note.pinned
                            ? 'text-amber-800 dark:text-amber-300 bg-amber-500/10'
                            : 'text-[var(--hub-muted)] hover:text-amber-500 hover:bg-[var(--hub-bg)]'
                        }`}
                        title={note.pinned ? 'Unpin from dashboard' : 'Pin to dashboard'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-amber-500' : ''}`} />
                      </button>
                    </div>

                    <div className="text-xs text-[var(--hub-ink)] opacity-90 leading-relaxed max-h-52 overflow-y-auto pr-1">
                      <SafeMarkdown content={note.body} className="text-xs" />
                    </div>

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

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setPreviewNote(note)}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Read full note"
                        aria-label={`Read note ${note.title}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleConvertToTask(note)}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-accent)] hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Turn note into a task"
                        aria-label={`Convert ${note.title} to task`}
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCopyNote(note)}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Copy Markdown"
                        aria-label={`Copy ${note.title} as Markdown`}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerMarkdownDownload(noteToFilename(note.title), buildNoteMarkdown(note))}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Download Markdown (.md)"
                        aria-label={`Download ${note.title} as Markdown`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStageForJarvis(note)}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-accent)] hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Stage prompt for JARVIS / Ask AI"
                        aria-label={`Ask JARVIS about ${note.title}`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditorTab('write');
                          openEditModal(note);
                        }}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Edit note"
                        aria-label={`Edit ${note.title}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteToDelete(note.id)}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                        title="Delete note"
                        aria-label={`Delete ${note.title}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        );
      })()}

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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider">
                Note Content * <span className="font-normal text-[var(--hub-muted)] normal-case">(Markdown supported)</span>
              </label>
              <div className="inline-flex rounded-lg border border-[var(--hub-line)] overflow-hidden text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setEditorTab('write')}
                  className={`px-2.5 py-1 cursor-pointer ${
                    editorTab === 'write'
                      ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                      : 'bg-[var(--hub-bg)] text-[var(--hub-muted)]'
                  }`}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setEditorTab('preview')}
                  className={`px-2.5 py-1 cursor-pointer ${
                    editorTab === 'preview'
                      ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                      : 'bg-[var(--hub-bg)] text-[var(--hub-muted)]'
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>
            {editorTab === 'write' ? (
              <textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={8}
                placeholder="Write Markdown notes, formulas, code blocks, or engineering specs..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] font-mono text-xs leading-relaxed"
                required
              />
            ) : (
              <div className="min-h-[12rem] max-h-72 overflow-y-auto px-3 py-2.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs">
                {formBody.trim() ? (
                  <SafeMarkdown content={formBody} />
                ) : (
                  <p className="text-[var(--hub-muted)]">Nothing to preview yet.</p>
                )}
              </div>
            )}
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
              onClick={() => {
                setEditorTab('write');
                setIsModalOpen(false);
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
            >
              {editingNote ? 'Save Changes' : 'Save Note'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Full Markdown Reader Modal */}
      <Modal
        isOpen={Boolean(previewNote)}
        onClose={() => setPreviewNote(null)}
        title={previewNote?.title || 'Note'}
        maxWidth="max-w-2xl"
      >
        {previewNote && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--hub-muted)]">
              <div className="flex flex-wrap items-center gap-2">
                {previewNote.area && <Badge variant="teal">{previewNote.area}</Badge>}
                {previewNote.pinned && <Badge variant="amber">Pinned</Badge>}
                <span>Updated {formatShortDate(previewNote.updated_at.slice(0, 10))}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleConvertToTask(previewNote)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                  To Task
                </button>
                <button
                  type="button"
                  onClick={() => void handleStageForJarvis(previewNote)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                  Ask JARVIS
                </button>
                <button
                  type="button"
                  onClick={() => triggerMarkdownDownload(noteToFilename(previewNote.title), buildNoteMarkdown(previewNote))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  .md
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = previewNote;
                    setPreviewNote(null);
                    setEditorTab('write');
                    openEditModal(target);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] cursor-pointer"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] max-h-[60vh] overflow-y-auto">
              <SafeMarkdown content={previewNote.body} />
            </div>

            {previewNote.tags && previewNote.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {previewNote.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-line)]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
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
