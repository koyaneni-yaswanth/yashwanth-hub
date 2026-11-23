import React from 'react';
import { AlertTriangle, CalendarDays, CheckSquare, Clock, Plus, Square, Users } from 'lucide-react';
import { formatTimeRange, fromDateKey, itemKey, sortDay, type CalItem } from '../../lib/calendarModel';

/**
 * Day / Week / Agenda list: one section per day with events, meetings and due
 * tasks in time order. Clashing timed items are flagged with what they overlap.
 */
export const CalendarDayList: React.FC<{
  days: string[];
  items: CalItem[];
  clashes: Map<string, CalItem[]>;
  today: string;
  /** Agenda hides empty days; Day and Week show them so you can add to them. */
  hideEmptyDays?: boolean;
  onOpenEvent: (id: string) => void;
  onToggleTask: (id: string) => void;
  onAdd: (date: string) => void;
}> = ({ days, items, clashes, today, hideEmptyDays, onOpenEvent, onToggleTask, onAdd }) => {
  const byDate = new Map<string, CalItem[]>();
  for (const it of items) {
    const list = byDate.get(it.date) ?? [];
    list.push(it);
    byDate.set(it.date, list);
  }
  const visible = hideEmptyDays ? days.filter((d) => byDate.has(d)) : days;

  if (visible.length === 0) {
    return (
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-12 text-center shadow-xs">
        <CalendarDays className="w-10 h-10 mx-auto text-[var(--hub-muted)] mb-3 opacity-60" aria-hidden="true" />
        <p className="font-medium text-[var(--hub-ink)]">Nothing scheduled in the next two weeks</p>
        <p className="text-xs text-[var(--hub-muted)] mt-1">Use “Add Event” to schedule something.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((day) => {
        const list = sortDay(byDate.get(day) ?? []);
        const d = fromDateKey(day);
        const isToday = day === today;
        return (
          <section key={day} aria-labelledby={`day-${day}`} className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl shadow-xs overflow-hidden">
            <header className={`flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--hub-line)] ${isToday ? 'bg-teal-500/5' : 'bg-[var(--hub-surface-subtle)]'}`}>
              <h3 id={`day-${day}`} className="text-sm font-bold text-[var(--hub-ink)]">
                {d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                {isToday && <span className="ml-2 text-xs font-semibold text-[var(--hub-accent)]">Today</span>}
              </h3>
              <button
                type="button"
                onClick={() => onAdd(day)}
                aria-label={`Add event on ${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}`}
                className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </header>
            {list.length === 0 ? (
              <p className="px-4 py-3 text-xs text-[var(--hub-muted)]">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-[var(--hub-line)]">
                {list.map((it) => {
                  const hits = clashes.get(itemKey(it)) ?? [];
                  return (
                    <li key={itemKey(it)} className="flex items-start gap-3 px-4 py-3">
                      {it.source === 'task' ? (
                        <button
                          type="button"
                          onClick={() => onToggleTask(it.id)}
                          aria-label={`${it.done ? 'Reopen' : 'Complete'} task: ${it.title}`}
                          className="mt-0.5 text-[var(--hub-accent)] cursor-pointer"
                        >
                          {it.done ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                        </button>
                      ) : it.source === 'meeting' ? (
                        <Users className="w-4 h-4 mt-0.5 text-purple-600 dark:text-purple-300 shrink-0" aria-hidden="true" />
                      ) : (
                        <Clock className="w-4 h-4 mt-0.5 text-[var(--hub-muted)] shrink-0" aria-hidden="true" />
                      )}
                      <div className="flex-1 min-w-0">
                        {it.source === 'event' ? (
                          <button type="button" onClick={() => onOpenEvent(it.id)} className="text-left text-sm font-semibold text-[var(--hub-ink)] hover:underline cursor-pointer break-words">
                            {it.title}
                          </button>
                        ) : (
                          <p className={`text-sm font-semibold break-words ${it.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>{it.title}</p>
                        )}
                        <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                          {it.source === 'task' ? 'Task due' : formatTimeRange(it)}
                          {it.source === 'meeting' && ' · Meeting'}
                        </p>
                        {hits.length > 0 && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            Clashes with {hits.map((h) => `“${h.title}” (${formatTimeRange(h)})`).join(', ')}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};
