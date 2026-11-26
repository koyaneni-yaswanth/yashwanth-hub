import { db } from '../db';
import { getSupabaseClient } from '../lib/supabase';
import { AIGateway } from './ai/aiGateway';
import { NeoSapienMemoryService } from './neoSapienMemoryService';
import { loadResearchBookmarks } from './sync/m3CloudStore';
import {
  hashContentForEmbedding,
  rankLocalVectors,
  type SemanticSearchMatch,
  type StoredEmbeddingEntry,
} from '../lib/semanticSearchCore';

const LOCAL_EMBEDDINGS_KEY = 'm7_local_embeddings_v1';

async function loadLocalEmbeddings(): Promise<StoredEmbeddingEntry[]> {
  try {
    const row = await db.settings.get(LOCAL_EMBEDDINGS_KEY);
    return Array.isArray(row?.value) ? (row.value as StoredEmbeddingEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveLocalEmbeddings(entries: StoredEmbeddingEntry[]): Promise<void> {
  try {
    await db.settings.put({
      key: LOCAL_EMBEDDINGS_KEY,
      value: entries.slice(0, 180),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* non-fatal */
  }
}

function toPgVectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? Number(n.toFixed(6)) : 0)).join(',')}]`;
}

export class SemanticMemoryService {
  /**
   * Indexes changed Notes, Research Bookmarks & Neo 1 Memories into local IndexedDB
   * and Supabase `pgvector` (`public.knowledge_embeddings`) via `/api/ai/chat?action=embed`.
   * Skips already-indexed items whose content hash hasn't changed.
   */
  public static async indexWorkspaceKnowledge(maxToEmbed = 12): Promise<{
    indexed: number;
    skipped: number;
    totalStored: number;
    error?: string;
  }> {
    const [notes, bookmarks, existingLocal] = await Promise.all([
      db.notes.toArray().catch(() => []),
      loadResearchBookmarks().catch(() => []),
      loadLocalEmbeddings(),
    ]);

    const privacy = NeoSapienMemoryService.getPrivacySettings();
    const allowNeo =
      privacy.allowGeminiAccess || privacy.allowOpenAIAccess || privacy.allowClaudeAccess;
    const neoMemories = allowNeo ? await db.neo_memories.toArray().catch(() => []) : [];

    const existingById = new Map<string, StoredEmbeddingEntry>();
    for (const item of existingLocal) existingById.set(item.id, item);

    const candidates: Array<{
      id: string;
      entity_type: StoredEmbeddingEntry['entity_type'];
      entity_id: string;
      title: string;
      text: string;
      excerpt: string;
      tags: string[];
    }> = [];

    for (const n of notes.slice(0, 40)) {
      const text = `${n.title}\n${n.area || ''}\n${n.body || ''}`.trim();
      candidates.push({
        id: `note:${n.id}`,
        entity_type: 'note',
        entity_id: n.id,
        title: n.title || 'Untitled Note',
        text,
        excerpt: (n.body || '').slice(0, 180),
        tags: Array.isArray(n.tags) ? n.tags : [],
      });
    }

    for (const b of bookmarks.slice(0, 40)) {
      const text = `${b.title}\n${b.topic || ''}\n${b.summary || ''}`.trim();
      candidates.push({
        id: `paper:${b.external_id || b.id}`,
        entity_type: 'paper',
        entity_id: String(b.external_id || b.id),
        title: b.title,
        text,
        excerpt: (b.summary || b.topic || '').slice(0, 180),
        tags: Array.isArray(b.tags) ? b.tags : [],
      });
    }

    for (const nm of neoMemories.slice(0, 30)) {
      const body = String(nm.summary || nm.transcript || '');
      const text = `${nm.title || 'Neo Memory'}\n${body}`.trim();
      candidates.push({
        id: `neo_memory:${nm.id}`,
        entity_type: 'neo_memory',
        entity_id: nm.id,
        title: nm.title || 'Neo 1 Memory',
        text,
        excerpt: body.slice(0, 180),
        tags: Array.isArray(nm.tags) ? nm.tags : [],
      });
    }

    let indexed = 0;
    let skipped = 0;
    let lastError: string | undefined;

    const supa = getSupabaseClient();
    const userId = supa ? (await supa.auth.getUser().catch(() => ({ data: { user: null } }))).data?.user?.id : null;

    for (const item of candidates) {
      const contentHash = hashContentForEmbedding(item.text);
      const prev = existingById.get(item.id);
      if (prev && prev.content_hash === contentHash && prev.embedding.length === 768) {
        skipped++;
        continue;
      }
      if (indexed >= maxToEmbed) break;

      const embedRes = await AIGateway.embed(item.text.slice(0, 3500));
      if (!embedRes.success || !Array.isArray(embedRes.embedding) || embedRes.embedding.length === 0) {
        lastError = embedRes.error || 'Sign in first or configure GEMINI_API_KEY / OPENAI_API_KEY to embed.';
        break;
      }

      const now = new Date().toISOString();
      const entry: StoredEmbeddingEntry = {
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        title: item.title,
        content_excerpt: item.excerpt,
        content_hash: contentHash,
        tags: item.tags,
        embedding: embedRes.embedding.slice(0, 768),
        updated_at: now,
      };
      existingById.set(entry.id, entry);
      indexed++;

      if (supa && userId && entry.embedding.length === 768) {
        try {
          await supa.from('knowledge_embeddings').upsert({
            id: entry.id,
            user_id: userId,
            entity_type: entry.entity_type,
            entity_id: entry.entity_id,
            title: entry.title,
            content_excerpt: entry.content_excerpt,
            content_hash: entry.content_hash,
            tags: entry.tags,
            embedding: toPgVectorLiteral(entry.embedding),
            updated_at: now,
          });
        } catch {
          /* local cache retains vector even if cloud table sync deferred */
        }
      }
    }

    const finalEntries = Array.from(existingById.values());
    await saveLocalEmbeddings(finalEntries);

    return {
      indexed,
      skipped,
      totalStored: finalEntries.length,
      error: indexed === 0 ? lastError : undefined,
    };
  }

  /**
   * Searches Postgres `pgvector` RPC first when signed in & embedding succeeds,
   * falling back seamlessly to local cosine ranking over IndexedDB cached vectors.
   */
  public static async searchSemantic(
    query: string,
    options: { limit?: number; minSimilarity?: number } = {},
  ): Promise<SemanticSearchMatch[]> {
    const q = String(query || '').trim();
    if (!q || q.length < 3) return [];

    const limit = options.limit ?? 8;
    const minSimilarity = options.minSimilarity ?? 0.35;

    const localEntries = await loadLocalEmbeddings();
    const supa = getSupabaseClient();
    const sessionToken = supa
      ? (await supa.auth.getSession().catch(() => ({ data: { session: null } }))).data?.session?.access_token
      : null;

    if (!sessionToken && localEntries.length === 0) return [];

    const qEmbed = sessionToken ? await AIGateway.embed(q) : { success: false as const };
    if (!qEmbed.success || !Array.isArray(qEmbed.embedding) || qEmbed.embedding.length === 0) {
      return [];
    }

    const queryVec = qEmbed.embedding.slice(0, 768);
    if (supa && queryVec.length === 768) {
      try {
        const { data, error } = await supa.rpc('match_knowledge_embeddings', {
          query_embedding: toPgVectorLiteral(queryVec),
          match_count: limit,
          min_similarity: minSimilarity,
        });
        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map((row: any) => ({
            id: String(row.id),
            entity_type: row.entity_type,
            entity_id: String(row.entity_id),
            title: String(row.title),
            content_excerpt: String(row.content_excerpt || ''),
            tags: Array.isArray(row.tags) ? row.tags : [],
            similarity: Number(Number(row.similarity || 0).toFixed(4)),
          }));
        }
      } catch {
        /* fallback to local vectors below */
      }
    }

    return rankLocalVectors(queryVec, localEntries, { limit, minSimilarity });
  }

  public static async getIndexStats(): Promise<{ localVectorCount: number }> {
    const rows = await loadLocalEmbeddings();
    return { localVectorCount: rows.length };
  }
}
