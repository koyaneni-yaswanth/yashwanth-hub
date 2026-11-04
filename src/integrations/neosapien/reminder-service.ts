// NeoSapien Integration: Spoken Commitments Reconciliation Engine ("I APPROVE" Standard)
import type { NeoMemory, NeoActionItem, Task } from '../../types';
import { db } from '../../db';
import { generateId, getTodayISO } from '../../lib/utils';
import { GoogleTasksService } from '../../services/google/googleTasksService';
import { GoogleAuthService } from '../../services/google/googleAuthService';

export class NeoReminderReconciliationEngine {
  // Reconcile spoken action items against active Yashwanth Hub tasks & Google Tasks
  public static async reconcileAll(): Promise<{
    newCommitments: { memory: NeoMemory; item: NeoActionItem }[];
    existingMatches: { memory: NeoMemory; item: NeoActionItem; hubTaskTitle: string }[];
    overdueItems: { memory: NeoMemory; item: NeoActionItem }[];
    approvedItems: { memory: NeoMemory; item: NeoActionItem }[];
  }> {
    const memories = await db.neo_memories.toArray();
    const hubTasks = await db.tasks.toArray();
    const today = getTodayISO();

    const newCommitments: { memory: NeoMemory; item: NeoActionItem }[] = [];
    const existingMatches: { memory: NeoMemory; item: NeoActionItem; hubTaskTitle: string }[] = [];
    const overdueItems: { memory: NeoMemory; item: NeoActionItem }[] = [];
    const approvedItems: { memory: NeoMemory; item: NeoActionItem }[] = [];

    for (const mem of memories) {
      if (!mem.actionItems || mem.actionItems.length === 0) continue;

      for (const item of mem.actionItems) {
        if (item.status === 'approved' || item.status === 'synced_to_hub' || item.status === 'synced_to_google') {
          approvedItems.push({ memory: mem, item });
          continue;
        }

        // Check for matching Hub task by title similarity
        const normalizedItem = item.text.toLowerCase().trim();
        const match = hubTasks.find(
          (t) =>
            t.text.toLowerCase().trim() === normalizedItem ||
            normalizedItem.includes(t.text.toLowerCase().trim())
        );

        if (match) {
          existingMatches.push({ memory: mem, item, hubTaskTitle: match.text });
        } else if (item.detectedDeadline && item.detectedDeadline < today) {
          overdueItems.push({ memory: mem, item });
        } else {
          newCommitments.push({ memory: mem, item });
        }
      }
    }

    return {
      newCommitments,
      existingMatches,
      overdueItems,
      approvedItems,
    };
  }

  // Explicit approval handler - converts spoken commitment into an active Task
  public static async approveAndCreateTask(
    memoryId: string,
    actionItemId: string,
    syncToGoogle: boolean = false,
    area?: string
  ): Promise<{ taskId: string; googleTaskId?: string }> {
    const memory = await db.neo_memories.get(memoryId);
    if (!memory) throw new Error(`Neo Memory ${memoryId} not found`);

    const actionItem = memory.actionItems?.find((a) => a.id === actionItemId);
    if (!actionItem) throw new Error('Action item not found in memory');

    const now = new Date().toISOString();
    const targetArea = area || memory.associatedArea || 'Personal';
    const deadline = actionItem.detectedDeadline || getTodayISO();

    let googleTaskId: string | undefined;
    const taskId = generateId();

    const newTask: Task = {
      id: taskId,
      text: actionItem.text,
      description: `Commitment from NeoSapien Memory: "${memory.title}"\nAssignee: ${
        actionItem.assigneeName || 'Founder'
      }\nCaptured: ${memory.capturedAt.slice(0, 10)}`,
      notes: `Extracted from Neo Memory: "${memory.title}" (${memory.source})`,
      area: targetArea,
      priority: actionItem.priority || 'medium',
      due_date: deadline,
      starred: actionItem.priority === 'urgent' || actionItem.priority === 'high',
      done: false,
      created_at: now,
      updated_at: now,
    };

    // External Google Tasks push if authorized
    if (syncToGoogle && GoogleAuthService.isConnected()) {
      try {
        const gResId = await GoogleTasksService.pushTaskToGoogle(newTask);
        if (gResId) {
          googleTaskId = gResId;
          newTask.google_task_id = gResId;
          newTask.synced = true;
        }
      } catch (gErr: any) {
        console.warn('Google Task creation skipped or failed:', gErr.message);
      }
    }

    // Add to Yashwanth Hub tasks
    await db.tasks.add(newTask);

    // Update memory status
    const updatedActions = memory.actionItems.map((a) => {
      if (a.id === actionItemId) {
        return {
          ...a,
          status: syncToGoogle ? ('synced_to_google' as const) : ('synced_to_hub' as const),
          hubTaskId: taskId,
          googleTaskId,
          reconciliationStatus: 'completed' as const,
        };
      }
      return a;
    });

    await db.neo_memories.update(memoryId, { actionItems: updatedActions });

    return { taskId, googleTaskId };
  }
}
