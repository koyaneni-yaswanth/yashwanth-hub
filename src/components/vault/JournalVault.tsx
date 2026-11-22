import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Lightbulb, Scale, GraduationCap, FileText, Search, Pin, PinOff, Pencil, Trash2, Tag, X } from 'lucide-react';
import { db } from '../../db';
import type { Area, Note, NoteKind } from '../../types';
import { generateId } from '../../lib/utils';
import { ConfirmDialog } from '../common/ConfirmDialog';

const KINDS: { id: NoteKind; label: string; icon: React.ElementType; prompt: string }[] = [
  { id: 'reflection', label: 'Reflection', icon: Lightbulb, prompt: 'What went well? What felt hard? What will you try next?' },
  { id: 'decision', label: 'Decision', icon: Scale, prompt: 'What did you decide, what were the options, and why this one?' },
  { id: 'lesson', label: 'Lesson', icon: GraduationCap, prompt: 'What did you learn, and when will it matter again?' },
  { id: 'note', label: 'Note', icon: FileText, prompt: 'Anything worth keeping…' },
];

const kindOf = (n: Note): NoteKind => n.kind ?? 'note';
const kindMeta = (k: NoteKind) => KINDS.find((x) => x.id === k) ?? KINDS[3];

const parseTags = (raw: string): string[] =>
  [...new Set(raw.split(/[,#]/).map((t) => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean))].slice(0, 12);

const fieldClass =
  'w-full px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-sm text-[var(--hub-ink)] focus:outline-none focus:border-[var(--hub-accent)]';
const labelClass = 'block text-xs font-semibold text-[var(--hub-muted)] mb-1';
const card = 'rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)] shadow-[var(--hub-card-shadow)]';
const chip = (active: boolean) =>
  `inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
    active
      ? 'bg-[var(--hub-accent)] border-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
      : 'border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
  }`;

export const JournalVault: React.FC<{ currentArea: string; areas: Area[] }> = ({ currentArea, areas }) => {
  const notes = useLiveQuery(() => db.notes.toArray(), []);

  // Capture form
  const [editing, setEditing] = useState<Note | null>(null);
  const [kind, setKind] = useState<NoteKind>('reflection');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [area, setArea] = useState(currentArea !== 'All' ? currentArea : areas[0]?.name || 'Personal');

  // Browse filters
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<NoteKind | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Note | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setBody('');
    setTagInput('');
  };

  const startEdit = (n: Note) => {
    setEditing(n);
    setKind(kindOf(n));
    setTitle(n.title);
    setBody(n.body);
    setTagInput((n.tags || []).join(', '));
    setArea(n.area || area);
    document.getElementById('vault-title')?.focus();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim() || body.trim().split('\n')[0].slice(0, 80);
    if (!t) return;
    const ts = new Date().toISOString();
    const fields = { title: t, body: body.trim(), kind, tags: parseTags(tagInput), area, updated_at: ts };
    if (editing) {
      await db.notes.update(editing.id, fields);
      setAnnouncement(`${kindMeta(kind).label} updated.`);
    } else {
      await db.notes.add({ id: generateId(), ...fields, pinned: false, created_at: ts });
      setAnnouncement(`${kindMeta(kind).label} saved.`);
    }
    resetForm();
  };

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes || []) for (const t of n.tags || []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);
  }, [notes]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (notes || [])
      .filter((n) => currentArea === 'All' || n.area === currentArea)
      .filter((n) => kindFilter === 'all' || kindOf(n) === kindFilter)
      .filter((n) => !tagFilter || (n.tags || []).includes(tagFilter))
      .filter(
        (n) =>
          !q ||
          n.title.toLowerCase().includes(q) ||
          n.body.toLowerCase().includes(q) ||
          (n.tags || []).some((t) => t.includes(q)) ||
          (n.area || '').toLowerCase().includes(q)
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at));
  }, [notes, query, kindFilter, tagFilter, currentArea]);

  const activePrompt = kindMeta(kind).prompt;

  return (
    <div className="space-y-6">
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {/* Capture */}
      <section aria-labelledby="vault-capture-heading" className={`${card} p-4 sm:p-5`}>
        <h2 id="vault-capture-heading" className="text-base font-bold text-[var(--hub-ink)]">
          {editing ? `Edit ${kindMeta(kind).label.toLowerCase()}` : 'Capture'}
        </h2>
        <form onSubmit={save} className="mt-3 space-y-3">
          <fieldset>
            <legend className={labelClass}>Type</legend>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => {
                const Icon = k.icon;
                return (
                  <label key={k.id} className={chip(kind === k.id)}>
                    <input
                      type="radio"
                      name="vault-kind"
                      value={k.id}
                      checked={kind === k.id}
                      onChange={() => setKind(k.id)}
                      className="sr-only"
                    />
                    <Icon className="w-3.5 h-3.5" />
                    {k.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div>
            <label htmlFor="vault-title" className={labelClass}>
              Title
            </label>
            <input
              id="vault-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A short headline"
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="vault-body" className={labelClass}>
              Details
            </label>
            <textarea
              id="vault-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={activePrompt}
              aria-describedby="vault-body-hint"
              className={fieldClass}
            />
            <p id="vault-body-hint" className="text-[11px] text-[var(--hub-muted)] mt-1">
              {activePrompt}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="vault-tags" className={labelClass}>
                Tags <span className="font-normal">(comma separated)</span>
              </label>
              <input
                id="vault-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="testing, generator"
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="vault-area" className={labelClass}>
                Workspace area
              </label>
              <select id="vault-area" value={area} onChange={(e) => setArea(e.target.value)} className={fieldClass}>
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3.5 py-2 rounded-xl border border-[var(--hub-line)] text-sm font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!title.trim() && !body.trim()}
              className="px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
            >
              {editing ? 'Save changes' : `Save ${kindMeta(kind).label.toLowerCase()}`}
            </button>
          </div>
        </form>
      </section>

      {/* Browse */}
      <section aria-labelledby="vault-browse-heading" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <h2 id="vault-browse-heading" className="text-base font-bold text-[var(--hub-ink)]">
            Your vault{' '}
            <span className="text-sm font-medium text-[var(--hub-muted)]">
              ({results.length}
              {currentArea !== 'All' ? ` in ${currentArea}` : ''})
            </span>
          </h2>
          <div className="relative sm:w-72">
            <label htmlFor="vault-search" className="sr-only">
              Search the vault
            </label>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-muted)] pointer-events-none" />
            <input
              id="vault-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, details, tags…"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          <button type="button" className={chip(kindFilter === 'all')} aria-pressed={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
            All
          </button>
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={chip(kindFilter === k.id)}
              aria-pressed={kindFilter === k.id}
              onClick={() => setKindFilter(kindFilter === k.id ? 'all' : k.id)}
            >
              {k.label}s
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
            <Tag className="w-3.5 h-3.5 text-[var(--hub-muted)]" aria-hidden="true" />
            {allTags.map((t) => (
              <button
                key={t}
                type="button"
                className={chip(tagFilter === t)}
                aria-pressed={tagFilter === t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
              >
                #{t}
              </button>
            ))}
            {tagFilter && (
              <button type="button" onClick={() => setTagFilter(null)} className="text-xs text-[var(--hub-muted)] hover:underline cursor-pointer inline-flex items-center gap-0.5">
                <X className="w-3 h-3" /> Clear tag
              </button>
            )}
          </div>
        )}

        {notes === undefined ? (
          <div className="hub-skeleton h-28 rounded-2xl" aria-hidden="true" />
        ) : results.length === 0 ? (
          <div className={`${card} p-6 text-center text-sm text-[var(--hub-muted)]`}>
            {query || tagFilter || kindFilter !== 'all'
              ? 'Nothing matches those filters yet. Try a broader search.'
              : 'Your vault is empty. Capture a reflection after your next work session — even one line helps.'}
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {results.map((n) => {
              const meta = kindMeta(kindOf(n));
              const Icon = meta.icon;
              return (
                <li key={n.id} className={`${card} p-4 flex flex-col gap-2 min-w-0`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-[var(--hub-muted)]">
                        <span className="inline-flex items-center gap-1 text-[var(--hub-accent)]">
                          <Icon className="w-3.5 h-3.5" />
                          {meta.label}
                        </span>
                        {n.area && <span>· {n.area}</span>}
                        <span>
                          ·{' '}
                          {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(n.updated_at))}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-[var(--hub-ink)] mt-0.5 break-words">{n.title}</h3>
                    </div>
                    <div className="flex shrink-0">
                      <button
                        type="button"
                        onClick={() => db.notes.update(n.id, { pinned: !n.pinned, updated_at: n.updated_at })}
                        aria-pressed={n.pinned}
                        aria-label={`${n.pinned ? 'Unpin' : 'Pin'} ${n.title}`}
                        className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                      >
                        {n.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(n)}
                        aria-label={`Edit ${n.title}`}
                        className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setToDelete(n)}
                        aria-label={`Delete ${n.title}`}
                        className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-red)] hover:bg-[var(--hub-bg)] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {n.body && <p className="text-sm text-[var(--hub-muted)] line-clamp-3 whitespace-pre-line break-words">{n.body}</p>}
                  {(n.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(n.tags || []).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setTagFilter(t)}
                          className="text-[11px] px-1.5 py-0.5 rounded-md bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                          aria-label={`Show entries tagged ${t}`}
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={async () => {
          if (toDelete) {
            await db.notes.delete(toDelete.id);
            setAnnouncement(`Deleted ${toDelete.title}.`);
            if (editing?.id === toDelete.id) resetForm();
          }
          setToDelete(null);
        }}
        title="Delete this entry?"
        message={`"${toDelete?.title ?? ''}" will be permanently deleted from this device.`}
      />
    </div>
  );
};
