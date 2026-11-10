import type { NavigationTab } from '../types';

export interface SearchHit {
  id: string;
  entityType:
    | 'project'
    | 'decision'
    | 'risk'
    | 'blocker'
    | 'task'
    | 'note'
    | 'document'
    | 'memory'
    | 'robotics'
    | 'meeting'
    | 'event'
    | 'contact'
    | 'expense';
  title: string;
  subtitle: string;
  targetTab: NavigationTab;
  area?: string;
  score: number;
}

export interface SearchableCorpus {
  tasks: any[];
  projects: any[];
  notes: any[];
  documents: any[];
  neo_memories: any[];
  robotics_records: any[];
  meetings: any[];
  events: any[];
  contacts: any[];
  expenses: any[];
}

function scoreMatch(rawQuery: string, tokens: string[], primaryText: string, secondaryText = ''): number {
  const p = (primaryText || '').toLowerCase();
  const s = (secondaryText || '').toLowerCase();
  const combined = `${p} ${s}`.trim();
  if (!rawQuery) return 1;

  let score = 0;
  if (p.includes(rawQuery)) score += 12;
  else if (s.includes(rawQuery)) score += 6;

  let matchedTokens = 0;
  for (const tok of tokens) {
    if (p.includes(tok)) {
      score += 4;
      matchedTokens++;
    } else if (s.includes(tok)) {
      score += 2;
      matchedTokens++;
    }
  }

  if (tokens.length > 0 && matchedTokens === 0 && !combined.includes(rawQuery)) {
    return 0;
  }
  return score;
}

