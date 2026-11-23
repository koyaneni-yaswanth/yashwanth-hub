import React from 'react';
import { Lock, Repeat, ListChecks } from 'lucide-react';
import type { Task } from '../../types';
import { describeRecurrence, openBlockers, subtaskProgress } from '../../lib/taskModel';

/** Small status chips for subtasks, repeat and "blocked by", shared by the list and the board. */
export const TaskChips: React.FC<{ task: Task; byId: Map<string, Task> }> = ({ task, byId }) => {
  const progress = subtaskProgress(task);
  const blockers = task.done ? [] : openBlockers(task, byId);
  const repeat = describeRecurrence(task.recurrence);
  if (!progress.total && !blockers.length && !repeat) return null;
  return (
    <>
      {progress.total > 0 && (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${progress.done === progress.total ? 'text-emerald-700 dark:text-emerald-300' : 'text-[var(--hub-muted)]'}`}
          title={`${progress.done} of ${progress.total} subtasks done`}
        >
          <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="sr-only">Subtasks:</span>
          {progress.done}/{progress.total}
        </span>
      )}
      {repeat && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--hub-muted)]">
          <Repeat className="w-3.5 h-3.5" aria-hidden="true" />
          {repeat}
        </span>
      )}
      {blockers.length > 0 && (
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30"
          title={`Waiting on: ${blockers.map((b) => b.text).join(', ')}`}
        >
          <Lock className="w-3 h-3" aria-hidden="true" />
          Blocked by {blockers.length === 1 ? `“${blockers[0].text.length > 32 ? `${blockers[0].text.slice(0, 31)}…` : blockers[0].text}”` : `${blockers.length} tasks`}
        </span>
      )}
    </>
  );
};
