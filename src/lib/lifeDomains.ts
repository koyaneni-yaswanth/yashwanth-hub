/**
 * Life domains: groups goals and habits into six areas of life so the
 * Constellation can colour them and the balance radar can compare them.
 * Pure functions; no database or React.
 *
 * Colours are identity only and always appear with a text label. They were
 * validated (dataviz palette checks) on the dark space surface in SLOT order —
 * the order below — which is why it isn't alphabetical.
 */
import type { Goal, Habit } from '../types';

export type DomainId = 'career' | 'creativity' | 'finance' | 'relationships' | 'health' | 'learning';

export interface LifeDomain {
  id: DomainId;
  label: string;
  color: string;
}

/** Slot order (validated adjacency). */
export const DOMAINS: LifeDomain[] = [
  { id: 'career', label: 'Career & focus', color: '#3987e5' },
  { id: 'creativity', label: 'Creativity', color: '#199e70' },
  { id: 'finance', label: 'Finance', color: '#c98500' },
  { id: 'relationships', label: 'Relationships', color: '#d55181' },
  { id: 'health', label: 'Health', color: '#0ca30c' },
  { id: 'learning', label: 'Learning', color: '#9085e9' },
];

/** Reading order for the radar and legends. */
export const DOMAIN_DISPLAY_ORDER: DomainId[] = ['career', 'learning', 'health', 'finance', 'relationships', 'creativity'];

export const domainById = (id: DomainId): LifeDomain => DOMAINS.find((d) => d.id === id) as LifeDomain;

const KEYWORDS: [DomainId, RegExp][] = [
  ['health', /\b(health|run|running|marathon|gym|workout|exercise|fitness|sleep|diet|yoga|walk|steps|meditat\w*|stretch\w*|weight|water)\b/i],
  ['finance', /\b(finance|financial|money|budget|saving|savings|invest\w*|revenue|income|profit|expense\w*|grant|funding|loan|₹|rupee|capital)\b/i],
  ['relationships', /\b(family|friend\w*|partner|relationship\w*|mom|dad|parents?|wife|husband|kids?|call|date night|network\w*)\b/i],
  ['creativity', /\b(creativ\w*|design|draw\w*|paint\w*|music|guitar|write|writing|blog|video|photo\w*|art|craft|compose)\b/i],
  ['learning', /\b(learn\w*|course|study|studying|read|reading|book|research|paper|certif\w*|exam|ros\s?2?|tutorial|class|lecture|ivlabs)\b/i],
];

/** Infers a goal's or habit's life domain from its words; career/focus is the default. */
export function domainOf(text: string, area?: string): DomainId {
  const hay = `${text} ${area ?? ''}`;
  for (const [id, re] of KEYWORDS) if (re.test(hay)) return id;
  return 'career';
}

export const goalDomain = (g: Pick<Goal, 'title' | 'area' | 'why'>): DomainId => domainOf(`${g.title} ${g.why ?? ''}`, g.area);

export function habitDomain(h: Pick<Habit, 'title' | 'area' | 'goal_id'>, goalsById: Map<string, Pick<Goal, 'title' | 'area' | 'why'>>): DomainId {
  const g = h.goal_id ? goalsById.get(h.goal_id) : undefined;
  return g ? goalDomain(g) : domainOf(h.title, h.area);
}

export interface DomainBalance {
  domain: LifeDomain;
  /** 0–100, or null when nothing in this domain has data yet. */
  score: number | null;
  goals: number;
  habits: number;
}

/**
 * Balance per domain: the average of each goal's milestone progress and each
 * habit's recent consistency in that domain. Domains with nothing in them are
 * null (shown as "no data"), never 0.
 */
export function domainBalance(
  goals: { goal: Pick<Goal, 'title' | 'area' | 'why'>; progress: number; total: number }[],
  habits: { habit: Pick<Habit, 'title' | 'area' | 'goal_id'>; consistency: number }[],
  goalsById: Map<string, Pick<Goal, 'title' | 'area' | 'why'>>
): DomainBalance[] {
  const buckets = new Map<DomainId, { values: number[]; goals: number; habits: number }>();
  for (const id of DOMAIN_DISPLAY_ORDER) buckets.set(id, { values: [], goals: 0, habits: 0 });
  for (const g of goals) {
    const b = buckets.get(goalDomain(g.goal))!;
    b.goals++;
    if (g.total > 0) b.values.push(g.progress);
  }
  for (const h of habits) {
    const b = buckets.get(habitDomain(h.habit, goalsById))!;
    b.habits++;
    b.values.push(h.consistency);
  }
  return DOMAIN_DISPLAY_ORDER.map((id) => {
    const b = buckets.get(id)!;
    return {
      domain: domainById(id),
      score: b.values.length ? Math.round((b.values.reduce((a, v) => a + v, 0) / b.values.length) * 100) : null,
      goals: b.goals,
      habits: b.habits,
    };
  });
}

/** Stable 0–1 pseudo-random number from a string (positions that don't jump between renders). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}
