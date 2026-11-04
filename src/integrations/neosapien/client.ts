// NeoSapien Integration: Unified Client Interface
import { NeoConnectionMonitor } from './connection';
import { NeoMemoryService } from './memory-service';
import { NeoSearchService } from './search-service';
import { NeoReminderReconciliationEngine } from './reminder-service';
import { NeoSyncService } from './sync-service';
import { NeoAuthenticationService } from './authentication';
import { NeoTranscriptService } from './transcript-service';
import type { NeoConnectionStatus } from './types';

export class NeoSapienClient {
  public static async getStatus(): Promise<NeoConnectionStatus> {
    return NeoConnectionMonitor.getStatus();
  }

  public static async scanAndConnectBle(): Promise<boolean> {
    return NeoConnectionMonitor.scanAndConnectBle();
  }

  public static disconnectBle(): void {
    NeoConnectionMonitor.disconnectBle();
  }

  public static async searchMemories(query: string, options?: any) {
    return NeoSearchService.searchMemories(query, options);
  }

  public static async reconcileCommitments() {
    return NeoReminderReconciliationEngine.reconcileAll();
  }

  public static async approveActionItem(memoryId: string, actionItemId: string, syncToGoogle?: boolean, area?: string) {
    return NeoReminderReconciliationEngine.approveAndCreateTask(memoryId, actionItemId, syncToGoogle, area);
  }

  public static async ingestMemories(rawItems: any[], method: 'mcp' | 'webhook' | 'json_export' | 'ble_stream') {
    return NeoSyncService.ingestMemories(rawItems, method);
  }

  public static formatTranscript(memory: any) {
    return NeoTranscriptService.formatTranscriptWithSpeakers(memory);
  }

  public static getWebhookSecret() {
    return NeoAuthenticationService.getWebhookSecret();
  }

  public static saveWebhookSecret(secret: string) {
    NeoAuthenticationService.saveWebhookSecret(secret);
  }
}
