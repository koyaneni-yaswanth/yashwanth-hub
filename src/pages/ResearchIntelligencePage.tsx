import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  BookmarkPlus,
  Check,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_RESEARCH_TOPICS,
  parseCrossrefWorks,
  parseOpenAlexWorks,
  type ResearchFeedResponse,
  type ResearchPaperItem,
} from '../../api/_lib/researchConnectors';
import { db } from '../db';
import { generateId } from '../lib/utils';
import { SyncQueueService } from '../services/sync/syncQueueService';
import {
  loadResearchBookmarks,
  M3_CLOUD_UPDATE_EVENT,
  removeResearchBookmark,
  saveResearchBookmark,
  type ResearchBookmarkRecord,
} from '../services/sync/m3CloudStore';
import { toast } from '../lib/toast';
import { Badge } from '../components/common/Badge';

interface ResearchIntelligencePageProps {
  onNavigateToAI?: (prompt?: string) => void;
}

export const ResearchIntelligencePage: React.FC<ResearchIntelligencePageProps> = ({
  onNavigateToAI,
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState(DEFAULT_RESEARCH_TOPICS[0].id);
  const [customQuery, setCustomQuery] = useState(DEFAULT_RESEARCH_TOPICS[0].query);
  const [feed, setFeed] = useState<ResearchFeedResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [bookmarks, setBookmarks] = useState<ResearchBookmarkRecord[]>([]);
  const [viewMode, setViewMode] = useState<'feed' | 'bookmarks'>('feed');

  const loadFeed = useCallback(async (queryText: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const resp = await fetch(`/api/integrations/sync?action=research&q=${encodeURIComponent(queryText)}`);
      if (resp.ok && (resp.headers.get('content-type') || '').includes('application/json')) {
        const data = (await resp.json()) as ResearchFeedResponse;
        setFeed(data);
        return;
      }
      throw new Error('Server research proxy unavailable');
    } catch {
      // Static vite preview without /api proxy falls back directly to public CORS-enabled OpenAlex + Crossref
      try {
        const terms = queryText.replace(/\b(OR|AND)\b/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
        const cleanQ = terms.join(' ') || 'wind turbine';
        const t0 = Date.now();
        const [oaRes, crRes] = await Promise.all([
          fetch(`https://api.openalex.org/works?search=${encodeURIComponent(cleanQ)}&per-page=5&sort=publication_date:desc`),
          fetch(`https://api.crossref.org/works?query=${encodeURIComponent(cleanQ)}&rows=5&sort=published&order=desc`),
        ]);
        const oaPapers = oaRes.ok ? parseOpenAlexWorks(await oaRes.json(), terms) : [];
        const crPapers = crRes.ok ? parseCrossrefWorks(await crRes.json(), terms) : [];
        const combined = [...oaPapers, ...crPapers].sort((a, b) => b.relevanceScore - a.relevanceScore);
        setFeed({
          success: combined.length > 0,
          query: queryText,
          papers: combined,
          sourceStatus: {
            arxiv: { ok: false, count: 0, latencyMs: 0, error: 'Requires server route in static mode' },
            openalex: { ok: oaRes.ok, count: oaPapers.length, latencyMs: Date.now() - t0 },
            crossref: { ok: crRes.ok, count: crPapers.length, latencyMs: Date.now() - t0 },
          },
          fetchedAt: new Date().toISOString(),
        });
      } catch (innerErr: any) {
        setErrorMsg(innerErr?.message || 'Could not reach research APIs. Check internet connection.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed(DEFAULT_RESEARCH_TOPICS[0].query);
    void loadResearchBookmarks().then(setBookmarks);
    const onCloudUpdate = (ev: Event) => {
      const table = (ev as CustomEvent<{ table?: string }>)?.detail?.table;
      if (!table || table === 'research_bookmarks') {
        void loadResearchBookmarks().then(setBookmarks);
      }
    };
    window.addEventListener(M3_CLOUD_UPDATE_EVENT, onCloudUpdate);
    return () => window.removeEventListener(M3_CLOUD_UPDATE_EVENT, onCloudUpdate);
  }, [loadFeed]);

  const handleToggleBookmark = async (paper: ResearchPaperItem) => {
    const existing = bookmarks.find(
      (b) => b.external_id === paper.id || (b.source === paper.source && b.title === paper.title),
    );
    if (existing) {
      await removeResearchBookmark(existing.id);
      setBookmarks((prev) => prev.filter((item) => item.id !== existing.id));
      toast('Removed synced bookmark', 'info');
      return;
    }
    const yearMatch = paper.publishedDate ? /^(\d{4})/.exec(paper.publishedDate) : null;
    const saved = await saveResearchBookmark({
      source: paper.source,
      external_id: paper.id,
      title: paper.title,
      authors: paper.authors,
      year: yearMatch ? Number(yearMatch[1]) : null,
      url: paper.url || '',
      summary: paper.summary,
      topic: selectedTopicId === 'custom' ? customQuery : selectedTopicId,
      tags: paper.matchedKeywords.slice(0, 5),
    });
    setBookmarks((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
    toast(`Bookmarked "${paper.title.slice(0, 38)}..." across devices`, 'success');
  };

  const handleSelectTopic = (id: string) => {
    const topic = DEFAULT_RESEARCH_TOPICS.find((t) => t.id === id);
    if (!topic) return;
    setSelectedTopicId(id);
    setCustomQuery(topic.query);
    loadFeed(topic.query);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadFeed(customQuery);
  };

  const handleSaveToNotes = async (paper: ResearchPaperItem) => {
    const id = generateId();
    const now = new Date().toISOString();
    const area =
      paper.matchedKeywords.some((k) => /wind|archimedes|gear|rotor|blade/.test(k))
        ? 'PAWAN SHAKTI'
        : 'IvLabs';
    const note = {
      id,
      title: `Paper: ${paper.title.slice(0, 90)}`,
      body: [
        `Source: ${paper.source.toUpperCase()} (${paper.venue || 'Research'})`,
        `Published: ${paper.publishedDate || 'Unknown'}`,
        paper.authors.length ? `Authors: ${paper.authors.join(', ')}` : '',
        `URL: ${paper.url}`,
        '',
        paper.summary,
      ]
        .filter(Boolean)
        .join('\n'),
      area,
      pinned: false,
      tags: ['research', paper.source, ...paper.matchedKeywords.slice(0, 3)],
      created_at: now,
      updated_at: now,
    };
    await db.notes.put(note);
    await SyncQueueService.enqueueChange('notes', id, 'INSERT', note).catch(() => {});
    const yearMatch = paper.publishedDate ? /^(\d{4})/.exec(paper.publishedDate) : null;
    const saved = await saveResearchBookmark({
      source: paper.source,
      external_id: paper.id,
      title: paper.title,
      authors: paper.authors,
      year: yearMatch ? Number(yearMatch[1]) : null,
      url: paper.url || '',
      summary: paper.summary,
      topic: area,
      tags: paper.matchedKeywords.slice(0, 5),
      note_id: id,
    });
    setBookmarks((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
    setSavedIds((prev) => ({ ...prev, [paper.id]: true }));
    toast(`Saved "${paper.title.slice(0, 42)}..." to Notes Vault & Bookmarks`, 'success');
  };

  const handleAskAIAboutPaper = (paper: ResearchPaperItem) => {
    localStorage.setItem(
      'yash_ai_prefill_prompt',
      `Analyze how this paper relates to my current Pawan Shakti / Robotics work and suggest actionable takeaways:\nTitle: ${paper.title}\nPublished: ${paper.publishedDate}\nSummary: ${paper.summary}\nLink: ${paper.url}`
    );
    onNavigateToAI?.();
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-[var(--hub-accent)] shrink-0" />
            <span>Research Intelligence</span>
          </h1>
          <p className="text-sm text-[var(--hub-muted)] mt-1">
            Live academic monitoring across arXiv, OpenAlex, and Crossref — zero API keys required.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadFeed(customQuery)}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Scanning Feeds...' : 'Refresh Feed'}</span>
        </button>
      </div>

      {/* Topic Presets + Search */}
      <div className="rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {DEFAULT_RESEARCH_TOPICS.map((topic) => (
            <button
              key={topic.id}
              type="button"
              onClick={() => handleSelectTopic(topic.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                selectedTopicId === topic.id
                  ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] border-[var(--hub-accent)]'
                  : 'bg-[var(--hub-bg)] border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
              }`}
            >
              {topic.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--hub-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={customQuery}
              onChange={(e) => {
                setSelectedTopicId('custom');
                setCustomQuery(e.target.value);
              }}
              placeholder="Search research topics (e.g. Archimedes spiral turbine, PiPER kinematics, AWR2944)..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !customQuery.trim()}
            className="px-4 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
          >
            Search Papers
          </button>
        </form>

        {/* View Switcher + Live Source Status Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="inline-flex rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('feed')}
              className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                viewMode === 'feed'
                  ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                  : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
              }`}
            >
              Live Feed ({feed?.papers.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('bookmarks')}
              className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                viewMode === 'bookmarks'
                  ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                  : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
              }`}
            >
              Synced Bookmarks ({bookmarks.length})
            </button>
          </div>

          {feed && viewMode === 'feed' && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {(['arxiv', 'openalex', 'crossref'] as const).map((src) => {
                const st = feed.sourceStatus[src];
                return (
                  <Badge key={src} variant={st.ok ? 'emerald' : 'amber'}>
                    {src.toUpperCase()}: {st.ok ? `${st.count} hits · ${st.latencyMs}ms` : st.error || 'Unavailable'}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl border border-amber-500/35 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
          {errorMsg}
        </div>
      )}

      {/* Papers Feed or Synced Bookmarks */}
      {viewMode === 'bookmarks' ? (
        <div className="space-y-3">
          {bookmarks.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--hub-muted)] rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)]">
              No synced research bookmarks yet. Click Bookmark on any live paper to sync it across devices and show it in your Knowledge Graph.
            </div>
          ) : (
            bookmarks.map((bm) => (
              <article
                key={bm.id}
                className="rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] p-4 sm:p-5 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="purple">{bm.source.toUpperCase()}</Badge>
                    {bm.year && <span className="text-[11px] font-mono text-[var(--hub-muted)]">{bm.year}</span>}
                    {bm.topic && <span className="text-[11px] text-[var(--hub-muted)]">{bm.topic}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void removeResearchBookmark(bm.id).then(() => {
                        setBookmarks((prev) => prev.filter((item) => item.id !== bm.id));
                        toast('Removed synced bookmark', 'info');
                      })
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--hub-line)] text-xs text-red-400 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                </div>
                <h3 className="font-heading text-base font-bold text-[var(--hub-ink)]">{bm.title}</h3>
                {bm.summary && <p className="text-xs text-[var(--hub-ink)]/85 leading-relaxed">{bm.summary}</p>}
                {bm.url && (
                  <a
                    href={bm.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--hub-accent)] hover:underline"
                  >
                    <span>Open Paper</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </article>
            ))
          )}
        </div>
      ) : (
      <div className="space-y-3">
        {isLoading && !feed ? (
          <div className="p-8 text-center text-sm text-[var(--hub-muted)] rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)]">
            Querying arXiv, OpenAlex, and Crossref...
          </div>
        ) : !feed || feed.papers.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--hub-muted)] rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)]">
            No matching papers found for "{customQuery}". Try broadening your technical keywords.
          </div>
        ) : (
          feed.papers.map((paper) => (
            <article
              key={paper.id}
              className="rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] p-4 sm:p-5 space-y-2.5 hover:border-[var(--hub-accent)]/35 transition-colors"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={paper.source === 'arxiv' ? 'purple' : paper.source === 'openalex' ? 'teal' : 'blue'}>
                    {paper.source.toUpperCase()}
                  </Badge>
                  {paper.publishedDate && (
                    <span className="text-[11px] font-mono text-[var(--hub-muted)]">{paper.publishedDate}</span>
                  )}
                  {paper.venue && (
                    <span className="text-[11px] text-[var(--hub-muted)] truncate max-w-[220px]">{paper.venue}</span>
                  )}
                  {typeof paper.citedByCount === 'number' && paper.citedByCount > 0 && (
                    <span className="text-[11px] font-mono text-[var(--hub-muted)]">
                      Cited {paper.citedByCount}x
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono font-semibold text-[var(--hub-accent)]">
                  Relevance {paper.relevanceScore}%
                </span>
              </div>

              <h3 className="font-heading text-base font-bold text-[var(--hub-ink)] leading-snug">
                {paper.title}
              </h3>

              {paper.authors.length > 0 && (
                <p className="text-xs text-[var(--hub-muted)]">{paper.authors.join(', ')}</p>
              )}

              <p className="text-xs text-[var(--hub-ink)]/85 leading-relaxed">{paper.summary}</p>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap gap-1.5">
                  {paper.matchedKeywords.map((kw) => (
                    <span
                      key={kw}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)]"
                    >
                      #{kw}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {paper.url && (
                    <a
                      href={paper.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-medium text-[var(--hub-ink)] hover:border-[var(--hub-accent)]"
                    >
                      <span>Open Source</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleBookmark(paper)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                  >
                    <Bookmark
                      className={`w-3.5 h-3.5 ${
                        bookmarks.some((b) => b.external_id === paper.id)
                          ? 'text-[var(--hub-accent)] fill-current'
                          : ''
                      }`}
                    />
                    <span>{bookmarks.some((b) => b.external_id === paper.id) ? 'Bookmarked' : 'Bookmark'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveToNotes(paper)}
                    disabled={savedIds[paper.id]}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer disabled:opacity-60"
                  >
                    {savedIds[paper.id] ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                    <span>{savedIds[paper.id] ? 'Saved' : 'Save Note'}</span>
                  </button>
                  {onNavigateToAI && (
                    <button
                      type="button"
                      onClick={() => handleAskAIAboutPaper(paper)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Analyze</span>
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      )}
    </div>
  );
};
