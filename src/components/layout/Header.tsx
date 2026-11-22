import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Sun,
  Moon,
  Cloud,
  RefreshCw,
  WifiOff,
  Menu,
  Bell,
  Search,
  Plus,
  UserCheck,
  LogIn,
  AlertTriangle,
} from 'lucide-react';
import { db } from '../../db';
import { TurbineLogo } from '../common/TurbineLogo';
import { useTheme } from '../../context/ThemeContext';
import { useSync } from '../../context/SyncContext';
import { SupabaseAuthService, type AuthState } from '../../services/auth/supabaseAuthService';
import type { Area, NavigationTab } from '../../types';

interface HeaderProps {
  currentArea: string;
  onAreaChange: (area: string) => void;
  areas: Area[];
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
  onOpenQuickCapture?: () => void;
  onNavigate: (tab: NavigationTab) => void;
  turbineDuration?: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentArea,
  onAreaChange,
  areas,
  onOpenMobileMenu,
  onOpenCommandPalette,
  onOpenQuickCapture,
  onNavigate,
  turbineDuration = 8,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const { status, queueCount, failedCount, statusMessage } = useSync();
  const [authState, setAuthState] = React.useState<AuthState>(() => SupabaseAuthService.getState());

  React.useEffect(() => {
    return SupabaseAuthService.subscribe(setAuthState);
  }, []);

  const unreadNotifs =
    useLiveQuery(() => db.notifications.filter((n) => !n.read).toArray(), []) || [];

  const todayStr = new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());

  const getSyncDot = () => {
    if (status === 'syncing') {
      return {
        icon: <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />,
        title: 'Syncing workspace...',
        label: 'Syncing',
      };
    }
    if (status === 'offline') {
      return {
        icon: <WifiOff className="w-3.5 h-3.5 text-red-500" />,
        title: queueCount > 0 ? `Offline — ${queueCount} change(s) saved locally, will sync when online` : 'Offline — changes saved locally',
        label: queueCount > 0 ? `Offline · ${queueCount}` : 'Offline',
      };
    }
    if (status === 'error') {
      return {
        icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
        title: statusMessage,
        label: failedCount > 0 ? `Sync issue · ${failedCount}` : 'Sync issue',
      };
    }
    if (status === 'synced') {
      return {
        icon: <Cloud className="w-3.5 h-3.5 text-emerald-500" />,
        title: statusMessage || 'Cloud synced',
        label: queueCount > 0 ? `${queueCount} pending` : 'Synced',
      };
    }
    return {
      icon: <span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />,
      title: 'Local mode — saved safely on this device',
      label: 'Saved locally',
    };
  };

  const syncInfo = getSyncDot();

  return (
    <header className="sticky top-0 z-30 bg-[var(--hub-surface)]/95 border-b border-[var(--hub-line)] backdrop-blur-md px-3 sm:px-6 py-2.5 safe-area-header transition-colors">
      <div className="flex items-center justify-between gap-2 sm:gap-3 max-w-7xl mx-auto">
        {/* Left: Menu + Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 rounded-xl text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer text-left min-w-0"
          >
            <TurbineLogo size={32} durationSeconds={turbineDuration} />
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold font-heading text-[var(--hub-ink)] tracking-tight leading-tight truncate">
                Yashwanth Hub
              </h1>
              <div className="text-[11px] text-[var(--hub-muted)] font-medium leading-tight">
                {todayStr}
              </div>
            </div>
          </button>
        </div>

        {/* Center: Clean Search Bar (Desktop) */}
        <button
          onClick={onOpenCommandPalette}
          aria-label="Search (Ctrl+K)"
          className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)]/80 text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:border-[var(--hub-accent)] transition-all cursor-pointer md:w-52 lg:w-64 xl:w-72 min-w-0 justify-between"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Search tasks, notes, projects...</span>
          </span>
          <kbd className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded">
            Ctrl K
          </kbd>
        </button>

        {/* Right: Essential Controls Only */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Search Icon */}
          <button
            onClick={onOpenCommandPalette}
            className="md:hidden p-2 rounded-xl text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            aria-label="Search"
            title="Search (Ctrl+K)"
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Workspace Area Filter (Compact) */}
          <div className="relative hidden sm:block">
            <select
              value={currentArea}
              onChange={(e) => onAreaChange(e.target.value)}
              aria-label="Filter by workspace area"
              className="text-xs font-medium py-1.5 pl-2.5 pr-7 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] transition-colors cursor-pointer appearance-none"
            >
              <option value="All">All Areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
            <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-[var(--hub-muted)]">
              ▾
            </span>
          </div>

          {/* Primary Quick Add Button */}
          {onOpenQuickCapture && (
            <button
              onClick={onOpenQuickCapture}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold whitespace-nowrap hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer shadow-xs"
              title="Quick Add or Voice Capture (Ctrl+Q)"
              aria-label="Quick Add"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Quick Add</span>
            </button>
          )}

          {/* Subtle Account / Sync Status Pill (Desktop) */}
          <button
            onClick={() => onNavigate('integrations')}
            title={
              authState.configured && authState.user
                ? `${authState.user.email || 'Signed in'} • ${syncInfo.title}`
                : syncInfo.title
            }
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)]/60 text-xs font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:border-[var(--hub-accent)]/40 transition-colors cursor-pointer"
          >
            {authState.configured && status !== 'offline' && status !== 'error' ? (
              authState.user ? (
                <UserCheck className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              ) : (
                <LogIn className="w-3.5 h-3.5 text-amber-500" />
              )
            ) : (
              syncInfo.icon
            )}
            <span className="max-w-[84px] truncate">
              {authState.configured && status !== 'offline' && status !== 'error'
                ? authState.user
                  ? authState.user.email?.split('@')[0] || 'Account'
                  : 'Sign In'
                : syncInfo.label}
            </span>
          </button>

          {/* Notifications Bell */}
          <button
            onClick={() => onNavigate('notifications')}
            className="relative p-2 rounded-xl text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
            aria-label={unreadNotifs.length > 0 ? `Notifications (${unreadNotifs.length} unread)` : 'Notifications'}
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifs.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[var(--hub-surface)]" />
            )}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>
      </div>
      {/* Offline / sync-problem notice — visible on every screen size, announced politely */}
      <div role="status" aria-live="polite" className="max-w-7xl mx-auto">
        {(status === 'offline' || (status === 'error' && failedCount > 0)) && (
          <p
            className={`mt-2 flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium ${
              status === 'offline'
                ? 'bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-line)]'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
            }`}
          >
            {status === 'offline' ? <WifiOff className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
            <span className="min-w-0">
              {status === 'offline'
                ? "You're offline. Everything you change is saved on this device and syncs when you reconnect."
                : statusMessage}
            </span>
          </p>
        )}
      </div>
    </header>
  );
};
