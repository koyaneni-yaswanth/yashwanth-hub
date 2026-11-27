import type { Note, Priority } from '../types';

export interface NoteTaskInput {
  text: string;
  notes?: string;
  area: string;
  priority: Priority;
  starred: boolean;
  done: boolean;
  project_id?: string;
}

/**
 * Generates a safe filesystem filename for exporting a note as Markdown.
 */
export function noteToFilename(title: string): string {
  const slug = String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${slug || 'note'}.md`;
}

/**
 * Formats a Note record cleanly as portable Markdown with frontmatter-style metadata.
 */
export function buildNoteMarkdown(
  note: Pick<Note, 'title' | 'body' | 'area' | 'tags' | 'pinned' | 'kind' | 'updated_at'>
): string {
  const lines: string[] = [`# ${note.title.trim() || 'Untitled Note'}`, ''];
  const meta: string[] = [];
  if (note.area) meta.push(`Area: ${note.area}`);
  if (note.kind && note.kind !== 'note') meta.push(`Kind: ${note.kind}`);
  if (note.pinned) meta.push('Pinned: Yes');
  if (note.updated_at) meta.push(`Updated: ${note.updated_at.slice(0, 10)}`);
  if (note.tags && note.tags.length > 0) meta.push(`Tags: ${note.tags.map((t) => `#${t}`).join(' ')}`);

  if (meta.length > 0) {
    lines.push(`> ${meta.join(' · ')}`, '');
  }
  lines.push(note.body || '');
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Maps a Note into a verified TaskService.create input payload.
 */
export function buildNoteTaskInput(
  note: Pick<Note, 'title' | 'body' | 'area' | 'pinned' | 'project_id'>,
  fallbackArea = 'General'
): NoteTaskInput {
  const cleanTitle = note.title.trim() || 'Follow up on note';
  const bodySnippet = (note.body || '').trim().slice(0, 800);
  return {
    text: cleanTitle,
    notes: bodySnippet || undefined,
    area: note.area?.trim() || fallbackArea,
    priority: note.pinned ? 'high' : 'medium',
    starred: Boolean(note.pinned),
    done: false,
    ...(note.project_id ? { project_id: note.project_id } : {}),
  };
}

/**
 * Builds a concise prompt for JARVIS / Ask AI from a note's title, area, tags, and content.
 */
export function buildNoteAiPrompt(
  note: Pick<Note, 'title' | 'body' | 'area' | 'tags'>
): string {
  const tags = note.tags && note.tags.length > 0 ? ` [${note.tags.map((t) => `#${t}`).join(', ')}]` : '';
  const area = note.area ? ` (${note.area})` : '';
  const excerpt = (note.body || '').trim().slice(0, 1800);
  return `Review this note "${note.title.trim() || 'Untitled'}"${area}${tags} and give me crisp next actions, key decisions, or risks:\n\n${excerpt}`;
}

/**
 * Filters notes by query, workspace area, and pinned status while sorting pinned notes first.
 */
export function filterNotesList(
  notes: Note[],
  opts: { query?: string; area?: string; pinnedOnly?: boolean } = {}
): Note[] {
  const q = (opts.query || '').trim().toLowerCase();
  const area = (opts.area || '').trim();
  const filtered = notes.filter((n) => {
    if (opts.pinnedOnly && !n.pinned) return false;
    if (area && area !== 'All' && n.area !== area) return false;
    if (!q) return true;
    const inTitle = n.title.toLowerCase().includes(q);
    const inBody = (n.body || '').toLowerCase().includes(q);
    const inTags = Boolean(n.tags?.some((t) => t.toLowerCase().includes(q)));
    return inTitle || inBody || inTags;
  });

  return filtered.slice().sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updated_at || '').localeCompare(a.updated_at || '');
  });
}
