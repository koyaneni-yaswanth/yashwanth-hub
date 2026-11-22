/**
 * Pure notification rules: user preferences, quiet hours and de-duplication.
 */

export type AlertType = 'meeting' | 'deadline' | 'ai' | 'system' | string;

export interface NotificationPrefs {
  /** Hour (0–23) quiet hours begin. */
  quietStart: number;
  /** Hour (0–23) quiet hours end. */
  quietEnd: number;
  quietHoursEnabled: boolean;
  /** Types that never raise a pop-up / push alert (they still appear in the inbox). */
  mutedAlertTypes: string[];
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  quietStart: 22,
  quietEnd: 7,
  quietHoursEnabled: true,
  mutedAlertTypes: [],
};

/** How long an identical unread notification suppresses a new copy. */
export const DUPLICATE_WINDOW_MS = 12 * 60 * 60 * 1000;

const clampHour = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback;

/** Parses stored prefs, accepting the legacy `{start, end}` quiet-hours shape. */
export function parseNotificationPrefs(raw: string | null | undefined, legacyQuietHours?: string | null): NotificationPrefs {
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  let legacy: Record<string, unknown> = {};
  try {
    legacy = legacyQuietHours ? JSON.parse(legacyQuietHours) : {};
  } catch {
    legacy = {};
  }
  return {
    quietStart: clampHour(parsed.quietStart ?? legacy.start, DEFAULT_NOTIFICATION_PREFS.quietStart),
    quietEnd: clampHour(parsed.quietEnd ?? legacy.end, DEFAULT_NOTIFICATION_PREFS.quietEnd),
    quietHoursEnabled:
      typeof parsed.quietHoursEnabled === 'boolean' ? parsed.quietHoursEnabled : DEFAULT_NOTIFICATION_PREFS.quietHoursEnabled,
    mutedAlertTypes: Array.isArray(parsed.mutedAlertTypes)
      ? parsed.mutedAlertTypes.filter((t): t is string => typeof t === 'string')
      : [],
  };
}

export function isWithinQuietHours(hour: number, prefs: NotificationPrefs): boolean {
  if (!prefs.quietHoursEnabled || prefs.quietStart === prefs.quietEnd) return false;
  if (prefs.quietStart > prefs.quietEnd) return hour >= prefs.quietStart || hour < prefs.quietEnd;
  return hour >= prefs.quietStart && hour < prefs.quietEnd;
}

export function shouldRaiseAlert(type: AlertType, hour: number, prefs: NotificationPrefs): boolean {
  return !prefs.mutedAlertTypes.includes(type) && !isWithinQuietHours(hour, prefs);
}

export interface NotificationLike {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  action_link?: string;
  created_at: string;
}

/** Returns an existing unread notification that the candidate would merely repeat, if any. */
export function findRecentDuplicate<T extends NotificationLike>(
  existing: T[],
  candidate: Pick<NotificationLike, 'title' | 'message' | 'type' | 'action_link'>,
  nowMs: number,
  windowMs: number = DUPLICATE_WINDOW_MS
): T | undefined {
  return existing.find(
    (n) =>
      !n.read &&
      n.title === candidate.title &&
      n.message === candidate.message &&
      n.type === candidate.type &&
      (n.action_link ?? '') === (candidate.action_link ?? '') &&
      nowMs - Date.parse(n.created_at) < windowMs
  );
}
