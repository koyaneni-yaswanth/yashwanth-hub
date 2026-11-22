/**
 * Lets other pages (Home, Daily Compass) open Deep Work with a task already chosen.
 * sessionStorage so the hand-off never outlives the tab; every access is guarded
 * because storage can be blocked (private mode, strict settings).
 */
const KEY = 'yash_focus_handoff_task';

export function handOffFocusTask(taskId: string): void {
  try {
    sessionStorage.setItem(KEY, taskId);
  } catch {
    /* storage blocked: Deep Work just opens without a preselected task */
  }
}

export function takeFocusTask(): string | null {
  try {
    const id = sessionStorage.getItem(KEY);
    if (id) sessionStorage.removeItem(KEY);
    return id;
  } catch {
    return null;
  }
}
