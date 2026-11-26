/**
 * Canonical 6-Destination Information Architecture & Focus Mode registry.
 *
 * Maps every existing navigable route into 6 calm top-level destinations
 * (Home, Command, AI Studio, Workspace, Intelligence, System) without removing
 * any existing feature or breaking deep-link URLs (`?tab=...`).
 */
import type { NavigationTab } from '../types';

export type HubDestinationId =
  | 'home'
  | 'command'
  | 'ai-studio'
  | 'workspace'
  | 'intelligence'
  | 'system';

export interface HubSubRoute {
  tab: NavigationTab;
  label: string;
  description: string;
  /** Primary sub-tabs appear directly in the contextual destination bar; secondary items live under "More". */
  tier: 'primary' | 'secondary';
}

export interface HubDestinationMeta {
  id: HubDestinationId;
  code: string;
  label: string;
  shortLabel: string;
  tagline: string;
  defaultTab: NavigationTab;
  routes: HubSubRoute[];
}

export const HUB_DESTINATIONS: HubDestinationMeta[] = [
  {
    id: 'home',
    code: '01',
    label: 'Home',
    shortLabel: 'Home',
    tagline: 'Daily clarity, central Jarvis core, and your next move',
    defaultTab: 'dashboard',
    routes: [
      { tab: 'dashboard', label: 'Home Command', description: 'Jarvis 3D Core & Next Move', tier: 'primary' },
      { tab: 'momentum', label: 'Momentum', description: 'Momentum score & life constellation', tier: 'secondary' },
    ],
  },
  {
    id: 'command',
    code: '02',
    label: 'Command',
    shortLabel: 'Command',
    tagline: 'Startup, robotics, learning, career, and active projects',
    defaultTab: 'projects',
    routes: [
      { tab: 'projects', label: 'Projects', description: 'Active portfolio & milestones', tier: 'primary' },
      { tab: 'startup-command', label: 'Pawan Shakti', description: 'Wind turbine TRL & V3F evidence', tier: 'primary' },
      { tab: 'robotics-lab', label: 'Robotics Lab', description: 'PiPER arm, Swarm & AWR2944', tier: 'primary' },
      { tab: 'learning-career', label: 'Learning & Career', description: 'Skills, papers & CV', tier: 'primary' },
      { tab: 'goals', label: 'Goals & Habits', description: 'Quarterly goals & weekly rhythm', tier: 'secondary' },
      { tab: 'momentum', label: 'Momentum', description: 'Progress velocity & forecasting', tier: 'secondary' },
    ],
  },
  {
    id: 'ai-studio',
    code: '03',
    label: 'AI Studio',
    shortLabel: 'AI Studio',
    tagline: 'Multi-AI assistants, specialized agents, models & automations',
    defaultTab: 'ai-assistant',
    routes: [
      { tab: 'ai-assistant', label: 'AI Assistant', description: 'Chief of Staff, agents & model router', tier: 'primary' },
      { tab: 'automations', label: 'Automations', description: 'Scheduled workflows & approval queue', tier: 'primary' },
      { tab: 'notifications', label: 'Alerts & Inbox', description: 'System alerts & reminders', tier: 'secondary' },
    ],
  },
  {
    id: 'workspace',
    code: '04',
    label: 'Workspace',
    shortLabel: 'Workspace',
    tagline: 'Daily execution: tasks, calendar, deep work, notes & files',
    defaultTab: 'tasks',
    routes: [
      { tab: 'tasks', label: 'Tasks', description: 'Priority board & due actions', tier: 'primary' },
      { tab: 'my-day', label: 'My Day', description: 'Daily Compass timebox & wrap-up', tier: 'primary' },
      { tab: 'calendar', label: 'Calendar', description: 'Schedule & deadines', tier: 'primary' },
      { tab: 'focus', label: 'Deep Work', description: 'Timed focus & distraction capture', tier: 'primary' },
      { tab: 'notes', label: 'Notes', description: 'Captured notes & engineering logs', tier: 'secondary' },
      { tab: 'documents', label: 'Files & Docs', description: 'Documents & project media', tier: 'secondary' },
      { tab: 'meetings', label: 'Meetings', description: 'Meeting briefs & action items', tier: 'secondary' },
      { tab: 'gmail', label: 'Gmail', description: 'Email follow-ups', tier: 'secondary' },
      { tab: 'contacts', label: 'Contacts', description: 'Collaborators & advisors', tier: 'secondary' },
      { tab: 'travel', label: 'Travel', description: 'Trips & field logistics', tier: 'secondary' },
    ],
  },
  {
    id: 'intelligence',
    code: '05',
    label: 'Intelligence',
    shortLabel: 'Intel',
    tagline: 'Knowledge vault, academic research, analytics & capital',
    defaultTab: 'knowledge-memory',
    routes: [
      { tab: 'knowledge-memory', label: 'Knowledge Vault', description: 'Journal, Knowledge Graph & Neo 1', tier: 'primary' },
      { tab: 'research-feed', label: 'Research Feed', description: 'Live arXiv, OpenAlex & Crossref papers', tier: 'primary' },
      { tab: 'analytics', label: 'Analytics', description: 'Execution metrics & trends', tier: 'primary' },
      { tab: 'finance', label: 'Finance & Capital', description: 'Expenses, runway & budgets', tier: 'primary' },
      { tab: 'health-routine', label: 'Routine & Energy', description: 'Recovery & sleep discipline', tier: 'secondary' },
    ],
  },
  {
    id: 'system',
    code: '06',
    label: 'System',
    shortLabel: 'System',
    tagline: 'Integrations, live sync health, notifications & settings',
    defaultTab: 'integrations',
    routes: [
      { tab: 'integrations', label: 'Integrations & Sync', description: 'Supabase, Google & NeoSapien auth', tier: 'primary' },
      { tab: 'system-health', label: 'System Health', description: 'Sync conflicts, fleet & diagnostics', tier: 'primary' },
      { tab: 'notifications', label: 'Notifications', description: 'Alert channels & quiet hours', tier: 'primary' },
      { tab: 'settings', label: 'Settings', description: 'Theme, areas & preferences', tier: 'secondary' },
    ],
  },
];

