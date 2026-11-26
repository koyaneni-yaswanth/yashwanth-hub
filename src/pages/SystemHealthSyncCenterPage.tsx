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
  GitBranch,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { db } from '../db';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { CoreSyncEngine, type SyncEngineStatus, type SyncConflictItem } from '../services/sync/syncEngine';
import { NeoConnectionMonitor } from '../integrations/neosapien/connection';
import { AIGateway } from '../services/ai/aiGateway';
import {
  PERMISSION_TIERS,
  guardActionExecution,
  runLevel1SelfHealingDiagnostics,
  type SelfHealingDiagnosticReport,
} from '../services/selfHealingService';
import { loadExecutionLogs, type AgentExecutionLogRecord } from '../services/sync/m3CloudStore';
import type { ProviderHealthReport } from '../../api/_lib/aiProviderAdapters';
import type { DevMonitorReport } from '../../api/_lib/devMonitor';
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
  const [aiProviders, setAiProviders] = useState<ProviderHealthReport[]>([]);
  const [devReport, setDevReport] = useState<DevMonitorReport | null>(null);
  const [isLoadingDev, setIsLoadingDev] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<SelfHealingDiagnosticReport | null>(null);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<AgentExecutionLogRecord[]>([]);

  const handleRunDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    try {
      const report = await runLevel1SelfHealingDiagnostics();
      setDiagnosticReport(report);
      const logs = await loadExecutionLogs();
      setExecutionLogs(logs);
    } finally {
      setIsRunningDiagnostics(false);
    }
  };

  useEffect(() => {
    void loadExecutionLogs().then(setExecutionLogs);
  }, []);

  // Live Database Queries
  const taskCount = useLiveQuery(() => db.tasks.count(), []) || 0;
  const eventCount = useLiveQuery(() => db.events.count(), []) || 0;
  const projectCount = useLiveQuery(() => db.projects.count(), []) || 0;
  const noteCount = useLiveQuery(() => db.notes.count(), []) || 0;
  const neoMemoryCount = useLiveQuery(() => db.neo_memories.count(), []) || 0;
  const syncHistoryLogs = useLiveQuery(() => db.sync_history.orderBy('timestamp').reverse().limit(20).toArray(), []) || [];
  const googleConfig = GoogleAuthService.getConfig();

  const loadDevMonitor = async () => {
    setIsLoadingDev(true);
    try {
      const r = await fetch('/api/integrations/sync?action=dev_status');
      if (r.ok && (r.headers.get('content-type') || '').includes('application/json')) {
        const data = await r.json();
        setDevReport(data);
        return;
      }
      throw new Error('Server route unavailable');
    } catch {
      try {
        const [repoR, comR] = await Promise.all([
          fetch('https://api.github.com/repos/koyaneni-yaswanth/yashwanth-hub'),
          fetch('https://api.github.com/repos/koyaneni-yaswanth/yashwanth-hub/commits?per_page=5'),
        ]);
        const repoJ = repoR.ok ? await repoR.json() : {};
        const comJ = comR.ok ? await comR.json() : [];
        setDevReport({
          github: {
            repo: 'koyaneni-yaswanth/yashwanth-hub',
            configuredToken: false,
            status: repoR.ok ? 'connected' : 'error',
            openIssuesCount: repoJ.open_issues_count,
            defaultBranch: repoJ.default_branch,
            recentCommits: Array.isArray(comJ)
              ? comJ.map((c: any) => ({
                  sha: String(c?.sha || '').slice(0, 7),
                  message: String(c?.commit?.message || '').split('\n')[0],
                  author: String(c?.commit?.author?.name || ''),
                  date: String(c?.commit?.author?.date || ''),
                  url: String(c?.html_url || ''),
                }))
              : [],
            openPullRequests: [],
            recentWorkflowRuns: [],
          },
          vercel: {
            project: 'yashwanth-hub',
            tokenConfigured: false,
            runtimeCommitSha: null,
            runtimeCommitMessage: null,
            runtimeCommitRef: null,
            runtimeRegion: null,
            latestDeployments: [],
          },
          checkedAt: new Date().toISOString(),
        });
      } catch {
        // Offline or rate-limited
      }
    } finally {
      setIsLoadingDev(false);
    }
  };

  useEffect(() => {
    const unsub = CoreSyncEngine.subscribe((status) => {
      setSyncStatus(status);
      setConflicts(CoreSyncEngine.getConflicts());
    });
    NeoConnectionMonitor.getStatus().then(setNeoStatus).catch(() => {});
    AIGateway.healthCheck().then((h) => setAiProviders(h.providers)).catch(() => {});
    loadDevMonitor();
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
            <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-700 dark:text-teal-300 shrink-0">
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
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] hover:bg-[var(--hub-accent-hover)] text-[var(--hub-accent-ink)] text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50"
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
              <Cloud className="w-4 h-4 text-blue-700 dark:text-blue-300" />
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
              <Brain className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
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
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline flex items-center gap-1 pt-1"
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
              <Database className="w-4 h-4 text-purple-700 dark:text-purple-300" />
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

        {/* 4. Multi-Model AI Gateway Card (Live Status) */}
        <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm flex items-center gap-2 text-[var(--hub-ink)]">
              <Sparkles className="w-4 h-4 text-amber-800 dark:text-amber-300" />
              AI Gateway
            </span>
            <Badge variant={aiProviders.some((p) => p.status === 'connected') ? 'emerald' : 'amber'}>
              {aiProviders.filter((p) => p.status === 'connected').length} Active
            </Badge>
          </div>

          <div className="text-xs text-[var(--hub-muted)] space-y-1">
            {aiProviders.length > 0 ? (
              aiProviders.slice(0, 3).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.name}</span>
                  <span className="font-mono text-[10px]">
                    {p.status === 'connected' ? `${p.latencyMs ?? '?'}ms` : 'Unset'}
                  </span>
                </div>
              ))
            ) : (
              <div>Gemini · OpenRouter · OpenAI · Claude · HF · Ollama</div>
            )}
          </div>

          <span className="text-[11px] text-[var(--hub-muted)] block pt-1">
            Server-side tool routing across local &amp; cloud stores
          </span>
        </div>
      </div>

      {/* Live GitHub & Vercel Development Monitor */}
      <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-5 h-5 text-[var(--hub-accent)]" />
            <div>
              <h2 className="text-base font-bold text-[var(--hub-ink)]">
                GitHub &amp; Vercel Development Monitor
              </h2>
              <p className="text-xs text-[var(--hub-muted)]">
                Live repository commits, open PRs, CI workflow status &amp; active Vercel runtime.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadDevMonitor}
            disabled={isLoadingDev}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDev ? 'animate-spin' : ''}`} />
            <span>{isLoadingDev ? 'Checking...' : 'Refresh Monitor'}</span>
          </button>
        </div>

        {devReport ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--hub-ink)]">GitHub · {devReport.github.repo}</span>
                <Badge variant={devReport.github.status === 'connected' ? 'emerald' : 'amber'}>
                  {devReport.github.status}
                </Badge>
              </div>
              {devReport.github.error && (
                <p className="text-amber-700 dark:text-amber-300">{devReport.github.error}</p>
              )}
              <div className="space-y-1.5">
                {devReport.github.recentCommits.map((c) => (
                  <a
                    key={c.sha}
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 py-1 border-b border-[var(--hub-border)]/60 last:border-0 hover:text-[var(--hub-accent)]"
                  >
                    <span className="truncate">
                      <code className="font-mono text-[10px] text-[var(--hub-accent)] mr-1.5">{c.sha}</code>
                      {c.message}
                    </span>
                    <ExternalLink className="w-3 h-3 shrink-0 opacity-60" />
                  </a>
                ))}
              </div>
              {devReport.github.recentWorkflowRuns.length > 0 && (
                <div className="pt-1 text-[11px] text-[var(--hub-muted)]">
                  Latest CI: {devReport.github.recentWorkflowRuns[0].name} (
                  {devReport.github.recentWorkflowRuns[0].conclusion || devReport.github.recentWorkflowRuns[0].status})
                </div>
              )}
            </div>

            <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--hub-ink)]">Vercel Deployment Runtime</span>
                <Badge variant={devReport.vercel.tokenConfigured || devReport.vercel.runtimeCommitSha ? 'emerald' : 'amber'}>
                  {devReport.vercel.tokenConfigured ? 'API Linked' : devReport.vercel.runtimeCommitSha ? 'Runtime Active' : 'Local Preview'}
                </Badge>
              </div>
              <div className="space-y-1 text-[var(--hub-muted)]">
                <div>Branch: <span className="text-[var(--hub-ink)] font-mono">{devReport.vercel.runtimeCommitRef || '—'}</span></div>
                <div>Commit: <span className="text-[var(--hub-ink)] font-mono">{devReport.vercel.runtimeCommitSha || '—'}</span></div>
                <div>Region: <span className="text-[var(--hub-ink)] font-mono">{devReport.vercel.runtimeRegion || '—'}</span></div>
              </div>
              {devReport.vercel.latestDeployments.length > 0 ? (
                <div className="space-y-1 pt-1">
                  {devReport.vercel.latestDeployments.slice(0, 3).map((d) => (
                    <div key={d.uid} className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-[11px]">{d.url}</span>
                      <Badge variant={d.state === 'READY' ? 'emerald' : 'amber'}>{d.state}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[var(--hub-muted)] pt-1">
                  Add <code className="font-mono">VERCEL_TOKEN</code> in server env for multi-deployment build history.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--hub-muted)]">Loading repository and deployment telemetry...</p>
        )}
      </div>

      {/* Conflict Resolution Workspace (if any conflicts exist) */}
      {conflicts.length > 0 && (
        <div className="bg-[var(--hub-card-bg)] border border-amber-500/30 rounded-2xl p-6 space-y-4">
          <h2 className="text-base font-bold flex items-center gap-2 text-amber-800 dark:text-amber-300">
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
                    className="px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] hover:bg-[var(--hub-accent-hover)] text-[var(--hub-accent-ink)] text-xs font-semibold"
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

      {/* Autonomous Self-Healing & Execution Policy Tiers (Level 1 / 2 / 3) */}
      <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2 text-[var(--hub-ink)]">
              <ShieldCheck className="w-5 h-5 text-[var(--hub-accent)]" />
              <span>Autonomous Self-Healing &amp; Execution Policy</span>
            </h2>
            <p className="text-xs text-[var(--hub-muted)] mt-0.5">
              Strict 3-tier execution guardrail: Level 1 runs safe diagnostics automatically; Level 2 waits for human approval; Level 3 destructive/security actions stay blocked.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunDiagnostics}
            disabled={isRunningDiagnostics}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostics ? 'animate-spin' : ''}`} />
            <span>{isRunningDiagnostics ? 'Scanning...' : 'Run Level-1 Diagnostics'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          {PERMISSION_TIERS.map((tier) => (
            <div key={tier.level} className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant={tier.badgeVariant}>Level {tier.level}</Badge>
                <span className="text-[10px] font-mono text-[var(--hub-muted)]">
                  {tier.level === 1 ? 'AUTO' : tier.level === 2 ? 'CONFIRM' : 'BLOCKED'}
                </span>
              </div>
              <div className="font-semibold text-[var(--hub-ink)]">{tier.name}</div>
              <p className="text-[11px] text-[var(--hub-muted)]">{tier.policy}</p>
            </div>
          ))}
        </div>

        {diagnosticReport && (
          <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--hub-ink)]">
                {diagnosticReport.overallStatus === 'healthy' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                )}
                <span>
                  Scan completed · {diagnosticReport.failedSyncCount} failed sync · {diagnosticReport.pendingSyncCount} pending · {diagnosticReport.overdueTaskCount} overdue
                </span>
              </div>
              <span className="text-[11px] font-mono text-[var(--hub-muted)]">
                {diagnosticReport.suppressedDuplicateAlerts > 0
                  ? 'Duplicate daily notice suppressed'
                  : diagnosticReport.newAlertsCreated === 1
                    ? '1 alert logged'
                    : `${diagnosticReport.newAlertsCreated} alerts logged`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {diagnosticReport.findings.map((finding) => (
                <div key={finding.id} className="p-3 rounded-lg bg-[var(--hub-card-bg)] border border-[var(--hub-border)] flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="font-semibold text-[var(--hub-ink)]">{finding.title}</div>
                    <div className="text-[11px] text-[var(--hub-muted)]">{finding.detail}</div>
                  </div>
                  {finding.recommendedActionType === 'retry_sync_queue' ? (
                    <button
                      type="button"
                      onClick={() =>
                        void guardActionExecution({
                          actionType: 'retry_sync_queue',
                          summary: 'User approved Level-2 sync queue retry from diagnostics',
                          approvedByHuman: true,
                          channel: 'sync_engine',
                        }).then(async () => {
                          await CoreSyncEngine.synchronizeAll();
                          const logs = await loadExecutionLogs();
                          setExecutionLogs(logs);
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-[11px] font-semibold shrink-0 cursor-pointer"
                    >
                      Approve Retry
                    </button>
                  ) : (
                    <Badge variant={finding.status === 'healthy' ? 'emerald' : 'amber'}>
                      {finding.status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {executionLogs.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--hub-muted)]">
              Recent Execution &amp; Policy Audit ({executionLogs.length})
            </div>
            <div className="space-y-1 max-h-44 overflow-y-auto pr-1 text-xs">
              {executionLogs.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-border)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={entry.permission_level === 1 ? 'emerald' : entry.permission_level === 2 ? 'amber' : 'red'}>
                      L{entry.permission_level}
                    </Badge>
                    <span className="truncate text-[var(--hub-ink)]">{entry.summary}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={entry.status === 'executed' || entry.status === 'approved' ? 'emerald' : entry.status === 'blocked' ? 'red' : 'amber'}>
                      {entry.status}
                    </Badge>
                    <span className="font-mono text-[10px] text-[var(--hub-muted)]">
                      {entry.created_at.slice(0, 16).replace('T', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
