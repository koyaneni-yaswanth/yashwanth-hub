import type { Task } from '../../types';

/**
 * The single persistence + cloud-sync pathway for tasks. Every screen that changes a
 * task (Home, Tasks, ...) goes through here, so local writes and sync-queue entries can
 * never drift apart. Dependency-injected so it is unit-testable without IndexedDB.
 */

export interface TaskStore {
  add(task: Task): Promise<unknown>;
  update(id: string, changes: Partial<Task>): Promise<unknown>;
  put(task: Task): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  bulkDelete(ids: string[]): Promise<unknown>;
}

export interface ChangeQueue {
  enqueueChange(
    table: string,
    recordId: string,
    action: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: unknown
  ): Promise<void>;
}

/** Outcome of the cloud half of a mutation. The local write has always succeeded when this is returned. */
export type SyncOutcome = 'queued' | 'queue-failed';

export interface TaskMutationResult {
  task: Task;
  sync: SyncOutcome;
}

export type NewTaskInput = Omit<Task, 'id' | 'created_at' | 'updated_at'> & { id?: string };

export function createTaskMutations(
  store: TaskStore,
  queue: ChangeQueue,
  options: { now?: () => string; newId?: () => string; onQueueError?: (err: unknown) => void } = {}
) {
  const now = options.now ?? (() => new Date().toISOString());
  const newId = options.newId ?? (() => Math.random().toString(36).slice(2) + Date.now().toString(36));
  const onQueueError = options.onQueueError ?? ((err) => console.warn('[tasks] Could not queue cloud sync:', err));

  // The local write is the source of truth; a queue failure is reported, never hidden,
  // and never rolls back the user's change.
  const enqueue = async (recordId: string, action: 'INSERT' | 'UPDATE' | 'DELETE', payload: unknown): Promise<SyncOutcome> => {
    try {
      await queue.enqueueChange('tasks', recordId, action, payload);
      return 'queued';
    } catch (err) {
      onQueueError(err);
      return 'queue-failed';
    }
  };

  return {
    async create(input: NewTaskInput): Promise<TaskMutationResult> {
      const timestamp = now();
      const task: Task = { ...input, id: input.id ?? newId(), created_at: timestamp, updated_at: timestamp } as Task;
      await store.add(task);
      return { task, sync: await enqueue(task.id, 'INSERT', task) };
    },

    async update(task: Task, changes: Partial<Task>): Promise<TaskMutationResult> {
      const updated: Task = { ...task, ...changes, id: task.id, updated_at: now() };
      const { id: _id, ...patch } = { ...changes, updated_at: updated.updated_at };
      await store.update(task.id, patch);
      return { task: updated, sync: await enqueue(task.id, 'UPDATE', updated) };
    },

    toggleDone(task: Task) {
      return this.update(task, { done: !task.done });
    },

    toggleStar(task: Task) {
      return this.update(task, { starred: !task.starred });
    },

    scheduleFor(task: Task, dueDate: string) {
      return this.update(task, { due_date: dueDate });
    },

    /** Deletes locally and in the cloud immediately. */
    async remove(task: Task): Promise<TaskMutationResult> {
      await store.delete(task.id);
      return { task, sync: await enqueue(task.id, 'DELETE', { id: task.id }) };
    },

    /** Deletes locally only — pair with commitRemove / restore to offer undo. */
    async removeLocally(task: Task): Promise<void> {
      await store.delete(task.id);
    },

    /** Sends a held delete to the cloud once the undo window closes. */
    commitRemove(taskId: string): Promise<SyncOutcome> {
      return enqueue(taskId, 'DELETE', { id: taskId });
    },

    /** Puts a locally-removed task back (its delete was never queued, so nothing to sync). */
    async restore(task: Task): Promise<void> {
      await store.put(task);
    },

    async removeMany(tasks: Task[]): Promise<SyncOutcome[]> {
      await store.bulkDelete(tasks.map((t) => t.id));
      const outcomes: SyncOutcome[] = [];
      for (const t of tasks) outcomes.push(await enqueue(t.id, 'DELETE', { id: t.id }));
      return outcomes;
    },
  };
}

export type TaskMutations = ReturnType<typeof createTaskMutations>;