const TAB_TO_DESTINATION: Partial<Record<NavigationTab, HubDestinationId>> = {
  dashboard: 'home',
  projects: 'command',
  'startup-command': 'command',
  'wind-plan': 'command',
  'robotics-lab': 'command',
  'learning-career': 'command',
  goals: 'command',
  momentum: 'command',
  'ai-assistant': 'ai-studio',
  automations: 'ai-studio',
  tasks: 'workspace',
  'my-day': 'workspace',
  calendar: 'workspace',
  focus: 'workspace',
  notes: 'workspace',
  documents: 'workspace',
  files: 'workspace',
  meetings: 'workspace',
  gmail: 'workspace',
  contacts: 'workspace',
  travel: 'workspace',
  'knowledge-memory': 'intelligence',
  'neo-memory': 'intelligence',
  'research-feed': 'intelligence',
  analytics: 'intelligence',
  finance: 'intelligence',
  expenses: 'intelligence',
  'health-routine': 'intelligence',
  integrations: 'system',
  'system-health': 'system',
  notifications: 'system',
  settings: 'system',
};

export function destinationForTab(tab: NavigationTab): HubDestinationMeta {
  const destId = TAB_TO_DESTINATION[tab] || 'home';
  return HUB_DESTINATIONS.find((d) => d.id === destId) || HUB_DESTINATIONS[0];
}

/** Focus Mode Workspaces (one thing at a time). */
export type FocusWorkspaceId =
  | 'startup-pawan'
  | 'robotics-engineering'
  | 'research-learning'
  | 'career-development';

export interface FocusWorkspaceOption {
  id: FocusWorkspaceId;
  label: string;
  shortLabel: string;
  description: string;
  /** Workspace filter values (case-insensitive substring match against task/project area). */
  areaMatches: string[];
  /** Preferred area filter to set when entering Focus Mode (or null to leave filter broader). */
  globalArea: string | null;
  destinationTab: NavigationTab;
  previewSummary: string;
}

export const FOCUS_WORKSPACES: FocusWorkspaceOption[] = [
  {
    id: 'startup-pawan',
    label: 'Startup & Pawan Shakti',
    shortLabel: 'Startup · Pawan',
    description: 'Wind turbine TRL 5/6 prototype validation, CAD, patents & commercialization',
    areaMatches: ['pawan shakti', 'pawan', 'mg automation'],
    globalArea: 'PAWAN SHAKTI',
    destinationTab: 'startup-command',
    previewSummary: 'Minimal view · One priority · Essential actions only',
  },
  {
    id: 'robotics-engineering',
    label: 'Robotics & Engineering',
    shortLabel: 'Robotics Lab',
    description: 'AgileX PiPER, swarm autonomy, AWR2944 mmWave & ROS 2 experiments',
    areaMatches: ['ivlabs', 'robotics', 'engineering', 'mg automation'],
    globalArea: 'IvLabs',
    destinationTab: 'robotics-lab',
    previewSummary: 'Hardware & simulation focus · Nonessential dashboards hidden',
  },
  {
    id: 'research-learning',
    label: 'Research & Learning',
    shortLabel: 'Research',
    description: 'Papers, technical synthesis, simulation theory & deep study',
    areaMatches: ['learning', 'research', 'knowledge'],
    globalArea: 'All',
    destinationTab: 'learning-career',
    previewSummary: 'Distraction-free synthesis · Papers, notes & study block only',
  },
  {
    id: 'career-development',
    label: 'Career & Professional Development',
    shortLabel: 'Career',
    description: 'Skills portfolio, grants, interviews, CV milestones & personal goals',
    areaMatches: ['personal', 'career', 'learning'],
    globalArea: 'Personal',
    destinationTab: 'goals',
    previewSummary: 'High-leverage career milestones · Quiet execution mode',
  },
];

export function filterItemsForFocusWorkspace<T extends { area?: string; text?: string; title?: string; tags?: string[] }>(
  items: T[],
  workspaceId: FocusWorkspaceId
): T[] {
  const ws = FOCUS_WORKSPACES.find((w) => w.id === workspaceId);
  if (!ws) return items;
  return items.filter((item) => {
    const hay = `${item.area || ''} ${item.text || ''} ${item.title || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
    return ws.areaMatches.some((kw) => hay.includes(kw));
  });
}
