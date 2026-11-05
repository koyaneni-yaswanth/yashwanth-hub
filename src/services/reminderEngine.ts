import { db } from '../db';
import type { AppNotification } from '../types';
import { generateId, getTodayISO, isOverdue } from '../lib/utils';

import { CapacitorService } from './native/capacitorService';

export class ReminderEngine {
  private static STORAGE_QUIET_HOURS = 'yash_quiet_hours';

  public static isQuietHours(): boolean {
    if (typeof window === 'undefined') return false;
    const raw = localStorage.getItem(this.STORAGE_QUIET_HOURS);
    const { start = 22, end = 7 } = raw ? JSON.parse(raw) : {};
    const currentHour = new Date().getHours();
    if (start > end) {
      return currentHour >= start || currentHour < end;
    }
    return currentHour >= start && currentHour < end;
  }

  public static async requestBrowserPermission(): Promise<boolean> {
    if (CapacitorService.isNative()) {
      return await CapacitorService.requestNotificationPermissions();
    }
    if (typeof window === 'undefined' || !('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    const res = await Notification.requestPermission();
    return res === 'granted';
  }

  // Deliver a notification to database and trigger alert (native or browser) if permitted
  public static async deliverNotification(
    title: string,
    message: string,
    type: AppNotification['type'],
    priority: AppNotification['priority'] = 'medium',
    actionLink?: string
  ): Promise<AppNotification> {
    const notif: AppNotification = {
      id: generateId(),
      title,
      message,
      type,
      priority,
      read: false,
      action_link: actionLink,
      created_at: new Date().toISOString(),
    };

    await db.notifications.add(notif);

    // Deliver alert if outside quiet hours
    if (!this.isQuietHours()) {
      if (CapacitorService.isNative()) {
        // Native Capacitor Local Notifications
        CapacitorService.scheduleNotification(title, message, undefined, undefined, actionLink);
      } else if (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(title, {
            body: message,
            icon: '/favicon.svg',
          });
        } catch (e) {
          console.warn('Browser notification failed:', e);
        }
      }
    }

    return notif;
  }

  // Server-delegated intelligence scan across tasks, meetings, and deadlines
  // Conforms strictly to Antigravity Hard Constraints:
  // - Executes on server via /api/automations/run
  // - Verified database execution record created in automation_execution_logs
  // - No optimistic success indicators without real execution records
  public static async runIntelligenceScan(): Promise<number> {
    let countDelivered = 0;

    try {
      // 1. Execute task & meeting scanner strictly on the server
      const { AutomationService } = await import('./automationService');
      const res = await AutomationService.triggerServerAutomation('task_deadline_scan', undefined, {
        lead_time_minutes: 45,
      });

      if (res.success && res.log) {
        countDelivered = res.log.records_affected || 0;
      }
    } catch (err) {
      console.warn('[ReminderEngine] Server automation trigger warning:', err);
    }

    // 2. Synchronize Native Device Alarms (Capacitor OS-level background notifications)
    if (CapacitorService.isNative()) {
      try {
        const [tasks, events] = await Promise.all([
          db.tasks.toArray(),
          db.events.toArray(),
        ]);
        await CapacitorService.syncUpcomingNativeReminders(tasks, events);
      } catch (err) {
        console.warn('[ReminderEngine] Native reminder sync warning:', err);
      }
    }

    return countDelivered;
  }
}
