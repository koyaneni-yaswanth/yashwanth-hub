export type PermissionLevel = 1 | 2 | 3;

export interface PermissionTierSpec {
  level: PermissionLevel;
  name: string;
  badgeVariant: 'emerald' | 'amber' | 'red';
  policy: string;
  examples: string[];
}

export interface AgentAuditLogEntry {
  id: string;
  action_type: string;
  permission_level: PermissionLevel;
  status: 'executed' | 'pending_approval' | 'approved' | 'rejected' | 'blocked' | 'failed';
  summary: string;
  channel?: string;
  details?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const PERMISSION_TIERS: PermissionTierSpec[] = [
  {
    level: 1,
    name: 'Level 1 — Safe Diagnostics & Local Organization',
    badgeVariant: 'emerald',
    policy: 'Runs automatically with zero external side effects.',
    examples: [
      'Inspect pending/failed sync queue items',
      'Verify Google OAuth expiry & AI Gateway health',
      'Deduplicate daily overdue task alerts',
    ],
  },
  {
    level: 2,
    name: 'Level 2 — External Messages, Sync & Scheduling',
    badgeVariant: 'amber',
    policy: 'Requires explicit human confirmation before dispatch.',
    examples: [
      'Send outbound Telegram / Discord / n8n webhook alerts',
      'Retry failed cloud sync batches',
      'Reschedule tasks or queue recurring automations',
    ],
  },
  {
    level: 3,
    name: 'Level 3 — Destructive, Financial & Security Actions',
    badgeVariant: 'red',
    policy: 'Strictly blocked from autonomous agent execution.',
    examples: [
      'Delete records, accounts, or sync databases',
      'Perform financial transactions or billing edits',
      'Modify API secrets, OAuth credentials, or RLS policies',
    ],
  },
];

const LEVEL_1_ACTIONS = new Set([
  'diagnostic_scan',
  'dedup_alerts',
  'health_check',
  'graph_rebuild',
]);

const LEVEL_2_ACTIONS = new Set([
  'notify_telegram',
  'notify_discord',
  'notify_webhook',
  'notify_all',
  'retry_sync_queue',
  'schedule_automation',
  'reschedule_task',
  'refresh_google_session',
]);

const LEVEL_3_ACTIONS = new Set([
  'delete_records',
  'wipe_database',
  'financial_transaction',
  'modify_secrets',
  'revoke_credentials',
  'change_rls_policy',
]);

export function classifyActionPermission(actionType: string): PermissionLevel {
  const normalized = String(actionType || '').trim().toLowerCase();
  if (LEVEL_1_ACTIONS.has(normalized)) return 1;
  if (LEVEL_2_ACTIONS.has(normalized)) return 2;
  if (LEVEL_3_ACTIONS.has(normalized)) return 3;
  if (/(delete|drop|wipe|secret|token|payment|transfer|billing|rls)/.test(normalized)) {
    return 3;
  }
  return 2;
}

export interface DiagnosticSyncQueueEntry {
  id: string;
  attempts?: number;
  last_error?: string;
  status?: string;
}

export interface DiagnosticTaskEntry {
  id: string;
  text?: string;
  title?: string;
  done?: boolean;
  completed?: boolean;
  due_date?: string;
  dueDate?: string;
}

export interface DiagnosticNotificationEntry {
  id: string;
  related_record_id?: string;
  sourceKey?: string;
}

export interface DiagnosticFinding {
  id: string;
  area: 'sync_queue' | 'google_auth' | 'ai_gateway' | 'overdue_tasks';
  status: 'healthy' | 'warning' | 'action_recommended';
  title: string;
  detail: string;
  recommendedActionType?: string;
  recommendedActionLevel?: PermissionLevel;
}

export interface SelfHealingDiagnosticReport {
  ranAt: string;
  overallStatus: 'healthy' | 'attention';
  pendingSyncCount: number;
  failedSyncCount: number;
  overdueTaskCount: number;
  newAlertsCreated: number;
  suppressedDuplicateAlerts: number;
  findings: DiagnosticFinding[];
  logEntry?: AgentAuditLogEntry;
}

export interface DiagnosticRuntimeDeps {
  todayISO: string;
  readSyncQueue: () => Promise<DiagnosticSyncQueueEntry[]>;
  readTasks: () => Promise<DiagnosticTaskEntry[]>;
  readNotifications: () => Promise<DiagnosticNotificationEntry[]>;
  writeNotification: (notification: {
    id: string;
    title: string;
    message: string;
    type: 'deadline';
    priority: 'high';
    read: boolean;
    related_record_id: string;
    created_at: string;
  }) => Promise<void>;
  readGoogleAuthMeta: () => Promise<{ connected?: boolean; expiresAt?: number | string | null } | null>;
  checkAiGatewayHealth: () => Promise<{ ok: boolean; connectedProviders: number }>;
  persistLog: (entry: {
    action_type: string;
    permission_level: PermissionLevel;
    status: AgentAuditLogEntry['status'];
    summary: string;
    channel?: string;
    details?: Record<string, unknown>;
  }) => Promise<AgentAuditLogEntry>;
}

function defaultLogFactory(entry: {
  action_type: string;
  permission_level: PermissionLevel;
  status: AgentAuditLogEntry['status'];
  summary: string;
  channel?: string;
  details?: Record<string, unknown>;
}): AgentAuditLogEntry {
  const now = new Date().toISOString();
  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: now,
    updated_at: now,
    ...entry,
  };
}

