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

  // Periodic intelligent scan across tasks, meetings, and deadlines
  public static async runIntelligenceScan(): Promise<number> {
    const today = getTodayISO();
    const now = new Date();
    let countDelivered = 0;

    const [tasks, meetings, existingNotifs] = await Promise.all([
      db.tasks.toArray(),
      db.meetings.toArray(),
      db.notifications.toArray(),
    ]);

    // 1. Scan for Overdue Tasks
    const overdueTasks = tasks.filter((t) => !t.done && isOverdue(t.due_date, t.done));
    if (overdueTasks.length > 0) {
      const alreadyAlerted = existingNotifs.some(
        (n) => n.type === 'deadline' && n.created_at.startsWith(today)
      );
      if (!alreadyAlerted) {
        await this.deliverNotification(
          'Action Required: Overdue Tasks Detected',
          `You have ${overdueTasks.length} task(s) past their scheduled due date. High priority: "${overdueTasks[0].text}"`,
          'deadline',
          'high',
          'tasks'
        );
        countDelivered++;
      }
    }

    // 2. Scan for Upcoming Meetings in next 45 minutes with incomplete action items
    for (const m of meetings) {
      if (m.date === today && m.status === 'scheduled') {
        const [mHour, mMin] = m.start_time.split(':').map(Number);
        const meetingMinutes = mHour * 60 + mMin;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const diffMinutes = meetingMinutes - currentMinutes;

        // Between 5 and 45 minutes before meeting
        if (diffMinutes > 0 && diffMinutes <= 45) {
          const alreadyAlerted = existingNotifs.some(
            (n) => n.related_record_id === m.id && n.created_at.startsWith(today)
          );
          if (!alreadyAlerted) {
            await this.deliverNotification(
              `Upcoming Meeting in ${diffMinutes}m: ${m.title}`,
              `With: ${m.attendees || 'Team'}. Action items pending: ${m.action_items || 'None'}. Click to join.`,
              'meeting',
              'high',
              m.location_or_link || 'meetings'
            );
            countDelivered++;
          }
        }
      }
    }

    // 3. Sync Native Capacitor Scheduled Alarms (for tasks due and events)
    if (CapacitorService.isNative()) {
      try {
        const events = await db.events.toArray();
        await CapacitorService.syncUpcomingNativeReminders(tasks, events);
      } catch (err) {
        console.warn('Native reminder sync warning:', err);
      }
    }

    return countDelivered;
  }
}
