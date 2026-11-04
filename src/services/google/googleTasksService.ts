import { GoogleAuthService } from './googleAuthService';
import { db } from '../../db';
import type { Task, GoogleTaskItem } from '../../types';
import { generateId, getTodayISO } from '../../lib/utils';

export class GoogleTasksService {
  private static BASE_URL = 'https://tasks.googleapis.com/tasks/v1';

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

      // Update local task with google_task_id
      if (gTask.id && !task.google_task_id) {
        await db.tasks.update(task.id, { google_task_id: gTask.id, synced: true });
      }
      return gTask.id;
    } catch (e) {
      console.warn('Failed to push task to Google:', e);
      return null;
    }
  }

  // Bi-directional Two-Way Synchronization with conflict resolution
  public static async syncTwoWay(): Promise<{ imported: number; exported: number }> {
    const listId = (await this.getPrimaryTaskList()) || '@default';
    const gTasks = await this.fetchGoogleTasks(listId);
    const localTasks = await db.tasks.toArray();

    let imported = 0;
    let exported = 0;

    // 1. Process Google Tasks into local Yashwanth Hub
    for (const gt of gTasks) {
      const match = localTasks.find((lt) => lt.google_task_id === gt.id || lt.text.trim().toLowerCase() === gt.title.trim().toLowerCase());
      if (match) {
        // Check if status changed in Google Tasks
        const isDoneInGoogle = gt.status === 'completed';
        if (match.done !== isDoneInGoogle) {
          await db.tasks.update(match.id, {
            done: isDoneInGoogle,
            google_task_id: gt.id,
            updated_at: new Date().toISOString(),
          });
          imported++;
        }
      } else {
        // New task created in Google Tasks -> Import into Yashwanth Hub
        const now = new Date().toISOString();
        const newTask: Task = {
          id: generateId(),
          text: gt.title,
          notes: gt.notes,
          area: 'Personal',
          priority: 'medium',
          due_date: gt.due || getTodayISO(),
          starred: false,
          done: gt.status === 'completed',
          google_task_id: gt.id,
          created_at: now,
          updated_at: now,
          synced: true,
        };
        await db.tasks.add(newTask);
        imported++;
      }
    }

    // 2. Export unsynced local tasks to Google Tasks
    for (const lt of localTasks) {
      if (!lt.google_task_id) {
        const gid = await this.pushTaskToGoogle(lt, listId);
        if (gid) exported++;
      }
    }

    return { imported, exported };
  }
}
