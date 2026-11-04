export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  text: string;
  description?: string;
  area: string;
  priority: Priority;
  due_date?: string; // YYYY-MM-DD
  starred: boolean;
  done: boolean;
  notes?: string;
  plan?: number; // week index if part of the 90-day founder plan
  project_id?: string; // Linked project
  google_task_id?: string; // Mapped Google Task ID
  created_at: string;
  updated_at: string;
  synced?: boolean;
}

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed';

export interface ProjectMilestone {
  id: string;
  title: string;
  target_date?: string;
  done: boolean;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  area: string;
  status: ProjectStatus;
  priority: Priority;
  start_date: string;
  target_date: string;
  progress: number; // 0 - 100
  milestones: ProjectMilestone[];
  repository_url?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export type EventKind = 'Meeting' | 'Travel' | 'Deadline' | 'Milestone' | 'Other';

export interface EventItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_time?: string; // HH:mm
  end_time?: string; // HH:mm
  kind: EventKind;
  place?: string;
  area?: string;
  notes?: string;
  google_event_id?: string;
  project_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time?: string; // HH:mm
  attendees: string;
  location_or_link: string;
  area: string;
  agenda_and_notes: string;
  action_items?: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  google_meet_link?: string;
  project_id?: string;
  created_at: string;
  updated_at: string;
}

export interface TravelRecord {
  id: string;
  destination: string;
  purpose: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  mode: 'Flight' | 'Train' | 'Cab / Car' | 'Bus' | 'Other';
  booking_reference?: string;
  area: string;
  cost_estimate?: number;
  notes_and_itinerary?: string;
  status: 'planning' | 'booked' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  area?: string;
  pinned: boolean;
  tags?: string[];
  project_id?: string;
  created_at: string;
  updated_at: string;
}

export type ExpenseCategory = 'Food' | 'Travel' | 'Business' | 'Parts' | 'Bills' | 'Equipment' | 'Other';

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  area: string;
  note: string;
  date: string; // YYYY-MM-DD
  receipt_doc_id?: string;
  project_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  company?: string;
  phone?: string;
  email?: string;
  area?: string;
  note?: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  tags: string[];
  area?: string;
  notes?: string;
  google_drive_id?: string;
  google_drive_link?: string;
  project_id?: string;
  data_blob?: Blob; // Persistent in IndexedDB
  created_at: string;
  updated_at: string;
}

export interface Area {
  id: string;
  name: string;
  color: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface AppSetting {
  key: string;
  value: any;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string;
  table_name: string;
  record_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: any;
  created_at: string;
  attempts: number;
}

// Notifications & Reminders
export type NotificationType = 'deadline' | 'meeting' | 'followup' | 'system' | 'ai';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: Priority;
  read: boolean;
  scheduled_for?: string;
  action_link?: string;
  related_record_id?: string;
  created_at: string;
}

// Google Workspace Integration Models
export type GoogleServiceKey =
  | 'calendar'
  | 'gmail'
  | 'drive'
  | 'photos'
  | 'tasks'
  | 'contacts'
  | 'docs';

export interface GoogleServiceStatus {
  enabled: boolean;
  authorized: boolean;
  lastSync?: string;
  error?: string;
}

export interface GoogleWorkspaceConfig {
  connected: boolean;
  email?: string;
  name?: string;
  picture?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  services?: Record<GoogleServiceKey, GoogleServiceStatus>;
  // Backward compatibility flags
  calendarSyncEnabled?: boolean;
  driveSyncEnabled?: boolean;
  gmailSyncEnabled?: boolean;
  lastCalendarSync?: string;
  lastDriveSync?: string;
  lastGmailSync?: string;
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  size?: number;
  modifiedTime?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  status: 'needsAction' | 'completed';
  due?: string;
  updated?: string;
  listId?: string;
  hubTaskId?: string;
}

export interface GooglePhotoItem {
  id: string;
  mediaItemId: string;
  filename: string;
  mimeType: string;
  baseUrl: string;
  productUrl?: string;
  description?: string;
  selectedAt: string;
  project_id?: string;
  area?: string;
}

export interface GmailFollowUpItem {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  detectedDeadline?: string;
  suggestedAction?: string;
  status: 'pending' | 'addressed' | 'dismissed';
}

// Unified Synchronization Engine Models
export type SyncEngineState = 'synced' | 'syncing' | 'offline' | 'expired' | 'permission_required' | 'failed';

export interface SyncEngineStatus {
  state: SyncEngineState;
  lastSuccessTimestamp?: string;
  activeService?: string;
  pendingQueueCount: number;
  failedCount: number;
  message: string;
}

export interface SyncHistoryRecord {
  id: string;
  service: string;
  action: string;
  status: 'success' | 'warning' | 'error';
  itemCount: number;
  timestamp: string;
  details?: string;
}

export interface DeviceSession {
  id: string;
  deviceName: string;
  platform: 'windows' | 'android' | 'ios' | 'mac' | 'linux' | 'browser';
  browser: string;
  isCurrent: boolean;
  lastActive: string;
  ipAddress?: string;
}

