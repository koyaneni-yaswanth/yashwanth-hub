import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plus,
  Search,
  Star,
  Trash2,
  Edit2,
  CheckCircle,
  Filter,
  Calendar,
  RefreshCw,
  List as ListIcon,
  Columns3,
} from 'lucide-react';
import { db } from '../db';
import type { Task, Area, Priority, Subtask, Recurrence, TaskStage } from '../types';
import { formatShortDate, getTodayISO, isOverdue } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { TaskService } from '../services/sync/taskService';
import { IntegrationVaultService } from '../services/integrationVaultService';
import { SubtaskEditor, RepeatPicker, BlockedByPicker } from '../components/tasks/TaskFieldsEditor';
import { TaskChips } from '../components/tasks/TaskChips';
import { TaskBoard } from '../components/tasks/TaskBoard';
import { alignAnchorDay, cleanSubtasks, moveToColumn, normaliseRecurrence, openBlockers, withPendingSubtask, type BoardColumn } from '../lib/taskModel';
import { toast } from '../lib/toast';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { GoogleTasksService } from '../services/google/googleTasksService';

const VIEW_KEY = 'yash_tasks_view';
const readView = (): 'list' | 'board' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'board' ? 'board' : 'list';
  } catch {
    return 'list';
  }
};

interface TasksPageProps {
  currentArea: string;
  areas: Area[];
}

