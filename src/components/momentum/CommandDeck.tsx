import React, { useEffect, useRef } from 'react';
import { CheckCircle2, Circle, Compass, History, Lightbulb, Rocket, Timer, X, ChevronLeft, ChevronRight, BookOpen, Repeat } from 'lucide-react';
import type { Insight, ProjectSystem } from '../../lib/lifeInsights';
import type { Note, Task } from '../../types';

// ---------------------------------------------------------------------------
// Weekly Time Machine
// ---------------------------------------------------------------------------

export const TimeMachineBar: React.FC<{
  weeksAgo: number;
  maxWeeks: number;
  label: string;
  score: number | null;
  onChange: (weeksAgo: number) => void;
}> = ({ weeksAgo, maxWeeks, label, score, onChange }) => (
  <section className="os-glass px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2" aria-labelledby="tm-title">
    <h2 id="tm-title" className="flex items-center gap-2 text-sm font-semibold text-[var(--hub-ink)]">
      <History className="w-4 h-4 text-[var(--hub-accent)]" aria-hidden="true" />
      Time machine
    </h2>
    <div className="flex items-center gap-2 flex-1 min-w-[14rem]">
      <button type="button" onClick={() => onChange(Math.min(maxWeeks, weeksAgo + 1))} disabled={weeksAgo >= maxWeeks} className="os-chip p-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Previous week">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <input
        type="range"
        min={-maxWeeks}
        max={0}
        step={1}
        value={-weeksAgo}
        onChange={(e) => onChange(-Number(e.target.value))}
        aria-label="Week to view"
        aria-valuetext={label}
        className="flex-1 accent-[var(--hub-accent)] cursor-pointer"
      />
      <button type="button" onClick={() => onChange(Math.max(0, weeksAgo - 1))} disabled={weeksAgo === 0} className="os-chip p-1.5 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Next week">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
    <p className="text-sm text-[var(--hub-ink)] tabular-nums" aria-live="polite">
      <span className="font-semibold">{label}</span>
      <span className="text-[var(--hub-muted)]"> · Life Score {score ?? '—'}</span>
    </p>
    {weeksAgo > 0 && (
      <button type="button" onClick={() => onChange(0)} className="text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer">
        Back to now
      </button>
    )}
  </section>
);

// ---------------------------------------------------------------------------
// Today's compass: Top 3, habit checklist, next focus block
// ---------------------------------------------------------------------------

export interface CompassHabit {
  id: string;
  title: string;
  doneToday: boolean;
  color: string;
}

