import { db } from '../../db';
import { generateId } from '../../lib/utils';
import { SyncQueueService } from './syncQueueService';
import { createTaskMutations, type TaskStore } from './taskMutations';
import { googleDeletedKey } from '../../lib/googleTaskSync';

/** App-wide task mutations: local IndexedDB write first, then the cloud sync queue. */
export const TaskService = createTaskMutations(db.tasks as unknown as TaskStore, SyncQueueService, {
  newId: generateId,
  // A deleted task that is linked to Google is deleted there too at the next Google sync,
  // so no device imports it back. Undo (restore) cancels that.
  onRemove: (t) =>
    t.google_task_id
      ? db.settings.put({ key: googleDeletedKey(t.google_task_id), value: true, updated_at: new Date().toISOString() })
      : undefined,
  onRestore: (t) => (t.google_task_id ? db.settings.delete(googleDeletedKey(t.google_task_id)) : undefined),
});
