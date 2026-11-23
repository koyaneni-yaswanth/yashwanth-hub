import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Check, Play, Star, Undo2 } from 'lucide-react';
import type { Task } from '../../types';
import { BOARD_COLUMNS, boardColumnOf, type BoardColumn } from '../../lib/taskModel';
import { formatShortDate, isOverdue } from '../../lib/utils';
import { TaskChips } from './TaskChips';

const DONE_LIMIT = 30;

/** The buttons a card shows for the columns it is not in. */
const MOVE_ACTIONS: Record<BoardColumn, { label: string; Icon: typeof Check }> = {
  todo: { label: 'To do', Icon: Undo2 },
  doing: { label: 'Start', Icon: Play },
  done: { label: 'Done', Icon: Check },
};

/**
 * Kanban board: To do / In progress / Done. Cards can be dragged between
 * columns, or moved with the buttons on each card (keyboard and touch); a move
 * only happens when a button is pressed, and focus follows the moved card.
 */
export const TaskBoard: React.FC<{
  tasks: Task[];
  byId: Map<string, Task>;
  onMove: (task: Task, column: BoardColumn) => void;
  onOpen: (task: Task) => void;
}> = ({ tasks, byId, onMove, onOpen }) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<BoardColumn | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // After a keyboard/touch move the card re-mounts in its new column; put focus back on it.
  const focusAfterMove = useRef<string | null>(null);
  useEffect(() => {
    const id = focusAfterMove.current;
    if (!id || !rootRef.current) return;
    const card = [...rootRef.current.querySelectorAll<HTMLElement>('[data-card-id]')].find((el) => el.dataset.cardId === id);
    if (!card) return;
    focusAfterMove.current = null;
    (card.querySelector<HTMLElement>('[data-move-button]') ?? card.querySelector<HTMLElement>('button'))?.focus();
  }, [tasks]);

  const moveWithButton = (task: Task, col: BoardColumn) => {
    focusAfterMove.current = task.id;
    onMove(task, col);
  };

  const columns = BOARD_COLUMNS.map((c) => {
    let list = tasks.filter((t) => boardColumnOf(t) === c.id);
    if (c.id === 'done') list = [...list].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { ...c, list, hidden: c.id === 'done' ? Math.max(0, list.length - DONE_LIMIT) : 0 };
  });

  const drop = (col: BoardColumn) => {
    const task = dragId ? byId.get(dragId) : undefined;
    if (task && boardColumnOf(task) !== col) onMove(task, col);
    setDragId(null);
    setOverCol(null);
  };

  return (
    <div ref={rootRef} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
      {columns.map((col) => (
        <section
          key={col.id}
          aria-labelledby={`board-col-${col.id}`}
          onDragOver={(e) => {
            if (!dragId) return;
            e.preventDefault();
            setOverCol(col.id);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(col.id);
          }}
          className={`rounded-2xl border p-2.5 min-h-[8rem] transition-colors ${
            overCol === col.id ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/5' : 'border-[var(--hub-line)] bg-[var(--hub-surface-subtle)]'
          }`}
        >
          <h3 id={`board-col-${col.id}`} className="flex items-center justify-between px-1.5 pb-2 text-xs font-bold uppercase tracking-wider text-[var(--hub-muted)]">
            <span>{col.label}</span>
            <span className="tabular-nums">{col.list.length}</span>
          </h3>
          {col.list.length === 0 ? (
            <p className="px-1.5 py-6 text-center text-xs text-[var(--hub-muted)]">{col.id === 'doing' ? 'Drag a task here when you start it.' : 'Nothing here.'}</p>
          ) : (
            <ul className="space-y-2">
              {col.list.slice(0, col.id === 'done' ? DONE_LIMIT : undefined).map((t) => {
                const overdue = isOverdue(t.due_date, t.done);
                return (
                  <li
                    key={t.id}
                    data-card-id={t.id}
                    draggable
                    onDragStart={(e) => {
                      setDragId(t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', t.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                    className={`group rounded-xl border bg-[var(--hub-surface)] p-3 shadow-xs cursor-grab active:cursor-grabbing transition ${
                      dragId === t.id ? 'opacity-50' : ''
                    } ${overdue ? 'border-red-500/30' : 'border-[var(--hub-line)] hover:border-[var(--hub-accent)]'}`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => onOpen(t)}
                        className={`flex-1 min-w-0 text-left text-sm font-semibold break-words cursor-pointer hover:underline ${
                          t.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'
                        }`}
                      >
                        {t.text}
                      </button>
                      {t.starred && <Star className="w-3.5 h-3.5 mt-0.5 shrink-0 fill-amber-500 text-amber-600" aria-label="Starred" />}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="text-xs text-[var(--hub-muted)]">{t.area}</span>
                      {t.due_date && (
                        <span className={`inline-flex items-center gap-1 text-xs ${overdue ? 'text-red-700 dark:text-red-400 font-bold' : 'text-[var(--hub-muted)]'}`}>
                          <Calendar className="w-3 h-3" aria-hidden="true" />
                          {overdue ? 'Overdue ' : ''}
                          {formatShortDate(t.due_date)}
                        </span>
                      )}
                      <TaskChips task={t} byId={byId} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={`Move “${t.text}”`}>
                      {BOARD_COLUMNS.filter((c) => c.id !== col.id).map((c, i) => {
                        const { label, Icon } = MOVE_ACTIONS[c.id];
                        return (
                          <button
                            key={c.id}
                            type="button"
                            {...(i === 0 ? { 'data-move-button': '' } : {})}
                            onClick={() => moveWithButton(t, c.id)}
                            aria-label={`${c.id === 'done' ? 'Mark done' : `Move to ${c.label}`}: ${t.text}`}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-medium text-[var(--hub-ink)] hover:border-[var(--hub-accent)] hover:text-[var(--hub-accent)] cursor-pointer"
                          >
                            <Icon className="w-3 h-3" aria-hidden="true" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {col.hidden > 0 && <p className="px-1.5 pt-2 text-xs text-[var(--hub-muted)]">+{col.hidden} older done tasks in the list view</p>}
        </section>
      ))}
    </div>
  );
};
