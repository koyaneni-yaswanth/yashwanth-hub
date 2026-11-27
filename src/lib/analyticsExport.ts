import type { AIUsageLog, Expense, FocusSession, HabitLog, Task } from '../types';
import { RANGE_META, rangeBuckets, type TimeRange } from './timeRanges.ts';

export interface RangeWindow {
  from: string;
  to: string;
  label: string;
}

export interface ProviderTelemetrySummary {
  label: string;
  value: number;
  costUSD: number;
  tokens: number;
  avgLatencyMs: number;
}

export interface AiTelemetrySummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUSD: number;
  avgLatencyMs: number;
  byProvider: ProviderTelemetrySummary[];
  recentLogs: AIUsageLog[];
}

export interface AnalyticsExportSnapshot {
  exportedAt: string;
  range: TimeRange;
  rangeLabel: string;
  window: RangeWindow;
  tasks: {
    total: number;
    open: number;
    completed: number;
    overdue: number;
  };
  focusMinutesInRange: number;
  habitCheckinsInRange: number;
  spendInRangeINR: number;
  aiTelemetry: AiTelemetrySummary;
}

/** Computes inclusive local YYYY-MM-DD bounds for an Analytics TimeRange. */
export function computeRangeWindow(range: TimeRange, today: string): RangeWindow {
  const buckets = rangeBuckets(range, today);
  const from = buckets[0]?.from ?? today;
  const to = buckets[buckets.length - 1]?.to ?? today;
  return { from, to, label: RANGE_META[range].long };
}

/** Aggregates real Dexie AIUsageLog rows within the active YYYY-MM-DD window. */
export function summarizeAiTelemetry(logs: AIUsageLog[], window: Pick<RangeWindow, 'from' | 'to'>): AiTelemetrySummary {
  const inRange = logs.filter((log) => {
    const day = (log.timestamp || '').slice(0, 10);
    return day >= window.from && day <= window.to;
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUSD = 0;
  let totalLatency = 0;

  const grouped = new Map<string, { calls: number; costUSD: number; tokens: number; latencySum: number }>();

  for (const log of inRange) {
    const inTok = Math.max(0, Number(log.tokensInput) || 0);
    const outTok = Math.max(0, Number(log.tokensOutput) || 0);
    const cost = Math.max(0, Number(log.estimatedCostUSD) || 0);
    const latency = Math.max(0, Number(log.latencyMs) || 0);

    totalInputTokens += inTok;
    totalOutputTokens += outTok;
    totalCostUSD += cost;
    totalLatency += latency;

    const providerKey = String(log.provider || 'unknown');
    const prev = grouped.get(providerKey) ?? { calls: 0, costUSD: 0, tokens: 0, latencySum: 0 };
    prev.calls += 1;
    prev.costUSD += cost;
    prev.tokens += inTok + outTok;
    prev.latencySum += latency;
    grouped.set(providerKey, prev);
  }

  const byProvider: ProviderTelemetrySummary[] = [...grouped.entries()]
    .map(([label, stats]) => ({
      label,
      value: stats.calls,
      costUSD: stats.costUSD,
      tokens: stats.tokens,
      avgLatencyMs: stats.calls > 0 ? Math.round(stats.latencySum / stats.calls) : 0,
    }))
    .sort((a, b) => b.value - a.value || b.tokens - a.tokens);

  const recentLogs = inRange
    .slice()
    .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
    .slice(0, 10);

  return {
    totalCalls: inRange.length,
    totalInputTokens,
    totalOutputTokens,
    totalTokens: totalInputTokens + totalOutputTokens,
    totalCostUSD,
    avgLatencyMs: inRange.length > 0 ? Math.round(totalLatency / inRange.length) : 0,
    byProvider,
    recentLogs,
  };
}

/** Computes verified range metrics across tasks, focus, habits, expenses, and AI logs. */
export function buildAnalyticsSnapshot(params: {
  range: TimeRange;
  today: string;
  tasks: Task[];
  expenses: Expense[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  aiLogs: AIUsageLog[];
  exportedAt?: string;
}): AnalyticsExportSnapshot {
  const { range, today, tasks, expenses, habitLogs, focusSessions, aiLogs } = params;
  const window = computeRangeWindow(range, today);

  const completed = tasks.filter((t) => t.done).length;
  const open = tasks.length - completed;
  const overdue = tasks.filter((t) => !t.done && t.due_date && t.due_date < today).length;

  const focusMinutesInRange = focusSessions
    .filter((s) => s.date >= window.from && s.date <= window.to)
    .reduce((sum, s) => sum + Math.max(0, Number(s.actual_minutes) || 0), 0);

  const habitCheckinsInRange = habitLogs.filter((l) => l.date >= window.from && l.date <= window.to).length;

  const spendInRangeINR = expenses
    .filter((e) => e.date >= window.from && e.date <= window.to)
    .reduce((sum, e) => sum + Math.max(0, Number(e.amount) || 0), 0);

  return {
    exportedAt: params.exportedAt ?? new Date().toISOString(),
    range,
    rangeLabel: window.label,
    window,
    tasks: {
      total: tasks.length,
      open,
      completed,
      overdue,
    },
    focusMinutesInRange,
    habitCheckinsInRange,
    spendInRangeINR,
    aiTelemetry: summarizeAiTelemetry(aiLogs, window),
  };
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const escaped = raw.replace(/"/g, '""');
  return /[",\n\r]/.test(raw) ? `"${escaped}"` : escaped;
}

/** Formats an AnalyticsExportSnapshot into a clean CSV report. */
export function buildAnalyticsCsv(snapshot: AnalyticsExportSnapshot): string {
  const rows: (string | number)[][] = [
    ['Section', 'Metric', 'Value', 'Unit / Notes'],
    ['Overview', 'Exported At', snapshot.exportedAt, 'ISO timestamp'],
    ['Overview', 'Range', snapshot.rangeLabel, `${snapshot.window.from} to ${snapshot.window.to}`],
    ['Tasks', 'Total Tasks', snapshot.tasks.total, 'all tasks'],
    ['Tasks', 'Open Tasks', snapshot.tasks.open, 'open'],
    ['Tasks', 'Completed Tasks', snapshot.tasks.completed, 'done'],
    ['Tasks', 'Overdue Tasks', snapshot.tasks.overdue, `due before ${snapshot.window.to}`],
    ['Momentum', 'Focus Time', snapshot.focusMinutesInRange, 'minutes in range'],
    ['Momentum', 'Habit Check-ins', snapshot.habitCheckinsInRange, 'logs in range'],
    ['Finance', 'Spend in Range', snapshot.spendInRangeINR, 'INR'],
    ['AI Gateway', 'Total Calls', snapshot.aiTelemetry.totalCalls, 'requests in range'],
    ['AI Gateway', 'Total Tokens', snapshot.aiTelemetry.totalTokens, 'input + output tokens'],
    ['AI Gateway', 'Estimated Cost USD', Number(snapshot.aiTelemetry.totalCostUSD.toFixed(6)), 'USD'],
    ['AI Gateway', 'Average Latency', snapshot.aiTelemetry.avgLatencyMs, 'ms'],
  ];

  for (const p of snapshot.aiTelemetry.byProvider) {
    rows.push([
      'AI Provider',
      p.label,
      p.value,
      `${p.tokens} tokens | $${p.costUSD.toFixed(4)} | ${p.avgLatencyMs}ms avg`,
    ]);
  }

  return `${rows.map((r) => r.map(csvCell).join(',')).join('\n')}\n`;
}

export function buildAnalyticsJson(snapshot: AnalyticsExportSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