// NeoSapien Device & Personal Memory Ecosystem Models
export type NeoSapienStatus = 'not_configured' | 'disconnected' | 'connected' | 'error';
export type NeoMemorySource = 'wearable_neo1' | 'desktop_meeting' | 'web_import' | 'mcp_sync' | 'webhook';
export type NeoMeetingPlatform = 'google_meet' | 'zoom' | 'microsoft_teams' | 'whatsapp' | 'in_person' | 'phone_call' | 'other';

export interface NeoSpeaker {
  speakerId?: string;
  id?: string;
  name: string;
  isUser?: boolean;
  isCurrentUser?: boolean;
}

export interface NeoActionItem {
  id: string;
  text: string;
  assigneeName?: string;
  detectedDeadline?: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'synced_to_hub' | 'synced_to_google';
  hubTaskId?: string;
  googleTaskId?: string;
  isCommitment: boolean;
  priority: Priority;
  reconciliationStatus?: 'new_commitment' | 'existing_match' | 'overdue' | 'duplicate' | 'completed' | 'deadline_changed';
}

export interface NeoDecision {
  id: string;
  text: string;
  context?: string;
}

export interface NeoMemory {
  id: string; // Hub internal ID
  originalNeoId?: string; // Original ID from NeoSapien Second Brain
  title: string;
  source: NeoMemorySource;
  platform: NeoMeetingPlatform;
  capturedAt: string; // ISO datetime
  durationMinutes?: number;
  summary: string;
  transcript?: string;
  speakers?: NeoSpeaker[];
  decisions: NeoDecision[];
  actionItems: NeoActionItem[];
  commitments: string[];
  followUps: string[];
  reminders: string[];
  peopleMentioned: string[];
  associatedProjectId?: string;
  associatedArea?: string; // 'PAWAN SHAKTI' | 'MG Automation' | 'IvLabs' | 'Waffle Whizz' | 'Personal'
  associatedGoogleEventId?: string;
  tags: string[];
  importedAt: string;
  syncMethod: 'mcp' | 'webhook' | 'json_export' | 'manual_entry';
  isImportant?: boolean;
  userNotes?: string;
}

export interface NeoMcpConfig {
  enabled: boolean;
  serverUrl: string; // e.g. http://localhost:3000/sse
  authToken?: string;
  authType: 'none' | 'bearer' | 'api_key' | 'custom_header';
  customHeaderName?: string;
  readOnly: boolean;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastPing?: string;
  errorMessage?: string;
}

export interface NeoSyncAuditRecord {
  id: string;
  timestamp: string;
  method: 'mcp' | 'webhook' | 'json_export' | 'api';
  status: 'success' | 'warning' | 'error';
  memoriesImported: number;
  memoriesUpdated: number;
  duplicatesSkipped: number;
  failedCount: number;
  details?: string;
}

export interface NeoPrivacySettings {
  allowGeminiAccess: boolean;
  allowOpenAIAccess: boolean;
  allowClaudeAccess: boolean;
  requireExplicitApprovalForTasks: boolean;
  maskSpeakerNames: boolean;
  autoPurgeOlderThanDays?: number;
}

export interface NeoSapienConfig {
  status: NeoSapienStatus;
  deviceName?: string;
  deviceId?: string;
  batteryLevel?: number;
  lastSyncTime?: string;
  bleSupported: boolean;
  autoVoiceTask: boolean;
  autoSummary: boolean;
  webhookSecret?: string;
  mcpConfig?: NeoMcpConfig;
  privacySettings?: NeoPrivacySettings;
}

export interface NeoSapienTranscript {
  id: string;
  timestamp: string;
  audioDurationSeconds?: number;
  transcriptText: string;
  speakers?: { speaker: string; text: string }[];
  extractedTasks: string[];
  extractedNotes: string[];
  source: 'bluetooth_ble' | 'webhook_import' | 'browser_mic';
}

// Multi-Model AI Engine
export type AIProvider = 'openai' | 'anthropic' | 'gemini' | 'local_heuristic';

export type AIMode =
  | 'personal'
  | 'engineering'
  | 'startup'
  | 'research'
  | 'meeting'
  | 'writing';

export interface AIModelConfig {
  provider: AIProvider;
  modelId: string;
  displayName: string;
  contextWindow: number;
  costPer1kInputTokensUSD: number;
  costPer1kOutputTokensUSD: number;
  supportedModes: AIMode[];
  latencyProfile: 'ultra_fast' | 'balanced' | 'deep_reasoning';
  isDefault?: boolean;
}

export interface AIUsageLog {
  id: string;
  provider: AIProvider;
  modelId: string;
  taskMode: AIMode;
  tokensInput: number;
  tokensOutput: number;
  latencyMs: number;
  estimatedCostUSD: number;
  timestamp: string;
}

export interface AIComparisonResult {
  provider: AIProvider;
  modelId: string;
  response: string;
  latencyMs: number;
  tokensUsed: number;
}

export type NavigationTab =
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'calendar'
  | 'meetings'
  | 'travel'
  | 'notes'
  | 'documents'
  | 'files'
  | 'gmail'
  | 'expenses'
  | 'contacts'
  | 'wind-plan'
  | 'ai-assistant'
  | 'notifications'
  | 'analytics'
  | 'integrations'
  | 'neo-memory'
  | 'system-health'
  | 'settings';
