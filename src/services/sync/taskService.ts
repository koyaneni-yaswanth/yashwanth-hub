import { db } from '../../db';
import { generateId } from '../../lib/utils';
import { SyncQueueService } from './syncQueueService';
import { createTaskMutations, type TaskStore } from './taskMutations';

/** App-wide task mutations: local IndexedDB write first, then the cloud sync queue. */
export const TaskService = createTaskMutations(db.tasks as unknown as TaskStore, SyncQueueService, {
  newId: generateId,
});
