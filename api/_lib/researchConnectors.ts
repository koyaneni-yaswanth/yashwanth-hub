/**
 * Real Academic Research Connectors (arXiv, OpenAlex, Crossref) — Zero API Keys Required.
 *
 * Pure HTTP/XML/JSON parsers with topic relevance scoring across founder domains
 * (wind turbines, planetary/magnetic gearing, robotics, ROS 2, mmWave perception, control).
 */

export interface ResearchTopicPreset {
  id: string;
  label: string;
  query: string;
  keywords: string[];
}

export const DEFAULT_RESEARCH_TOPICS: ResearchTopicPreset[] = [
  {
    id: 'wind-turbines',
    label: 'Small Wind Turbines & Aerodynamics',
    query: 'small wind turbine aerodynamics OR Archimedes spiral wind turbine',
    keywords: ['wind turbine', 'archimedes', 'blade', 'rotor', 'aerodynamic', 'low wind', 'axial flux'],
  },
  {
    id: 'gearing',
    label: 'Planetary & Magnetic Gearing',
    query: 'magnetic gear OR planetary gearbox wind turbine',
    keywords: ['magnetic gear', 'planetary gear', 'gearbox', 'torque', 'transmission'],
  },
  {
    id: 'robotics-ros2',
    label: 'Robotics, ROS 2 & Manipulators',
    query: 'ROS 2 autonomous navigation manipulator kinematics swarm',
    keywords: ['ros 2', 'ros2', 'manipulator', 'kinematics', 'swarm', 'uav', 'autonomous navigation', 'embedded'],
  },
  {
    id: 'radar-perception',
    label: 'mmWave Radar & AI Control',
    query: 'mmWave radar perception FMCW OR reinforcement learning optimal control',
    keywords: ['mmwave', 'fmcw', 'radar', 'perception', 'reinforcement learning', 'optimal control'],
  },
];

export interface ResearchPaperItem {
  id: string;
  source: 'arxiv' | 'openalex' | 'crossref';
  title: string;
  authors: string[];
  summary: string;
  publishedDate: string;
  url: string;
  doi?: string;
  venue?: string;
  citedByCount?: number;
  relevanceScore: number;
  matchedKeywords: string[];
}

export interface ResearchFeedResponse {
  success: boolean;
  query: string;
  papers: ResearchPaperItem[];
  sourceStatus: {
    arxiv: { ok: boolean; count: number; latencyMs: number; error?: string };
    openalex: { ok: boolean; count: number; latencyMs: number; error?: string };
    crossref: { ok: boolean; count: number; latencyMs: number; error?: string };
  };
  fetchedAt: string;
}

const ALL_FOUNDER_KEYWORDS = Array.from(
  new Set(DEFAULT_RESEARCH_TOPICS.flatMap((t) => t.keywords))
);

export function scoreResearchRelevance(
  title: string,
  abstract: string,
  queryTerms: string[]
): { score: number; matched: string[] } {
  const hay = `${title} ${abstract}`.toLowerCase();
  const matched = new Set<string>();
  let score = 0;

  for (const kw of ALL_FOUNDER_KEYWORDS) {
    if (hay.includes(kw)) {
      matched.add(kw);
      score += 18;
    }
  }
  for (const term of queryTerms) {
    const t = term.trim().toLowerCase();
    if (t.length >= 3 && hay.includes(t)) {
      score += 15;
      if (title.toLowerCase().includes(t)) score += 10;
    }
  }

  return { score: Math.min(100, score || 10), matched: Array.from(matched).slice(0, 5) };
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseArxivAtomXml(xml: string, queryTerms: string[]): ResearchPaperItem[] {
  const entries = xml.match(/<entry[\s\S]*?<\/entry>/g) || [];
  const items: ResearchPaperItem[] = [];

  for (const entry of entries) {
    const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const pubMatch = entry.match(/<published>([\s\S]*?)<\/published>/);
    const authorMatches = [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) =>
      decodeXmlEntities(m[1])
    );

    const rawId = idMatch ? decodeXmlEntities(idMatch[1]) : '';
    const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : '';
    const summary = summaryMatch ? decodeXmlEntities(summaryMatch[1]) : '';
    const publishedDate = pubMatch ? pubMatch[1].slice(0, 10) : '';
    if (!title || !rawId) continue;

    const { score, matched } = scoreResearchRelevance(title, summary, queryTerms);
    items.push({
      id: `arxiv:${rawId.split('/').pop() || title.slice(0, 24)}`,
      source: 'arxiv',
      title,
      authors: authorMatches.slice(0, 4),
      summary: summary.slice(0, 320),
      publishedDate,
      url: rawId.replace(/^http:\/\//, 'https://'),
      venue: 'arXiv Preprint',
      relevanceScore: score,
      matchedKeywords: matched,
    });
  }

  return items;
}

function invertOpenAlexAbstract(inverted?: Record<string, number[]>): string {
  if (!inverted || typeof inverted !== 'object') return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(inverted)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (typeof pos === 'number' && pos < 120) words[pos] = word;
    }
  }
  return words.filter(Boolean).join(' ').slice(0, 320);
}