export const CompassPanel: React.FC<{
  top: Task[];
  hasPlan: boolean;
  habits: CompassHabit[];
  nextFocus: Task | null;
  focusHint: string | null;
  readOnly: boolean;
  onToggleTask: (t: Task) => void;
  onToggleHabit: (h: CompassHabit) => void;
  onStartFocus: (t: Task | null) => void;
  onPlanDay: () => void;
}> = ({ top, hasPlan, habits, nextFocus, focusHint, readOnly, onToggleTask, onToggleHabit, onStartFocus, onPlanDay }) => (
  <section className="os-glass p-5 space-y-4" aria-labelledby="compass-title">
    <div className="flex items-center justify-between gap-2">
      <h2 id="compass-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
        <Compass className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
        Today’s compass
      </h2>
      {readOnly && <span className="text-[11px] text-[var(--hub-muted)]">Showing today — the time machine affects the charts</span>}
    </div>

    <div className="grid md:grid-cols-3 gap-5">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--hub-muted)]">Top 3</h3>
        {top.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-[var(--hub-muted)]">{hasPlan ? 'Everything on today’s plan is done.' : 'No plan for today yet.'}</p>
            {!hasPlan && (
              <button type="button" onClick={onPlanDay} className="text-sm font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer">
                Plan my day
              </button>
            )}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {top.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => onToggleTask(t)}
                  aria-pressed={t.done}
                  aria-label={`${t.done ? 'Mark not done' : 'Mark done'}: ${t.text}`}
                  className={`mt-0.5 shrink-0 cursor-pointer ${t.done ? 'text-[var(--hub-accent)]' : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'}`}
                >
                  {t.done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </button>
                <span className={`text-sm break-words ${t.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>{t.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--hub-muted)]">Habits today</h3>
        {habits.length === 0 ? (
          <p className="text-sm text-[var(--hub-muted)]">No habits yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {habits.slice(0, 6).map((h) => (
              <li key={h.id} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onToggleHabit(h)}
                  aria-pressed={h.doneToday}
                  aria-label={`${h.doneToday ? 'Undo check-in' : 'Check in'}: ${h.title}`}
                  className={`shrink-0 cursor-pointer ${h.doneToday ? 'text-[var(--hub-accent)]' : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'}`}
                >
                  {h.doneToday ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </button>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: h.color }} aria-hidden="true" />
                <span className={`text-sm truncate ${h.doneToday ? 'text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>{h.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--hub-muted)]">Next focus block</h3>
        <p className="text-sm text-[var(--hub-ink)] break-words">{nextFocus ? nextFocus.text : 'Something of your choice'}</p>
        {focusHint && <p className="text-xs text-[var(--hub-muted)]">{focusHint}</p>}
        <button
          type="button"
          onClick={() => onStartFocus(nextFocus)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
        >
          <Timer className="w-4 h-4" aria-hidden="true" />
          Start focus
        </button>
      </div>
    </div>
  </section>
);

// ---------------------------------------------------------------------------
// Insight cards
// ---------------------------------------------------------------------------

export const InsightCards: React.FC<{ insights: Insight[] }> = ({ insights }) =>
  insights.length === 0 ? null : (
    <section aria-labelledby="insights-title" className="space-y-2">
      <h2 id="insights-title" className="text-sm font-semibold text-[var(--hub-ink)] flex items-center gap-1.5">
        <Lightbulb className="w-4 h-4 text-[var(--hub-accent)]" aria-hidden="true" />
        Insights
      </h2>
      <ul className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {insights.map((i) => (
          <li key={i.id} className="os-glass p-4 text-sm text-[var(--hub-ink)] leading-relaxed">
            <span
              className="block w-6 h-1 rounded-full mb-2"
              style={{ background: i.tone === 'attention' ? 'var(--hub-amber)' : i.tone === 'positive' ? 'var(--hub-accent)' : 'var(--hub-muted)' }}
              aria-hidden="true"
            />
            <span className="sr-only">{i.tone === 'attention' ? 'Needs attention: ' : ''}</span>
            {i.text}
          </li>
        ))}
      </ul>
    </section>
  );

// ---------------------------------------------------------------------------
// Detail panels for a selected journal memory or project
// ---------------------------------------------------------------------------

const DetailFrame: React.FC<{ title: string; kicker: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }> = ({ title, kicker, icon, onClose, children }) => {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <section className="os-glass p-5 space-y-3 hub-rise" aria-label={`${kicker}: ${title}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--hub-accent)] flex items-center gap-1.5">
            {icon}
            {kicker}
          </p>
          <h2 className="text-lg font-semibold text-[var(--hub-ink)] break-words">{title}</h2>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} className="os-chip p-1.5 cursor-pointer shrink-0" aria-label="Close details">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </section>
  );
};

