/**
 * Pure data selectors and telemetry helpers for the Jarvis HUD on Home.
 *
 * Zero DOM and zero Three.js dependencies so every selector is directly unit-tested.
 * Every count, metric, milestone and deadline comes strictly from stored Dexie records.
 */
import type { AiActivityPhase } from './aiActivity.ts';
import { dueStatus, toDueKey } from './utils.ts';

export type HudGlyph =
  | 'wind'
  | 'bot'
  | 'graduation'
  | 'rupee'
  | 'heart'
  | 'folder'
  | 'brain';

export type HudWorkspaceId =
  | 'startup-command'
  | 'robotics-lab'
  | 'learning-career'
  | 'finance'
  | 'health-routine'
  | 'projects'
  | 'knowledge-memory';

export interface HudTaskSummary {
  id: string;
  text: string;
  area: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  starred: boolean;
  done: boolean;
}

export interface HudWorkspaceSummary {
  id: HudWorkspaceId;
  label: string;
  shortLabel: string;
  description: string;
  glyph: HudGlyph;
  color: string;
  target: { tab: HudWorkspaceId; area?: string };
  openTasks: number;
  dueTodayCount: number;
  overdueCount: number;
  recentUpdatesCount: number;
  /** Normalised 0..1 live activity signal driving 3D node size and emissive intensity. */
  activityLevel: number;
  hasDueTodayBeam: boolean;
  stats: [string, string] | [string, string, string];
  keyMetric: { label: string; value: string };
  nextMilestone: { title: string; date?: string } | null;
  topTasks: HudTaskSummary[];
  statusText: string | null;
}

export interface HudDeadlineItem {
  id: string;
  kind: 'task' | 'event' | 'meeting';
  title: string;
  area: string;
  dateKey: string;
  time?: string;
  countdownLabel: string;
  urgentUnder24h: boolean;
  overdue: boolean;
  targetTab: 'tasks' | 'calendar' | 'meetings';
}

export interface HudCoreState {
  mode: 'thinking' | 'talking' | 'overdue' | 'attention' | 'idle';
  primaryHex: string;
  secondaryHex: string;
  pulseRate: number;
  displacementAmp: number;
  statusLabel: string;
}

type TaskInput = {
  id: string;
  text: string;
  area?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  due_date?: string;
  starred?: boolean;
  done?: boolean;
  updated_at?: string;
};

type ProjectInput = {
  id: string;
  title: string;
  area?: string;
  status?: string;
  progress?: number;
  target_date?: string;
  updated_at?: string;
  milestones?: Array<{ title: string; target_date?: string; done?: boolean }>;
};

type NoteInput = { id: string; title?: string; area?: string; kind?: string; updated_at?: string };
type ExpenseInput = { id: string; amount?: number; date?: string; area?: string; updated_at?: string };
type HabitInput = { id: string; archived?: boolean; updated_at?: string };
type HabitLogInput = { id: string; habit_id: string; date: string };
type EventInput = { id: string; title: string; date: string; start_time?: string; area?: string };
type MeetingInput = { id: string; title: string; date: string; start_time?: string; area?: string; status?: string };

const norm = (s: string | undefined) => String(s ?? '').trim().toLowerCase();

const PRIORITY_WEIGHT: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

