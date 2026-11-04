// NeoSapien Integration: Synchronization, Ingestion & Audit Service
import type { NeoMemory, NeoSyncAuditRecord } from '../../types';
import { db } from '../../db';
import { NeoNormalizationService } from './normalization';
import { NeoDeduplicationService } from './deduplication';
import { generateId } from '../../lib/utils';

export class NeoSyncService {
  // Idempotently ingest a batch of raw or structured memories
  public static async ingestMemories(
    rawItems: any[],
    method: 'mcp' | 'webhook' | 'json_export' | 'ble_stream'
  ): Promise<{ imported: number; updated: number; skipped: number }> {
    const existingMemories = await db.neo_memories.toArray();

    // Map existing memories by fingerprint
    const existingMap = new Map<string, NeoMemory>();
    for (const mem of existingMemories) {
      const fp = NeoDeduplicationService.getMemoryFingerprint(mem);
      existingMap.set(fp, mem);
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const raw of rawItems) {
      const normalized = NeoNormalizationService.normalizeRawMemory(
        raw,
        method === 'webhook' ? 'webhook' : method === 'ble_stream' ? 'wearable_neo1' : 'web_import'
      );
      const fp = NeoDeduplicationService.getMemoryFingerprint(normalized);

      const existing = existingMap.get(fp);
      if (existing) {
        // Compare checksum
        const oldHash = NeoDeduplicationService.computeContentChecksum(existing);
        const newHash = NeoDeduplicationService.computeContentChecksum(normalized);

        if (oldHash === newHash) {
          skipped++;
        } else {
          // Update content while preserving user links
          await db.neo_memories.update(existing.id, {
            title: normalized.title,
            summary: normalized.summary,
            transcript: normalized.transcript || existing.transcript,
            actionItems: normalized.actionItems.length > 0 ? normalized.actionItems : existing.actionItems,
            decisions: normalized.decisions.length > 0 ? normalized.decisions : existing.decisions,
            importedAt: new Date().toISOString(),
          });
          updated++;
        }
      } else {
        await db.neo_memories.add(normalized);
        existingMap.set(fp, normalized);
        imported++;
      }
    }

    // Record audit entry
    const auditRecord: NeoSyncAuditRecord = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      method: method === 'ble_stream' ? 'api' : method,
      status: 'success',
      memoriesImported: imported,
      memoriesUpdated: updated,
      duplicatesSkipped: skipped,
      failedCount: 0,
      details: `Processed ${rawItems.length} records. Imported: ${imported}, Updated: ${updated}, Skipped: ${skipped}`,
    };
    await db.neo_sync_audit.add(auditRecord);

    return { imported, updated, skipped };
  }
}
