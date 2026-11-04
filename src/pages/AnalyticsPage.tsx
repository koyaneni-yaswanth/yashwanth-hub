import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
  Layers,
  Wind,
  Calendar,
} from 'lucide-react';
import { db } from '../db';
import type { Area, Task, Expense, EventItem } from '../types';
import { formatINR, getTodayISO, isOverdue } from '../lib/utils';
import { StatCard } from '../components/common/StatCard';
import { Badge } from '../components/common/Badge';

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

  // Queries
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allEvents = useLiveQuery(() => db.events.toArray(), []) || [];
  const allMeetings = useLiveQuery(() => db.meetings.toArray(), []) || [];

  // Filter based on selected area
  const tasks = currentArea === 'All' ? allTasks : allTasks.filter((t) => t.area === currentArea);
  const expenses = currentArea === 'All' ? allExpenses : allExpenses.filter((e) => e.area === currentArea);
  const events = currentArea === 'All' ? allEvents : allEvents.filter((e) => e.area === currentArea);

  // Task Analytics
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.done).length;
  const openTasks = tasks.filter((t) => !t.done).length;
  const overdueTasks = tasks.filter((t) => isOverdue(t.due_date, t.done)).length;
  const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Expense Analytics
  const totalSpendAllTime = expenses.reduce((sum, e) => sum + e.amount, 0);
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

  allExpenses.forEach((e) => {
    if (!areaTaskCounts[e.area]) {
      areaTaskCounts[e.area] = { total: 0, done: 0, spend: 0 };
    }
    areaTaskCounts[e.area].spend += e.amount;
  });

  // Category breakdown for expenses
  const categoryTotals: Record<string, number> = {};
  expenses.forEach((e) => {
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
          icon={<CheckCircle2 className="w-5 h-5 text-teal-600" />}
        />
        <StatCard
          label="Month Burn Rate"
          value={formatINR(currentMonthSpend)}
          subtext={`Cycle: ${currentMonth}`}
          icon={<IndianRupee className="w-5 h-5 text-amber-600" />}
        />
        <StatCard
          label="Overdue Backlog"
          value={overdueTasks}
          subtext={overdueTasks === 0 ? 'Zero overdue items' : 'Requires immediate attention'}
          icon={<AlertCircle className={`w-5 h-5 ${overdueTasks > 0 ? 'text-red-500' : 'text-teal-600'}`} />}
        />
        <StatCard
          label="Wind TRL Progress"
          value={`${planRate}%`}
          subtext={`${planCompleted} of ${planTasks.length} milestones`}
          icon={<Wind className="w-5 h-5 text-teal-600" />}
          onClick={() => onNavigate('wind-plan')}
        />
      </div>

      {/* Two Column Layout: Workspace Distribution & Task Priorities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Workspace Areas Distribution */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              <span>Workspace Distribution</span>
            </h3>
            <span className="text-xs text-[var(--hub-muted)] font-medium">
              Tasks & Capital
            </span>
          </div>

          <div className="space-y-3.5">
            {areas.map((area) => {
              const data = areaTaskCounts[area.name] || { total: 0, done: 0, spend: 0 };
              const taskPct = totalTasks > 0 ? Math.round((data.total / totalTasks) * 100) : 0;
              const spendPct = totalSpendAllTime > 0 ? Math.round((data.spend / totalSpendAllTime) * 100) : 0;

              return (
                <div key={area.id} className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--hub-ink)]">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-none"
                        style={{ backgroundColor: area.color }}
                      />
                      <span>{area.name}</span>
                    </div>
                    <span className="text-[var(--hub-muted)] font-normal">
                      {data.total} tasks • {formatINR(data.spend)} ({spendPct}%)
                    </span>
                  </div>

                  {/* Task volume bar */}
                  <div className="w-full h-1.5 rounded-full bg-[var(--hub-line)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${taskPct}%`,
                        backgroundColor: area.color || 'var(--hub-accent)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Task Priority Distribution */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Open Task Priority Matrix</span>
            </h3>
            <span className="text-xs text-[var(--hub-muted)] font-medium">
              {openTasks} Open Actions
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
              <span className="text-xs font-bold text-red-600 uppercase tracking-wider block">
                Urgent
              </span>
              <span className="text-3xl font-bold font-heading text-red-700 dark:text-red-300 mt-1 block">
                {priorityCounts.urgent}
              </span>
              <span className="text-[11px] text-red-800/70 dark:text-red-300/70 mt-1 block">
                Critical blockers
              </span>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider block">
                High Priority
              </span>
              <span className="text-3xl font-bold font-heading text-amber-700 dark:text-amber-300 mt-1 block">
                {priorityCounts.high}
              </span>
              <span className="text-[11px] text-amber-800/70 dark:text-amber-300/70 mt-1 block">
                Key deliverables
              </span>
            </div>

            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center">
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block">
                Medium Priority
              </span>
              <span className="text-3xl font-bold font-heading text-blue-700 dark:text-blue-300 mt-1 block">
                {priorityCounts.medium}
              </span>
              <span className="text-[11px] text-blue-800/70 dark:text-blue-300/70 mt-1 block">
                Standard tasks
              </span>
            </div>

            <div className="p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-center">
              <span className="text-xs font-bold text-[var(--hub-muted)] uppercase tracking-wider block">
                Low Priority
              </span>
              <span className="text-3xl font-bold font-heading text-[var(--hub-ink)] mt-1 block">
                {priorityCounts.low}
              </span>
              <span className="text-[11px] text-[var(--hub-muted)] mt-1 block">
                Backlog / Someday
              </span>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-muted)] leading-relaxed">
            <strong className="text-[var(--hub-ink)]">Execution Guidance:</strong> Founder bandwidth is best allocated by tackling all Urgent blockers before starting new Medium backlog items.
          </div>
        </div>
      </div>

      {/* Expense Categories Breakdown */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <PieChart className="w-4 h-4 text-emerald-600" />
            <span>Cumulative Expenditure Breakdown</span>
          </h3>
          <span className="text-xs font-bold text-[var(--hub-ink)]">
            Total: {formatINR(totalSpendAllTime)}
          </span>
        </div>

        {totalSpendAllTime === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--hub-muted)]">
            No expenses logged yet. Add your hardware procurement and operational bills in the Expenses module.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.keys(categoryTotals).map((cat) => {
              const amount = categoryTotals[cat];
              const pct = Math.round((amount / totalSpendAllTime) * 100);
              return (
                <div
                  key={cat}
                  className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-[var(--hub-ink)] mb-1">
                    <span>{cat}</span>
                    <span>{formatINR(amount)} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--hub-line)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--hub-accent)] rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