export async function runDiagnosticCore(
  deps: DiagnosticRuntimeDeps,
): Promise<SelfHealingDiagnosticReport> {
  const ranAt = new Date().toISOString();
  const todayISO = deps.todayISO;

  const syncItems = await deps.readSyncQueue();
  const failedSyncCount = syncItems.filter(
    (item) =>
      item.status === 'failed' ||
      Boolean(item.last_error) ||
      (typeof item.attempts === 'number' && item.attempts >= 3),
  ).length;
  const pendingSyncCount = Math.max(0, syncItems.length - failedSyncCount);

  const tasks = await deps.readTasks();
  const overdueTasks = tasks.filter((t) => {
    const isDone = Boolean(t.done ?? t.completed);
    const due = t.due_date || t.dueDate || '';
    return !isDone && Boolean(due) && due < todayISO;
  });

  const notifications = await deps.readNotifications();
  const findings: DiagnosticFinding[] = [];

  if (failedSyncCount > 0) {
    findings.push({
      id: 'sync_queue_failed',
      area: 'sync_queue',
      status: 'action_recommended',
      title: `${failedSyncCount} failed cloud sync item${failedSyncCount === 1 ? '' : 's'}`,
      detail: 'Approve a Level 2 sync retry or clear conflicts in System Health.',
      recommendedActionType: 'retry_sync_queue',
      recommendedActionLevel: 2,
    });
  } else if (pendingSyncCount > 0) {
    findings.push({
      id: 'sync_queue_pending',
      area: 'sync_queue',
      status: 'warning',
      title: `${pendingSyncCount} local change${pendingSyncCount === 1 ? '' : 's'} queued for sync`,
      detail: 'Changes will flush automatically on next cloud heartbeat or manual Sync Now.',
    });
  } else {
    findings.push({
      id: 'sync_queue_ok',
      area: 'sync_queue',
      status: 'healthy',
      title: 'Sync queue clean',
      detail: '0 pending and 0 failed queue mutations.',
    });
  }

  let newAlertsCreated = 0;
  let suppressedDuplicateAlerts = 0;

  if (overdueTasks.length > 0) {
    const dedupKey = `self_heal_overdue_${todayISO}`;
    const alreadyAlerted = notifications.some(
      (n) => n.related_record_id === dedupKey || n.sourceKey === dedupKey,
    );
    if (alreadyAlerted) {
      suppressedDuplicateAlerts = 1;
    } else {
      const sampleTitles = overdueTasks
        .slice(0, 3)
        .map((t) => t.text || t.title || 'Untitled task')
        .join(', ');
      await deps.writeNotification({
        id: `diag_${todayISO}_${Math.random().toString(36).slice(2, 7)}`,
        title: `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'} flagged by diagnostics`,
        message: `Items behind schedule: ${sampleTitles}${overdueTasks.length > 3 ? ` (+${overdueTasks.length - 3} more)` : ''}.`,
        type: 'deadline',
        priority: 'high',
        read: false,
        related_record_id: dedupKey,
        created_at: ranAt,
      });
      newAlertsCreated = 1;
    }

    findings.push({
      id: 'overdue_tasks_found',
      area: 'overdue_tasks',
      status: 'warning',
      title: `${overdueTasks.length} overdue task${overdueTasks.length === 1 ? '' : 's'} detected`,
      detail:
        newAlertsCreated > 0
          ? 'Created one consolidated daily notice (Level 1).'
          : 'Consolidated daily notice already logged today — duplicate suppressed.',
      recommendedActionType: 'reschedule_task',
      recommendedActionLevel: 2,
    });
  } else {
    findings.push({
      id: 'overdue_tasks_ok',
      area: 'overdue_tasks',
      status: 'healthy',
      title: 'No overdue tasks',
      detail: 'All open dated tasks are on or ahead of schedule.',
    });
  }

  const googleMeta = await deps.readGoogleAuthMeta();
  if (googleMeta?.connected) {
    const expiresMs =
      typeof googleMeta.expiresAt === 'number'
        ? googleMeta.expiresAt
        : googleMeta.expiresAt
          ? Date.parse(String(googleMeta.expiresAt))
          : NaN;
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      findings.push({
        id: 'google_auth_expired',
        area: 'google_auth',
        status: 'action_recommended',
        title: 'Google Workspace session expired',
        detail: 'Reconnect Google Workspace manually in Settings -> Google Cloud to resume Calendar/Tasks sync.',
        recommendedActionType: 'refresh_google_session',
        recommendedActionLevel: 2,
      });
    } else {
      findings.push({
        id: 'google_auth_ok',
        area: 'google_auth',
        status: 'healthy',
        title: 'Google Workspace session active',
        detail: 'Token present with no expiration fault detected locally.',
      });
    }
  } else {
    findings.push({
      id: 'google_auth_unlinked',
      area: 'google_auth',
      status: 'healthy',
      title: 'Google Workspace optional link',
      detail: 'Not currently linked in this local browser session.',
    });
  }

  const gateway = await deps.checkAiGatewayHealth();
  findings.push(
    gateway.ok
      ? {
          id: 'ai_gateway_ok',
          area: 'ai_gateway',
          status: 'healthy',
          title: `AI Gateway responsive (${gateway.connectedProviders} connected provider${gateway.connectedProviders === 1 ? '' : 's'})`,
          detail: 'Unified router is reachable and reporting live key status.',
        }
      : {
          id: 'ai_gateway_offline',
          area: 'ai_gateway',
          status: 'warning',
          title: 'AI Gateway offline or running in local deterministic mode',
          detail: 'Server /api/ai/chat health endpoint did not respond; offline answers remain available.',
        },
  );

  const overallStatus: 'healthy' | 'attention' = findings.some(
    (f) => f.status === 'action_recommended' || (f.area === 'sync_queue' && failedSyncCount > 0),
  )
    ? 'attention'
    : 'healthy';

  const summary = `Level 1 scan: ${failedSyncCount} failed sync, ${pendingSyncCount} pending, ${overdueTasks.length} overdue, ${newAlertsCreated} alert emitted.`;
  const logEntry = await deps.persistLog({
    action_type: 'diagnostic_scan',
    permission_level: 1,
    status: 'executed',
    summary,
    channel: 'diagnostics',
    details: {
      pendingSyncCount,
      failedSyncCount,
      overdueTaskCount: overdueTasks.length,
      newAlertsCreated,
      suppressedDuplicateAlerts,
    },
  });

  return {
    ranAt,
    overallStatus,
    pendingSyncCount,
    failedSyncCount,
    overdueTaskCount: overdueTasks.length,
    newAlertsCreated,
    suppressedDuplicateAlerts,
    findings,
    logEntry,
  };
}

