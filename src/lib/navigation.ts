import type { NavigationTab } from '../types';

/**
 * Human-readable titles for every navigable tab. Used for document.title,
 * the browser history entry name, and screen-reader route announcements.
 */
export const TAB_TITLES: Record<NavigationTab, string> = {
  dashboard: 'Home',
  buddy: 'JARVIS Buddy',
  'my-day': 'My Day',
  projects: 'Projects',
  'ai-assistant': 'Ask AI',
  automations: 'Automations',
  'learning-career': 'Learning & Career',
  calendar: 'Calendar',
  tasks: 'Tasks',
  'startup-command': 'Pawan Shakti',
  'robotics-lab': 'Robotics Lab',
  'knowledge-memory': 'Memory Vault',
  finance: 'Finance',
  'health-routine': 'Routine & Health',
  integrations: 'Integrations & Sync',
  analytics: 'Analytics',
  settings: 'Settings',
  meetings: 'Meetings',
  travel: 'Travel',
  notes: 'Notes',
  documents: 'Files & Docs',
  files: 'Files & Docs',
  gmail: 'Gmail',
  expenses: 'Finance',
  contacts: 'Contacts',
  'wind-plan': 'Pawan Shakti',
  notifications: 'Notifications',
  'neo-memory': 'Memory Vault',
  'system-health': 'System Health',
  goals: 'Goals & Habits',
  focus: 'Deep Work',
  momentum: 'Momentum',
  'research-feed': 'Research Intelligence',
  universe: '3D Universe',
};

const APP_NAME = 'Yashwanth Hub';

/**
 * Old duplicate routes. They stay valid (bookmarks, deep links, older code)
 * but always land on one canonical tab, so each page has a single URL.
 */
export const TAB_ALIASES: Partial<Record<NavigationTab, NavigationTab>> = {
  'wind-plan': 'startup-command',
  'neo-memory': 'knowledge-memory',
  files: 'documents',
  expenses: 'finance',
};

export function canonicalTab(tab: NavigationTab): NavigationTab {
  return TAB_ALIASES[tab] ?? tab;
}

export function isNavigationTab(value: unknown): value is NavigationTab {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TAB_TITLES, value);
}

/** Reads the active tab from `?tab=` in a URL search string. */
export function readTabFromSearch(search: string): NavigationTab | null {
  const tab = new URLSearchParams(search).get('tab');
  return isNavigationTab(tab) ? canonicalTab(tab) : null;
}

/** Reads the active tab from `/buddy`, `/universe`, or `?tab=` in a URL search string. */
export function readTabFromLocation(pathname: string, search: string): NavigationTab | null {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  if (cleanPath === '/buddy') return 'buddy';
  if (cleanPath === '/universe') return 'universe';
  return readTabFromSearch(search);
}

/** Builds the URL for a tab, keeping clean `/buddy` and `/universe` routes and `?tab=` deep links for workspace routes. */
export function buildTabUrl(tab: NavigationTab, pathname: string): string {
  const cleanPath = (pathname || '/').replace(/\/+$/, '') || '/';
  if (tab === 'buddy') return '/buddy';
  if (tab === 'universe') return '/universe';
  const basePath = cleanPath === '/buddy' || cleanPath === '/universe' ? '/' : (pathname || '/');
  return tab === 'dashboard' ? basePath : `${basePath}?tab=${encodeURIComponent(tab)}`;
}

export function documentTitleFor(tab: NavigationTab): string {
  if (tab === 'buddy') return `JARVIS — Personal AI Companion · ${APP_NAME}`;
  if (tab === 'universe') return `Yashwanth — Interactive 3D Engineering Universe`;
  return tab === 'dashboard' ? `${APP_NAME} — Command Center` : `${TAB_TITLES[tab]} · ${APP_NAME}`;
}
