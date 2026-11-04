import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Sun,
  Moon,
  Database,
  Cloud,
  RefreshCw,
  WifiOff,
  Menu,
  Bell,
  Search,
} from 'lucide-react';
import { db } from '../../db';
import { TurbineLogo } from '../common/TurbineLogo';
import { useTheme } from '../../context/ThemeContext';
import { useSync } from '../../context/SyncContext';
import type { Area, NavigationTab } from '../../types';

interface HeaderProps {
  currentArea: string;
  onAreaChange: (area: string) => void;
  areas: Area[];
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
  onNavigate: (tab: NavigationTab) => void;
  turbineDuration?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentArea,
  onAreaChange,
  areas,
  onOpenMobileMenu,
  onOpenCommandPalette,
  onNavigate,
  turbineDuration = 8,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const { status, syncNow } = useSync();

  // Unread notifications query
  const unreadNotifs = useLiveQuery(
    () => db.notifications.filter((n) => !n.read).toArray(),
    []
  ) || [];

  const todayStr = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  // Live multi-device session count and pending sync mutations
  const activeSessions = useLiveQuery(() => db.device_sessions.filter((d) => d.status === 'online').count(), []) || 1;
  const pendingQueueCount = useLiveQuery(() => db.sync_queue.count(), []) || 0;

  const getSyncBadge = () => {
    switch (status) {
      case 'synced':
        return (
          <button
            onClick={() => onNavigate('integrations')}
            title={`All Devices Synchronized • ${activeSessions} Active Device(s) • Pending: ${pendingQueueCount}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors cursor-pointer"
          >
            <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Synced</span>
            <span className="text-[10px] px-1 py-0.2 rounded-full bg-emerald-500/20 font-bold">
              {activeSessions} {activeSessions === 1 ? 'device' : 'devices'}
            </span>
          </button>
        );
      case 'syncing':
        return (
          <button
            onClick={() => onNavigate('integrations')}
            title="Synchronizing cross-device data..."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 animate-pulse cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
            <span className="hidden sm:inline">Syncing</span>
            {pendingQueueCount > 0 && (
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-amber-500/20 font-bold">
                {pendingQueueCount}
              </span>
            )}
          </button>
        );
      case 'offline':
        return (
          <button
            onClick={() => onNavigate('integrations')}
            title={`Device is offline • ${pendingQueueCount} local mutations queued`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20 cursor-pointer"
          >
            <WifiOff className="w-3.5 h-3.5 text-red-600" />
            <span className="hidden sm:inline">Offline</span>
            {pendingQueueCount > 0 && (
              <span className="text-[10px] px-1 py-0.2 rounded-full bg-red-500/20 font-bold">
                {pendingQueueCount} queued
              </span>
            )}
          </button>
        );
      case 'local':
      default:
        return (
          <button
            onClick={() => onNavigate('integrations')}
            title="Local-First Mode (IndexedDB persistent & multi-device ready)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20 hover:bg-teal-500/20 transition-colors cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="hidden sm:inline">Local OS</span>
            <span className="text-[10px] px-1 py-0.2 rounded-full bg-teal-500/20 font-bold">
              {activeSessions} {activeSessions === 1 ? 'device' : 'devices'}
            </span>
          </button>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[var(--hub-surface)] border-b border-[var(--hub-line)] backdrop-blur-md px-4 sm:px-6 py-2.5 transition-colors">
      <div className="flex items-center justify-between gap-3 max-w-7xl mx-auto">
        {/* Left: Mobile Toggle & Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-3 cursor-pointer"
          >
            <TurbineLogo size={36} durationSeconds={turbineDuration} />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight leading-none flex items-center gap-2">
                Yashwanth Hub
              </h1>
              <div className="text-xs text-[var(--hub-muted)] font-medium mt-0.5">
                {todayStr}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:border-[var(--hub-accent)] transition-all cursor-pointer w-64 justify-between shadow-xs"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search or command...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded">
            Ctrl K
          </kbd>
        </button>

        {/* Right: Area filter, Notifications, Sync Badge, Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Workspace Area Filter */}
          <div className="relative">
            <select
              value={currentArea}
              onChange={(e) => onAreaChange(e.target.value)}
              aria-label="Filter by workspace area"
              className="text-xs sm:text-sm font-medium py-1.5 px-2.5 sm:px-3 pr-8 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] transition-colors cursor-pointer appearance-none"
            >
              <option value="All">All Areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-xs text-[var(--hub-muted)]">
              ▾
            </div>
          </div>

          {/* Sync Status Badge */}
          {getSyncBadge()}

          {/* Notifications Bell */}
          <button
            onClick={() => onNavigate('notifications')}
            className="relative p-2 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
            aria-label="Notifications"
            title="Notifications & Reminders"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                {unreadNotifs.length}
              </span>
            )}
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