export async function guardActionExecutionCore(
  input: {
    actionType: string;
    summary: string;
    approvedByHuman?: boolean;
    channel?: string;
    details?: Record<string, unknown>;
  },
  persistLog: DiagnosticRuntimeDeps['persistLog'] = async (entry) => defaultLogFactory(entry),
): Promise<{
  allowed: boolean;
  permissionLevel: PermissionLevel;
  status: 'executed' | 'pending_approval' | 'blocked';
  reason: string;
  logEntry: AgentAuditLogEntry;
}> {
  const level = classifyActionPermission(input.actionType);

  if (level === 3) {
    const reason = `Blocked Level 3 restricted action "${input.actionType}": destructive, financial, and credential mutations are disabled for autonomous execution.`;
    const logEntry = await persistLog({
      action_type: input.actionType,
      permission_level: 3,
      status: 'blocked',
      summary: input.summary,
      channel: input.channel || 'policy_guard',
      details: { ...input.details, reason },
    });
    return {
      allowed: false,
      permissionLevel: 3,
      status: 'blocked',
      reason,
      logEntry,
    };
  }

  if (level === 2 && !input.approvedByHuman) {
    const reason = `Approval required for Level 2 external/write action "${input.actionType}".`;
    const logEntry = await persistLog({
      action_type: input.actionType,
      permission_level: 2,
      status: 'pending_approval',
      summary: input.summary,
      channel: input.channel || 'policy_guard',
      details: { ...input.details, reason },
    });
    return {
      allowed: false,
      permissionLevel: 2,
      status: 'pending_approval',
      reason,
      logEntry,
    };
  }

  const reason =
    level === 1
      ? `Permitted Level 1 safe action "${input.actionType}".`
      : `Permitted Level 2 action "${input.actionType}" with explicit user confirmation.`;
  const logEntry = await persistLog({
    action_type: input.actionType,
    permission_level: level,
    status: level === 2 ? 'approved' : 'executed',
    summary: input.summary,
    channel: input.channel || 'policy_guard',
    details: { ...input.details, approvedByHuman: Boolean(input.approvedByHuman) },
  });

  return {
    allowed: true,
    permissionLevel: level,
    status: 'executed',
    reason,
    logEntry,
  };
}
