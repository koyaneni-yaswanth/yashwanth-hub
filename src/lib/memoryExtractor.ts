/**
 * JARVIS 4.0 Long-Term Memory Extractor, Contradiction Checker & Context Scorer
 * Zero DOM / Dexie dependencies (Node & Browser safe).
 * Strictly enforces secret rejection across all 10 memory categories.
 */
import type { CompanionMemoryCategory, CompanionMemoryRecord } from '../types';
import { containsSensitiveSecret, redactSensitiveSecrets } from './companionSecurity.ts';

export const COMPANION_MEMORY_CATEGORIES: Array<{
  id: CompanionMemoryCategory;
  label: string;
  description: string;
}> = [
  { id: 'preference', label: 'Personal Preferences', description: 'Working style, communication & tool preferences' },
  { id: 'goal', label: 'Long-Term Goals', description: 'Startup, robotics, research, and career milestones' },
  { id: 'project', label: 'Active Projects', description: 'Current initiatives and focus areas' },
  { id: 'milestone', label: 'Project Milestones', description: 'Key checkpoints, deadlines, and gates' },
  { id: 'architecture', label: 'Technical Architecture', description: 'Stack, hardware, firmware & pipeline decisions' },
  { id: 'decision', label: 'Important Decisions', description: 'Explicit choices made with rationale' },
  { id: 'unfinished_task', label: 'Unfinished Tasks', description: 'Pending commitments & open loops' },
  { id: 'learning', label: 'Learning Progress', description: 'Skills, readings, and concepts mastered' },
  { id: 'workflow', label: 'Frequent Workflows', description: 'Repeated habits and operating procedures' },
  { id: 'contact', label: 'Authorized Contacts', description: 'Advisors & collaborators when explicitly enabled' },
];

function tokenize(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

export function tokenJaccard(a: string, b: string): number {
  const sa = new Set(tokenize(a));
  const sb = new Set(tokenize(b));
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  return intersection / (sa.size + sb.size - intersection);
}

function inferProjectFromText(text: string, fallback?: string): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('pawan') || lower.includes('turbine') || lower.includes('trl') || lower.includes('v3f')) {
    return 'PAWAN SHAKTI';
  }
  if (lower.includes('piper') || lower.includes('drone') || lower.includes('awr2944') || lower.includes('ivlabs')) {
    return 'IvLabs / Robotics';
  }
  if (lower.includes('yashwanth hub') || lower.includes('jarvis') || lower.includes('buddy')) {
    return 'Yashwanth Hub';
  }
  return fallback;
}

export interface ExtractedMemoryCandidate {
  category: CompanionMemoryCategory;
  title: string;
  content: string;
  importance: number;
  confidence: number;
  durability: 'long_term' | 'temporary';
  expires_at?: string;
  project?: string;
  tags: string[];
  skippedSecret?: boolean;
}

