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
  created_at: string;
  updated_at: string;
  synced?: boolean;
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

export type NavigationTab = 
  | 'dashboard'
  | 'calendar'
  | 'meetings'
  | 'travel'
  | 'tasks'
  | 'notes'
  | 'documents'
  | 'expenses'
  | 'contacts'
  | 'wind-plan'
  | 'ai-assistant'
  | 'analytics'
  | 'settings';
