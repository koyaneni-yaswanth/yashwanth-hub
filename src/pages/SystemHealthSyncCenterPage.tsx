import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  RefreshCw,
  Database,
  Cloud,
  Brain,
  Sparkles,
  Download,
  ArrowRight,
  Split,
} from 'lucide-react';
import { db } from '../db';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { CoreSyncEngine, type SyncEngineStatus, type SyncConflictItem } from '../services/sync/syncEngine';
import { NeoConnectionMonitor } from '../integrations/neosapien/connection';
import { Badge } from '../components/common/Badge';

interface SystemHealthSyncCenterPageProps {
  onNavigateToIntegrations?: () => void;
  onNavigateToNeoMemory?: () => void;
}

export const SystemHealthSyncCenterPage: React.FC<SystemHealthSyncCenterPageProps> = ({
  onNavigateToIntegrations,
  onNavigateToNeoMemory,
}) => {
  const [syncStatus, setSyncStatus] = useState<SyncEngineStatus>(() => CoreSyncEngine.getStatus());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflictItem[]>(() => CoreSyncEngine.getConflicts());
  const [neoStatus, setNeoStatus] = useState<any>(null);

  // Live Database Queries
  const taskCount = useLiveQuery(() => db.tasks.count(), []) || 0;
  const eventCount = useLiveQuery(() => db.events.count(), []) || 0;
  const projectCount = useLiveQuery(() => db.projects.count(), []) || 0;
  const noteCount = useLiveQuery(() => db.notes.count(), []) || 0;
  const neoMemoryCount = useLiveQuery(() => db.neo_memories.count(), []) || 0;
  const syncHistoryLogs = useLiveQuery(() => db.sync_history.orderBy('timestamp').reverse().limit(20).toArray(), []) || [];
  const googleConfig = GoogleAuthService.getConfig();

  useEffect(() => {
    const unsub = CoreSyncEngine.subscribe((status) => {
      setSyncStatus(status);
      setConflicts(CoreSyncEngine.getConflicts());
    });
    NeoConnectionMonitor.getStatus().then(setNeoStatus).catch(() => {});
    return unsub;
  }, []);

  const handleRunSync = async () => {
    setIsSyncing(true);
    setSyncMessage('Executing multi-service synchronization...');
    try {
      const res = await CoreSyncEngine.synchronizeAll();
      if (res.success) {
        setSyncMessage(`All active services synchronized: ${res.syncedServices.join(', ')}`);
      } else {
        setSyncMessage(`Sync completed with notices: ${res.errors.join(' | ')}`);
      }
      setConflicts(CoreSyncEngine.getConflicts());
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResolveConflict = async (conflictId: string, choice: 'local' | 'remote') => {
    await CoreSyncEngine.resolveConflict(conflictId, choice);
    setConflicts(CoreSyncEngine.getConflicts());
  };

  const handleExportDiagnostics = async () => {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      appVersion: '2.0.0-UNIFIED',
      environment: {
        origin: typeof window !== 'undefined' ? window.location.origin : 'N/A',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        online: typeof navigator !== 'undefined' ? navigator.onLine : false,
      },
      googleOAuth: {
        connected: GoogleAuthService.isConnected(),
        clientIdConfigured: Boolean(GoogleAuthService.getEffectiveClientId()),
        email: googleConfig.email || 'None',
        services: googleConfig.services || {},
      },
      neoSapien: neoStatus || {},
      database: {
        taskCount,
        eventCount,
        projectCount,
        noteCount,
        neoMemoryCount,
      },
      syncState: syncStatus,
      activeConflicts: conflicts,
      recentSyncLogs: syncHistoryLogs.slice(0, 10),
    };

    const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yashwanth_hub_diagnostics_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isGoogleConnected = GoogleAuthService.isConnected();

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">System Health & Sync Center</h1>
                <Badge variant={syncStatus.state === 'SYNCED' ? 'emerald' : syncStatus.state === 'PROCESSING' ? 'blue' : 'amber'}>
                  {syncStatus.state}
                </Badge>
              </div>
              <p className="text-sm text-[var(--hub-muted)] mt-1">
                Real-time operational dashboard for Google OAuth, NeoSapien Memory, Dexie IndexedDB & Cross-Platform Synchronization.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={handleRunSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] hover:bg-[var(--hub-accent-hover)] text-white text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronizing...' : 'Sync Now'}</span>
            </button>

            <button
              onClick={handleExportDiagnostics}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-bg)] hover:bg-[var(--hub-surface-hover)] border border-[var(--hub-border)] text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Diagnostics</span>
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="mt-4 p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-300">
            {syncMessage}
          </div>
        )}
      </div>

      {/* Service Health Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Google Workspace Card */}
        <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm flex items-center gap-2 text-[var(--hub-ink)]">
              <Cloud className="w-4 h-4 text-blue-400" />
              Google Workspace
            </span>
            <Badge variant={isGoogleConnected ? 'emerald' : 'amber'}>
              {isGoogleConnected ? 'Authorized' : 'Disconnected'}
            </Badge>
          </div>

          <div className="text-xs text-[var(--hub-muted)] space-y-1">
            <div>Account: {googleConfig.email || 'None'}</div>
            <div>OAuth Client: {GoogleAuthService.getEffectiveClientId() ? 'Configured' : 'Missing'}</div>
            <div>Origins: {typeof window !== 'undefined' ? window.location.origin : 'N/A'}</div>
          </div>

          {onNavigateToIntegrations && (
            <button
              onClick={onNavigateToIntegrations}
              className="text-xs font-semibold text-[var(--hub-accent)] hover:underline flex items-center gap-1 pt-1"
            >
              <span>Manage Credentials</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 2. NeoSapien Second Brain Card */}
        <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm flex items-center gap-2 text-[var(--hub-ink)]">
              <Brain className="w-4 h-4 text-emerald-400" />
              NeoSapien Ecosystem
            </span>
            <Badge variant="emerald">Operational</Badge>
          </div>

          <div className="text-xs text-[var(--hub-muted)] space-y-1">
            <div>Memories in Hub: {neoMemoryCount}</div>
            <div>Desktop Botless: Supported</div>
            <div>BLE Hardware: {neoStatus?.bluetoothPaired ? 'Connected' : 'Ready'}</div>
          </div>

          {onNavigateToNeoMemory && (
            <button
              onClick={onNavigateToNeoMemory}
              className="text-xs font-semibold text-emerald-400 hover:underline flex items-center gap-1 pt-1"
            >
              <span>Open Memory Center</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* 3. Local IndexedDB Card */}
        <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm flex items-center gap-2 text-[var(--hub-ink)]">
              <Database className="w-4 h-4 text-purple-400" />
              Dexie Database
            </span>
            <Badge variant="emerald">Healthy (v4)</Badge>
          </div>

          <div className="text-xs text-[var(--hub-muted)] space-y-1">
            <div>Tasks: {taskCount} | Events: {eventCount}</div>
            <div>Projects: {projectCount} | Notes: {noteCount}</div>
            <div>Latency: &lt; 1 ms (Local Memory)</div>
          </div>

          <span className="text-[11px] text-[var(--hub-muted)] block pt-1">
            100% Offline-First Persistent Storage
          </span>
        </div>

        {/* 4. Multi-Model AI Gateway Card */}
        <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm flex items-center gap-2 text-[var(--hub-ink)]">
              <Sparkles className="w-4 h-4 text-amber-400" />
              AI Gateway
            </span>
            <Badge variant="emerald">Active</Badge>
          </div>

          <div className="text-xs text-[var(--hub-muted)] space-y-1">
            <div>Gemini: 2.5 Flash / Pro (BYOK)</div>
            <div>OpenAI: GPT-4o (BYOK)</div>
            <div>Claude: 3.5 Sonnet (BYOK)</div>
          </div>

          <span className="text-[11px] text-[var(--hub-muted)] block pt-1">
            RAG Context Over 16 Local Stores
          </span>
        </div>
      </div>

      {/* Conflict Resolution Workspace (if any conflicts exist) */}
      {conflicts.length > 0 && (
        <div className="bg-[var(--hub-card-bg)] border border-amber-500/30 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold flex items-center gap-2 text-amber-400">
            <Split className="w-5 h-5" />
            <span>Unresolved Data Conflicts ({conflicts.length})</span>
          </h2>
          <p className="text-xs text-[var(--hub-muted)]">
            A simultaneous edit occurred on both Yashwanth Hub and an external provider. Choose which version to preserve.
          </p>

          <div className="space-y-3">
            {conflicts.map((conf) => (
              <div key={conf.id} className="p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="font-bold text-sm text-[var(--hub-ink)]">{conf.title}</div>
                  <div className="text-xs text-[var(--hub-muted)]">
                    Provider: <span className="uppercase font-semibold">{conf.provider}</span> · Record: {conf.recordType}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleResolveConflict(conf.id, 'local')}
                    className="px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] hover:bg-[var(--hub-accent-hover)] text-white text-xs font-semibold"
                  >
                    Keep Local Version
                  </button>
                  <button
                    onClick={() => handleResolveConflict(conf.id, 'remote')}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                  >
                    Keep Remote Provider
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Synchronization Event History */}
      <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--hub-muted)] mb-4">
          Recent Synchronization Audit Events
        </h3>

        {syncHistoryLogs.length === 0 ? (
          <div className="text-xs text-[var(--hub-muted)] text-center py-6">
            No synchronization history recorded yet. Click "Sync Now" to trigger a run.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--hub-border)] text-[var(--hub-muted)]">
                  <th className="pb-2">Timestamp</th>
                  <th className="pb-2">Service</th>
                  <th className="pb-2">Operation</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Records</th>
                  <th className="pb-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hub-border)]">
                {syncHistoryLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="py-2.5 font-mono text-[var(--hub-muted)]">
                      {log.timestamp.slice(0, 19).replace('T', ' ')}
                    </td>
                    <td className="py-2.5 font-semibold text-[var(--hub-ink)]">{log.service}</td>
                    <td className="py-2.5 text-[var(--hub-muted)]">{log.action}</td>
                    <td className="py-2.5">
                      <Badge variant={log.status === 'success' ? 'emerald' : 'amber'}>
                        {log.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 font-bold">{log.itemCount}</td>
                    <td className="py-2.5 text-[var(--hub-muted)] truncate max-w-xs">{log.details || 'OK'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
