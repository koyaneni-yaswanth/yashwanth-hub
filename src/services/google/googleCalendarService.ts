import { GoogleAuthService } from './googleAuthService';
import { db } from '../../db';
import type { EventItem, Meeting } from '../../types';
import { generateId } from '../../lib/utils';

export class GoogleCalendarService {
  private static BASE_URL = 'https://www.googleapis.com/calendar/v3';

  // Check for scheduling conflicts
  public static async detectConflicts(
    date: string,
    startTime: string,
    endTime?: string,
    excludeId?: string
  ): Promise<(EventItem | Meeting)[]> {
    const [events, meetings] = await Promise.all([
      db.events.where('date').equals(date).toArray(),
      db.meetings.where('date').equals(date).toArray(),
    ]);

    const end = endTime || startTime;
    const conflicts: (EventItem | Meeting)[] = [];

    events.forEach((ev) => {
      if (ev.id === excludeId) return;
      if (!ev.start_time) return;
      const evEnd = ev.end_time || ev.start_time;
      if (startTime < evEnd && end > ev.start_time) {
        conflicts.push(ev);
      }
    });

    meetings.forEach((m) => {
      if (m.id === excludeId) return;
      if (m.status === 'cancelled') return;
      const mEnd = m.end_time || m.start_time;
      if (startTime < mEnd && end > m.start_time) {
        conflicts.push(m);
      }
    });

    return conflicts;
  }

  // Pull events from primary Google Calendar
  public static async syncFromGoogle(): Promise<{ imported: number; updated: number }> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) throw new Error('Google Workspace is not connected.');

    const now = new Date();
    const timeMin = new Date(now.getTime() - 30 * 86400000).toISOString(); // Past 30 days
    const timeMax = new Date(now.getTime() + 90 * 86400000).toISOString(); // Next 90 days

    const url = `${this.BASE_URL}/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Google Calendar API error: ${res.statusText}`);
    }

    const data = await res.json();
    const items = data.items || [];
    let imported = 0;
    let updated = 0;

    for (const item of items) {
      const gId = item.id;
      const title = item.summary || 'Untitled Google Event';
      const startDateTime = item.start?.dateTime || item.start?.date;
      if (!startDateTime) continue;

      const dateStr = startDateTime.slice(0, 10);
      const timeStr = startDateTime.includes('T') ? startDateTime.slice(11, 16) : undefined;
      const meetLink = item.hangoutLink || item.conferenceData?.entryPoints?.[0]?.uri;

      const existing = await db.events.filter((e) => e.google_event_id === gId).first();

      if (existing) {
        await db.events.update(existing.id, {
          title,
          date: dateStr,
          start_time: timeStr,
          place: item.location || meetLink || existing.place,
          updated_at: new Date().toISOString(),
        });
        updated++;
      } else {
        const newEv: EventItem = {
          id: generateId(),
          title,
          date: dateStr,
          start_time: timeStr,
          kind: meetLink ? 'Meeting' : 'Other',
          place: item.location || meetLink,
          google_event_id: gId,
          area: 'Personal',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await db.events.add(newEv);
        imported++;
      }
    }

    return { imported, updated };
  }

  // Create Google Calendar event with Google Meet link
  public static async createGoogleMeetEvent(
    title: string,
    date: string,
    startTime: string,
    endTime: string,
    attendeesEmails: string[]
  ): Promise<{ googleEventId: string; meetLink: string }> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) throw new Error('Google Workspace is not connected.');

    const startDateTime = `${date}T${startTime}:00`;
    const endDateTime = `${date}T${endTime}:00`;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

    const payload = {
      summary: title,
      start: { dateTime: startDateTime, timeZone },
      end: { dateTime: endDateTime, timeZone },
      attendees: attendeesEmails.map((email) => ({ email: email.trim() })),
      conferenceData: {
        createRequest: {
          requestId: generateId(),
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    const url = `${this.BASE_URL}/calendars/primary/events?conferenceDataVersion=1`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to create Google Meet event: ${res.status}`);
    }

    const created = await res.json();
    const meetLink = created.hangoutLink || created.conferenceData?.entryPoints?.[0]?.uri || '';

    return {
      googleEventId: created.id,
      meetLink,
    };
  }

  // Push local Yashwanth Hub event to Google Calendar
  public static async pushToGoogle(event: EventItem): Promise<string> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) throw new Error('Google Workspace is not connected.');

    const startDateTime = event.start_time ? `${event.date}T${event.start_time}:00` : `${event.date}T09:00:00`;
    const endDateTime = event.end_time ? `${event.date}T${event.end_time}:00` : `${event.date}T10:00:00`;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

    const payload = {
      summary: event.title,
      description: event.notes || `Created via Yashwanth Hub [${event.area || 'Personal'}]`,
      location: event.place || '',
      start: { dateTime: startDateTime, timeZone },
      end: { dateTime: endDateTime, timeZone },
    };

    const url = `${this.BASE_URL}/calendars/primary/events`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to push event to Google: ${res.status}`);
    }

    const created = await res.json();
    await db.events.update(event.id, {
      google_event_id: created.id,
      updated_at: new Date().toISOString(),
    });

    return created.id;
  }

  // Two-way synchronization between Yashwanth Hub events and Google Calendar
  public static async syncTwoWay(localEvents?: EventItem[]): Promise<{
    syncedCount: number;
    conflicts: (EventItem | Meeting)[];
    imported: number;
    updated: number;
  }> {
    // 1. Pull events from Google Calendar
    const { imported, updated } = await this.syncFromGoogle();

    // 2. Scan for scheduling conflicts across all events/meetings
    const events = localEvents || (await db.events.toArray());
    const conflicts: (EventItem | Meeting)[] = [];

    for (const ev of events) {
      if (ev.start_time) {
        const detected = await this.detectConflicts(ev.date, ev.start_time, ev.end_time, ev.id);
        if (detected.length > 0) {
          conflicts.push(...detected);
        }
      }
    }

    // Deduplicate conflicts by id
    const uniqueConflicts = Array.from(new Map(conflicts.map((c) => [c.id, c])).values());

    return {
      syncedCount: imported + updated,
      conflicts: uniqueConflicts,
      imported,
      updated,
    };
  }
}
