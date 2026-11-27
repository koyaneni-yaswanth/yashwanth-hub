/**
 * Pure deterministic Autonomous Intelligence Radar for Home Command Centre & AI Studio.
 * Aggregates high-signal cross-domain items without fabricating external data.
 */
import type { NavigationTab, Task } from '../types';
import { dueStatus } from './utils.ts';

export interface AutonomousRadarItem {
  id: string;
  severity: 'critical' | 'attention' | 'info';
  title: string;
  detail: string;
  ctaLabel: string;
  targetTab: NavigationTab;
}

export function buildAutonomousRadarItems(input: {
  todayISO: string;
  tasks: Task[];
  activeGoalsCount: number;
  neoMemoriesPendingCount: number;
  hasVerifiedPvTelemetry: boolean;
  queueCount: number;
  signedIn: boolean;
}): AutonomousRadarItem[] {
  const items: AutonomousRadarItem[] = [];
  const overdue = input.tasks.filter((t) => !t.done && dueStatus(t.due_date, t.done, input.todayISO) === 'overdue');
  const dueToday = input.tasks.filter((t) => !t.done && dueStatus(t.due_date, t.done, input.todayISO) === 'today');

  if (overdue.length > 0) {
    items.push({
      id: 'radar-overdue',
      severity: 'critical',
      title: `${overdue.length} Overdue Task${overdue.length > 1 ? 's' : ''} Require Triage`,
      detail: overdue[0].text,
      ctaLabel: 'Open My Day',
      targetTab: 'my-day',
    });
  }

  if (input.neoMemoriesPendingCount > 0) {
    items.push({
      id: 'radar-neo',
      severity: 'attention',
      title: `${input.neoMemoriesPendingCount} Spoken Commitment${input.neoMemoriesPendingCount > 1 ? 's' : ''} Pending Review`,
      detail: 'Approve extracted meeting commitments into tracked tasks.',
      ctaLabel: 'Review',
      targetTab: 'knowledge-memory',
    });
  }

  if (!input.hasVerifiedPvTelemetry) {
    items.push({
      id: 'radar-pv',
      severity: 'attention',
      title: 'PAWAN SHAKTI V3F >= 1 Hz P-v Gate Open',
      detail: 'Capture bench serial data or CSV sweep to validate v3f-2-2.',
      ctaLabel: 'Open DAQ',
      targetTab: 'startup-command',
    });
  }

  if (input.activeGoalsCount === 0) {
    items.push({
      id: 'radar-goals',
      severity: 'info',
      title: 'No Active Quarterly Goals Set',
      detail: 'Define a target outcome + weekly milestone to power Momentum.',
      ctaLabel: 'Set Goal',
      targetTab: 'goals',
    });
  } else if (dueToday.length > 0 && items.length < 3) {
    items.push({
      id: 'radar-today',
      severity: 'info',
      title: `${dueToday.length} Priority Item${dueToday.length > 1 ? 's' : ''} Scheduled Today`,
      detail: dueToday[0].text,
      ctaLabel: 'Run Focus',
      targetTab: 'focus',
    });
  }

  if (!input.signedIn && input.queueCount > 0 && items.length < 3) {
    items.push({
      id: 'radar-sync',
      severity: 'attention',
      title: `${input.queueCount} Local Change${input.queueCount > 1 ? 's' : ''} Waiting for Cloud`,
      detail: 'Sign in once to mirror updates across mobile, tablet, and laptop.',
      ctaLabel: 'Sync Account',
      targetTab: 'integrations',
    });
  }

  return items.slice(0, 3);
}
