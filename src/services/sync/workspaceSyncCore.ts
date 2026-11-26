/**
 * Pure two-way sync mapping and conflict rules for all core workspace tables
 * (tasks, projects, events, notes, meetings, expenses, contacts, travel,
 * documents, robotics_records). Zero DOM/Dexie imports so unit tests can run directly.
 */

export const WORKSPACE_TABLE_SPECS = {
  tasks: {
    remoteTable: 'tasks',
    columns: [
      'id',
      'text',
      'description',
      'area',
      'priority',
      'due_date',
      'starred',
      'done',
      'notes',
      'plan',
      'project_id',
      'google_task_id',
      'synced',
      'subtasks',
      'recurrence',
      'blocked_by',
      'stage',
      'recurred_to',
      'created_at',
      'updated_at',
    ],
  },
  projects: {
    remoteTable: 'projects',
    columns: [
      'id',
      'title',
      'description',
      'area',
      'status',
      'priority',
      'start_date',
      'target_date',
      'progress',
      'milestones',
      'goals',
      'decisions',
      'risks',
      'blockers',
      'progress_reports',
      'activity_history',
      'verification_note',
      'repository_url',
      'tags',
      'created_at',
      'updated_at',
    ],
  },
  events: {
    remoteTable: 'events',
    columns: [
      'id',
      'title',
      'date',
      'start_time',
      'end_time',
      'kind',
      'place',
      'area',
      'notes',
      'google_event_id',
      'project_id',
      'created_at',
      'updated_at',
    ],
  },
  notes: {
    remoteTable: 'notes',
    columns: ['id', 'title', 'body', 'area', 'pinned', 'kind', 'tags', 'project_id', 'created_at', 'updated_at'],
  },
  meetings: {
    remoteTable: 'meetings',
    columns: [
      'id',
      'title',
      'date',
      'start_time',
      'end_time',
      'attendees',
      'location_or_link',
      'area',
      'agenda_and_notes',
      'action_items',
      'status',
      'google_meet_link',
      'project_id',
      'created_at',
      'updated_at',
    ],
  },
  expenses: {
    remoteTable: 'expenses',
    columns: [
      'id',
      'amount',
      'category',
      'area',
      'note',
      'date',
      'payment_method',
      'receipt_doc_id',
      'receipt_url',
      'linked_task_id',
      'project_id',
      'source',
      'created_by',
      'last_verified_at',
      'status',
      'created_at',
      'updated_at',
    ],
  },
  contacts: {
    remoteTable: 'contacts',
    columns: [
      'id',
      'name',
      'role',
      'company',
      'organization',
      'phone',
      'email',
      'area',
      'note',
      'notes',
      'created_at',
      'updated_at',
    ],
  },
  travel: {
    remoteTable: 'travel',
    columns: [
      'id',
      'destination',
      'purpose',
      'start_date',
      'end_date',
      'mode',
      'booking_reference',
      'area',
      'cost_estimate',
      'notes_and_itinerary',
      'status',
      'created_at',
      'updated_at',
    ],
  },
  documents: {
    remoteTable: 'documents',
    columns: [
      'id',
      'title',
      'file_name',
      'category',
      'file_type',
      'file_size',
      'mime_type',
      'tags',
      'area',
      'notes',
      'google_drive_id',
      'google_drive_link',
      'project_id',
      'created_at',
      'updated_at',
    ],
  },
  robotics_records: {
    remoteTable: 'robotics_experiments',
    columns: ['id', 'project', 'title', 'category', 'status', 'description', 'parameters', 'tags', 'created_at', 'updated_at'],
  },
} as const;

export type WorkspaceLocalTable = keyof typeof WORKSPACE_TABLE_SPECS;
export type WorkspaceRemoteTable = (typeof WORKSPACE_TABLE_SPECS)[WorkspaceLocalTable]['remoteTable'];

export const WORKSPACE_LOCAL_TABLES = Object.keys(WORKSPACE_TABLE_SPECS) as WorkspaceLocalTable[];

const REMOTE_TO_LOCAL: Record<string, WorkspaceLocalTable> = Object.fromEntries(
  WORKSPACE_LOCAL_TABLES.map((t) => [WORKSPACE_TABLE_SPECS[t].remoteTable, t]),
) as Record<string, WorkspaceLocalTable>;

