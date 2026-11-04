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
  Check,
  Calendar,
} from 'lucide-react';
import { db } from '../db';
import type { Task, Area, Priority } from '../types';
import { formatShortDate, getTodayISO, isOverdue, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

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

  // Delete Confirm State
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [isClearDoneConfirmOpen, setIsClearDoneConfirmOpen] = useState(false);

  // Live Query
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];

  // Filter & Search Logic
  const filteredTasks = allTasks.filter((task) => {
    // Area filter
    if (selectedAreaFilter !== 'All' && task.area !== selectedAreaFilter) return false;

    // Status filter
    if (statusFilter === 'open' && task.done) return false;
    if (statusFilter === 'done' && !task.done) return false;
    if (statusFilter === 'starred' && !task.starred) return false;
    if (statusFilter === 'overdue' && (!task.due_date || task.done || task.due_date >= today)) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = task.text.toLowerCase().includes(q);
      const matchDesc = task.description?.toLowerCase().includes(q) || false;
      const matchNotes = task.notes?.toLowerCase().includes(q) || false;
      if (!matchText && !matchDesc && !matchNotes) return false;
    }

    return true;
  });

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
    setIsModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formText.trim()) return;

    const now = new Date().toISOString();

    if (editingTask) {
      await db.tasks.update(editingTask.id, {
        text: formText.trim(),
        description: formDescription.trim() || undefined,
        area: formArea,
        priority: formPriority,
        due_date: formDueDate || undefined,
        notes: formNotes.trim() || undefined,
        updated_at: now,
      });
    } else {
      const newTask: Task = {
        id: generateId(),
        text: formText.trim(),
        description: formDescription.trim() || undefined,
        area: formArea,
        priority: formPriority,
        due_date: formDueDate || undefined,
        starred: false,
        done: false,
        notes: formNotes.trim() || undefined,
        created_at: now,
        updated_at: now,
      };
      await db.tasks.add(newTask);
    }

    setIsModalOpen(false);
  };

  const handleToggleTask = async (task: Task) => {
    await db.tasks.update(task.id, {
      done: !task.done,
      updated_at: new Date().toISOString(),
    });
  };

  const handleToggleStar = async (task: Task) => {
    await db.tasks.update(task.id, {
      starred: !task.starred,
      updated_at: new Date().toISOString(),
    });
  };

  const handleConfirmDelete = async () => {
    if (taskToDelete) {
      await db.tasks.delete(taskToDelete);
      setTaskToDelete(null);
    }
  };

  const handleClearDone = async () => {
    const doneIds = allTasks.filter((t) => t.done).map((t) => t.id);
    await db.tasks.bulkDelete(doneIds);
  };

  const renderTaskItem = (task: Task) => {
    const overdue = isOverdue(task.due_date, task.done);
    return (
      <div
        key={task.id}
        className={`flex items-start gap-3 p-4 rounded-xl border transition-all duration-150 ${
          task.done
            ? 'bg-[var(--hub-surface-subtle)] border-[var(--hub-line)] opacity-70'
            : overdue
            ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40'
            : 'bg-[var(--hub-surface)] border-[var(--hub-line)] hover:border-[var(--hub-accent)] shadow-xs'
        }`}
      >
        <input
          type="checkbox"
          checked={task.done}
          onChange={() => handleToggleTask(task)}
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
                    ? 'text-red-600 dark:text-red-400 font-bold'
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
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-none">
          <button
            onClick={() => handleToggleStar(task)}
            className="p-1.5 rounded-lg text-amber-500 hover:bg-[var(--hub-bg)] cursor-pointer transition-colors"
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
      {/* Header & New Task Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Task Management
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Organize, prioritize and execute tasks across workspaces
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Task</span>
        </button>
      </div>

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

        {/* Status Filter Pills */}
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
                  ? 'bg-[var(--hub-accent)] text-white'
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
      </div>

      {/* Task List */}
      <div className="space-y-4">
        {sortedTasks.length === 0 ? (
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-12 text-center">
            <CheckCircle className="w-10 h-10 mx-auto text-teal-600 mb-3 opacity-60" />
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
