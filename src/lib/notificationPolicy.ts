/**
 * JARVIS 4.0 Proactive Notification Policy, Quiet Hours & Briefing Scheduler
 * Pure deterministic logic (Node & Browser safe).
 */
import type { CompanionTimelineItem, JarvisCompanionSettings } from '../types';
import { DEFAULT_COMPANION_SETTINGS } from './companionIdentity.ts';

function parseHHmm(hhmm: string, fallbackMinutes: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return fallbackMinutes;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + min;
}

export function getZonedClockParts(
  date: Date,
  timeZone = 'Asia/Kolkata'
): { dateISO: string; weekday: number; minutesOfDay: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateISO: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: wdMap[get('weekday')] ?? date.getDay(),
    minutesOfDay: hour * 60 + minute,
  };
}

export function isWithinQuietHours(
  date: Date,
  settings: Pick<JarvisCompanionSettings, 'quietHoursEnabled' | 'quietHoursStart' | 'quietHoursEnd'>,
  timeZone = 'Asia/Kolkata'
): boolean {
  if (!settings.quietHoursEnabled) return false;
  const { minutesOfDay } = getZonedClockParts(date, timeZone);
  const start = parseHHmm(settings.quietHoursStart, 22 * 60 + 30);
  const end = parseHHmm(settings.quietHoursEnd, 7 * 60);

  if (start === end) return false;
  if (start < end) {
    return minutesOfDay >= start && minutesOfDay < end;
  }
  // Overnight quiet window (e.g., 22:30 -> 07:00)
  return minutesOfDay >= start || minutesOfDay < end;
}

export interface ProactiveAlertCandidate {
  dedupKey: string;
  title: string;
  summary: string;
  importanceScore: number; // 1-10
  severity: 'low' | 'normal' | 'high' | 'critical';
  source: string;
}

export function evaluateProactiveNotification(
  candidate: ProactiveAlertCandidate,
  context: {
    settings?: Partial<JarvisCompanionSettings>;
    recentTimeline?: CompanionTimelineItem[];
    now?: Date;
    timeZone?: string;
    dedupCooldownHours?: number;
  } = {}
): {
  decision: 'deliver_now' | 'queue_for_digest' | 'suppress_duplicate' | 'suppress_low_importance';
  reason: string;
} {
  const settings = { ...DEFAULT_COMPANION_SETTINGS, ...(context.settings || {}) };
  const now = context.now || new Date();
  const timeZone = context.timeZone || 'Asia/Kolkata';
  const cooldownMs = (context.dedupCooldownHours ?? 6) * 3600000;

  // 1. Duplicate suppression within cooldown window
  const recent = context.recentTimeline || [];
  for (const item of recent) {
    const ageMs = now.getTime() - Date.parse(item.created_at || '');
    if (Number.isNaN(ageMs) || ageMs > cooldownMs) continue;
    const itemDedup = String(item.metadata?.dedupKey || '');
    if (
      (candidate.dedupKey && itemDedup === candidate.dedupKey) ||
      item.title.toLowerCase() === candidate.title.toLowerCase()
    ) {
      return {
        decision: 'suppress_duplicate',
        reason: `Similar alert delivered within the last ${context.dedupCooldownHours ?? 6}h.`,
      };
    }
  }

  // 2. Importance threshold filter (critical bypasses low-importance filter)
  if (candidate.severity !== 'critical' && candidate.importanceScore < settings.minProactiveImportance) {
    return {
      decision: 'suppress_low_importance',
      reason: `Importance (${candidate.importanceScore}) is below threshold (${settings.minProactiveImportance}).`,
    };
  }

  // 3. Proactive master toggle or quiet hours -> defer non-critical notifications to digest
  if (!settings.proactiveEnabled && candidate.severity !== 'critical') {
    return {
      decision: 'queue_for_digest',
      reason: 'Proactive interruptions paused; queued for briefing digest.',
    };
  }

  if (isWithinQuietHours(now, settings, timeZone) && candidate.severity !== 'critical') {
    return {
      decision: 'queue_for_digest',
      reason: `Within quiet hours (${settings.quietHoursStart}–${settings.quietHoursEnd}); deferred to morning digest.`,
    };
  }

  return {
    decision: 'deliver_now',
    reason: candidate.severity === 'critical' ? 'Critical issue requires immediate awareness.' : 'Passed importance, quiet-hours, and dedup policy.',
  };
}

export function isScheduledBriefingDue(input: {
  cadence: 'morning' | 'evening' | 'weekly';
  scheduleTimeHHmm: string;
  weeklyDay?: number;
  lastSentAt?: string | null;
  now?: Date;
  timeZone?: string;
}): boolean {
  const now = input.now || new Date();
  const tz = input.timeZone || 'Asia/Kolkata';
  const { dateISO, weekday, minutesOfDay } = getZonedClockParts(now, tz);
  const targetMinutes = parseHHmm(input.scheduleTimeHHmm, input.cadence === 'morning' ? 8 * 60 : 20 * 60 + 30);

  if (input.cadence === 'weekly' && typeof input.weeklyDay === 'number' && weekday !== input.weeklyDay) {
    return false;
  }
  if (minutesOfDay < targetMinutes) return false;

  if (input.lastSentAt) {
    const lastDate = new Date(input.lastSentAt);
    if (!Number.isNaN(lastDate.getTime())) {
      const lastParts = getZonedClockParts(lastDate, tz);
      if (lastParts.dateISO === dateISO) return false;
      if (input.cadence === 'weekly' && now.getTime() - lastDate.getTime() < 5 * 86400000) {
        return false;
      }
    }
  }
  return true;
}