function sortOpenTasks(list: TaskInput[], today: string): HudTaskSummary[] {
  return [...list]
    .filter((t) => !t.done)
    .sort((a, b) => {
      const sa = dueStatus(a.due_date, false, today);
      const sb = dueStatus(b.due_date, false, today);
      const rank = (st: string) => (st === 'overdue' ? 3 : st === 'today' ? 2 : 0);
      if (rank(sb) !== rank(sa)) return rank(sb) - rank(sa);
      if (Boolean(b.starred) !== Boolean(a.starred)) return b.starred ? 1 : -1;
      const pw = (PRIORITY_WEIGHT[b.priority ?? 'medium'] ?? 0) - (PRIORITY_WEIGHT[a.priority ?? 'medium'] ?? 0);
      if (pw !== 0) return pw;
      return toDueKey(a.due_date).localeCompare(toDueKey(b.due_date));
    })
    .map((t) => ({
      id: t.id,
      text: t.text,
      area: t.area || 'Personal',
      priority: t.priority || 'medium',
      due_date: t.due_date,
      starred: Boolean(t.starred),
      done: Boolean(t.done),
    }));
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function formatINRCompact(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) return '₹0';
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export const HUD_WORKSPACE_ORDER: HudWorkspaceId[] = [
  'startup-command',
  'robotics-lab',
  'learning-career',
  'finance',
  'health-routine',
  'projects',
  'knowledge-memory',
];

export function buildHudWorkspaceNodes(input: {
  today: string;
  recentCutoffISO: string;
  tasks: TaskInput[];
  projects: ProjectInput[];
  notes: NoteInput[];
  expenses: ExpenseInput[];
  habits: HabitInput[];
  habitLogs: HabitLogInput[];
  roboticsRecords: number;
  neoMemoriesCount: number;
}): HudWorkspaceSummary[] {
  const {
    today,
    recentCutoffISO,
    tasks,
    projects,
    notes,
    expenses,
    habits,
    habitLogs,
    roboticsRecords,
    neoMemoriesCount,
  } = input;

  const isRecent = (iso?: string) => Boolean(iso && iso >= recentCutoffISO);
  const currentMonth = today.slice(0, 7);

  const openStatsFor = (areaFilter: (area: string) => boolean) => {
    const matching = tasks.filter((t) => !t.done && areaFilter(norm(t.area)));
    const dueTodayCount = matching.filter((t) => dueStatus(t.due_date, false, today) === 'today').length;
    const overdueCount = matching.filter((t) => dueStatus(t.due_date, false, today) === 'overdue').length;
    const recentUpdatesCount = matching.filter((t) => isRecent(t.updated_at)).length;
    return {
      matching,
      openTasks: matching.length,
      dueTodayCount,
      overdueCount,
      recentUpdatesCount,
      topTasks: sortOpenTasks(matching, today).slice(0, 3),
    };
  };

  const firstPendingMilestone = (areaCheck: (a: string) => boolean) => {
    for (const p of projects) {
      if (!areaCheck(norm(p.area))) continue;
      const pending = (p.milestones ?? []).find((m) => !m.done);
      if (pending) return { title: pending.title, date: pending.target_date || p.target_date };
    }
    return null;
  };

  // 1. Pawan Shakti
  const pawanFilter = (a: string) => a === 'pawan shakti';
  const pawanTasks = openStatsFor(pawanFilter);
  const pawanProj = projects.find((p) => norm(p.area) === 'pawan shakti');
  const pawanDone = pawanProj?.milestones?.filter((m) => m.done).length ?? 0;
  const pawanTotal = pawanProj?.milestones?.length ?? 0;
  const pawanActivity = clamp01((pawanTasks.openTasks + pawanTasks.recentUpdatesCount + (pawanProj ? 2 : 0)) / 8);

  // 2. Robotics Lab
  const robotFilter = (a: string) => a === 'ivlabs' || a.includes('robot');
  const robotTasks = openStatsFor(robotFilter);
  const robotProj = projects.find((p) => robotFilter(norm(p.area)));
  const robotActivity = clamp01((robotTasks.openTasks + Math.min(4, roboticsRecords) + robotTasks.recentUpdatesCount) / 8);

  // 3. Learning & Career
  const learnFilter = (a: string) => a.includes('learn') || a.includes('career') || a.includes('research');
  const learnTasks = openStatsFor(learnFilter);
  const learnNotes = notes.filter((n) => learnFilter(norm(n.area))).length;
  const learnActivity = clamp01((learnTasks.openTasks + Math.min(3, learnNotes) + learnTasks.recentUpdatesCount) / 6);

  // 4. Finance
  const finFilter = (a: string) => a.includes('finance') || a.includes('waffle') || a.includes('mg automation');
  const finTasks = openStatsFor(finFilter);
  const monthSpend = expenses.filter((e) => (e.date || '').startsWith(currentMonth)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const recentExpenses = expenses.filter((e) => isRecent(e.updated_at) || (e.date || '') >= recentCutoffISO.slice(0, 10)).length;
  const finActivity = clamp01((finTasks.openTasks + Math.min(4, recentExpenses)) / 6);

  // 5. Routine & Health
  const healthFilter = (a: string) => a === 'personal' || a.includes('health') || a.includes('routine');
  const healthTasks = openStatsFor(healthFilter);
  const activeHabits = habits.filter((h) => !h.archived).length;
  const todayHabitDone = habitLogs.filter((l) => l.date === today).length;
  const healthActivity = clamp01((healthTasks.openTasks + todayHabitDone + (activeHabits > 0 ? 1 : 0)) / 6);

  // 6. Projects (all active/planning projects)
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planning');
  const allOpenStats = openStatsFor(() => true);
  const nextAnyMilestone = firstPendingMilestone(() => true);
  const avgProgress =
    activeProjects.length > 0
      ? Math.round(activeProjects.reduce((s, p) => s + (p.progress ?? 0), 0) / activeProjects.length)
      : 0;
  const projectsActivity = clamp01((activeProjects.length * 1.5 + allOpenStats.dueTodayCount) / 8);

  // 7. Notes / Memory Vault
  const recentNotesCount = notes.filter((n) => isRecent(n.updated_at)).length;
  const memoryTotal = notes.length + neoMemoriesCount;
  const memoryTasks = openStatsFor((a) => a.includes('note') || a.includes('memory') || a.includes('founder'));
  const memoryActivity = clamp01((Math.min(5, recentNotesCount) + Math.min(3, memoryTotal * 0.2)) / 6);

  return [
    {
      id: 'startup-command',
      label: 'Pawan Shakti',
      shortLabel: 'Pawan',
      description: 'Low-wind planetary turbine programme, TRL baseline & safety testing.',
      glyph: 'wind',
      color: '#3BE8FF',
      target: { tab: 'startup-command' },
      openTasks: pawanTasks.openTasks,
      dueTodayCount: pawanTasks.dueTodayCount,
      overdueCount: pawanTasks.overdueCount,
      recentUpdatesCount: pawanTasks.recentUpdatesCount + (pawanProj && isRecent(pawanProj.updated_at) ? 1 : 0),
      activityLevel: pawanActivity,
      hasDueTodayBeam: pawanTasks.dueTodayCount > 0 || pawanTasks.overdueCount > 0,
      stats: [
        `${pawanTasks.openTasks} open task${pawanTasks.openTasks === 1 ? '' : 's'}`,
        pawanProj ? `${pawanProj.progress ?? 0}% progress` : 'No project seeded',
        pawanTotal > 0 ? `${pawanDone}/${pawanTotal} milestones` : `${pawanTasks.dueTodayCount} due today`,
      ],
      keyMetric: {
        label: 'Programme Progress',
        value: pawanProj ? `${pawanProj.progress ?? 0}%` : '—',
      },
      nextMilestone: firstPendingMilestone(pawanFilter),
      topTasks: pawanTasks.topTasks,
      statusText: pawanTasks.openTasks > 0 ? `${pawanTasks.openTasks} open` : pawanProj ? `${pawanProj.progress ?? 0}%` : null,
    },
    {
      id: 'robotics-lab',
      label: 'Robotics Lab',
      shortLabel: 'Robotics',
      description: 'AgileX PiPER, 3-drone swarm & TI AWR2944 mmWave experiment logbook.',
      glyph: 'bot',
      color: '#7C5CFF',
      target: { tab: 'robotics-lab' },
      openTasks: robotTasks.openTasks,
      dueTodayCount: robotTasks.dueTodayCount,
      overdueCount: robotTasks.overdueCount,
      recentUpdatesCount: robotTasks.recentUpdatesCount,
      activityLevel: robotActivity,
      hasDueTodayBeam: robotTasks.dueTodayCount > 0 || robotTasks.overdueCount > 0,
      stats: [
        `${roboticsRecords} lab record${roboticsRecords === 1 ? '' : 's'}`,
        `${robotTasks.openTasks} open task${robotTasks.openTasks === 1 ? '' : 's'}`,
        robotProj ? `${robotProj.progress ?? 0}% build` : 'Hardware log active',
      ],
      keyMetric: {
        label: 'Experiment Logs',
        value: `${roboticsRecords}`,
      },
      nextMilestone: firstPendingMilestone(robotFilter),
      topTasks: robotTasks.topTasks,
      statusText: roboticsRecords > 0 ? `${roboticsRecords} log${roboticsRecords === 1 ? '' : 's'}` : robotTasks.openTasks > 0 ? `${robotTasks.openTasks} open` : null,
    },
    {
      id: 'learning-career',
      label: 'Learning & Career',
      shortLabel: 'Learning',
      description: 'Research papers, fellowships, skill tracks and career roadmap.',
      glyph: 'graduation',
      color: '#5CE1E6',
      target: { tab: 'learning-career' },
      openTasks: learnTasks.openTasks,
      dueTodayCount: learnTasks.dueTodayCount,
      overdueCount: learnTasks.overdueCount,
      recentUpdatesCount: learnTasks.recentUpdatesCount + learnNotes,
      activityLevel: learnActivity,
      hasDueTodayBeam: learnTasks.dueTodayCount > 0 || learnTasks.overdueCount > 0,
      stats: [
        `${learnTasks.openTasks} open task${learnTasks.openTasks === 1 ? '' : 's'}`,
        `${learnNotes} research note${learnNotes === 1 ? '' : 's'}`,
        `${learnTasks.dueTodayCount} due today`,
      ],
      keyMetric: {
        label: 'Study & Career Items',
        value: `${learnTasks.openTasks + learnNotes}`,
      },
      nextMilestone: firstPendingMilestone(learnFilter),
      topTasks: learnTasks.topTasks,
      statusText: learnTasks.openTasks > 0 ? `${learnTasks.openTasks} open` : learnNotes > 0 ? `${learnNotes} notes` : null,
    },
    {
      id: 'finance',
      label: 'Finance',
      shortLabel: 'Finance',
      description: 'Monthly expenditure, equipment & parts ledger, capital planning.',
      glyph: 'rupee',
      color: '#FFB547',
      target: { tab: 'finance' },
      openTasks: finTasks.openTasks,
      dueTodayCount: finTasks.dueTodayCount,
      overdueCount: finTasks.overdueCount,
      recentUpdatesCount: finTasks.recentUpdatesCount + recentExpenses,
      activityLevel: finActivity,
      hasDueTodayBeam: finTasks.dueTodayCount > 0 || finTasks.overdueCount > 0,
      stats: [
        `${formatINRCompact(monthSpend)} this month`,
        `${expenses.length} total entr${expenses.length === 1 ? 'y' : 'ies'}`,
        `${finTasks.openTasks} open task${finTasks.openTasks === 1 ? '' : 's'}`,
      ],
      keyMetric: {
        label: 'Month Spend',
        value: formatINRCompact(monthSpend),
      },
      nextMilestone: firstPendingMilestone(finFilter),
      topTasks: finTasks.topTasks,
      statusText: monthSpend > 0 ? formatINRCompact(monthSpend) : finTasks.openTasks > 0 ? `${finTasks.openTasks} open` : null,
    },
    {
      id: 'health-routine',
      label: 'Routine & Health',
      shortLabel: 'Routine',
      description: 'Daily habits, sleep rhythm, deep engineering recovery & personal tasks.',
      glyph: 'heart',
      color: '#FF6B9D',
      target: { tab: 'health-routine' },
      openTasks: healthTasks.openTasks,
      dueTodayCount: healthTasks.dueTodayCount,
      overdueCount: healthTasks.overdueCount,
      recentUpdatesCount: healthTasks.recentUpdatesCount + todayHabitDone,
      activityLevel: healthActivity,
      hasDueTodayBeam: healthTasks.dueTodayCount > 0 || healthTasks.overdueCount > 0,
      stats: [
        `${todayHabitDone}/${activeHabits} habits today`,
        `${healthTasks.openTasks} personal task${healthTasks.openTasks === 1 ? '' : 's'}`,
        `${healthTasks.dueTodayCount} due today`,
      ],
      keyMetric: {
        label: 'Habits Today',
        value: `${todayHabitDone}/${activeHabits}`,
      },
      nextMilestone: firstPendingMilestone(healthFilter),
      topTasks: healthTasks.topTasks,
      statusText: activeHabits > 0 ? `${todayHabitDone}/${activeHabits} today` : healthTasks.openTasks > 0 ? `${healthTasks.openTasks} open` : null,
    },
    {
      id: 'projects',
      label: 'Projects',
      shortLabel: 'Projects',
      description: 'All active engineering programmes, milestones, decisions & blockers.',
      glyph: 'folder',
      color: '#38BDF8',
      target: { tab: 'projects' },
      openTasks: allOpenStats.openTasks,
      dueTodayCount: allOpenStats.dueTodayCount,
      overdueCount: allOpenStats.overdueCount,
      recentUpdatesCount: allOpenStats.recentUpdatesCount,
      activityLevel: projectsActivity,
      hasDueTodayBeam: allOpenStats.dueTodayCount > 0 || allOpenStats.overdueCount > 0,
      stats: [
        `${activeProjects.length} active project${activeProjects.length === 1 ? '' : 's'}`,
        `${avgProgress}% avg progress`,
        `${allOpenStats.openTasks} open task${allOpenStats.openTasks === 1 ? '' : 's'}`,
      ],
      keyMetric: {
        label: 'Active Projects',
        value: `${activeProjects.length}`,
      },
      nextMilestone: nextAnyMilestone,
      topTasks: allOpenStats.topTasks,
      statusText: activeProjects.length > 0 ? `${activeProjects.length} active` : null,
    },
    {
      id: 'knowledge-memory',
      label: 'Notes / Memory Vault',
      shortLabel: 'Memory Vault',
      description: 'Pinned directives, decisions, reflections, lessons & Neo memories.',
      glyph: 'brain',
      color: '#A78BFA',
      target: { tab: 'knowledge-memory' },
      openTasks: memoryTasks.openTasks,
      dueTodayCount: memoryTasks.dueTodayCount,
      overdueCount: memoryTasks.overdueCount,
      recentUpdatesCount: recentNotesCount,
      activityLevel: memoryActivity,
      hasDueTodayBeam: memoryTasks.dueTodayCount > 0 || memoryTasks.overdueCount > 0,
      stats: [
        `${notes.length} note${notes.length === 1 ? '' : 's'} stored`,
        `${neoMemoriesCount} memory record${neoMemoriesCount === 1 ? '' : 's'}`,
        `${recentNotesCount} updated (7d)`,
      ],
      keyMetric: {
        label: 'Stored Records',
        value: `${memoryTotal}`,
      },
      nextMilestone: null,
      topTasks: memoryTasks.topTasks,
      statusText: memoryTotal > 0 ? `${memoryTotal} saved` : null,
    },
  ];
}

export function deriveCoreState(input: {
  aiPhase: AiActivityPhase;
  overdueCount: number;
  dueTodayCount: number;
}): HudCoreState {
  const { aiPhase, overdueCount, dueTodayCount } = input;
  if (aiPhase === 'thinking') {
    return {
      mode: 'thinking',
      primaryHex: '#3BE8FF',
      secondaryHex: '#7C5CFF',
      pulseRate: 4.2,
      displacementAmp: 0.085,
      statusLabel: 'AI SYNTHESIZING',
    };
  }
  if (aiPhase === 'talking') {
    return {
      mode: 'talking',
      primaryHex: '#7C5CFF',
      secondaryHex: '#3BE8FF',
      pulseRate: 3.1,
      displacementAmp: 0.065,
      statusLabel: 'AI RESPONDING',
    };
  }
  if (overdueCount > 0) {
    return {
      mode: 'overdue',
      primaryHex: '#FF4D6D',
      secondaryHex: '#FFB547',
      pulseRate: 1.85,
      displacementAmp: 0.055,
      statusLabel: `${overdueCount} OVERDUE ALERT`,
    };
  }
  if (dueTodayCount > 0) {
    return {
      mode: 'attention',
      primaryHex: '#FFB547',
      secondaryHex: '#3BE8FF',
      pulseRate: 1.25,
      displacementAmp: 0.04,
      statusLabel: `${dueTodayCount} DUE TODAY`,
    };
  }
  return {
    mode: 'idle',
    primaryHex: '#3BE8FF',
    secondaryHex: '#7C5CFF',
    pulseRate: 0.8,
    displacementAmp: 0.028,
    statusLabel: 'CORE STANDBY',
  };
}

export function formatDeadlineCountdown(targetMs: number, nowMs: number, dateKey: string, todayISO: string): {
  label: string;
  urgentUnder24h: boolean;
  overdue: boolean;
} {
  if (dateKey < todayISO || targetMs < nowMs) {
    const diffHours = Math.max(1, Math.round((nowMs - targetMs) / 3600000));
    return {
      label: diffHours < 24 ? `${diffHours}h overdue` : `${Math.ceil(diffHours / 24)}d overdue`,
      urgentUnder24h: true,
      overdue: true,
    };
  }
  const diffMs = targetMs - nowMs;
  const diffHours = Math.max(1, Math.ceil(diffMs / 3600000));
  if (diffHours <= 24) {
    return {
      label: `${diffHours}h left`,
      urgentUnder24h: true,
      overdue: false,
    };
  }
  const diffDays = Math.ceil(diffMs / 86400000);
  return {
    label: `${diffDays}d`,
    urgentUnder24h: false,
    overdue: false,
  };
}

function targetTimestampMs(dateKey: string, time?: string): number {
  const hhmm = time && /^\d{1,2}:\d{2}/.test(time) ? time.slice(0, 5) : '23:59';
  const [h, m] = hhmm.split(':').map((x) => Number(x));
  const [y, mo, d] = dateKey.split('-').map((x) => Number(x));
  if (!y || !mo || !d) return Number.NaN;
  return new Date(y, mo - 1, d, Number.isFinite(h) ? h : 23, Number.isFinite(m) ? m : 59, 0, 0).getTime();
}

export function collectDeadlines(input: {
  tasks: TaskInput[];
  events: EventInput[];
  meetings: MeetingInput[];
  nowMs: number;
  todayISO: string;
  nextWeekISO: string;
}): HudDeadlineItem[] {
  const { tasks, events, meetings, nowMs, todayISO, nextWeekISO } = input;
  const items: Array<HudDeadlineItem & { sortMs: number }> = [];

  for (const t of tasks) {
    if (t.done) continue;
    const key = toDueKey(t.due_date);
    if (!key || key > nextWeekISO) continue;
    const ms = targetTimestampMs(key);
    const cd = formatDeadlineCountdown(ms, nowMs, key, todayISO);
    items.push({
      id: `task:${t.id}`,
      kind: 'task',
      title: t.text,
      area: t.area || 'Personal',
      dateKey: key,
      countdownLabel: cd.label,
      urgentUnder24h: cd.urgentUnder24h,
      overdue: cd.overdue,
      targetTab: 'tasks',
      sortMs: ms,
    });
  }

  for (const m of meetings) {
    if (m.status && m.status !== 'scheduled') continue;
    if (!m.date || m.date < todayISO || m.date > nextWeekISO) continue;
    const ms = targetTimestampMs(m.date, m.start_time);
    const cd = formatDeadlineCountdown(ms, nowMs, m.date, todayISO);
    items.push({
      id: `meeting:${m.id}`,
      kind: 'meeting',
      title: m.title,
      area: m.area || 'Meetings',
      dateKey: m.date,
      time: m.start_time,
      countdownLabel: cd.label,
      urgentUnder24h: cd.urgentUnder24h,
      overdue: cd.overdue,
      targetTab: 'calendar',
      sortMs: ms,
    });
  }

  for (const e of events) {
    if (!e.date || e.date < todayISO || e.date > nextWeekISO) continue;
    const ms = targetTimestampMs(e.date, e.start_time);
    const cd = formatDeadlineCountdown(ms, nowMs, e.date, todayISO);
    items.push({
      id: `event:${e.id}`,
      kind: 'event',
      title: e.title,
      area: e.area || 'Calendar',
      dateKey: e.date,
      time: e.start_time,
      countdownLabel: cd.label,
      urgentUnder24h: cd.urgentUnder24h,
      overdue: cd.overdue,
      targetTab: 'calendar',
      sortMs: ms,
    });
  }

  items.sort((a, b) => a.sortMs - b.sortMs);
  return items.map(({ sortMs: _ignored, ...rest }) => rest);
}

export function formatSyncHudStatus(
  status: 'local' | 'synced' | 'syncing' | 'offline' | 'error',
  queueCount: number,
  failedCount: number,
  signedIn = true,
  cloudConfigured = true
): { label: string; tone: 'cyan' | 'amber' | 'danger' } {
  if (status === 'error') {
    return {
      label: failedCount > 0 ? `SYNC ATTENTION · ${failedCount} PENDING` : 'SYNC ATTENTION',
      tone: 'danger',
    };
  }
  if (status === 'offline') {
    return {
      label: queueCount > 0 ? `LOCAL VAULT · ${queueCount} QUEUED` : 'OFFLINE · LOCAL VAULT',
      tone: 'amber',
    };
  }
  if (status === 'syncing') {
    return {
      label: queueCount > 0 ? `SYNCING · ${queueCount}` : 'SYNCING STREAM',
      tone: 'cyan',
    };
  }
  if (cloudConfigured && !signedIn && status === 'local') {
    return {
      label: queueCount > 0 ? `SYSTEMS NOMINAL · SIGN IN TO SYNC (${queueCount})` : 'SYSTEMS NOMINAL · SIGN IN TO SYNC',
      tone: 'amber',
    };
  }
  if (status === 'synced') {
    return {
      label: queueCount > 0 ? `SYSTEMS NOMINAL · ${queueCount} QUEUED` : 'SYSTEMS NOMINAL',
      tone: 'cyan',
    };
  }
  return {
    label: 'SYSTEMS NOMINAL · LOCAL VAULT',
    tone: 'cyan',
  };
}
