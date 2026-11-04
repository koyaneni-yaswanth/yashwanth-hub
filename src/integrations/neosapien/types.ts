// NeoSapien Integration: Domain Types & Interfaces
// Certified against official NeoSapien product capabilities

export type {
  NeoMemorySource,
  NeoMeetingPlatform,
  NeoSpeaker,
  NeoActionItem,
  NeoDecision,
  NeoMemory,
  NeoMcpConfig,
  NeoSyncAuditRecord,
  NeoPrivacySettings,
  NeoSapienConfig,
  NeoSapienStatus,
} from '../../types';

export interface NeoConnectionStatus {
  authenticated: boolean;
  memoryAccessAuthorized: boolean;
  mcpConnected: boolean;
  mcpServerUrl?: string;
  latestSuccessfulRetrieval?: string;
  lastSuccessfulSync?: string;
  syncInProgress: boolean;
  pendingRecordsCount: number;
  failedRecordsCount: number;
  bluetoothPaired: boolean;
  bleDeviceName?: string;
  deviceConnected: boolean;
  batteryLevel?: number; // Only present if physically accessible via BLE
}
