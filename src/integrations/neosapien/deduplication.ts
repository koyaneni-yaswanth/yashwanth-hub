// NeoSapien Integration: Deduplication & Fingerprinting

export class NeoDeduplicationService {
  // Simple deterministic hash for string content (FNV-1a 32-bit equivalent)
  public static computeHash(content: string): string {
    let hash = 2166136261;
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  // Generates unique memory fingerprint
  public static getMemoryFingerprint(memory: { originalNeoId?: string; title: string; capturedAt: string }): string {
    if (memory.originalNeoId && memory.originalNeoId.trim()) {
      return `neo_${memory.originalNeoId.trim()}`;
    }
    const normalizedTitle = memory.title.trim().toLowerCase().replace(/\s+/g, ' ');
    const normalizedDate = memory.capturedAt.slice(0, 16);
    return `hash_${this.computeHash(`${normalizedTitle}_${normalizedDate}`)}`;
  }

  // Content checksum to detect edits
  public static computeContentChecksum(memory: { title: string; summary: string; transcript?: string }): string {
    const raw = `${memory.title}:::${memory.summary}:::${memory.transcript || ''}`;
    return this.computeHash(raw);
  }
}