export function parseOpenAlexWorks(data: any, queryTerms: string[]): ResearchPaperItem[] {
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .map((w: any): ResearchPaperItem | null => {
      const title = String(w?.title || '').trim();
      if (!title) return null;
      const summary = invertOpenAlexAbstract(w?.abstract_inverted_index);
      const { score, matched } = scoreResearchRelevance(title, summary, queryTerms);
      const authors = Array.isArray(w?.authorships)
        ? w.authorships.slice(0, 4).map((a: any) => String(a?.author?.display_name || '')).filter(Boolean)
        : [];
      const doi = w?.doi ? String(w.doi) : undefined;
      const url = String(w?.open_access?.oa_url || doi || w?.id || '');
      return {
        id: `openalex:${String(w?.id || title).split('/').pop()}`,
        source: 'openalex',
        title,
        authors,
        summary: summary || 'Metadata retrieved from OpenAlex scholarly index.',
        publishedDate: String(w?.publication_date || ''),
        url,
        doi,
        venue: String(w?.primary_location?.source?.display_name || 'OpenAlex'),
        citedByCount: typeof w?.cited_by_count === 'number' ? w.cited_by_count : undefined,
        relevanceScore: score,
        matchedKeywords: matched,
      };
    })
    .filter((x: ResearchPaperItem | null): x is ResearchPaperItem => x !== null);
}

