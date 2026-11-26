import { db } from '../db';
import { getTodayISO, generateId } from '../lib/utils';
import {
  PERMISSION_TIERS,
  classifyActionPermission,
  guardActionExecutionCore,
  runDiagnosticCore,
  type AgentAuditLogEntry,
  type DiagnosticFinding,
  type DiagnosticRuntimeDeps,
  type PermissionLevel,
  type PermissionTierSpec,
  type SelfHealingDiagnosticReport,
} from '../lib/selfHealingCore';
import { recordExecutionLog, type AgentExecutionLogRecord } from './sync/m3CloudStore';

export type {
  AgentAuditLogEntry,
  DiagnosticFinding,
  DiagnosticRuntimeDeps,
  PermissionLevel,
  PermissionTierSpec,
  SelfHealingDiagnosticReport,
};
export { PERMISSION_TIERS, classifyActionPermission };

export async function runLevel1SelfHealingDiagnostics(
  overrides: Partial<DiagnosticRuntimeDeps> = {},
): Promise<SelfHealingDiagnosticReport> {
  const deps: DiagnosticRuntimeDeps = {
    todayISO: overrides.todayISO || getTodayISO(),
    readSyncQueue: overrides.readSyncQueue || (() => db.sync_queue.toArray().catch(() => [])),
    readTasks: overrides.readTasks || (() => db.tasks.toArray().catch(() => [])),
    readNotifications: overrides.readNotifications || (() => db.notifications.toArray().catch(() => [])),
    writeNotification:
      overrides.writeNotification ||
      (async (payload) => {
        await db.notifications
          .put({
            id: generateId(),
            title: payload.title,
            message: payload.message,
            type: payload.type,
            priority: payload.priority,
            read: payload.read,
            related_record_id: payload.related_record_id,
            created_at: payload.created_at,
          })
          .catch(() => {});
      }),
    readGoogleAuthMeta:
      overrides.readGoogleAuthMeta ||
      (() =>
        db.settings
          .get('google_oauth_state')
          .then((row) => (row?.value as { connected?: boolean; expiresAt?: number | string | null } | undefined) ?? null)
          .catch(() => null)),
    checkAiGatewayHealth:
      overrides.checkAiGatewayHealth ||
      (() =>
        fetch('/api/ai/chat?action=health')
          .then(async (res) => {
            if (!res.ok) return { ok: false, connectedProviders: 0 };
            const body = await res.json();
            const connected = Array.isArray(body?.providers)
              ? body.providers.filter((p: { connected?: boolean }) => p.connected).length
              : 0;
            return { ok: true, connectedProviders: connected };
          })
          .catch(() => ({ ok: false, connectedProviders: 0 }))),
    persistLog:
      overrides.persistLog ||
      (async (entry) => {
        const saved: AgentExecutionLogRecord = await recordExecutionLog(entry);
        return saved;
      }),
  };

  return runDiagnosticCore(deps);
}

export async function guardActionExecution(input: {
  actionType: string;
  summary: string;
  approvedByHuman?: boolean;
  channel?: string;
  details?: Record<string, unknown>;
}) {
  return guardActionExecutionCore(input, (entry) => recordExecutionLog(entry));
}
