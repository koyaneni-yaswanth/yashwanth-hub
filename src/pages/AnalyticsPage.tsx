import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  Wind,
} from 'lucide-react';
import { db } from '../db';
import type { Area } from '../types';
import { formatINR, getTodayISO, isOverdue } from '../lib/utils';
import { StatCard } from '../components/common/StatCard';
import { ChartCard } from '../components/charts/ChartCard';
import { ColumnChart, type ColumnDatum } from '../components/charts/ColumnChart';
import { RankedBars, type RankedDatum } from '../components/charts/RankedBars';
import { SegmentedBar, type Segment } from '../components/charts/SegmentedBar';
import { addDays, parseDateKey, weekStart } from '../lib/habits';

interface AnalyticsPageProps {
  currentArea: string;
  areas: Area[];
  onNavigate: (tab: any) => void;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  currentArea,
  areas,
  onNavigate,
}) => {
  const today = getTodayISO();
  const currentMonth = today.slice(0, 7);

  // Time range for the trend and spending charts (open-task charts are always "right now").
  const [rangeWeeks, setRangeWeeks] = useState<4 | 8 | 12>(8);
  const thisWeek = weekStart(today);
  const rangeStart = addDays(thisWeek, -(rangeWeeks - 1) * 7);
  const inRange = (date: string) => date >= rangeStart;

  // Queries
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];

  // Filter based on selected area
  const tasks = currentArea === 'All' ? allTasks : allTasks.filter((t) => t.area === currentArea);
  const expenses = currentArea === 'All' ? allExpenses : allExpenses.filter((e) => e.area === currentArea);

  // Task Analytics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.done).length;
  const openTasks = tasks.filter((t) => !t.done).length;
  const overdueTasks = tasks.filter((t) => isOverdue(t.due_date, t.done)).length;
  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Expense Analytics
  const currentMonthExpenses = expenses.filter((e) => e.date.startsWith(currentMonth));
  const currentMonthSpend = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Area distribution calculations
  const areaTaskCounts: Record<string, { total: number; done: number; spend: number }> = {};
  areas.forEach((a) => {
    areaTaskCounts[a.name] = { total: 0, done: 0, spend: 0 };
  });

  allTasks.forEach((t) => {
    if (!areaTaskCounts[t.area]) {
      areaTaskCounts[t.area] = { total: 0, done: 0, spend: 0 };
    }
    areaTaskCounts[t.area].total++;
    if (t.done) areaTaskCounts[t.area].done++;
  });

  allExpenses.filter((e) => inRange(e.date)).forEach((e) => {
    if (!areaTaskCounts[e.area]) {
      areaTaskCounts[e.area] = { total: 0, done: 0, spend: 0 };
    }
    areaTaskCounts[e.area].spend += e.amount;
  });

  // Category breakdown for expenses
  const categoryTotals: Record<string, number> = {};
  expenses.filter((e) => inRange(e.date)).forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  // Priority distribution
  const priorityCounts = {
    urgent: tasks.filter((t) => t.priority === 'urgent' && !t.done).length,
    high: tasks.filter((t) => t.priority === 'high' && !t.done).length,
    medium: tasks.filter((t) => t.priority === 'medium' && !t.done).length,
    low: tasks.filter((t) => t.priority === 'low' && !t.done).length,
  };

  // Wind 90-Day Plan metrics
  const planTasks = allTasks.filter((t) => t.plan !== undefined);
  const planCompleted = planTasks.filter((t) => t.done).length;
  const planRate = planTasks.length > 0 ? Math.round((planCompleted / planTasks.length) * 100) : 0;

  // --- Chart data ---
  const areaColor = (name: string) => areas.find((a) => a.name === name)?.color;
  const areaRows: RankedDatum[] = Object.entries(areaTaskCounts)
    .map(([name, d]) => ({ key: name, label: name, value: d.total - d.done, swatch: areaColor(name) }))
    .filter((r) => r.value > 0 || areas.some((a) => a.name === r.label));
  const spendRows: RankedDatum[] = Object.entries(areaTaskCounts).map(([name, d]) => ({
    key: name,
    label: name,
    value: d.spend,
    swatch: areaColor(name),
  }));
  const categoryRows: RankedDatum[] = Object.entries(categoryTotals).map(([cat, v]) => ({ key: cat, label: cat, value: v }));
  const prioritySegments: Segment[] = [
    { key: 'urgent', label: 'Urgent', value: priorityCounts.urgent, color: 'var(--viz-ord-4)', ink: 'var(--viz-ord-4-ink)' },
    { key: 'high', label: 'High', value: priorityCounts.high, color: 'var(--viz-ord-3)', ink: 'var(--viz-ord-3-ink)' },
    { key: 'medium', label: 'Medium', value: priorityCounts.medium, color: 'var(--viz-ord-2)', ink: 'var(--viz-ord-2-ink)' },
    { key: 'low', label: 'Low', value: priorityCounts.low, color: 'var(--viz-ord-1)', ink: 'var(--viz-ord-1-ink)' },
  ];
  const rangeSpend = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
  const rangeLabel = `last ${rangeWeeks} weeks`;
  const weeklyDone: ColumnDatum[] = Array.from({ length: rangeWeeks }, (_, i) => {
    const wk = addDays(thisWeek, (i - (rangeWeeks - 1)) * 7);
    const end = addDays(wk, 6);
    const d = parseDateKey(wk);
    return {
      key: wk,
      label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      longLabel: `Week of ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`,
      value: tasks.filter((t) => t.done && t.updated_at && t.updated_at.slice(0, 10) >= wk && t.updated_at.slice(0, 10) <= end).length,
      current: wk === thisWeek,
    };
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
          Executive Analytics & Metrics
        </h2>
        <p className="text-sm text-[var(--hub-muted)] mt-0.5">
          Real-time productivity velocity, budget consumption, and workspace distribution
        </p>
      </div>

      {/* Top Level KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <StatCard
          label="Task Completion"
          value={`${taskCompletionRate}%`}
          subtext={`${completedTasks} of ${totalTasks} completed`}
          icon={<CheckCircle2 className="w-5 h-5 text-teal-700 dark:text-teal-300" />}
        />
        <StatCard
          label="Month Burn Rate"
          value={currentMonthSpend === 0 ? '₹0' : formatINR(currentMonthSpend)}
          subtext={currentMonthSpend === 0 ? 'No expenses logged • Manually entered only' : `Cycle: ${currentMonth}`}
          icon={<IndianRupee className="w-5 h-5 text-amber-800 dark:text-amber-300" />}
        />
        <StatCard
          label="Overdue Backlog"
          value={overdueTasks}
          subtext={overdueTasks === 0 ? 'Zero overdue items' : 'Requires immediate attention'}
          icon={<AlertCircle className={`w-5 h-5 ${overdueTasks > 0 ? 'text-red-700 dark:text-red-300' : 'text-teal-700 dark:text-teal-300'}`} />}
        />
        <StatCard
          label="Wind TRL Progress"
          value={`${planRate}%`}
          subtext={`${planCompleted} of ${planTasks.length} milestones`}
          icon={<Wind className="w-5 h-5 text-teal-700 dark:text-teal-300" />}
          onClick={() => onNavigate('wind-plan')}
        />
      </div>

      {/* One filter row scoping the time-based charts below */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time range for trend and spending charts">
        <span className="text-sm font-semibold text-[var(--hub-ink)] mr-1">Time range</span>
        {([4, 8, 12] as const).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setRangeWeeks(w)}
            aria-pressed={rangeWeeks === w}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
              rangeWeeks === w
                ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] border-[var(--hub-accent)]'
                : 'bg-[var(--hub-surface)] text-[var(--hub-ink)] border-[var(--hub-line)] hover:bg-[var(--hub-surface-hover)]'
            }`}
          >
            Last {w} weeks
          </button>
        ))}
        <span className="text-xs text-[var(--hub-muted)]">Open-task charts always show right now.</span>
      </div>

      {/* Weekly completions */}
      <ChartCard
        title="Tasks completed per week"
        subtitle={`${weeklyDone.reduce((a, w) => a + w.value, 0)} in the ${rangeLabel}, by the date a task was last updated while done`}
        tableColumns={['Week starting', 'Tasks completed']}
        tableRows={weeklyDone.map((w) => ({ label: w.longLabel ?? w.label, cells: [String(w.value)] }))}
        empty={weeklyDone.every((w) => w.value === 0) ? `No completed tasks in the ${rangeLabel}.` : undefined}
      >
        <ColumnChart data={weeklyDone} label={`Tasks completed per week, ${rangeLabel}`} format={(v) => `${v}`} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Open tasks by priority: one whole, four ordered parts */}
        <ChartCard
          title="Open tasks by priority"
          subtitle={`${openTasks} open · darker = more urgent`}
          tableColumns={['Priority', 'Open tasks', 'Share']}
          tableRows={prioritySegments.map((s) => ({
            label: s.label,
            cells: [String(s.value), openTasks ? `${Math.round((s.value / openTasks) * 100)}%` : '0%'],
          }))}
          empty={openTasks === 0 ? 'No open tasks — nothing waiting on you.' : undefined}
        >
          <SegmentedBar segments={prioritySegments} label="Open tasks by priority" unit="tasks" />
          {priorityCounts.urgent > 0 && (
            <p className="text-xs text-[var(--hub-muted)]">
              Tip: clearing the {priorityCounts.urgent} urgent task{priorityCounts.urgent === 1 ? '' : 's'} first frees the most headspace.
            </p>
          )}
        </ChartCard>

        {/* Open tasks by workspace: compare parts by length */}
        <ChartCard
          title="Open tasks by workspace"
          subtitle="Largest first"
          tableColumns={['Workspace', 'Open tasks', 'Completed']}
          tableRows={areaRows.map((r) => ({ label: r.label, cells: [String(r.value), String(areaTaskCounts[r.label]?.done ?? 0)] }))}
          empty={areaRows.every((r) => r.value === 0) ? 'No open tasks in any workspace.' : undefined}
        >
          <RankedBars data={areaRows} label="Open tasks by workspace" showShare />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Spending by category"
          subtitle={`${formatINR(rangeSpend)} in the ${rangeLabel}`}
          tableColumns={['Category', 'Amount', 'Share']}
          tableRows={categoryRows.map((r) => ({
            label: r.label,
            cells: [formatINR(r.value), rangeSpend ? `${Math.round((r.value / rangeSpend) * 100)}%` : '0%'],
          }))}
          empty={rangeSpend === 0 ? `No expenses in the ${rangeLabel}. Add bills in the Expenses module.` : undefined}
        >
          <RankedBars data={categoryRows} label="Spending by category" format={formatINR} showShare />
        </ChartCard>

        <ChartCard
          title="Spending by workspace"
          subtitle={`The ${rangeLabel}, all workspaces`}
          tableColumns={['Workspace', 'Amount']}
          tableRows={spendRows.map((r) => ({ label: r.label, cells: [formatINR(r.value)] }))}
          empty={spendRows.every((r) => r.value === 0) ? 'No spending recorded against a workspace yet.' : undefined}
        >
          <RankedBars data={spendRows.filter((r) => r.value > 0)} label="Spending by workspace" format={formatINR} showShare />
        </ChartCard>
      </div>
    </div>
  );
};
