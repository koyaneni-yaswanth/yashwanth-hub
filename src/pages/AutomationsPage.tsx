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
  Activity,
  Calendar,
  Brain,
  ShieldAlert,
  ChevronRight,
  Copy,
  Check,
  Plus,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { getSupabaseClient } from '../lib/supabase';
import {
  AutomationService,
  type AutomationDefinition,
  type AutomationExecutionLog,
  type AutomationQueueJob,
} from '../services/automationService';

export const AutomationsPage: React.FC = () => {
  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [queueJobs, setQueueJobs] = useState<AutomationQueueJob[]>([]);
  const [runs, setRuns] = useState<AutomationExecutionLog[]>([]);
  const [configured, setConfigured] = useState(true);
  const [authenticated, setAuthenticated] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [reviewingJobId, setReviewingJobId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<AutomationExecutionLog | null>(null);
  const [isLogsDrawerOpen, setIsLogsDrawerOpen] = useState(false);
  const [filterAutomationId, setFilterAutomationId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Create schedule modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newActionType, setNewActionType] = useState('task_deadline_scan');
  const [newTriggerType, setNewTriggerType] = useState<'cron' | 'one_time'>('cron');
  const [newCronExpr, setNewCronExpr] = useState('0 7 * * *');
  const [newScheduledFor, setNewScheduledFor] = useState('');
  const [newRequiresApproval, setNewRequiresApproval] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await AutomationService.loadDashboardData();
      setConfigured(data.configured);
      setAuthenticated(data.authenticated);
      setStatusMessage(data.message || null);
      setAutomations(data.automations);
      setQueueJobs(data.queue);
      setRuns(data.runs);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const client = getSupabaseClient();
    if (client) {
      const channel = client
        .channel('public:automation_v2_stream')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_runs' }, () => {
          loadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'automation_queue' }, () => {
          loadData();
        })
        .subscribe();

      return () => {
        client.removeChannel(channel);
      };
    }
  }, []);

  const handleRunNow = async (auto: AutomationDefinition) => {
    setDispatchingId(auto.id);
    setActionMessage(null);
    try {
      const res = await AutomationService.triggerServerAutomation(auto.action_type, auto.id);
      if (res.requires_approval) {
        setActionMessage('Job queued in Approval Queue. Confirm execution below.');
      } else if (res.success && res.log) {
        setActionMessage(`Executed in ${res.log.duration_ms}ms (${res.log.records_affected} records affected).`);
      } else {
        setActionMessage(res.error || 'Dispatch did not complete.');
      }
      await loadData();
    } finally {
      setDispatchingId(null);
    }
  };

  const handleToggleStatus = async (auto: AutomationDefinition) => {
    const nextStatus = auto.status === 'active' ? 'paused' : 'active';
    const res = await AutomationService.toggleStatus(auto.id, nextStatus);
    if (res.success) {
      setAutomations((prev) => prev.map((a) => (a.id === auto.id ? { ...a, status: nextStatus } : a)));
      setActionMessage(`Automation "${auto.name}" ${nextStatus === 'paused' ? 'paused' : 'resumed'}.`);
    } else {
      setActionMessage(res.error || 'Could not update automation status.');
    }
  };

  const handleReviewJob = async (jobId: string, decision: 'approve_job' | 'reject_job' | 'retry_job') => {
    setReviewingJobId(jobId);
    setActionMessage(null);
    try {
      const res = await AutomationService.reviewQueueJob(jobId, decision);
      if (res.success) {
        setActionMessage(
          decision === 'approve_job'
            ? 'Job approved and dispatched.'
            : decision === 'reject_job'
            ? 'Job rejected and cancelled.'
            : 'Job re-queued and executed.'
        );
        await loadData();
      } else {
        setActionMessage(res.error || 'Queue action failed.');
      }
    } finally {
      setReviewingJobId(null);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    setActionMessage(null);
    try {
      const res = await AutomationService.createSchedule({
        name: newName.trim(),
        description: newDescription.trim(),
        action_type: newActionType,
        trigger_type: newTriggerType,
        cron_expression: newTriggerType === 'cron' ? newCronExpr.trim() : undefined,
        scheduled_for:
          newTriggerType === 'one_time' && newScheduledFor
            ? new Date(newScheduledFor).toISOString()
            : undefined,
        timezone: 'Asia/Kolkata',
        requires_approval: newRequiresApproval,
      });

      if (res.success) {
        setIsCreateOpen(false);
        setNewName('');
        setNewDescription('');
        setNewScheduledFor('');
        setActionMessage(`Schedule "${res.automation?.name}" created on server.`);
        await loadData();
      } else {
        setActionMessage(res.error || 'Failed to create schedule.');
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenLogs = (automationId?: string, run?: AutomationExecutionLog) => {
    setFilterAutomationId(automationId || null);
    if (run) setSelectedRun(run);
    setIsLogsDrawerOpen(true);
  };

  const filteredRuns = filterAutomationId
    ? runs.filter((r) => r.automation_id === filterAutomationId)
    : runs;

  const pendingApprovals = queueJobs.filter(
    (j) => j.approval_status === 'pending_approval' && j.status !== 'cancelled'
  );
  const activeOrFailedQueue = queueJobs.filter(
    (j) =>
      j.approval_status !== 'pending_approval' &&
      (j.status === 'pending' || j.status === 'retry_scheduled' || j.status === 'processing' || j.status === 'failed')
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[var(--hub-line)]">
        <div>
          <h2 className="font-heading font-extrabold text-2xl text-[var(--hub-ink)] flex items-center gap-2">
            <Zap className="w-6 h-6 text-[var(--hub-accent)]" />
            <span>Automations & Durable Scheduler</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-1">
            Server-side cron & one-time workers backed by Supabase queue, retry backoff, and human approval gates.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleOpenLogs()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] text-xs font-semibold hover:bg-[var(--hub-line)]/50 cursor-pointer shadow-xs"
          >
            <Activity className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
            <span>Run History ({runs.length})</span>
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            disabled={!configured || !authenticated}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hub-accent)]/40 bg-[var(--hub-accent)]/10 text-[var(--hub-accent)] text-xs font-semibold hover:bg-[var(--hub-accent)]/20 cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Schedule</span>
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

      {/* Honest Server Configuration / Auth Diagnostic Banner */}
      {statusMessage && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-3">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">
              {!configured
                ? 'Automation Database Not Configured'
                : !authenticated
                ? 'Authentication Required'
                : 'Automation Engine Notice'}
            </div>
            <p className="leading-relaxed">{statusMessage}</p>
          </div>
        </div>
      )}

      {actionMessage && (
        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs hover:underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Human Approval Queue */}
      {pendingApprovals.length > 0 && (
        <div className="bg-[var(--hub-surface)] border border-amber-500/40 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>Pending Human Approvals ({pendingApprovals.length})</span>
            </h3>
            <Badge variant="amber">Confirmation Required</Badge>
          </div>
          <div className="space-y-2">
            {pendingApprovals.map((job) => (
              <div
                key={job.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]"
              >
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-[var(--hub-ink)]">
                    Action: <code className="font-mono">{job.action_type}</code>
                  </div>
                  <div className="text-[11px] text-[var(--hub-muted)]">
                    Source: {job.trigger_source} • Queued {new Date(job.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReviewJob(job.id, 'approve_job')}
                    disabled={reviewingJobId === job.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                    <span>Approve & Run</span>
                  </button>
                  <button
                    onClick={() => handleReviewJob(job.id, 'reject_job')}
                    disabled={reviewingJobId === job.id}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 text-xs font-semibold hover:bg-red-500/10 cursor-pointer disabled:opacity-50"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automations Grid */}
      {automations.length === 0 && !isLoading ? (
        <div className="bg-[var(--hub-surface)] border border-dashed border-[var(--hub-line)] rounded-xl p-8 text-center space-y-2">
          <Clock className="w-7 h-7 text-[var(--hub-muted)] mx-auto" />
          <div className="text-sm font-bold text-[var(--hub-ink)]">No Scheduled Automations Loaded</div>
          <p className="text-xs text-[var(--hub-muted)] max-w-md mx-auto">
            {configured && authenticated
              ? 'Create your first recurring cron or one-time automation schedule using the "New Schedule" button above.'
              : 'Connect your Supabase session and verify server environment configuration to manage scheduled automations.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {automations.map((auto) => {
            const autoRuns = runs.filter((r) => r.automation_id === auto.id);
            const lastRun = autoRuns[0];
            const isDispatching = dispatchingId === auto.id;
            const cronLabel =
              auto.trigger_type === 'one_time'
                ? `One-time: ${auto.scheduled_for || auto.trigger_config?.scheduled_for || 'Unscheduled'}`
                : `${auto.cron_expression || auto.trigger_config?.cron_expression || '0 * * * *'} (${
                    auto.timezone || auto.trigger_config?.timezone || 'Asia/Kolkata'
                  })`;

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
                          <span>{cronLabel}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {auto.requires_approval && <Badge variant="purple">Approval Gate</Badge>}
                      <Badge
                        variant={
                          auto.status === 'active'
                            ? 'emerald'
                            : auto.status === 'paused' || auto.status === 'completed'
                            ? 'amber'
                            : auto.status === 'needs_authorization'
                            ? 'purple'
                            : 'red'
                        }
                      >
                        {auto.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </div>

                  {auto.description && (
                    <p className="text-xs text-[var(--hub-muted)] leading-relaxed">{auto.description}</p>
                  )}
                </div>

                <div className="bg-[var(--hub-line)]/20 rounded-lg p-3 text-xs space-y-1.5 border border-[var(--hub-line)]/40">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--hub-muted)]">Next Scheduled Run:</span>
                    <span className="font-medium text-[var(--hub-ink)]">
                      {auto.next_run_at || auto.trigger_config?.next_run_at
                        ? new Date(auto.next_run_at || auto.trigger_config.next_run_at!).toLocaleString()
                        : 'Pending first tick'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--hub-muted)]">Last Server Run:</span>
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
                        <span className="text-[var(--hub-muted)]">No runs yet</span>
                      )}
                    </span>
                  </div>
                </div>

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
      )}

      {/* Durable Queue & Retry Inspector */}
      {activeOrFailedQueue.length > 0 && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-3">
          <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-[var(--hub-accent)]" />
            <span>Queued & Retry Jobs ({activeOrFailedQueue.length})</span>
          </h3>
          <div className="divide-y divide-[var(--hub-line)] text-xs">
            {activeOrFailedQueue.map((q) => (
              <div key={q.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        q.status === 'retry_scheduled'
                          ? 'amber'
                          : q.status === 'failed'
                          ? 'red'
                          : 'blue'
                      }
                    >
                      {q.status.toUpperCase()}
                    </Badge>
                    <span className="font-mono font-semibold text-[var(--hub-ink)]">{q.action_type}</span>
                    <span className="text-[var(--hub-muted)]">
                      Retry {q.retry_count}/{q.max_retries}
                    </span>
                  </div>
                  {q.error_message && (
                    <div className="text-[11px] text-red-500">{q.error_message}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--hub-muted)]">
                    Scheduled: {new Date(q.scheduled_for).toLocaleString()}
                  </span>
                  {(q.status === 'failed' || q.status === 'retry_scheduled') && (
                    <button
                      onClick={() => handleReviewJob(q.id, 'retry_job')}
                      disabled={reviewingJobId === q.id}
                      className="px-2.5 py-1 rounded border border-[var(--hub-accent)] text-[var(--hub-accent)] font-semibold hover:bg-[var(--hub-accent)]/10 cursor-pointer"
                    >
                      Retry Now
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution History Table */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div>
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--hub-accent)]" />
            <span>Execution Run Audit Trail (Supabase)</span>
          </h3>
          <p className="text-xs text-[var(--hub-muted)] mt-0.5">
            Every server execution produces an immutable run row with latency metrics and output payloads.
          </p>
        </div>

        {runs.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--hub-muted)]">
            No verified execution runs recorded yet.
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
                {runs.slice(0, 12).map((run) => (
                  <tr key={run.id} className="hover:bg-[var(--hub-line)]/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--hub-ink)]">
                      {run.id.substring(0, 8)}...
                    </td>
                    <td className="py-2.5 px-3 text-[var(--hub-ink)] font-medium">
                      <span className="capitalize">{run.trigger_source.replace(/_/g, ' ')}</span>
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
                      {typeof run.duration_ms === 'number' ? `${run.duration_ms}ms` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--hub-muted)]">{run.retry_count}</td>
                    <td className="py-2.5 px-3 text-[var(--hub-muted)]">
                      {new Date(run.created_at).toLocaleString()}
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

      {/* Create Schedule Modal */}
      {isCreateOpen && (
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Server Automation Schedule">
          <form onSubmit={handleCreateSchedule} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-[var(--hub-ink)] mb-1">Automation Name</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Daily 7 AM Briefing"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              />
            </div>

            <div>
              <label className="block font-bold text-[var(--hub-ink)] mb-1">Description</label>
              <input
                type="text"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="What this server job performs"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-[var(--hub-ink)] mb-1">Server Action</label>
                <select
                  value={newActionType}
                  onChange={(e) => setNewActionType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                >
                  <option value="task_deadline_scan">Task & Meeting Deadline Scan</option>
                  <option value="morning_briefing">AI Executive Briefing</option>
                  <option value="neosapien_mcp">NeoSapien Wearable MCP Sync</option>
                  <option value="google_calendar">Google Calendar Sync</option>
                  <option value="google_gmail">Google Gmail Scan</option>
                  <option value="isolated_scheduled_check">Isolated Verification Check</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[var(--hub-ink)] mb-1">Schedule Type</label>
                <select
                  value={newTriggerType}
                  onChange={(e) => setNewTriggerType(e.target.value as 'cron' | 'one_time')}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                >
                  <option value="cron">Recurring (5-Field Cron, IST)</option>
                  <option value="one_time">One-Time Scheduled Run</option>
                </select>
              </div>
            </div>

            {newTriggerType === 'cron' ? (
              <div>
                <label className="block font-bold text-[var(--hub-ink)] mb-1">Cron Expression (Asia/Kolkata)</label>
                <input
                  type="text"
                  required
                  value={newCronExpr}
                  onChange={(e) => setNewCronExpr(e.target.value)}
                  placeholder="0 7 * * *"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] font-mono text-[var(--hub-ink)]"
                />
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {[
                    { label: 'Daily 7 AM', val: '0 7 * * *' },
                    { label: 'Hourly', val: '0 * * * *' },
                    { label: 'Every 2h', val: '0 */2 * * *' },
                    { label: 'Mon 9 AM', val: '0 9 * * 1' },
                  ].map((p) => (
                    <button
                      type="button"
                      key={p.val}
                      onClick={() => setNewCronExpr(p.val)}
                      className="px-2 py-0.5 rounded bg-[var(--hub-line)]/40 text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                    >
                      {p.label} ({p.val})
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="block font-bold text-[var(--hub-ink)] mb-1">Run At (Local Time)</label>
                <input
                  type="datetime-local"
                  required
                  value={newScheduledFor}
                  onChange={(e) => setNewScheduledFor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                />
              </div>
            )}

            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={newRequiresApproval}
                onChange={(e) => setNewRequiresApproval(e.target.checked)}
              />
              <span className="text-[var(--hub-ink)] font-medium">
                Require human confirmation in Approval Queue before executing
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-4 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer disabled:opacity-50"
              >
                {isCreating ? 'Saving...' : 'Create Schedule'}
              </button>
            </div>
          </form>
        </Modal>
      )}

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
