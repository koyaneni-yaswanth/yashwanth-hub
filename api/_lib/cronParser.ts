// V2 Real 5-Field Cron Expression Parser & Next-Run Evaluator
// Supports standard POSIX 5-field expressions ("min hour dom month dow")
// in arbitrary IANA timezones (default Asia/Kolkata).

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface ZonedDateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  weekday: number; // 0-6 (Sun-Sat)
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, fmt);
  }
  return fmt;
}

export function getZonedParts(date: Date, timeZone = 'Asia/Kolkata'): ZonedDateParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  let year = 1970;
  let month = 1;
  let day = 1;
  let hour = 0;
  let minute = 0;
  let weekday = 0;

  for (const p of parts) {
    if (p.type === 'year') year = Number(p.value);
    else if (p.type === 'month') month = Number(p.value);
    else if (p.type === 'day') day = Number(p.value);
    else if (p.type === 'hour') hour = Number(p.value) % 24;
    else if (p.type === 'minute') minute = Number(p.value);
    else if (p.type === 'weekday') weekday = WEEKDAY_MAP[p.value] ?? 0;
  }

  return { year, month, day, hour, minute, weekday };
}

export function parseCronField(
  expr: string,
  min: number,
  max: number,
  normalizeValue?: (v: number) => number
): Set<number> {
  const result = new Set<number>();
  const trimmed = (expr || '').trim();
  if (!trimmed) {
    throw new Error('Empty cron field');
  }

  const segments = trimmed.split(',');
  for (const seg of segments) {
    const part = seg.trim();
    if (!part) throw new Error(`Invalid cron segment in "${expr}"`);

    const [rangePart, stepPart] = part.split('/');
    if (part.split('/').length > 2) {
      throw new Error(`Invalid step syntax in "${part}"`);
    }

    const step = stepPart !== undefined ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step <= 0) {
      throw new Error(`Invalid cron step "${stepPart}" in "${part}"`);
    }

    let rangeStart = min;
    let rangeEnd = max;

    if (rangePart !== '*') {
      if (rangePart.includes('-')) {
        const [aStr, bStr] = rangePart.split('-');
        const a = Number(aStr);
        const b = Number(bStr);
        if (!Number.isInteger(a) || !Number.isInteger(b) || a > b || a < min || b > max) {
          throw new Error(`Invalid cron range "${rangePart}" (allowed ${min}-${max})`);
        }
        rangeStart = a;
        rangeEnd = b;
      } else {
        const v = Number(rangePart);
        if (!Number.isInteger(v) || v < min || v > max) {
          throw new Error(`Invalid cron value "${rangePart}" (allowed ${min}-${max})`);
        }
        rangeStart = v;
        rangeEnd = stepPart !== undefined ? max : v;
      }
    }

    for (let val = rangeStart; val <= rangeEnd; val += step) {
      result.add(normalizeValue ? normalizeValue(val) : val);
    }
  }

  if (result.size === 0) {
    throw new Error(`Cron field "${expr}" resolved to zero values`);
  }
  return result;
}

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domWildcard: boolean;
  dowWildcard: boolean;
}

export function parseCronExpression(cronExpression: string): ParsedCron {
  const fields = (cronExpression || '').trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Expected 5-field cron expression, got ${fields.length}: "${cronExpression}"`);
  }

  const [minStr, hourStr, domStr, monthStr, dowStr] = fields;
  return {
    minutes: parseCronField(minStr, 0, 59),
    hours: parseCronField(hourStr, 0, 23),
    daysOfMonth: parseCronField(domStr, 1, 31),
    months: parseCronField(monthStr, 1, 12),
    daysOfWeek: parseCronField(dowStr, 0, 7, (v) => (v === 7 ? 0 : v)),
    domWildcard: domStr.trim() === '*',
    dowWildcard: dowStr.trim() === '*',
  };
}

export function isValidCronExpression(cronExpression: string): boolean {
  try {
    parseCronExpression(cronExpression);
    return true;
  } catch {
    return false;
  }
}

export function matchesParsedCron(parsed: ParsedCron, parts: ZonedDateParts): boolean {
  if (!parsed.minutes.has(parts.minute)) return false;
  if (!parsed.hours.has(parts.hour)) return false;
  if (!parsed.months.has(parts.month)) return false;

  const domMatch = parsed.daysOfMonth.has(parts.day);
  const dowMatch = parsed.daysOfWeek.has(parts.weekday);

  // Standard Vixie/POSIX cron semantics: if both DOM and DOW are restricted, either matches.
  if (!parsed.domWildcard && !parsed.dowWildcard) {
    return domMatch || dowMatch;
  }
  return domMatch && dowMatch;
}

/**
 * Computes the exact next execution Date strictly after `fromDate`
 * in the configured timezone (default `Asia/Kolkata`).
 */
export function computeNextCronRun(
  cronExpression: string,
  fromDate: Date = new Date(),
  timeZone = 'Asia/Kolkata'
): Date {
  const parsed = parseCronExpression(cronExpression);
  // Start cleanly on the next minute boundary
  let cursorMs = Math.floor(fromDate.getTime() / 60000) * 60000 + 60000;
  const maxIterations = 366 * 24 * 60; // 1 year search ceiling

  for (let i = 0; i < maxIterations; i++) {
    const candidate = new Date(cursorMs);
    const parts = getZonedParts(candidate, timeZone);
    if (matchesParsedCron(parsed, parts)) {
      return candidate;
    }
    cursorMs += 60000;
  }

  throw new Error(`No matching cron occurrence found within 366 days for "${cronExpression}"`);
}
