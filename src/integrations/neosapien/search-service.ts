// NeoSapien Integration: Search & Retrieval Engine
import type { NeoMemory, NeoMemorySource, NeoMeetingPlatform } from '../../types';
import { db } from '../../db';

export class NeoSearchService {
  // High-performance compound search across all memory fields with latency tracking
  public static async searchMemories(
    query: string,
    options?: {
      area?: string;
      source?: NeoMemorySource;
      platform?: NeoMeetingPlatform;
      limit?: number;
    }
  ): Promise<{ memories: NeoMemory[]; latencyMs: number; totalCount: number }> {
    const startTime = typeof performance !== 'undefined' ? performance.now() : 0;
    const q = query.toLowerCase().trim();

    const all = await db.neo_memories.toArray();

    let filtered = all.filter((mem) => {
      if (options?.area && options.area !== 'All' && mem.associatedArea !== options.area) {
        return false;
      }
      if (options?.source && mem.source !== options.source) {
        return false;
      }
      if (options?.platform && mem.platform !== options.platform) {
        return false;
      }
      if (!q) return true;

      return (
        mem.title.toLowerCase().includes(q) ||
        mem.summary.toLowerCase().includes(q) ||
        (mem.transcript && mem.transcript.toLowerCase().includes(q)) ||
        mem.tags?.some((t) => t.toLowerCase().includes(q)) ||
        mem.peopleMentioned?.some((p) => p.toLowerCase().includes(q)) ||
        mem.actionItems?.some((a) => a.text.toLowerCase().includes(q)) ||
        mem.decisions?.some((d) => d.text.toLowerCase().includes(q))
      );
    });

    filtered.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());

    const totalCount = filtered.length;
    if (options?.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    const endTime = typeof performance !== 'undefined' ? performance.now() : 0;
    const latencyMs = Math.max(0.1, Math.round((endTime - startTime) * 10) / 10);

    return {
      memories: filtered,
      latencyMs,
      totalCount,
    };
  }
}
