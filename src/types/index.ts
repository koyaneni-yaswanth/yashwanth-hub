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
export interface GoogleWorkspaceConfig {
  connected: boolean;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  calendarSyncEnabled: boolean;
  driveSyncEnabled: boolean;
  gmailSyncEnabled: boolean;
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

// NeoSapien Device Integration Models
export type NeoSapienStatus = 'not_configured' | 'disconnected' | 'connected' | 'error';

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
  | 'expenses'
  | 'contacts'
  | 'wind-plan'
  | 'ai-assistant'
  | 'notifications'
  | 'analytics'
  | 'settings';
