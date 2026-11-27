import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bot, Clock, Cpu, Download, Flame, Timer } from 'lucide-react';
import { db } from '../../db';
import type { Expense, FocusSession, HabitLog, NavigationTab, Task } from '../../types';
import type { TimeRange } from '../../lib/timeRanges';
import { buildAnalyticsCsv, buildAnalyticsJson, buildAnalyticsSnapshot } from '../../lib/analyticsExport';
import { ChartCard } from '../charts/ChartCard';
import { RankedBars } from '../charts/RankedBars';
import { StatCard } from '../common/StatCard';

interface AnalyticsSnapshotProps {
  range: TimeRange;
  today: string;
  allTasks: Task[];
  allExpenses: Expense[];
  habitLogs: HabitLog[];
  focusSessions: FocusSession[];
  onNavigate: (tab: NavigationTab) => void;
}

function triggerFileDownload(filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Export actions for the Analytics header/filter bar using verified local DB metrics. */
export const AnalyticsExportControls: React.FC<AnalyticsSnapshotProps> = ({
  range,
  today,
  allTasks,
  allExpenses,
  habitLogs,
  focusSessions,
}) => {
  const aiLogs = useLiveQuery(() => db.ai_logs.toArray(), []) || [];

  const createSnapshot = () =>
    buildAnalyticsSnapshot({
      range,
      today,
      tasks: allTasks,
      expenses: allExpenses,
      habitLogs,
      focusSessions,
      aiLogs,
    });

  return (
    <div className="flex items-center gap-2 ml-auto">
      <button
        type="button"
        onClick={() => triggerFileDownload(`yashwanth-hub-analytics-${today}.csv`, 'text/csv;charset=utf-8', buildAnalyticsCsv(createSnapshot()))}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
        title="Download executive summary & AI telemetry as CSV"
      >
        <Download className="w-3.5 h-3.5 text-[var(--hub-accent)]" aria-hidden="true" />
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => triggerFileDownload(`yashwanth-hub-analytics-${today}.json`, 'application/json;charset=utf-8', buildAnalyticsJson(createSnapshot()))}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
        title="Download structured analytics snapshot as JSON"
      >
        <Download className="w-3.5 h-3.5 text-[var(--hub-accent)]" aria-hidden="true" />
        Export JSON
      </button>
    </div>
  );
};

/** Displays Focus velocity, Habit check-ins, and AI Gateway telemetry scoped to the active TimeRange. */
export const AiTelemetryPanel: React.FC<AnalyticsSnapshotProps> = ({
  range,
  today,
  allTasks,
  allExpenses,
  habitLogs,
  focusSessions,
  onNavigate,
}) => {
  const aiLogs = useLiveQuery(() => db.ai_logs.toArray(), []) || [];
  const activeHabits = useLiveQuery(() => db.habits.filter((h) => !h.archived).toArray(), []) || [];

  const snapshot = buildAnalyticsSnapshot({
    range,
    today,
    tasks: allTasks,
    expenses: allExpenses,
    habitLogs,
    focusSessions,
    aiLogs,
  });

  const { aiTelemetry } = snapshot;
  const focusHours = (snapshot.focusMinutesInRange / 60).toFixed(1);

  return (
    <section aria-label="Focus, Habit & AI Gateway Telemetry" className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Focus in range"
          value={`${snapshot.focusMinutesInRange}m`}
          subtext={`${focusHours} hrs across ${snapshot.rangeLabel}`}
          icon={<Timer className="w-5 h-5 text-[var(--hub-accent)]" />}
          onClick={() => onNavigate('focus')}
        />
        <StatCard
          label="Habit check-ins"
          value={snapshot.habitCheckinsInRange}
          subtext={`${activeHabits.length} active habit${activeHabits.length === 1 ? '' : 's'} tracked`}
          icon={<Flame className="w-5 h-5 text-amber-600 dark:text-amber-300" />}
          onClick={() => onNavigate('learning-career')}
        />
        <StatCard
          label="AI Gateway calls"
          value={aiTelemetry.totalCalls}
          subtext={
            aiTelemetry.totalCalls > 0
              ? `${aiTelemetry.totalTokens.toLocaleString()} tok · $${aiTelemetry.totalCostUSD.toFixed(4)} · ${aiTelemetry.avgLatencyMs}ms`
              : `No AI calls in ${snapshot.rangeLabel}`
          }
          icon={<Cpu className="w-5 h-5 text-[var(--hub-accent)]" />}
          onClick={() => onNavigate('ai-assistant')}
        />
      </div>

      <ChartCard
        title="AI Gateway usage by provider"
        subtitle={
          aiTelemetry.totalCalls > 0
            ? `${aiTelemetry.totalCalls} request${aiTelemetry.totalCalls === 1 ? '' : 's'} · ${aiTelemetry.totalTokens.toLocaleString()} tokens · est. $${aiTelemetry.totalCostUSD.toFixed(4)}`
            : `Token & latency telemetry for the ${snapshot.rangeLabel}`
        }
        tableColumns={['Provider', 'Requests', 'Tokens', 'Est. Cost', 'Avg Latency']}
        tableRows={aiTelemetry.byProvider.map((p) => ({
          label: p.label,
          cells: [String(p.value), p.tokens.toLocaleString(), `$${p.costUSD.toFixed(4)}`, `${p.avgLatencyMs}ms`],
        }))}
        empty={
          aiTelemetry.totalCalls === 0 ? (
            <div className="space-y-3">
              <p>
                No AI Gateway calls logged in the {snapshot.rangeLabel}. Use Ask AI or JARVIS Buddy to record real token, latency, and cost telemetry.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onNavigate('ai-assistant')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] hover:bg-[var(--hub-accent-hover)] cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5" aria-hidden="true" />
                  Open Ask AI
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('buddy')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer"
                >
                  <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                  Open JARVIS Buddy
                </button>
              </div>
            </div>
          ) : undefined
        }
      >
        <RankedBars
          data={aiTelemetry.byProvider.map((p) => ({ key: p.label, label: p.label, value: p.value }))}
          label="AI Gateway calls by provider"
          format={(v) => `${v} req`}
          showShare
        />
      </ChartCard>
    </section>
  );
};