const DATE_FIELDS = new Set(['due_date', 'date', 'start_date', 'target_date', 'end_date', 'last_contact_date']);
const TS_FIELDS = new Set(['created_at', 'updated_at', 'last_verified_at', 'last_synced_at']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWorkspaceLocalTable(name: string): name is WorkspaceLocalTable {
  return Object.prototype.hasOwnProperty.call(WORKSPACE_TABLE_SPECS, name);
}

export function resolveLocalWorkspaceTable(tableOrRemote: string): WorkspaceLocalTable | null {
  if (isWorkspaceLocalTable(tableOrRemote)) return tableOrRemote;
  return REMOTE_TO_LOCAL[tableOrRemote] ?? null;
}

export function resolveRemoteWorkspaceTable(tableOrRemote: string): string {
  return isWorkspaceLocalTable(tableOrRemote) ? WORKSPACE_TABLE_SPECS[tableOrRemote].remoteTable : tableOrRemote;
}

export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id.trim());
}

/**
 * Normalizes legacy non-UUID strings into deterministic UUIDv4-shaped IDs so
 * Postgres `uuid` primary keys never reject offline-created items.
 */
export function ensureWorkspaceUuid(rawId: string): string {
  const trimmed = rawId.trim();
  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase();
  const h = [0, 0, 0, 0];
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed.charCodeAt(i);
    h[i % 4] = (h[i % 4] * 31 + c + i * 17) >>> 0;
  }
  const hex = h.map((n) => n.toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

type Row = Record<string, unknown>;

export function toCloudWorkspaceRow(localTable: WorkspaceLocalTable, row: Row, userId?: string | null): Row {
  const spec = WORKSPACE_TABLE_SPECS[localTable];
  const out: Row = {};
  for (const col of spec.columns) {
    let val = row[col];
    if (col === 'id' && val !== undefined) {
      val = ensureWorkspaceUuid(String(val));
    } else if (DATE_FIELDS.has(col)) {
      if (val === undefined || val === '') val = null;
    } else if (TS_FIELDS.has(col)) {
      if (val === undefined || val === '') val = null;
    } else if (val === undefined) {
      val = null;
    }
    out[col] = val;
  }

  if (localTable === 'contacts') {
    const company = row.company ?? row.organization ?? null;
    const note = row.note ?? row.notes ?? null;
    out.company = company;
    out.organization = company;
    out.note = note;
    out.notes = note;
  }

  if (localTable === 'documents') {
    out.category = row.area || row.category || 'General';
    out.file_type = row.mime_type || row.file_type || 'application/octet-stream';
    out.file_size = String(row.file_size ?? '0');
    out.file_name = row.file_name ?? row.title ?? 'document';
  }

  if (userId) out.user_id = userId;
  return out;
}

export function fromCloudWorkspaceRow(localTable: WorkspaceLocalTable, remoteRow: Row, existingLocal?: Row): Row {
  const spec = WORKSPACE_TABLE_SPECS[localTable];
  const out: Row = {};
  for (const col of spec.columns) {
    const val = remoteRow[col];
    if (val === null || val === undefined) continue;
    if (TS_FIELDS.has(col)) {
      const t = Date.parse(String(val));
      out[col] = Number.isNaN(t) ? val : new Date(t).toISOString();
    } else if (DATE_FIELDS.has(col)) {
      out[col] = String(val).slice(0, 10);
    } else {
      out[col] = val;
    }
  }

  if (localTable === 'contacts') {
    if (out.company === undefined && remoteRow.organization != null) out.company = remoteRow.organization;
    if (out.note === undefined && remoteRow.notes != null) out.note = remoteRow.notes;
    delete out.organization;
    delete out.notes;
  }

  if (localTable === 'documents') {
    out.file_size = Number(remoteRow.file_size ?? 0) || 0;
    if (!out.mime_type && remoteRow.file_type) out.mime_type = String(remoteRow.file_type);
    if (!out.area && remoteRow.category) out.area = String(remoteRow.category);
    if (!out.file_name) out.file_name = String(out.title ?? 'document');
    if (existingLocal?.data_blob) out.data_blob = existingLocal.data_blob;
  }

  return out;
}

export function workspaceRowStamp(row: Row | undefined): number {
  if (!row) return 0;
  const raw = row.updated_at ?? row.created_at;
  const t = Date.parse(String(raw ?? ''));
  return Number.isNaN(t) ? 0 : t;
}
