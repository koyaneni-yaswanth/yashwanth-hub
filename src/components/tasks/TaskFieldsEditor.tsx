import React, { useId, useState } from 'react';
import { Plus, X, Repeat, Link2, ListChecks } from 'lucide-react';
import type { Recurrence, RecurrenceFreq, Subtask, Task } from '../../types';
import { RECURRENCE_OPTIONS, describeRecurrence, wouldCreateCycle } from '../../lib/taskModel';
import { generateId } from '../../lib/utils';

const fieldCls =
  'min-w-0 px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]';
const inputCls = `w-full ${fieldCls}`;
const labelCls = 'flex items-center gap-1.5 text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1';

/** Checklist editor: add, rename, tick and remove steps. */
export const SubtaskEditor: React.FC<{ value: Subtask[]; onChange: (next: Subtask[]) => void }> = ({ value, onChange }) => {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...value, { id: generateId(), text, done: false }]);
    setDraft('');
  };
  return (
    <div>
      <label htmlFor={`${id}-new`} className={labelCls}>
        <ListChecks className="w-3.5 h-3.5" aria-hidden="true" /> Subtasks
      </label>
      {value.length > 0 && (
        <ul className="space-y-1.5 mb-2">
          {value.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => onChange(value.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
                aria-label={`Subtask ${i + 1} done`}
                className="w-4 h-4 rounded cursor-pointer"
              />
              <input
                type="text"
                value={s.text}
                onChange={(e) => onChange(value.map((x) => (x.id === s.id ? { ...x, text: e.target.value } : x)))}
                aria-label={`Subtask ${i + 1}`}
                className={`${inputCls} py-1.5`}
              />
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.id !== s.id))}
                aria-label={`Remove subtask: ${s.text}`}
                className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-red)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          id={`${id}-new`}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a step, then press Enter"
          className={`${inputCls} py-1.5`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 px-3 rounded-lg border border-[var(--hub-line)] text-sm font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] disabled:opacity-40 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" /> Add
        </button>
      </div>
    </div>
  );
};

/** Repeat picker: frequency, every-N interval and an optional end date. */
export const RepeatPicker: React.FC<{ value: Recurrence | undefined; onChange: (next: Recurrence | undefined) => void; hasDueDate: boolean }> = ({
  value,
  onChange,
  hasDueDate,
}) => {
  const id = useId();
  const unit = RECURRENCE_OPTIONS.find((o) => o.value === value?.freq)?.unit;
  return (
    <div>
      <label htmlFor={`${id}-freq`} className={labelCls}>
        <Repeat className="w-3.5 h-3.5" aria-hidden="true" /> Repeat
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`${id}-freq`}
          value={value?.freq ?? ''}
          onChange={(e) => onChange(e.target.value ? { freq: e.target.value as RecurrenceFreq, interval: value?.interval ?? 1, until: value?.until } : undefined)}
          className={`${fieldCls} flex-1 basis-40`}
        >
          <option value="">Doesn't repeat</option>
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {value && value.freq !== 'weekdays' && (
          <label className="flex items-center gap-2 text-sm text-[var(--hub-muted)]">
            <span className="shrink-0">Every</span>
            <input
              type="number"
              min={1}
              max={365}
              value={value.interval}
              onChange={(e) => onChange({ ...value, interval: Math.max(1, Number(e.target.value) || 1) })}
              aria-label={`Repeat every how many ${unit}s`}
              className={`${fieldCls} w-16`}
            />
            <span className="shrink-0">{unit}{value.interval === 1 ? '' : 's'}</span>
          </label>
        )}
        {value && (
          <label className="flex items-center gap-2 text-sm text-[var(--hub-muted)]">
            <span className="shrink-0">Until</span>
            <input
              type="date"
              value={value.until ?? ''}
              onChange={(e) => onChange({ ...value, until: e.target.value || undefined })}
              aria-label="Repeat until (optional)"
              className={`${fieldCls} w-40`}
            />
          </label>
        )}
      </div>
      {value && (
        <p className="mt-1.5 text-xs text-[var(--hub-muted)]">
          {describeRecurrence(value)}. Completing it creates the next one{hasDueDate ? ', due on the next date in the series' : ', due from today'}.
        </p>
      )}
    </div>
  );
};

/** "Blocked by" picker: choose open tasks that must be finished first (loops are prevented). */
export const BlockedByPicker: React.FC<{
  taskId: string | null;
  value: string[];
  onChange: (next: string[]) => void;
  tasks: Task[];
}> = ({ taskId, value, onChange, tasks }) => {
  const id = useId();
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const candidates = tasks
    .filter((t) => !t.done && t.id !== taskId && !value.includes(t.id))
    .filter((t) => !taskId || !wouldCreateCycle(taskId, t.id, byId))
    .sort((a, b) => a.text.localeCompare(b.text));
  return (
    <div>
      <label htmlFor={`${id}-add`} className={labelCls}>
        <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> Blocked by
      </label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 mb-2">
          {value.map((bid) => {
            const t = byId.get(bid);
            return (
              <li key={bid} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs bg-[var(--hub-surface-hover)] text-[var(--hub-ink)] border border-[var(--hub-line)]">
                <span className={`max-w-[14rem] truncate ${t?.done ? 'line-through text-[var(--hub-muted)]' : ''}`}>{t?.text ?? 'Deleted task'}</span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x !== bid))}
                  aria-label={`Remove blocker: ${t?.text ?? 'deleted task'}`}
                  className="p-0.5 rounded-full hover:bg-[var(--hub-line)] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <select
        id={`${id}-add`}
        value=""
        onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        className={inputCls}
        disabled={candidates.length === 0}
      >
        <option value="">{candidates.length ? 'Add a task this one waits on…' : 'No other open tasks to link'}</option>
        {candidates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.text}
          </option>
        ))}
      </select>
    </div>
  );
};
