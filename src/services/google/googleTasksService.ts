import { GoogleAuthService } from './googleAuthService';
import { db } from '../../db';
import type { Task, GoogleTaskItem } from '../../types';
import { toDueKey } from '../../lib/utils';
import { TaskService } from '../sync/taskService';
import { decideStatusSync, matchLocalTask, taskIdForGoogleTask } from '../../lib/googleTaskSync';

/** Per linked Google task: the done/open status both sides last agreed on (device-local). */
const STATUS_KEY = (googleTaskId: string) => `gtask_status:${googleTaskId}`;

export class GoogleTasksService {
  private static BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

  private static async lastSyncedDone(googleTaskId: string): Promise<boolean | undefined> {
    const row = await db.settings.get(STATUS_KEY(googleTaskId));
    return typeof row?.value === 'boolean' ? row.value : undefined;
  }

  private static async recordSyncedDone(googleTaskId: string, done: boolean): Promise<void> {
    await db.settings.put({ key: STATUS_KEY(googleTaskId), value: done, updated_at: new Date().toISOString() });
  }

  // Retrieve user's primary Google Tasks list
  public static async getPrimaryTaskList(): Promise<string | null> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return null;

    try {
      const res = await fetch(`${this.BASE_URL}/users/@me/lists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const primary = data.items?.[0]?.id || '@default';
      return primary;
    } catch (e) {
      console.warn('Failed to fetch Google task lists:', e);
      return null;
    }
  }

  // Fetch tasks from Google Tasks
  public static async fetchGoogleTasks(listId: string = '@default'): Promise<GoogleTaskItem[]> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return [];

    try {
      const res = await fetch(`${this.BASE_URL}/lists/${listId}/tasks?showCompleted=true&showHidden=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        GoogleAuthService.updateServiceStatus('tasks', { error: `Tasks API returned ${res.status}` });
        return [];
      }
      const data = await res.json();
      const items = (data.items || []).map((t: any) => ({
        id: t.id,
        title: t.title || 'Untitled Task',
        notes: t.notes || '',
        status: t.status === 'completed' ? 'completed' : 'needsAction',
        due: t.due ? t.due.slice(0, 10) : undefined,
        updated: t.updated,
        listId,
      })) as GoogleTaskItem[];

      // Store in local google_tasks cache
      if (items.length > 0) {
        await db.google_tasks.bulkPut(items);
      }
      GoogleAuthService.updateServiceStatus('tasks', {
        lastSync: new Date().toISOString(),
        error: undefined,
        authorized: true,
      });

      return items;
    } catch (e: any) {
      console.warn('Google Tasks fetch error:', e);
      GoogleAuthService.updateServiceStatus('tasks', { error: e.message });
      return [];
    }
  }

  // Push a Yashwanth Hub task to Google Tasks
  public static async pushTaskToGoogle(task: Task, listId: string = '@default'): Promise<string | null> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return null;

    const payload: any = {
      title: task.text,
      notes: `Area: ${task.area} | Priority: ${task.priority.toUpperCase()}${task.notes ? `\n\nNotes: ${task.notes}` : ''}`,
      status: task.done ? 'completed' : 'needsAction',
    };
    if (task.due_date) {
      payload.due = `${task.due_date}T00:00:00.000Z`;
    }

    try {
      let res;
      if (task.google_task_id) {
        // Update existing task
        res = await fetch(`${this.BASE_URL}/lists/${listId}/tasks/${task.google_task_id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new task
        res = await fetch(`${this.BASE_URL}/lists/${listId}/tasks`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) return null;
      const gTask = await res.json();

      if (gTask.id) {
        await this.recordSyncedDone(gTask.id, task.done);
        // Save the link through TaskService so it reaches the cloud and other devices.
        const current = await db.tasks.get(task.id);
        if (current && !current.google_task_id) await TaskService.update(current, { google_task_id: gTask.id, synced: true });
      }
      return gTask.id;
    } catch (e) {
      console.warn('Failed to push task to Google:', e);
      return null;
    }
  }

  /**
   * Sets only the done/open status of a linked Google task (leaves its title,
   * notes and due date as they are). Returns false if it could not be sent.
   */
  public static async setGoogleTaskStatus(googleTaskId: string, done: boolean, listId: string = '@default'): Promise<boolean> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return false;
    try {
      const res = await fetch(`${this.BASE_URL}/lists/${listId}/tasks/${googleTaskId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(done ? { status: 'completed' } : { status: 'needsAction', completed: null }),
      });
      if (res.ok) await this.recordSyncedDone(googleTaskId, done);
      return res.ok;
    } catch (e) {
      console.warn('Failed to update Google task status:', e);
      return false;
    }
  }

  // Bi-directional Two-Way Synchronization with conflict resolution
  public static async syncTwoWay(): Promise<{ imported: number; exported: number }> {
    const listId = (await this.getPrimaryTaskList()) || '@default';
    const gTasks = await this.fetchGoogleTasks(listId);
    const localTasks = await db.tasks.toArray();

    let imported = 0;
    let exported = 0;
    const matched = new Set<string>();

    // 1. Process Google Tasks into local Yashwanth Hub
    for (const gt of gTasks) {
      const snapshotMatch = matchLocalTask(gt, localTasks, matched);
      if (snapshotMatch) {
        matched.add(snapshotMatch.id);
        // Decide on the stored row: the user may have changed it while this sync was running.
        const match = (await db.tasks.get(snapshotMatch.id)) ?? snapshotMatch;
        const googleDone = gt.status === 'completed';
        // Status: the side that moved away from the last agreed status wins. Local changes go
        // through TaskService so they are queued for the cloud and repeats continue.
        const decision = decideStatusSync(gt, match, await this.lastSyncedDone(gt.id));
        if (decision === 'import') {
          await TaskService.update(match, { done: googleDone, google_task_id: gt.id });
          await this.recordSyncedDone(gt.id, googleDone);
          imported++;
        } else if (decision === 'export') {
          if (await this.setGoogleTaskStatus(gt.id, match.done, listId)) exported++;
          if (!match.google_task_id) await TaskService.update(match, { google_task_id: gt.id });
        } else {
          await this.recordSyncedDone(gt.id, match.done);
          // Same task matched by title: link it so it isn't exported again as a duplicate.
          if (!match.google_task_id) await TaskService.update(match, { google_task_id: gt.id });
        }
      } else {
        // New task created in Google Tasks -> import it. The id is derived from the Google id,
        // so devices importing the same task create one row, and it is queued for the cloud.
        const id = await taskIdForGoogleTask(gt.id);
        const existing = await db.tasks.get(id);
        if (existing) {
          // Imported before, but the link was lost on this device: re-link instead of duplicating.
          if (existing.google_task_id !== gt.id) await TaskService.update(existing, { google_task_id: gt.id });
          continue;
        }
        await TaskService.create({
          id,
          text: gt.title,
          notes: gt.notes,
          area: 'Personal',
          priority: 'medium',
          // Google sends date-only due dates as midnight-UTC timestamps; store a plain date.
          // An undated Google task stays undated (it used to be given today's date).
          due_date: gt.due ? toDueKey(gt.due) || undefined : undefined,
          starred: false,
          done: gt.status === 'completed',
          google_task_id: gt.id,
          synced: true,
        });
        await this.recordSyncedDone(gt.id, gt.status === 'completed');
        imported++;
      }
    }

    // 2. Export unsynced local tasks to Google Tasks (re-read: step 1 may have linked
    // tasks or created the next copy of a repeating task)
    for (const lt of await db.tasks.toArray()) {
      if (!lt.google_task_id) {
        const gid = await this.pushTaskToGoogle(lt, listId);
        if (gid) exported++;
      }
    }

    return { imported, exported };
  }
}
