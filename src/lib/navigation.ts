import type { NavigationTab } from '../types';

/**
 * Human-readable titles for every navigable tab. Used for document.title,
 * the browser history entry name, and screen-reader route announcements.
 */
export const TAB_TITLES: Record<NavigationTab, string> = {
  dashboard: 'Home',
  'my-day': 'Daily Compass',
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

/** Builds the URL for a tab, keeping the path and dropping other query params. Home is the bare path. */
export function buildTabUrl(tab: NavigationTab, pathname: string): string {
  return tab === 'dashboard' ? pathname : `${pathname}?tab=${encodeURIComponent(tab)}`;
}

export function documentTitleFor(tab: NavigationTab): string {
  return tab === 'dashboard' ? `${APP_NAME} — Command Center` : `${TAB_TITLES[tab]} · ${APP_NAME}`;
}
