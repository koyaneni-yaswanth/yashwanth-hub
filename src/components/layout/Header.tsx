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
  Compass,
  Crosshair,
} from 'lucide-react';
import { db } from '../../db';
import { TurbineLogo } from '../common/TurbineLogo';
import { useTheme } from '../../context/ThemeContext';
import { useSync } from '../../context/SyncContext';
import { useFocusMode } from '../../context/FocusModeContext';
import { SupabaseAuthService, type AuthState } from '../../services/auth/supabaseAuthService';
import type { Area, NavigationTab } from '../../types';

interface HeaderProps {
  currentTab?: NavigationTab;
  currentArea: string;
  onAreaChange: (area: string) => void;
  areas: Area[];
  onOpenMobileMenu: () => void;
  onOpenCommandPalette: () => void;
  onOpenQuickCapture?: () => void;
  onOpenSyncModal?: () => void;
  onNavigate: (tab: NavigationTab) => void;
  turbineDuration?: number;
  hudMode?: boolean;
}

const HEADER_QUICK_TABS: Array<{ tab: NavigationTab; label: string }> = [
  { tab: 'dashboard', label: 'Home' },
  { tab: 'universe', label: '3D Studio' },
  { tab: 'buddy', label: 'JARVIS' },
  { tab: 'tasks', label: 'Tasks' },
  { tab: 'calendar', label: 'Calendar' },
  { tab: 'projects', label: 'Projects' },
];

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  currentArea,
  onAreaChange,
  areas,
  onOpenMobileMenu,
  onOpenCommandPalette,
  onOpenQuickCapture,
  onOpenSyncModal,
  onNavigate,
  turbineDuration = 8,
  hudMode = false,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const { status, queueCount, failedCount, signedIn, statusMessage, syncNow } = useSync();
  const focus = useFocusMode();
  const [authState, setAuthState] = React.useState<AuthState>(() => SupabaseAuthService.getState());

  React.useEffect(() => {
    return SupabaseAuthService.subscribe(setAuthState);
  }, []);

  // Soft shadow under the header once content scrolls beneath it.
  const [isScrolled, setIsScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
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
        icon: <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-800 dark:text-amber-300" />,
        title: 'Syncing workspace...',
        label: 'Syncing',
      };
    }
    if (status === 'offline') {
      return {
        icon: <WifiOff className="w-3.5 h-3.5 text-red-700 dark:text-red-300" />,
        title: queueCount > 0 ? `Offline — ${queueCount} change(s) saved locally, will sync when online` : 'Offline — changes saved locally',
        label: queueCount > 0 ? `Offline · ${queueCount}` : 'Offline',
      };
    }
    if (status === 'error') {
      return {
        icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-800 dark:text-amber-300" />,
        title: statusMessage,
        label: failedCount > 0 ? `Sync issue · ${failedCount}` : 'Sync issue',
      };
    }
    if (status === 'synced') {
      return {
        icon: <Cloud className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />,
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
    <header
      className={`sticky top-0 z-30 backdrop-blur-md px-2.5 sm:px-6 py-2 safe-area-header transition-colors${
        hudMode
          ? ' bg-[rgba(5,7,13,0.78)] border-b border-[rgba(59,232,255,0.18)] text-[#E6F1FF]'
          : ' bg-[var(--hub-surface)]/95 border-b border-[var(--hub-line)]'
      }${isScrolled ? ' is-scrolled' : ''}`}
    >
      <div className={`flex items-center justify-between gap-1.5 sm:gap-3 ${hudMode ? 'w-full' : 'max-w-7xl mx-auto'}`}>
        {/* Left: Menu + Brand */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="lg:hidden p-1.5 sm:p-2 rounded-xl text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="flex items-center gap-2 sm:gap-2.5 cursor-pointer text-left min-w-0"
          >
            <TurbineLogo size={26} durationSeconds={turbineDuration} />
            <div className="min-w-0">
              <h1 className="text-[14px] sm:text-lg font-bold font-heading text-[var(--hub-ink)] tracking-tight leading-tight whitespace-nowrap">
                Yashwanth Hub
              </h1>
              <div className="text-[10px] sm:text-[11px] text-[var(--hub-muted)] font-medium leading-tight">
                {todayStr}
              </div>
            </div>
          </button>
        </div>

        {/* Center: 1-Click Core Bar (lg+) + Search Bar */}
        <div className="hidden md:flex items-center gap-2 min-w-0">
          <nav aria-label="Quick switch" className="hidden lg:flex items-center gap-1 mr-1">
            {HEADER_QUICK_TABS.map((item) => {
              const active = currentTab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  aria-current={active ? 'page' : undefined}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? hudMode
                        ? 'bg-[#3BE8FF]/20 text-[#3BE8FF] border border-[#3BE8FF]/45'
                        : 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                      : hudMode
                      ? 'text-[#A8B8D0] hover:text-[#E6F1FF] hover:bg-white/5'
                      : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <button
            onClick={onOpenCommandPalette}
            aria-label="Search (Ctrl+K)"
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)]/80 text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:border-[var(--hub-accent)] transition-all cursor-pointer md:w-36 lg:w-36 xl:w-52 min-w-0 justify-between"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Jump or search...</span>
            </span>
            <kbd className="shrink-0 px-1.5 py-0.5 text-[10px] font-mono bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Right: Essential Controls Only */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {/* Mobile & Tablet 1-Tap 3D Studio Pill */}
          <button
            type="button"
            onClick={() => onNavigate('universe')}
            data-testid="header-mobile-3d-btn"
            aria-label="Open 3D Studio"
            title="Open Interactive 3D Engineering Studio"
            className={`lg:hidden inline-flex items-center gap-1 px-2 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer ${
              currentTab === 'universe'
                ? 'border-[#C6A46B]/60 bg-[#C6A46B]/18 text-[#C6A46B]'
                : 'border-[var(--hub-line)] bg-[var(--hub-bg)]/80 text-[var(--hub-ink)]'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-[#C6A46B]" />
            <span>3D</span>
          </button>

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

          {/* Primary Quick Add Button (on phones, MobileNav provides the center '+' FAB cleanly without duplicating buttons) */}
          {onOpenQuickCapture && (
            <button
              onClick={onOpenQuickCapture}
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold whitespace-nowrap hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer shadow-xs"
              title="Quick Add or Voice Capture (Ctrl+Q)"
              aria-label="Quick Add"
            >
              <Plus className="w-4 h-4" />
              <span>Quick Add</span>
            </button>
          )}

          {/* Focus Mode Toggle (One Thing at a Time — Home strip & mobile drawer also expose it on xs) */}
          <button
            type="button"
            onClick={focus.toggleFocusMode}
            aria-pressed={focus.enabled}
            aria-label={focus.enabled ? `Exit Focus Mode (${focus.workspace.shortLabel})` : 'Enter Focus Mode (Ctrl+Shift+F)'}
            title={focus.enabled ? `Focused: ${focus.workspace.label} (Click to exit)` : 'Enter Focus Mode (Ctrl+Shift+F)'}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              focus.enabled
                ? 'border-[#7C5CFF]/60 bg-[#7C5CFF]/15 text-[#E6F1FF] dark:text-[#E6F1FF] hover:bg-[#7C5CFF]/25'
                : 'border-[var(--hub-line)] bg-[var(--hub-bg)]/60 text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:border-[var(--hub-accent)]/40'
            }`}
          >
            <Crosshair className={`w-3.5 h-3.5 shrink-0 ${focus.enabled ? 'text-[#3BE8FF]' : ''}`} />
            <span className="hidden lg:inline">
              {focus.enabled ? focus.workspace.shortLabel : 'Focus'}
            </span>
          </button>

          {/* Always-visible Account / Live Sync Pill (Mobile + Desktop) */}
          <button
            type="button"
            onClick={() => {
              if (onOpenSyncModal) {
                onOpenSyncModal();
              } else if (authState.configured && !signedIn && !authState.user) {
                onNavigate('integrations');
              } else if (status === 'error' || (authState.configured && signedIn)) {
                void syncNow();
              } else {
                onNavigate('integrations');
              }
            }}
            title={
              authState.configured && (signedIn || authState.user)
                ? `${authState.user?.email || 'Signed in'} • ${statusMessage} (Click to sync now)`
                : statusMessage || syncInfo.title
            }
            aria-label={
              authState.configured && !signedIn && !authState.user
                ? 'Sign in to sync across devices'
                : status === 'syncing'
                ? 'Syncing across devices'
                : 'Cloud sync status — click to sync now'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
              authState.configured && !signedIn && !authState.user && status !== 'offline'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15'
                : status === 'error'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15'
                : 'border-[var(--hub-line)] bg-[var(--hub-bg)]/60 text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:border-[var(--hub-accent)]/40'
            }`}
          >
            {authState.configured && status !== 'offline' && status !== 'error' && status !== 'syncing' ? (
              signedIn || authState.user ? (
                <UserCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              ) : (
                <LogIn className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300 shrink-0" />
              )
            ) : (
              syncInfo.icon
            )}
            <span className="max-w-[96px] truncate hidden sm:inline">
              {status === 'syncing'
                ? 'Syncing'
                : status === 'offline'
                ? syncInfo.label
                : status === 'error'
                ? failedCount > 0
                  ? `Retry · ${failedCount}`
                  : 'Sync issue'
                : authState.configured
                ? signedIn || authState.user
                  ? queueCount > 0
                    ? `Syncing · ${queueCount}`
                    : 'Synced'
                  : 'Sign in'
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
              <Sun className="w-4 h-4 text-amber-800 dark:text-amber-300" />
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
                : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/30'
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