const EXTRACTION_RULES: Array<{
  category: CompanionMemoryCategory;
  regex: RegExp;
  importance: number;
  titlePrefix: string;
}> = [
  {
    category: 'preference',
    regex: /\b(?:i\s+prefer|please\s+always|i\s+like\s+my\s+replies|i\s+work\s+best|my\s+preferred)\b/i,
    importance: 8,
    titlePrefix: 'Preference',
  },
  {
    category: 'goal',
    regex: /\b(?:my\s+goal\s+is|aiming\s+(?:to|for)|long[- ]term\s+(?:goal|vision)|by\s+202\d)\b/i,
    importance: 9,
    titlePrefix: 'Goal',
  },
  {
    category: 'decision',
    regex: /\b(?:we\s+decided|i\s+decided|decision:|let'?s\s+go\s+with|switched?\s+to|finalized)\b/i,
    importance: 8,
    titlePrefix: 'Decision',
  },
  {
    category: 'architecture',
    regex: /\b(?:architecture|tech\s+stack|schema|pipeline|can\s+bus|ros\s*2|pgvector|dexie|three\.js)\b/i,
    importance: 7,
    titlePrefix: 'Architecture',
  },
  {
    category: 'milestone',
    regex: /\b(?:milestone|trl\s*[456]|deadline|demo\s+day|v3f|bench\s+test|release\s+target)\b/i,
    importance: 8,
    titlePrefix: 'Milestone',
  },
  {
    category: 'unfinished_task',
    regex: /\b(?:still\s+need\s+to|todo:|follow\s+up\s+on|pending|unfinished|haven'?t\s+finished|need\s+to\s+fix)\b/i,
    importance: 7,
    titlePrefix: 'Open Loop',
  },
  {
    category: 'learning',
    regex: /\b(?:learned|studying|reading\s+paper|paper\s+insight|note\s+to\s+self\s+on\s+learning)\b/i,
    importance: 6,
    titlePrefix: 'Learning',
  },
  {
    category: 'workflow',
    regex: /\b(?:every\s+morning|every\s+evening|my\s+workflow|routine\s+is|habitually|weekly\s+review)\b/i,
    importance: 7,
    titlePrefix: 'Workflow',
  },
  {
    category: 'project',
    regex: /\b(?:working\s+on\s+project|building|pawan\s+shakti|agilex\s+piper|3-drone\s+swarm|awr2944)\b/i,
    importance: 7,
    titlePrefix: 'Project Context',
  },
  {
    category: 'contact',
    regex: /\b(?:mentor|advisor|professor|co-?founder|investor|partner)\s+[A-Z][a-z]+/i,
    importance: 6,
    titlePrefix: 'Contact Context',
  },
];

const TEMPORARY_RE = /\b(?:today|tonight|this\s+afternoon|tomorrow\s+morning|for\s+now|temporarily)\b/i;

export function extractCandidateMemories(input: {
  text: string;
  allowContacts?: boolean;
  defaultProject?: string;
  now?: Date;
}): ExtractedMemoryCandidate[] {
  const raw = String(input.text || '').trim();
  if (raw.length < 18) return [];

  // Hard security rule: NEVER extract memory entries containing raw credentials/keys/passwords
  if (containsSensitiveSecret(raw)) {
    const scrubbed = redactSensitiveSecrets(raw).redacted;
    // Also skip if the entire sentence was about storing a secret/password/api key
    if (/\b(?:my\s+(?:password|api\s*key|token|secret)|save\s+this\s+(?:key|password|token))\b/i.test(raw)) {
      return [];
    }
    if (!scrubbed || scrubbed.includes('[REDACTED')) {
      return [];
    }
  }

  const now = input.now || new Date();
  const sentences = raw
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16 && s.length <= 420);

  const out: ExtractedMemoryCandidate[] = [];
  const seenContent = new Set<string>();

  for (const sentence of sentences) {
    if (containsSensitiveSecret(sentence)) continue;
    for (const rule of EXTRACTION_RULES) {
      if (rule.category === 'contact' && !input.allowContacts) continue;
      if (!rule.regex.test(sentence)) continue;

      const key = `${rule.category}:${sentence.toLowerCase()}`;
      if (seenContent.has(key)) break;
      seenContent.add(key);

      const isTemp = TEMPORARY_RE.test(sentence) && rule.category === 'unfinished_task';
      const cleanSentence = sentence.replace(/\s+/g, ' ').trim();
      const shortTitle =
        cleanSentence.length > 64 ? `${cleanSentence.slice(0, 61)}...` : cleanSentence;

      const project = inferProjectFromText(cleanSentence, input.defaultProject);
      out.push({
        category: rule.category,
        title: `${rule.titlePrefix}: ${shortTitle}`,
        content: cleanSentence,
        importance: rule.importance,
        confidence: 0.82,
        durability: isTemp ? 'temporary' : 'long_term',
        expires_at: isTemp ? new Date(now.getTime() + 14 * 86400000).toISOString() : undefined,
        project,
        tags: [rule.category, ...(project ? [project.toLowerCase().replace(/[^a-z0-9]+/g, '-')] : [])],
      });
      break;
    }
    if (out.length >= 3) break;
  }

  return out;
}

const NEGATION_RE = /\b(?:no\s+longer|stopped|switched\s+(?:from|to)|instead\s+of|not\s+using|replaced)\b/i;

export function reconcileCandidateMemory(
  candidate: ExtractedMemoryCandidate,
  existing: CompanionMemoryRecord[]
):
  | { action: 'skip_duplicate'; existingId: string }
  | { action: 'supersede'; supersedesId: string; reason: string }
  | { action: 'insert' } {
  const active = existing.filter((m) => m.status === 'active');

  for (const prev of active) {
    const sim = tokenJaccard(`${candidate.title} ${candidate.content}`, `${prev.title} ${prev.content}`);
    if (sim >= 0.78 && prev.category === candidate.category) {
      return { action: 'skip_duplicate', existingId: prev.id };
    }

    const sameDomain =
      prev.category === candidate.category &&
      (!candidate.project || !prev.project || candidate.project === prev.project);

    if (
      sameDomain &&
      sim >= 0.34 &&
      (NEGATION_RE.test(candidate.content) ||
        /\b(?:instead\s+of|move(?:d)?\s+to|changed?\s+from|now\s+using)\b/i.test(candidate.content))
    ) {
      return {
        action: 'supersede',
        supersedesId: prev.id,
        reason: `Updated context supersedes earlier note "${prev.title}"`,
      };
    }
  }

  return { action: 'insert' };
}

export function selectRelevantMemories(
  query: string,
  memories: CompanionMemoryRecord[],
  options: { limit?: number; now?: Date; semanticScores?: Map<string, number> } = {}
): Array<CompanionMemoryRecord & { score: number }> {
  const now = (options.now || new Date()).getTime();
  const limit = options.limit ?? 8;
  const qLower = String(query || '').toLowerCase();

  const ranked: Array<CompanionMemoryRecord & { score: number }> = [];
  for (const m of memories) {
    if (m.status !== 'active') continue;
    if (m.expires_at && Date.parse(m.expires_at) <= now) continue;

    const lexical = tokenJaccard(qLower, `${m.title} ${m.content} ${m.project || ''} ${(m.tags || []).join(' ')}`);
    const semantic = options.semanticScores?.get(m.id) ?? 0;
    const ageDays = Math.max(0, (now - Date.parse(m.updated_at || m.created_at || new Date(now).toISOString())) / 86400000);
    const recencyBoost = 1 / (1 + ageDays / 21);
    const importanceBoost = (m.importance || 5) / 10;
    const verifiedBoost = m.verified_by_user ? 0.12 : 0;

    const score = lexical * 0.42 + semantic * 0.48 + importanceBoost * 0.18 + recencyBoost * 0.12 + verifiedBoost;
    if (score >= 0.12 || m.importance >= 8) {
      ranked.push({ ...m, score: Number(score.toFixed(4)) });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