export function parseCrossrefWorks(data: any, queryTerms: string[]): ResearchPaperItem[] {
  const items = Array.isArray(data?.message?.items) ? data.message.items : [];
  return items
    .map((w: any): ResearchPaperItem | null => {
      const title = Array.isArray(w?.title) ? String(w.title[0] || '').trim() : String(w?.title || '').trim();
      if (!title) return null;
      const rawAbs = String(w?.abstract || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const { score, matched } = scoreResearchRelevance(title, rawAbs, queryTerms);
      const authors = Array.isArray(w?.author)
        ? w.author
            .slice(0, 4)
            .map((a: any) => [a?.given, a?.family].filter(Boolean).join(' ').trim())
            .filter(Boolean)
        : [];
      const parts = w?.published?.['date-parts']?.[0];
      const publishedDate = Array.isArray(parts)
        ? [parts[0], String(parts[1] || 1).padStart(2, '0'), String(parts[2] || 1).padStart(2, '0')].join('-')
        : String(w?.created?.['date-time'] || '').slice(0, 10);
      const doi = w?.DOI ? `https://doi.org/${w.DOI}` : undefined;
      return {
        id: `crossref:${String(w?.DOI || title.slice(0, 24))}`,
        source: 'crossref',
        title,
        authors,
        summary: rawAbs.slice(0, 320) || 'Peer-reviewed publication record indexed via Crossref.',
        publishedDate,
        url: String(w?.URL || doi || ''),
        doi,
        venue: Array.isArray(w?.['container-title']) ? String(w['container-title'][0] || 'Crossref') : 'Crossref',
        citedByCount: typeof w?.['is-referenced-by-count'] === 'number' ? w['is-referenced-by-count'] : undefined,
        relevanceScore: score,
        matchedKeywords: matched,
      };
    })
    .filter((x: ResearchPaperItem | null): x is ResearchPaperItem => x !== null);
}

export async function fetchResearchIntelligence(
  rawQuery: string,
  fetchImpl: typeof fetch = fetch,
  limitPerSource = 5
): Promise<ResearchFeedResponse> {
  const query = rawQuery.trim() || DEFAULT_RESEARCH_TOPICS[0].query;
  const queryTerms = query
    .replace(/\b(AND|OR|NOT)\b/g, ' ')
    .split(/[\s,]+/)
    .filter((w) => w.length >= 3);

  const sourceStatus: ResearchFeedResponse['sourceStatus'] = {
    arxiv: { ok: false, count: 0, latencyMs: 0 },
    openalex: { ok: false, count: 0, latencyMs: 0 },
    crossref: { ok: false, count: 0, latencyMs: 0 },
  };

  const [arxivRes, openAlexRes, crossrefRes] = await Promise.all([
    (async () => {
      const t0 = Date.now();
      try {
        const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limitPerSource}&sortBy=submittedDate&sortOrder=descending`;
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
        sourceStatus.arxiv.latencyMs = Date.now() - t0;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const xml = await r.text();
        const parsed = parseArxivAtomXml(xml, queryTerms);
        sourceStatus.arxiv = { ok: true, count: parsed.length, latencyMs: Date.now() - t0 };
        return parsed;
      } catch (e: any) {
        sourceStatus.arxiv = { ok: false, count: 0, latencyMs: Date.now() - t0, error: e?.message || 'Error' };
        return [] as ResearchPaperItem[];
      }
    })(),

    (async () => {
      const t0 = Date.now();
      try {
        const cleanQ = query.replace(/\b(OR|AND)\b/g, ' ').replace(/\s+/g, ' ').trim();
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(cleanQ)}&per-page=${limitPerSource}&sort=publication_date:desc`;
        const r = await fetchImpl(url, {
          headers: { 'User-Agent': 'YashwanthHub-Research/3.0 (mailto:research@yashwanthhub.local)' },
          signal: AbortSignal.timeout(6000),
        });
        sourceStatus.openalex.latencyMs = Date.now() - t0;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const parsed = parseOpenAlexWorks(data, queryTerms);
        sourceStatus.openalex = { ok: true, count: parsed.length, latencyMs: Date.now() - t0 };
        return parsed;
      } catch (e: any) {
        sourceStatus.openalex = { ok: false, count: 0, latencyMs: Date.now() - t0, error: e?.message || 'Error' };
        return [] as ResearchPaperItem[];
      }
    })(),

    (async () => {
      const t0 = Date.now();
      try {
        const cleanQ = query.replace(/\b(OR|AND)\b/g, ' ').replace(/\s+/g, ' ').trim();
        const url = `https://api.crossref.org/works?query=${encodeURIComponent(cleanQ)}&rows=${limitPerSource}&sort=published&order=desc`;
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
        sourceStatus.crossref.latencyMs = Date.now() - t0;
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const parsed = parseCrossrefWorks(data, queryTerms);
        sourceStatus.crossref = { ok: true, count: parsed.length, latencyMs: Date.now() - t0 };
        return parsed;
      } catch (e: any) {
        sourceStatus.crossref = { ok: false, count: 0, latencyMs: Date.now() - t0, error: e?.message || 'Error' };
        return [] as ResearchPaperItem[];
      }
    })(),
  ]);

  // Deduplicate by DOI or normalised title
  const seen = new Set<string>();
  const combined: ResearchPaperItem[] = [];
  for (const p of [...arxivRes, ...openAlexRes, ...crossrefRes]) {
    const key = (p.doi || p.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    combined.push(p);
  }

  combined.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    return (b.publishedDate || '').localeCompare(a.publishedDate || '');
  });

  return {
    success: sourceStatus.arxiv.ok || sourceStatus.openalex.ok || sourceStatus.crossref.ok,
    query,
    papers: combined,
    sourceStatus,
    fetchedAt: new Date().toISOString(),
  };
}