export const TasksPage: React.FC<TasksPageProps> = ({ currentArea, areas }) => {
  const today = getTodayISO();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'done' | 'starred' | 'overdue'>('all');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);
  const [view, setViewState] = useState<'list' | 'board'>(readView);
  const setView = (v: 'list' | 'board') => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // Remembering the view is a convenience only.
    }
  };

  // Sync State
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; success: boolean } | null>(null);

  // Modal State for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form Fields
  const [formText, setFormText] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formArea, setFormArea] = useState('PAWAN SHAKTI');
  const [formPriority, setFormPriority] = useState<Priority>('medium');
  const [formDueDate, setFormDueDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSubtasks, setFormSubtasks] = useState<Subtask[]>([]);
  const [formSubtaskDraft, setFormSubtaskDraft] = useState('');
  const [formRecurrence, setFormRecurrence] = useState<Recurrence | undefined>(undefined);
  const [formBlockedBy, setFormBlockedBy] = useState<string[]>([]);
  const [formStage, setFormStage] = useState<TaskStage>('todo');

  // Delete Confirm State
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [isClearDoneConfirmOpen, setIsClearDoneConfirmOpen] = useState(false);

  // Live Query
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const tasksById = new Map(allTasks.map((t) => [t.id, t]));

  // Filter & Search Logic
  const filteredTasks = allTasks.filter((task) => {
    // Area filter
    if (selectedAreaFilter !== 'All' && task.area !== selectedAreaFilter) return false;

    // Status filter (the board shows every status in its own column)
    if (view === 'board') return matchesSearch(task);
    if (statusFilter === 'open' && task.done) return false;
    if (statusFilter === 'done' && !task.done) return false;
    if (statusFilter === 'starred' && !task.starred) return false;
    if (statusFilter === 'overdue' && (!task.due_date || task.done || task.due_date >= today)) return false;

    return matchesSearch(task);
  });

  function matchesSearch(task: Task): boolean {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = task.text.toLowerCase().includes(q);
      const matchDesc = task.description?.toLowerCase().includes(q) || false;
      const matchNotes = task.notes?.toLowerCase().includes(q) || false;
      const matchSub = task.subtasks?.some((st) => st.text.toLowerCase().includes(q)) || false;
      if (!matchText && !matchDesc && !matchNotes && !matchSub) return false;
    }
    return true;
  }

  // Sorting: Starred first, then Overdue, then Due Date, then Priority
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    // Open tasks before done tasks in 'all' view
    if (a.done !== b.done) return a.done ? 1 : -1;
    // Starred tasks first
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    // Priority weights
    const priorityWeight: Record<Priority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    // Due date comparison
    return (a.due_date || '9999').localeCompare(b.due_date || '9999');
  });

  const openTasksList = sortedTasks.filter((t) => !t.done);
  const doneTasksList = sortedTasks.filter((t) => t.done);

  const openCreateModal = () => {
    setEditingTask(null);
    setFormText('');
    setFormDescription('');
    setFormArea(selectedAreaFilter !== 'All' ? selectedAreaFilter : 'PAWAN SHAKTI');
    setFormPriority('medium');
    setFormDueDate(today);
    setFormNotes('');
    setFormSubtasks([]);
    setFormSubtaskDraft('');
    setFormRecurrence(undefined);
    setFormBlockedBy([]);
    setFormStage('todo');
    setIsModalOpen(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setFormText(task.text);
    setFormDescription(task.description || '');
    setFormArea(task.area);
    setFormPriority(task.priority);
    setFormDueDate(task.due_date || '');
    setFormNotes(task.notes || '');
    setFormSubtasks(task.subtasks ?? []);
    setFormSubtaskDraft('');
    setFormRecurrence(task.recurrence);
    setFormBlockedBy(task.blocked_by ?? []);
    setFormStage(task.stage === 'doing' ? 'doing' : 'todo');
    setIsModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formText.trim()) return;

    const fields = {
      text: formText.trim(),
      description: formDescription.trim() || undefined,
      area: formArea,
      priority: formPriority,
      due_date: formDueDate || undefined,
      notes: formNotes.trim() || undefined,
      subtasks: cleanSubtasks(withPendingSubtask(formSubtasks, formSubtaskDraft)),
      recurrence: alignAnchorDay(normaliseRecurrence(formRecurrence), formDueDate || undefined),
      blocked_by: formBlockedBy.length ? formBlockedBy : undefined,
      stage: formStage,
    };

    if (editingTask) {
      // A finished copy of an old series that is given a repeat again starts a new series,
      // unless the series still continues on its next copy (that would create two series).
      const successor = editingTask.recurred_to ? tasksById.get(editingTask.recurred_to) : undefined;
      const seriesContinues = !!successor && !successor.done && !!successor.recurrence;
      if (fields.recurrence && seriesContinues) {
        fields.recurrence = undefined;
        toast(`This task's repeat continues on its next copy (due ${successor!.due_date ? formatShortDate(successor!.due_date) : 'soon'}). Edit that copy to change it.`, 'info');
      }
      const restartSeries = fields.recurrence && editingTask.recurred_to ? { recurred_to: undefined } : {};
      await TaskService.update(editingTask, { ...fields, ...restartSeries });
    } else {
      await TaskService.create({ ...fields, starred: false, done: false });
    }

    setIsModalOpen(false);
  };

  const handleToggleTask = async (task: Task) => {
    const nextDone = !task.done;
    await completeOrReopen(task, { done: nextDone });

    // Asynchronously dispatch task status to NeoSapien MCP if connected (Google is handled in completeOrReopen)
    try {
      fetch('/api/integrations/neosapien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sync_task',
          task: {
            id: task.id,
            text: task.text,
            done: nextDone,
            area: task.area,
            priority: task.priority,
          },
        }),
      }).catch((err) => console.warn('[TasksPage] NeoSapien sync background error:', err));
    } catch {
      // Non-blocking
    }
  };

  /** Shared by the checkbox and the board: reports blockers and the next repeat, and tells Google. */
  const completeOrReopen = async (task: Task, changes: Partial<Task>) => {
    const res = await TaskService.update(task, changes);
    if (res.task.google_task_id && res.task.done !== task.done && GoogleAuthService.isConnected()) {
      void GoogleTasksService.setGoogleTaskStatus(res.task.google_task_id, res.task.done);
    }
    if (changes.done && !task.done) {
      const waiting = openBlockers(task, tasksById);
      if (res.next) {
        toast(`Done. Next “${res.next.text}” is due ${formatShortDate(res.next.due_date!)}.`, 'success');
      } else if (waiting.length) {
        toast(`Marked done, though it was still waiting on “${waiting[0].text}”${waiting.length > 1 ? ` and ${waiting.length - 1} more` : ''}.`, 'info');
      }
    }
    return res;
  };

  const handleMoveOnBoard = async (task: Task, column: BoardColumn) => {
    let res;
    try {
      res = await completeOrReopen(task, moveToColumn(column));
    } catch (err) {
      toast(`Couldn't move “${task.text}”. Please try again.`, 'error');
      throw err;
    }
    // Every move gets a short polite confirmation (completeOrReopen already announces a
    // completion that created a next copy or that was still blocked).
    if (column !== 'done') toast(`Moved “${task.text}” to ${column === 'doing' ? 'In progress' : 'To do'}.`, 'info', 3000);
    else if (!res.next && openBlockers(task, tasksById).length === 0) toast(`Marked “${task.text}” done.`, 'success', 3000);
  };

  const toggleSubtask = async (task: Task, subtaskId: string) => {
    const subtasks = (task.subtasks ?? []).map((st) => (st.id === subtaskId ? { ...st, done: !st.done } : st));
    await TaskService.update(task, { subtasks });
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      const res = await IntegrationVaultService.triggerSyncNow();
      if (res.success) {
        setSyncStatusMsg({
          text: 'Bi-directional sync completed with Google Tasks & NeoSapien',
          success: true,
        });
      } else {
        setSyncStatusMsg({
          text: `Sync warning: ${res.error || 'Check integration tokens'}`,
          success: false,
        });
      }
    } catch (err: any) {
      setSyncStatusMsg({
        text: `Sync error: ${err.message || 'Network failure'}`,
        success: false,
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 5000);
    }
  };

  const handleToggleStar = async (task: Task) => {
    await TaskService.toggleStar(task);
  };

  const handleConfirmDelete = async () => {
    const task = allTasks.find((t) => t.id === taskToDelete);
    if (task) await TaskService.remove(task);
    setTaskToDelete(null);
  };

  const handleClearDone = async () => {
    await TaskService.removeMany(allTasks.filter((t) => t.done));
  };

  const renderTaskItem = (task: Task) => {
    const overdue = isOverdue(task.due_date, task.done);
    return (
      <div
        key={task.id}
        className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-150 ${
          task.done
            ? 'bg-[var(--hub-surface-subtle)] border-[var(--hub-line)]'
            : overdue
            ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
            : 'bg-[var(--hub-surface)] border-[var(--hub-line)] hover:border-[var(--hub-accent)] shadow-xs'
        }`}
      >
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => handleToggleTask(task)}
          aria-label={`Mark ${task.done ? 'not done' : 'done'}: ${task.text}`}
          className="mt-1 w-4 h-4 rounded text-[var(--hub-accent)] focus:ring-[var(--hub-accent)] cursor-pointer flex-none"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4
              className={`text-sm font-semibold break-words ${
                task.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'
              }`}
            >
              {task.text}
            </h4>
          </div>

          {task.description && (
            <p className="text-xs text-[var(--hub-muted)] mt-1 line-clamp-2">
              {task.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge variant="teal">{task.area}</Badge>
            {task.priority === 'urgent' && <Badge variant="red" dot>Urgent</Badge>}
            {task.priority === 'high' && <Badge variant="amber">High</Badge>}
            {task.priority === 'low' && <Badge variant="gray">Low</Badge>}

            {task.due_date && (
              <span
                className={`text-xs flex items-center gap-1 ${
                  overdue
                    ? 'text-red-700 dark:text-red-400 font-bold'
                    : 'text-[var(--hub-muted)]'
                }`}
              >
                <Calendar className="w-3 h-3" />
                {overdue ? 'Overdue: ' : 'Due: '}
                {formatShortDate(task.due_date)}
              </span>
            )}

            {task.plan && (
              <Badge variant="emerald">Week {task.plan} Milestone</Badge>
            )}

            {task.google_task_id ? (
              <Badge variant="blue" dot>Google Tasks Synced</Badge>
            ) : task.synced ? (
              <Badge variant="emerald" dot>Cloud Synced</Badge>
            ) : null}
            {task.stage === 'doing' && !task.done && <Badge variant="blue">In progress</Badge>}
            <TaskChips task={task} byId={tasksById} />
          </div>

          {task.subtasks && task.subtasks.length > 0 && !task.done && (
            <ul className="mt-2.5 space-y-1" aria-label={`Subtasks of ${task.text}`}>
              {task.subtasks.map((st) => (
                <li key={st.id}>
                  <label className="inline-flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={st.done}
                      onChange={() => toggleSubtask(task, st.id)}
                      className="mt-0.5 w-3.5 h-3.5 rounded cursor-pointer"
                    />
                    <span className={st.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}>{st.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-none">
          <button
            onClick={() => handleToggleStar(task)}
            className="p-1.5 rounded-lg text-amber-800 dark:text-amber-300 hover:bg-[var(--hub-bg)] cursor-pointer transition-colors"
            title={task.starred ? 'Starred' : 'Not starred'}
          >
            <Star className={`w-4 h-4 ${task.starred ? 'fill-amber-500' : ''}`} />
          </button>
          <button
            onClick={() => openEditModal(task)}
            className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer transition-colors"
            title="Edit task"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTaskToDelete(task.id)}
            className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer transition-colors"
            title="Delete task"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Task Management
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Organize, prioritize and execute tasks across workspaces
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div role="group" aria-label="Task view" className="inline-flex p-0.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)]">
            {(
              [
                { id: 'list', label: 'List', Icon: ListIcon },
                { id: 'board', label: 'Board', Icon: Columns3 },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-sm font-semibold cursor-pointer transition-colors ${
                  view === id ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]' : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] text-sm font-semibold hover:bg-[var(--hub-surface-subtle)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
            title="Trigger bi-directional sync with Google Tasks and NeoSapien"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-[var(--hub-accent)]' : 'text-[var(--hub-muted)]'}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Task</span>
          </button>
        </div>
      </div>

      {syncStatusMsg && (
        <div className={`p-3 rounded-xl text-xs font-semibold flex items-center justify-between border ${
          syncStatusMsg.success
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300'
        }`}>
          <span>{syncStatusMsg.text}</span>
          <button onClick={() => setSyncStatusMsg(null)} className="text-xs opacity-70 hover:opacity-100 cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 sm:p-4 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search tasks"
              placeholder="Search tasks, descriptions or notes..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] placeholder:text-[var(--hub-muted)]"
            />
          </div>

          {/* Area select */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-4 h-4 text-[var(--hub-muted)] flex-none" />
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
          </div>
        </div>

        {/* Status Filter Pills (list view only; the board shows each status as a column) */}
        {view === 'list' && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[var(--hub-line)]">
          {(
            [
              { id: 'all', label: `All (${filteredTasks.length})` },
              { id: 'open', label: `Open (${allTasks.filter((t) => !t.done).length})` },
              { id: 'starred', label: `Starred (${allTasks.filter((t) => t.starred).length})` },
              { id: 'overdue', label: `Overdue (${allTasks.filter((t) => isOverdue(t.due_date, t.done)).length})` },
              { id: 'done', label: `Done (${allTasks.filter((t) => t.done).length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {doneTasksList.length > 0 && statusFilter === 'all' && (
            <button
              onClick={() => setIsClearDoneConfirmOpen(true)}
              className="ml-auto text-xs font-medium text-[var(--hub-muted)] hover:text-red-600 transition-colors cursor-pointer py-1 px-2"
            >
              Clear completed
            </button>
          )}
        </div>
        )}
      </div>

      {view === 'board' && (
        <TaskBoard tasks={filteredTasks} byId={tasksById} onMove={handleMoveOnBoard} onOpen={openEditModal} />
      )}

      {/* Task List */}
      {view === 'list' && (
      <div className="space-y-4">
        {sortedTasks.length === 0 ? (
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-12 text-center">
            <CheckCircle className="w-10 h-10 mx-auto text-teal-700 dark:text-teal-300 mb-3 opacity-60" />
            <h3 className="text-base font-bold text-[var(--hub-ink)]">No tasks match your criteria</h3>
            <p className="text-xs text-[var(--hub-muted)] mt-1">
              {searchQuery ? 'Try clearing your search query' : 'Click "New Task" to create your first action item.'}
            </p>
          </div>
        ) : statusFilter === 'all' ? (
          <>
            {/* Open Tasks */}
            {openTasksList.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--hub-muted)] uppercase tracking-wider px-1">
                  <span>Open Tasks ({openTasksList.length})</span>
                </div>
                <div className="space-y-2">{openTasksList.map(renderTaskItem)}</div>
              </div>
            )}

            {/* Completed Tasks */}
            {doneTasksList.length > 0 && (
              <div className="space-y-2 pt-4">
                <div className="flex items-center justify-between text-xs font-bold text-[var(--hub-muted)] uppercase tracking-wider px-1">
                  <span>Completed Tasks ({doneTasksList.length})</span>
                </div>
                <div className="space-y-2">{doneTasksList.map(renderTaskItem)}</div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">{sortedTasks.map(renderTaskItem)}</div>
        )}
      </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTask ? 'Edit Task' : 'Create New Task'}
      >
        <form onSubmit={handleSaveTask} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Task Title *
            </label>
            <input
              type="text"
              value={formText}
              onChange={(e) => setFormText(e.target.value)}
              placeholder="e.g. Assemble generator stator laminations..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Description / Notes
            </label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={2}
              placeholder="Add key specifications, deliverable criteria or context..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
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
                Priority
              </label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as Priority)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Due Date
            </label>
            <input
              type="date"
              value={formDueDate}
              onChange={(e) => setFormDueDate(e.target.value)}
              className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div>
            <label htmlFor="task-stage" className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Status
            </label>
            <select
              id="task-stage"
              value={formStage}
              onChange={(e) => setFormStage(e.target.value as TaskStage)}
              className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            >
              <option value="todo">To do</option>
              <option value="doing">In progress</option>
            </select>
          </div>

          <SubtaskEditor value={formSubtasks} onChange={setFormSubtasks} draft={formSubtaskDraft} onDraftChange={setFormSubtaskDraft} />
          <RepeatPicker value={formRecurrence} onChange={setFormRecurrence} dueDate={formDueDate} />
          <BlockedByPicker taskId={editingTask?.id ?? null} value={formBlockedBy} onChange={setFormBlockedBy} tasks={allTasks} />

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
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
            >
              {editingTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Single Task Confirm */}
      <ConfirmDialog
        isOpen={Boolean(taskToDelete)}
        onClose={() => setTaskToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
      />

      {/* Clear Done Tasks Confirm */}
      <ConfirmDialog
        isOpen={isClearDoneConfirmOpen}
        onClose={() => setIsClearDoneConfirmOpen(false)}
        onConfirm={handleClearDone}
        title="Clear All Completed Tasks"
        message="Are you sure you want to delete all completed tasks across the workspace?"
      />
    </div>
  );
};
