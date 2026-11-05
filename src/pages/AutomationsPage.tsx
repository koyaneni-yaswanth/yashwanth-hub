import React, { useState, useEffect } from 'react';
import {
  Zap,
  Play,
  Pause,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  FileCode,
  Terminal,
  Activity,
  Calendar,
  Brain,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Layers,
  Copy,
  Check,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { getSupabaseClient } from '../lib/supabase';

export interface AutomationItem {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  trigger_type: 'cron' | 'event' | 'webhook' | 'manual';
  trigger_config: {
    cron_expression?: string;
    timezone?: string;
    next_run_at?: string;
    last_run_at?: string;
  };
  action_type: string;
  action_config: Record<string, any>;
  status: 'active' | 'paused' | 'error' | 'needs_authorization';
  created_at: string;
  updated_at: string;
}

export interface AutomationRunItem {
  id: string;
  automation_id: string;
  user_id?: string;
  trigger_source: 'cron_vercel' | 'pg_cron' | 'manual' | 'webhook' | 'event';
  status: 'queued' | 'running' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  input_payload?: Record<string, any>;
  output_payload?: Record<string, any>;
  error_log?: string;
  retry_count: number;
  idempotency_key?: string;
  created_at: string;
}

export const AutomationsPage: React.FC = () => {
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [runs, setRuns] = useState<AutomationRunItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<AutomationRunItem | null>(null);
  const [isLogsDrawerOpen, setIsLogsDrawerOpen] = useState(false);
  const [filterAutomationId, setFilterAutomationId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Load live data directly from Supabase / server API
  const loadData = async () => {
    setIsLoading(true);
    try {
      const client = getSupabaseClient();
      if (client) {
        const [autoRes, runsRes] = await Promise.all([
          client.from('automations').select('*').order('created_at', { ascending: true }),
          client.from('automation_runs').select('*').order('created_at', { ascending: false }).limit(40),
        ]);

        if (autoRes.data && autoRes.data.length > 0) {
          setAutomations(autoRes.data as AutomationItem[]);
        } else {
          // If table empty, fallback to seed endpoint or default system automations
          fetchFallbackAutomations();
        }

        if (runsRes.data) {
          setRuns(runsRes.data as AutomationRunItem[]);
        }
      } else {
        fetchFallbackAutomations();
      }
    } catch (err) {
      console.warn('[AutomationsPage] Error loading data:', err);
      fetchFallbackAutomations();
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFallbackAutomations = async () => {
    try {
      const res = await fetch('/api/automations');
      if (res.ok) {
        const json = await res.json();
        if (json.automations && json.automations.length > 0) {
          setAutomations(json.automations);
        }
        if (json.recentExecutionLogs) {
          setRuns(json.recentExecutionLogs);
        }
      }
    } catch {
      // Offline fallback state with real system definitions
      setAutomations([
        {
          id: 'a0000000-0000-0000-0000-000000000001',
          name: 'Executive Morning Briefing',
          description: 'Daily 07:00 AM IST executive briefing synthesizing high-priority tasks, calendar events, and hardware milestones.',
          trigger_type: 'cron',
          trigger_config: { cron_expression: '0 7 * * *', timezone: 'Asia/Kolkata' },
          action_type: 'morning_briefing',
          action_config: { priority_threshold: 'high' },
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'a0000000-0000-0000-0000-000000000002',
          name: 'Task Deadline & Meeting Scanner',
          description: 'Hourly server-side scan detecting tasks past due date and meetings starting within 45 minutes.',
          trigger_type: 'cron',
          trigger_config: { cron_expression: '0 * * * *', timezone: 'Asia/Kolkata' },
          action_type: 'task_deadline_scan',
          action_config: { lead_time_minutes: 45 },
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'a0000000-0000-0000-0000-000000000003',
          name: 'NeoSapien Wearable & MCP Memory Sync',
          description: 'Bi-hourly automated synchronization pulling Neo 1 wearable conversations via official NeoSapien MCP.',
          trigger_type: 'cron',
          trigger_config: { cron_expression: '0 */2 * * *', timezone: 'Asia/Kolkata' },
          action_type: 'neosapien_mcp',
          action_config: { mcp_endpoint: 'https://api.neosapien.xyz/mcp' },
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to Supabase Realtime for live run updates
    const client = getSupabaseClient();
    if (client) {
      const channel = client
        .channel('public:automation_runs')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'automation_runs' },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setRuns((prev) => [payload.new as AutomationRunItem, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setRuns((prev) =>
                prev.map((r) => (r.id === payload.new.id ? (payload.new as AutomationRunItem) : r))
              );
            }
          }
        )
        .subscribe();

      return () => {
        client.removeChannel(channel);
      };
    }
  }, []);

  // Action: Trigger "Run Now" via /api/automations/dispatch
  const handleRunNow = async (auto: AutomationItem) => {
    setDispatchingId(auto.id);
    setActionMessage(null);
    try {
      const idempotencyKey = `manual_${auto.id}_${Date.now()}`;
      const client = getSupabaseClient();
      let token: string | undefined = undefined;
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        token = session?.access_token;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/automations/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          automation_id: auto.id,
          action_type: auto.action_type,
          trigger_source: 'manual',
          idempotency_key: idempotencyKey,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setActionMessage(`Run executed in ${data.duration_ms}ms (Status: ${data.status}).`);
        loadData();
      } else {
        setActionMessage(`Dispatch error: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setActionMessage(`Network error triggering automation: ${err.message}`);
    } finally {
      setDispatchingId(null);
    }
  };

  // Action: Toggle Pause / Resume
  const handleToggleStatus = async (auto: AutomationItem) => {
    const nextStatus = auto.status === 'active' ? 'paused' : 'active';
    try {
      const client = getSupabaseClient();
      if (client) {
        await client
          .from('automations')
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq('id', auto.id);
      }
      setAutomations((prev) =>
        prev.map((a) => (a.id === auto.id ? { ...a, status: nextStatus } : a))
      );
    } catch (err: any) {
      console.warn('Could not toggle automation status:', err);
    }
  };

  // Helper to open drawer for a specific automation or global run
  const handleOpenLogs = (automationId?: string, run?: AutomationRunItem) => {
    setFilterAutomationId(automationId || null);
    if (run) setSelectedRun(run);
    setIsLogsDrawerOpen(true);
  };

  const filteredRuns = filterAutomationId
    ? runs.filter((r) => r.automation_id === filterAutomationId)
    : runs;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[var(--hub-line)]">
        <div>
          <h2 className="font-heading font-extrabold text-2xl text-[var(--hub-ink)] flex items-center gap-2">
            <Zap className="w-6 h-6 text-[var(--hub-accent)]" />
            <span>Server-Side Automations Engine</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-1">
            Autonomous background workers running on Vercel Serverless & Supabase Queue. Zero browser intervals, guaranteed idempotency.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenLogs()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] text-xs font-semibold hover:bg-[var(--hub-line)]/50 cursor-pointer shadow-xs"
          >
            <Activity className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
            <span>Execution Audit Trail ({runs.length})</span>
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs hover:underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Automations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {automations.map((auto) => {
          const autoRuns = runs.filter((r) => r.automation_id === auto.id);
          const lastRun = autoRuns[0];
          const isDispatching = dispatchingId === auto.id;

          return (
            <div
              key={auto.id}
              className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-[var(--hub-accent)]/50 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[var(--hub-accent)]/10 text-[var(--hub-accent)] flex items-center justify-center font-bold">
                      {auto.action_type.includes('google') ? (
                        <Calendar className="w-4 h-4" />
                      ) : auto.action_type.includes('neo') ? (
                        <Brain className="w-4 h-4" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)]">{auto.name}</h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-[var(--hub-muted)] mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>Schedule: {auto.trigger_config?.cron_expression || '0 * * * *'} ({auto.trigger_config?.timezone || 'Asia/Kolkata'})</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <Badge
                    variant={
                      auto.status === 'active'
                        ? 'emerald'
                        : auto.status === 'paused'
                        ? 'amber'
                        : auto.status === 'needs_authorization'
                        ? 'purple'
                        : 'red'
                    }
                  >
                    {auto.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>

                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">{auto.description}</p>
              </div>

              {/* Last Run Metrics */}
              <div className="bg-[var(--hub-line)]/20 rounded-lg p-3 text-xs space-y-1.5 border border-[var(--hub-line)]/40">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--hub-muted)]">Last Server Execution:</span>
                  <span className="font-medium text-[var(--hub-ink)]">
                    {lastRun?.completed_at ? new Date(lastRun.completed_at).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--hub-muted)]">Run Result & Latency:</span>
                  <span className="font-medium flex items-center gap-1.5">
                    {lastRun?.status === 'completed' ? (
                      <span className="text-emerald-500 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> {lastRun.duration_ms}ms
                      </span>
                    ) : lastRun?.status === 'failed' ? (
                      <span className="text-red-500 font-semibold flex items-center gap-1">
                        <XCircle className="w-3 h-3" /> Failed
                      </span>
                    ) : (
                      <span className="text-[var(--hub-muted)]">Idle</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--hub-line)]/50">
                <button
                  onClick={() => handleOpenLogs(auto.id, lastRun)}
                  className="text-xs text-[var(--hub-accent)] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>View Run Logs</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleStatus(auto)}
                    className="p-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-line)]/40 cursor-pointer"
                    title={auto.status === 'active' ? 'Pause Automation' : 'Resume Automation'}
                  >
                    {auto.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => handleRunNow(auto)}
                    disabled={isDispatching}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
                  >
                    <Play className={`w-3 h-3 ${isDispatching ? 'animate-spin' : ''}`} />
                    <span>{isDispatching ? 'Dispatching...' : 'Run Now'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution History Table */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[var(--hub-accent)]" />
              <span>Real-Time Execution Logs (Supabase)</span>
            </h3>
            <p className="text-xs text-[var(--hub-muted)] mt-0.5">
              Verified serverless run history. Every execution is backed by database records with timing and payload traces.
            </p>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--hub-muted)]">
            No execution logs recorded yet. Click "Run Now" on any automation to trigger a verified server execution.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--hub-line)]/30 text-[var(--hub-muted)] uppercase tracking-wider font-semibold border-b border-[var(--hub-line)]">
                <tr>
                  <th className="py-2.5 px-3">Run ID</th>
                  <th className="py-2.5 px-3">Source</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Retries</th>
                  <th className="py-2.5 px-3">Executed At</th>
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hub-line)]">
                {runs.slice(0, 10).map((run) => (
                  <tr key={run.id} className="hover:bg-[var(--hub-line)]/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--hub-ink)]">
                      {run.id.substring(0, 8)}...
                    </td>
                    <td className="py-2.5 px-3 text-[var(--hub-ink)] font-medium">
                      <span className="capitalize">{run.trigger_source.replace('_', ' ')}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant={
                          run.status === 'completed'
                            ? 'emerald'
                            : run.status === 'running'
                            ? 'amber'
                            : run.status === 'queued'
                            ? 'blue'
                            : 'red'
                        }
                      >
                        {run.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[var(--hub-ink)]">
                      {run.duration_ms ? `${run.duration_ms}ms` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--hub-muted)]">{run.retry_count}</td>
                    <td className="py-2.5 px-3 text-[var(--hub-muted)]">
                      {new Date(run.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedRun(run);
                          setIsLogsDrawerOpen(true);
                        }}
                        className="text-[var(--hub-accent)] hover:underline font-semibold cursor-pointer"
                      >
                        View JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Execution Details Drawer / Modal */}
      {isLogsDrawerOpen && (
        <Modal
          isOpen={isLogsDrawerOpen}
          onClose={() => {
            setIsLogsDrawerOpen(false);
            setSelectedRun(null);
          }}
          title={selectedRun ? `Run Details: ${selectedRun.id.substring(0, 8)}...` : 'Execution Logs'}
        >
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {selectedRun ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--hub-line)]/20 p-3 rounded-lg border border-[var(--hub-line)]">
                  <div>
                    <span className="text-[var(--hub-muted)] block">Trigger Source:</span>
                    <span className="font-semibold text-[var(--hub-ink)]">{selectedRun.trigger_source}</span>
                  </div>
                  <div>
                    <span className="text-[var(--hub-muted)] block">Duration:</span>
                    <span className="font-semibold text-[var(--hub-ink)]">{selectedRun.duration_ms}ms</span>
                  </div>
                  <div>
                    <span className="text-[var(--hub-muted)] block">Status:</span>
                    <Badge variant={selectedRun.status === 'completed' ? 'emerald' : 'red'}>
                      {selectedRun.status.toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-[var(--hub-muted)] block">Idempotency Key:</span>
                    <span className="font-mono text-[10px] text-[var(--hub-ink)] break-all">
                      {selectedRun.idempotency_key || 'N/A'}
                    </span>
                  </div>
                </div>

                {selectedRun.error_log && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-red-500 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Execution Error Log / Stack Trace</span>
                    </label>
                    <pre className="p-3 rounded-lg bg-red-950/20 border border-red-500/30 text-red-400 font-mono text-[11px] overflow-x-auto whitespace-pre-wrap">
                      {selectedRun.error_log}
                    </pre>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-[var(--hub-ink)] flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                      <span>Output Payload (JSON)</span>
                    </label>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(selectedRun.output_payload, null, 2));
                        setCopiedKey(true);
                        setTimeout(() => setCopiedKey(false), 2000);
                      }}
                      className="text-xs text-[var(--hub-accent)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-lg bg-[var(--hub-line)]/30 border border-[var(--hub-line)] font-mono text-[11px] text-[var(--hub-ink)] overflow-x-auto">
                    {JSON.stringify(selectedRun.output_payload || {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-[var(--hub-muted)]">
                  Showing execution history for {filterAutomationId ? 'selected automation' : 'all automations'}.
                </p>
                <div className="divide-y divide-[var(--hub-line)]">
                  {filteredRuns.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => setSelectedRun(r)}
                      className="py-2.5 flex items-center justify-between hover:bg-[var(--hub-line)]/20 p-2 rounded-lg cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={r.status === 'completed' ? 'emerald' : 'red'}>{r.status}</Badge>
                        <span className="text-xs font-medium text-[var(--hub-ink)]">{r.trigger_source}</span>
                      </div>
                      <span className="font-mono text-xs text-[var(--hub-muted)]">{r.duration_ms}ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
