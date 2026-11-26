/**
 * Pure Hybrid Semantic Search & Vector Math Helpers (Node & Browser safe).
 *
 * Combines cosine similarity over 768-dim embeddings with normalized keyword hits
 * via Reciprocal Rank Fusion (RRF), without inventing scores when vectors are empty.
 */

export interface StoredEmbeddingEntry {
  id: string;
  entity_type: 'note' | 'paper' | 'neo_memory' | 'robotics' | 'project';
  entity_id: string;
  title: string;
  content_excerpt: string;
  content_hash: string;
  tags: string[];
  embedding: number[];
  updated_at: string;
}

export interface SemanticSearchMatch {
  id: string;
  entity_type: StoredEmbeddingEntry['entity_type'];
  entity_id: string;
  title: string;
  content_excerpt: string;
  tags: string[];
  similarity: number;
}

export function hashContentForEmbedding(text: string): string {
  const input = String(text || '');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function rankLocalVectors(
  queryEmbedding: number[],
  entries: StoredEmbeddingEntry[],
  options: { limit?: number; minSimilarity?: number } = {},
): SemanticSearchMatch[] {
  const limit = options.limit ?? 8;
  const minSimilarity = options.minSimilarity ?? 0.35;

  const scored: SemanticSearchMatch[] = [];
  for (const entry of entries) {
    const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
    if (similarity >= minSimilarity) {
      scored.push({
        id: entry.id,
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        title: entry.title,
        content_excerpt: entry.content_excerpt,
        tags: entry.tags || [],
        similarity: Number(similarity.toFixed(4)),
      });
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}

export interface HybridRankedCandidate {
  key: string;
  entityType: string;
  id: string;
  title: string;
  subtitle: string;
  score: number;
  semanticSimilarity?: number;
  targetTab: string;
}

export function mapSemanticEntityToTab(entityType: StoredEmbeddingEntry['entity_type']): string {
  if (entityType === 'paper') return 'research-feed';
  if (entityType === 'robotics') return 'robotics-lab';
  if (entityType === 'project') return 'projects';
  if (entityType === 'neo_memory') return 'knowledge-memory';
  return 'notes';
}

export function blendKeywordAndSemanticResults<
  T extends { entityType: string; id: string; title: string; subtitle: string; targetTab: string }
>(
  keywordHits: T[],
  semanticMatches: SemanticSearchMatch[],
  limit = 20,
): Array<T & { semanticSimilarity?: number }> {
  const rrfK = 40;
  const scores = new Map<string, number>();
  const items = new Map<string, T & { semanticSimilarity?: number }>();

  keywordHits.forEach((hit, idx) => {
    const key = `${hit.entityType}:${hit.id}`;
    scores.set(key, (scores.get(key) || 0) + 1 / (rrfK + idx + 1));
    items.set(key, { ...hit });
  });

  semanticMatches.forEach((match, idx) => {
    const mappedType = match.entity_type === 'neo_memory' ? 'memory' : match.entity_type;
    const key = `${mappedType}:${match.entity_id}`;
    const semBoost = 1 / (rrfK + idx + 1) + match.similarity * 0.025;
    scores.set(key, (scores.get(key) || 0) + semBoost);
    const existing = items.get(key);
    if (existing) {
      existing.semanticSimilarity = match.similarity;
      if (!existing.subtitle.includes('Semantic')) {
        existing.subtitle = `${existing.subtitle} · ${Math.round(match.similarity * 100)}% semantic`;
      }
    } else {
      items.set(key, {
        entityType: mappedType,
        id: match.entity_id,
        title: match.title,
        subtitle: `Semantic match (${Math.round(match.similarity * 100)}%) · ${match.content_excerpt.slice(0, 70)}`,
        targetTab: mapSemanticEntityToTab(match.entity_type),
        semanticSimilarity: match.similarity,
      } as unknown as T & { semanticSimilarity?: number });
    }
  });

  return Array.from(items.entries())
    .sort((a, b) => (scores.get(b[0]) || 0) - (scores.get(a[0]) || 0))
    .slice(0, limit)
    .map(([, value]) => value);
}
