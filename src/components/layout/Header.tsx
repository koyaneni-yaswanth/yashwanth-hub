import React from 'react';
import { Sun, Moon, Database, Cloud, RefreshCw, WifiOff, Menu } from 'lucide-react';
import { TurbineLogo } from '../common/TurbineLogo';
import { useTheme } from '../../context/ThemeContext';
import { useSync } from '../../context/SyncContext';
import type { Area } from '../../types';

interface HeaderProps {
  currentArea: string;
  onAreaChange: (area: string) => void;
  areas: Area[];
  onOpenMobileMenu: () => void;
  turbineDuration?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentArea,
  onAreaChange,
  areas,
  onOpenMobileMenu,
  turbineDuration = 8,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const { status, statusMessage, syncNow } = useSync();

  const todayStr = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const getSyncBadge = () => {
    switch (status) {
      case 'synced':
        return (
          <button
            onClick={() => syncNow()}
            title="Cloud Synced (Click to refresh)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Synced</span>
          </button>
        );
      case 'syncing':
        return (
          <span
            title="Syncing with Supabase..."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 animate-pulse"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
            <span className="hidden sm:inline">Syncing</span>
          </span>
        );
      case 'offline':
        return (
          <span
            title="Device is offline. Local changes saved to IndexedDB queue."
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20"
          >
            <WifiOff className="w-3.5 h-3.5 text-red-600" />
            <span className="hidden sm:inline">Offline</span>
          </span>
        );
      case 'local':
      default:
        return (
          <div
            title="Running in Local-First Mode (Data safely stored in browser IndexedDB)"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20"
          >
            <Database className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span className="hidden sm:inline">Local (IndexedDB)</span>
          </div>
        );
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[var(--hub-surface)] border-b border-[var(--hub-line)] backdrop-blur-md px-4 sm:px-6 py-3 transition-colors">
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

          <div className="flex items-center gap-3">
            <TurbineLogo size={38} durationSeconds={turbineDuration} />
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

        {/* Right: Area filter, Sync Badge, Theme Toggle */}
        <div className="flex items-center gap-2 sm:gap-3">
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
