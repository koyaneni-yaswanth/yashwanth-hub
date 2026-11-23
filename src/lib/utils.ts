import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

export function formatFullDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function getTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Normalises a stored due date to a local calendar day 'YYYY-MM-DD' ('' if none/invalid).
 * - Plain 'YYYY-MM-DD' is returned as-is.
 * - Midnight-UTC timestamps ('2026-11-04T00:00:00.000Z', how Google Tasks encodes a
 *   date-only due date) keep their calendar date — converting them to local time would
 *   shift them a day in time zones west of UTC.
 * - Any other timestamp is converted to the local calendar day.
 * Comparing raw strings without this treats a timestamp due today as "not today".
 */
export function toDueKey(value?: string | null): string {
  if (!value) return '';
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|\+00:00)$/.test(v)) return v.slice(0, 10);
  const d = new Date(v);
  if (isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type DueStatus = 'none' | 'overdue' | 'today' | 'upcoming';

/** Overdue, due today or upcoming — relative to `today` (local 'YYYY-MM-DD'). Done tasks are never overdue. */
export function dueStatus(dateStr: string | null | undefined, done: boolean | undefined, today: string = getTodayISO()): DueStatus {
  const key = toDueKey(dateStr);
  if (!key) return 'none';
  if (key === today) return 'today';
  if (key < today) return done ? 'none' : 'overdue';
  return 'upcoming';
}

export function isOverdue(dateStr?: string, done?: boolean): boolean {
  return dueStatus(dateStr, done) === 'overdue';
}

export function isDueToday(dateStr?: string): boolean {
  return dueStatus(dateStr, false) === 'today';
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getGreeting(name: string = 'Yaswanth'): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
}
