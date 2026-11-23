import { db } from '../../db';
import { toDueKey } from '../../lib/utils';
import { TaskService } from './taskService';

/**
 * One-time repair: earlier Google Tasks imports stored due dates as full
 * timestamps ('2026-11-04T00:00:00.000Z'). Rewrite them as plain local dates
 * through TaskService, so the fix also reaches the cloud via the sync queue.
 * Safe to run repeatedly: tasks already in 'YYYY-MM-DD' form are skipped.
 *
 * Note: undated Google tasks used to be given *today's* date on import. Those
 * can't be told apart from tasks genuinely due that day, so they are left as is.
 */
export async function repairTaskDueDates(): Promise<number> {
  const tasks = await db.tasks.filter((t) => typeof t.due_date === 'string' && t.due_date.length > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(t.due_date)).toArray();
  let fixed = 0;
  for (const t of tasks) {
    const key = toDueKey(t.due_date);
    if (key !== t.due_date) {
      await TaskService.update(t, { due_date: key || undefined });
      fixed++;
    }
  }
  if (fixed) console.info(`[tasks] Normalised ${fixed} due date${fixed === 1 ? '' : 's'} to plain dates.`);
  return fixed;
}