export function rankUniversalSearchCorpus(
  query: string,
  corpus: SearchableCorpus,
  options: { limit?: number; includeNeoMemories?: boolean } = {}
): SearchHit[] {
  const q = (query || '').trim().toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  const limit = options.limit ?? 25;
  const includeNeo = options.includeNeoMemories !== false;

  const hits: SearchHit[] = [];

  for (const p of corpus.projects || []) {
    const score = scoreMatch(q, tokens, p.title, `${p.description || ''} ${p.area || ''} ${(p.tags || []).join(' ')}`);
    if (score > 0) {
      hits.push({
        id: `proj_${p.id}`,
        entityType: 'project',
        title: p.title,
        subtitle: `Project • ${p.area} • ${p.progress ?? 0}%`,
        targetTab: 'projects',
        area: p.area,
        score: score + 2,
      });
    }

    for (const d of p.decisions || []) {
      const dScore = scoreMatch(q, tokens, d.title, `${d.decision || ''} ${d.rationale || ''} ${p.title}`);
      if (dScore > 0) {
        hits.push({
          id: `dec_${d.id}`,
          entityType: 'decision',
          title: `${d.title}`,
          subtitle: `Decision in ${p.title} (${d.decided_at || 'undated'})`,
          targetTab: 'projects',
          area: p.area,
          score: dScore + 2,
        });
      }
    }

    for (const r of p.risks || []) {
      const rScore = scoreMatch(q, tokens, r.title, `${r.mitigation || ''} ${p.title}`);
      if (rScore > 0) {
        hits.push({
          id: `risk_${r.id}`,
          entityType: 'risk',
          title: `${r.title}`,
          subtitle: `Risk (${r.severity}) in ${p.title}`,
          targetTab: 'projects',
          area: p.area,
          score: rScore + 1,
        });
      }
    }

    for (const b of p.blockers || []) {
      const bScore = scoreMatch(q, tokens, b.title, `${b.impact || ''} ${p.title}`);
      if (bScore > 0) {
        hits.push({
          id: `blocker_${b.id}`,
          entityType: 'blocker',
          title: `${b.title}`,
          subtitle: `Blocker (${b.status}) in ${p.title}`,
          targetTab: 'projects',
          area: p.area,
          score: bScore + 2,
        });
      }
    }
  }

  for (const t of corpus.tasks || []) {
    const score = scoreMatch(q, tokens, t.text, `${t.description || ''} ${t.notes || ''} ${t.area || ''}`);
    if (score > 0) {
      hits.push({
        id: `task_${t.id}`,
        entityType: 'task',
        title: t.text,
        subtitle: `Task • ${t.area || 'General'} • ${t.done ? 'Done' : t.priority}`,
        targetTab: 'tasks',
        area: t.area,
        score: score + (t.done ? 0 : 1),
      });
    }
  }

  for (const r of corpus.robotics_records || []) {
    const score = scoreMatch(q, tokens, r.title, `${r.project || ''} ${r.description || ''} ${(r.tags || []).join(' ')}`);
    if (score > 0) {
      hits.push({
        id: `rob_${r.id}`,
        entityType: 'robotics',
        title: `[${r.project}] ${r.title}`,
        subtitle: `Robotics Lab • ${r.category} • ${r.status}`,
        targetTab: 'robotics-lab',
        area: 'IvLabs',
        score: score + 2,
      });
    }
  }

  for (const n of corpus.notes || []) {
    const score = scoreMatch(q, tokens, n.title, `${n.body || ''} ${n.area || ''}`);
    if (score > 0) {
      hits.push({
        id: `note_${n.id}`,
        entityType: 'note',
        title: n.title,
        subtitle: `Note • ${n.area || 'Personal'}`,
        targetTab: 'notes',
        area: n.area,
        score: score + (n.pinned ? 2 : 0),
      });
    }
  }

  for (const d of corpus.documents || []) {
    const score = scoreMatch(q, tokens, d.title || d.file_name, `${d.notes || ''} ${d.area || ''}`);
    if (score > 0) {
      hits.push({
        id: `doc_${d.id}`,
        entityType: 'document',
        title: d.title || d.file_name,
        subtitle: `Document • ${d.area || 'General'}`,
        targetTab: 'files',
        area: d.area,
        score,
      });
    }
  }

  if (includeNeo) {
    for (const m of corpus.neo_memories || []) {
      const score = scoreMatch(
        q,
        tokens,
        m.title,
        `${m.summary || ''} ${m.transcript || ''} ${(m.tags || []).join(' ')}`
      );
      if (score > 0) {
        hits.push({
          id: `mem_${m.id}`,
          entityType: 'memory',
          title: m.title,
          subtitle: `Neo Memory • ${(m.capturedAt || '').slice(0, 10)} • ${m.associatedArea || 'Personal'}`,
          targetTab: 'neo-memory',
          area: m.associatedArea,
          score: score + (m.isImportant ? 2 : 0),
        });
      }
    }
  }

  for (const m of corpus.meetings || []) {
    const score = scoreMatch(q, tokens, m.title, `${m.agenda_and_notes || ''} ${m.attendees || ''}`);
    if (score > 0) {
      hits.push({
        id: `meet_${m.id}`,
        entityType: 'meeting',
        title: m.title,
        subtitle: `Meeting • ${m.date} ${m.start_time || ''}`,
        targetTab: 'meetings',
        area: m.area,
        score,
      });
    }
  }

  for (const ev of corpus.events || []) {
    const score = scoreMatch(q, tokens, ev.title, `${ev.notes || ''} ${ev.place || ''}`);
    if (score > 0) {
      hits.push({
        id: `evt_${ev.id}`,
        entityType: 'event',
        title: ev.title,
        subtitle: `Calendar • ${ev.date} • ${ev.kind}`,
        targetTab: 'calendar',
        area: ev.area,
        score,
      });
    }
  }

  for (const c of corpus.contacts || []) {
    const score = scoreMatch(q, tokens, c.name, `${c.company || ''} ${c.role || ''} ${c.email || ''}`);
    if (score > 0) {
      hits.push({
        id: `contact_${c.id}`,
        entityType: 'contact',
        title: c.name,
        subtitle: `Contact • ${c.company || c.role || c.area}`,
        targetTab: 'contacts',
        area: c.area,
        score,
      });
    }
  }

  for (const x of corpus.expenses || []) {
    const score = scoreMatch(q, tokens, x.note || x.category, `${x.area || ''} ${x.amount}`);
    if (score > 0) {
      hits.push({
        id: `exp_${x.id}`,
        entityType: 'expense',
        title: `${x.note || x.category} (₹${x.amount})`,
        subtitle: `Expense • ${x.date} • ${x.area}`,
        targetTab: 'finance',
        area: x.area,
        score,
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
