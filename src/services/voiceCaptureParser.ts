import type { Area, Priority, Project } from '../types';

export type CaptureType = 'task' | 'event' | 'note' | 'expense' | 'idea';

export interface ParsedCaptureEntity {
  type: CaptureType;
  typeAutoDetected: boolean;
  title: string;
  date: string;
  time: string;
  area: string;
  projectId?: string;
  projectTitle?: string;
  amount?: number;
  priority: Priority;
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function addDaysISO(baseISO: string, days: number): string {
  const base = new Date(`${baseISO}T00:00:00Z`);
  if (Number.isNaN(base.getTime())) {
    return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  }
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Pure voice & natural-language capture parser.
 * Extracts intent, cleaned title, suggested project from real project list,
 * target area, suggested date/time, amount, and priority before user confirmation.
 */
export function parseQuickCaptureInput(
  rawText: string,
  options: {
    projects?: Project[];
    areas?: Area[];
    todayISO?: string;
    manualType?: CaptureType;
  } = {}
): ParsedCaptureEntity {
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();
  const todayStr = options.todayISO || new Date().toISOString().slice(0, 10);
  const projects = options.projects || [];
  const areas = options.areas || [];

  let type: CaptureType = options.manualType || 'task';
  let typeAutoDetected = false;
  let title = text;
  let area = areas[0]?.name || 'PAWAN SHAKTI';
  let date = todayStr;
  let time = '';
  let amount: number | undefined;
  let priority: Priority = 'medium';
  let projectId: string | undefined;
  let projectTitle: string | undefined;

  // 1. Intent Detection
  if (lower.includes('₹') || lower.includes(' rs') || lower.includes('rs.') || lower.includes('inr')) {
    type = 'expense';
    typeAutoDetected = true;
    const amtMatch = text.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/i);
    if (amtMatch) amount = parseFloat(amtMatch[1]);
  } else if (
    lower.includes('meeting') ||
    lower.includes('schedule') ||
    lower.includes('call with') ||
    lower.includes('sync with') ||
    (lower.includes('at ') && /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text))
  ) {
    if (lower.includes('create task') || lower.includes('create a task') || lower.includes('todo')) {
      type = 'task';
    } else {
      type = 'event';
      typeAutoDetected = true;
    }
  } else if (lower.startsWith('note:') || lower.startsWith('log:') || lower.includes('decision:')) {
    type = 'note';
    typeAutoDetected = true;
  } else if (lower.startsWith('idea:')) {
    type = 'idea';
    typeAutoDetected = true;
  } else if (lower.includes('task') || lower.includes('remind') || lower.includes('test ') || lower.includes('fix ')) {
    type = 'task';
    typeAutoDetected = true;
  }

  // 2. Priority Detection
  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('critical')) {
    priority = 'urgent';
  } else if (lower.includes('high priority') || lower.includes('important')) {
    priority = 'high';
  } else if (lower.includes('low priority')) {
    priority = 'low';
  }

  // 3. Date & Time Extraction
  const explicitIsoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicitIsoMatch) {
    date = explicitIsoMatch[1];
  } else if (lower.includes('tomorrow')) {
    date = addDaysISO(todayStr, 1);
  } else if (lower.includes('next week')) {
    date = addDaysISO(todayStr, 7);
  } else {
    const baseDate = new Date(`${todayStr}T00:00:00Z`);
    const baseDow = baseDate.getUTCDay();
    for (let i = 0; i < WEEKDAY_NAMES.length; i++) {
      if (lower.includes(WEEKDAY_NAMES[i])) {
        let diff = (i - baseDow + 7) % 7;
        if (diff === 0) diff = 7;
        date = addDaysISO(todayStr, diff);
        break;
      }
    }
  }

  const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (timeMatch) {
    time = timeMatch[1].toUpperCase();
  }

  // 4. Match Suggested Project from live Projects list
  for (const proj of projects) {
    const pTitleLower = (proj.title || '').toLowerCase();
    const pAreaLower = (proj.area || '').toLowerCase();
    const keywords = [
      ...pTitleLower.split(/[\s—,-]+/).filter((w) => w.length >= 4),
      ...(proj.tags || []).map((t) => t.toLowerCase()),
    ];
    if (
      (pAreaLower && lower.includes(pAreaLower)) ||
      keywords.some((kw) => lower.includes(kw))
    ) {
      projectId = proj.id;
      projectTitle = proj.title;
      area = proj.area;
      break;
    }
  }

  // Fallback area detection if no direct project matched
  if (!projectId) {
    if (
      lower.includes('#robotics') ||
      lower.includes('piper') ||
      lower.includes('drone') ||
      lower.includes('radar') ||
      lower.includes('awr2944') ||
      lower.includes('ivlabs')
    ) {
      area = 'IvLabs';
    } else if (
      lower.includes('#startup') ||
      lower.includes('#wind') ||
      lower.includes('pawan') ||
      lower.includes('turbine') ||
      lower.includes('generator') ||
      lower.includes('v3f')
    ) {
      area = 'PAWAN SHAKTI';
    } else if (lower.includes('#personal') || lower.includes('#routine') || lower.includes('sleep')) {
      area = 'Personal';
    } else if (lower.includes('#mg') || lower.includes('plc') || lower.includes('client')) {
      area = 'MG Automation';
    }
  }

  // 5. Clean Spoken Prefixes & Hashtags for Title
  title = title
    .replace(/#[a-zA-Z0-9_-]+/g, '')
    .replace(/^(?:please\s+)?(?:create|add|make)\s+(?:a\s+)?(?:task|note|event)\s*(?:to|for|:)?\s*/i, '')
    .replace(/^(?:note|idea|log|reminder)\s*:\s*/i, '')
    .trim();

  if (title) {
    title = title.charAt(0).toUpperCase() + title.slice(1);
  }

  return {
    type,
    typeAutoDetected,
    title,
    date,
    time,
    area,
    projectId,
    projectTitle,
    amount,
    priority,
  };
}