export const MemoryPanel: React.FC<{ note: Note; relatedGoals: string[]; onClose: () => void; onOpenVault: () => void }> = ({ note, relatedGoals, onClose, onOpenVault }) => {
  const kind = note.kind ?? 'note';
  const date = new Date(note.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  return (
    <DetailFrame title={note.title || 'Untitled entry'} kicker={`${kind[0].toUpperCase()}${kind.slice(1)} · ${date}`} icon={<BookOpen className="w-3.5 h-3.5" aria-hidden="true" />} onClose={onClose}>
      {note.body ? (
        <p className="text-sm text-[var(--hub-ink)] whitespace-pre-wrap break-words leading-relaxed">{note.body.length > 600 ? `${note.body.slice(0, 600)}…` : note.body}</p>
      ) : (
        <p className="text-sm text-[var(--hub-muted)]">No details written for this entry.</p>
      )}
      {(note.tags ?? []).length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Themes">
          {(note.tags ?? []).map((t) => (
            <li key={t} className="os-chip px-2 py-0.5 text-[11px] text-[var(--hub-ink)]">
              #{t}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-[var(--hub-muted)]">
        {relatedGoals.length ? <>Related goals: {relatedGoals.join(', ')}</> : 'No goal shares this entry’s themes yet.'}
      </p>
      <button type="button" onClick={onOpenVault} className="text-sm font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer">
        Open the Memory Vault
      </button>
    </DetailFrame>
  );
};

export const ProjectPanel: React.FC<{ project: ProjectSystem; onClose: () => void; onOpenProjects: () => void }> = ({ project, onClose, onOpenProjects }) => (
  <DetailFrame title={project.title} kicker={`Project · ${project.status}`} icon={<Rocket className="w-3.5 h-3.5" aria-hidden="true" />} onClose={onClose}>
    <div>
      <div className="flex justify-between text-xs text-[var(--hub-muted)]">
        <span>
          Progress {project.source === 'milestones' ? '(milestones)' : project.source === 'tasks' ? '(tasks)' : '(set manually)'}
        </span>
        <span className="font-semibold text-[var(--hub-ink)] tabular-nums">{Math.round(project.progress * 100)}%</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-[rgba(125,211,252,0.14)] overflow-hidden" role="progressbar" aria-label={`${project.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(project.progress * 100)}>
        <div className="h-full rounded-full bg-[var(--hub-accent)]" style={{ width: `${Math.round(project.progress * 100)}%` }} />
      </div>
    </div>
    <p className="text-sm text-[var(--hub-ink)]">
      {project.openTasks} open task{project.openTasks === 1 ? '' : 's'} · {project.doneTasks} done
    </p>
    {project.milestones.length > 0 && (
      <ul className="space-y-1" aria-label="Milestones">
        {project.milestones.slice(0, 8).map((m, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            {m.done ? <CheckCircle2 className="w-4 h-4 text-[var(--hub-accent)] shrink-0" aria-hidden="true" /> : <Circle className="w-4 h-4 text-[var(--hub-muted)] shrink-0" aria-hidden="true" />}
            <span className={m.done ? 'text-[var(--hub-muted)] line-through' : 'text-[var(--hub-ink)]'}>
              <span className="sr-only">{m.done ? 'Done: ' : 'Open: '}</span>
              {m.title}
            </span>
          </li>
        ))}
      </ul>
    )}
    <button type="button" onClick={onOpenProjects} className="text-sm font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer">
      Open Projects
    </button>
  </DetailFrame>
);

export const ProjectList: React.FC<{ projects: (ProjectSystem & { color: string })[]; selectedId: string | null; onSelect: (id: string) => void }> = ({ projects, selectedId, onSelect }) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
        <Repeat className="w-4 h-4 text-[var(--hub-accent)]" aria-hidden="true" />
        Project orbits
      </h3>
      <p className="text-xs text-[var(--hub-muted)]">Outer systems: tasks as satellites, milestones as waypoints</p>
    </div>
    {projects.length === 0 ? (
      <p className="text-sm text-[var(--hub-muted)] py-4">No active projects.</p>
    ) : (
      <ul className="space-y-1.5" aria-label="Projects in the constellation">
        {projects.map((p) => {
          const on = selectedId === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-pressed={on}
                className={`w-full text-left rounded-xl border px-3 py-2 cursor-pointer transition-colors ${on ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10' : 'border-transparent hover:bg-[var(--hub-surface-hover)]'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rotate-45 shrink-0" style={{ background: p.color }} aria-hidden="true" />
                    <span className="text-sm font-medium text-[var(--hub-ink)] truncate">{p.title}</span>
                  </span>
                  <span className="text-xs tabular-nums text-[var(--hub-ink)]">{Math.round(p.progress * 100)}%</span>
                </span>
                <span className="block text-[11px] text-[var(--hub-muted)] mt-0.5 pl-4">
                  {p.openTasks} open · {p.doneTasks} done{p.milestones.length ? ` · ${p.milestones.filter((m) => m.done).length}/${p.milestones.length} milestones` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);

export const MemoryList: React.FC<{ notes: Note[]; selectedId: string | null; onSelect: (id: string) => void }> = ({ notes, selectedId, onSelect }) => (
  <div className="space-y-3">
    <div>
      <h3 className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-[var(--hub-accent)]" aria-hidden="true" />
        Memory nodes
      </h3>
      <p className="text-xs text-[var(--hub-muted)]">Recent journal entries — choose one to open it</p>
    </div>
    {notes.length === 0 ? (
      <p className="text-sm text-[var(--hub-muted)] py-4">No journal entries yet. Reflections, lessons and decisions appear here.</p>
    ) : (
      <ul className="space-y-1" aria-label="Recent journal memories">
        {notes.slice(0, 6).map((n) => {
          const on = selectedId === n.id;
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onSelect(n.id)}
                aria-pressed={on}
                className={`w-full text-left rounded-xl border px-3 py-1.5 cursor-pointer transition-colors ${on ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10' : 'border-transparent hover:bg-[var(--hub-surface-hover)]'}`}
              >
                <span className="block text-sm text-[var(--hub-ink)] truncate">{n.title || 'Untitled entry'}</span>
                <span className="block text-[11px] text-[var(--hub-muted)]">
                  {(n.kind ?? 'note').replace(/^./, (c) => c.toUpperCase())} · {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {(n.tags ?? []).length ? ` · #${(n.tags ?? []).slice(0, 2).join(' #')}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    )}
  </div>
);
