import React, { useState, useEffect } from 'react';
import {
  Home,
  Compass,
  Sparkles,
  Layers,
  Brain,
  SlidersHorizontal,
  Settings,
  X,
  Search,
  Crosshair,
  ChevronDown,
  ChevronRight,
  Grid,
  CheckSquare,
  Calendar,
  FolderKanban,
  Sun,
  FileText,
} from 'lucide-react';
import {
  HUB_DESTINATIONS,
  destinationForTab,
  type HubDestinationId,
} from '../../lib/hubArchitecture';
import { useFocusMode } from '../../context/FocusModeContext';
import type { NavigationTab } from '../../types';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  openTasksCount?: number;
  activeProjectsCount?: number;
  unreadNotifsCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onOpenCommandPalette?: () => void;
  /** On Home desktop, collapse sidebar into a 64px frosted glass icon rail. */
  compactRail?: boolean;
}

const PINNED_QUICK_LINKS: Array<{ tab: NavigationTab; label: string; icon: React.ElementType }> = [
  { tab: 'dashboard', label: 'Home', icon: Home },
  { tab: 'universe', label: '3D Studio', icon: Compass },
  { tab: 'buddy', label: 'JARVIS', icon: Sparkles },
  { tab: 'my-day', label: 'My Day', icon: Sun },
  { tab: 'tasks', label: 'Tasks', icon: CheckSquare },
  { tab: 'calendar', label: 'Calendar', icon: Calendar },
  { tab: 'projects', label: 'Projects', icon: FolderKanban },
  { tab: 'ai-assistant', label: 'Ask AI', icon: Brain },
  { tab: 'notes', label: 'Notes', icon: FileText },
];

const DESTINATION_ICONS: Record<HubDestinationId, React.ElementType> = {
  home: Home,
  command: Compass,
  'ai-studio': Sparkles,
  workspace: Layers,
  intelligence: Brain,
  system: SlidersHorizontal,
};

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  openTasksCount = 0,
  activeProjectsCount = 0,
  unreadNotifsCount = 0,
  isOpenMobile = false,
  onCloseMobile,
  onOpenCommandPalette,
  compactRail = false,
}) => {
  const focus = useFocusMode();
  const activeDest = destinationForTab(currentTab);
  const [expandedDestId, setExpandedDestId] = useState<HubDestinationId>(activeDest.id);
  const [showSecondaryInDrawer, setShowSecondaryInDrawer] = useState<boolean>(false);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [navFilter, setNavFilter] = useState('');

  useEffect(() => {
    setExpandedDestId(activeDest.id);
    const currentIsSecondary = activeDest.routes.some(
      (r) => r.tab === currentTab && r.tier === 'secondary'
    );
    if (currentIsSecondary) setShowSecondaryInDrawer(true);
  }, [activeDest.id, activeDest.routes, currentTab]);

  useEffect(() => {
    if (!flyoutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFlyoutOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flyoutOpen]);

  const handleNavClick = (tab: NavigationTab) => {
    setFlyoutOpen(false);
    setNavFilter('');
    onSelectTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const trimmedNavFilter = navFilter.trim().toLowerCase();
  const filteredNavRoutes = trimmedNavFilter
    ? HUB_DESTINATIONS.flatMap((dest) =>
        dest.routes
          .filter(
            (r) =>
              r.label.toLowerCase().includes(trimmedNavFilter) ||
              r.description.toLowerCase().includes(trimmedNavFilter) ||
              dest.label.toLowerCase().includes(trimmedNavFilter)
          )
          .map((r) => ({ ...r, groupLabel: dest.label }))
      )
    : [];

  const badgeForDestination = (id: HubDestinationId): number | undefined => {
    if (id === 'workspace' && openTasksCount > 0) return openTasksCount;
    if (id === 'command' && activeProjectsCount > 0) return activeProjectsCount;
    if (id === 'system' && unreadNotifsCount > 0) return unreadNotifsCount;
    return undefined;
  };

  const navContent = (
    <div className="flex flex-col h-full py-4 px-3">
      {/* Mobile Drawer Header */}
      <div className="flex items-center justify-between px-3 pb-3 mb-2 border-b border-[var(--hub-line)] lg:hidden">
        <div>
          <span className="font-heading font-bold text-base text-[var(--hub-ink)]">
            Yashwanth Hub
          </span>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--hub-muted)]">
            Quick Jump &amp; All Pages
          </div>
        </div>
        <button
          onClick={onCloseMobile}
          aria-label="Close menu"
          className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Live Page Filter + 1-Tap Quick Access */}
      <div className="mb-3 space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--hub-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={navFilter}
            onChange={(e) => setNavFilter(e.target.value)}
            aria-label="Jump to any page"
            placeholder="Jump to page..."
            className="w-full pl-8 pr-7 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)] placeholder:text-[var(--hub-muted)] focus:outline-none focus:border-[var(--hub-accent)]"
          />
          {navFilter && (
            <button
              type="button"
              onClick={() => setNavFilter('')}
              aria-label="Clear page filter"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {!trimmedNavFilter && !focus.enabled && (
          <div className="space-y-1">
            <div className="px-1 text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--hub-muted)]">
              Quick Access
            </div>
            <div className="grid grid-cols-2 gap-1">
              {PINNED_QUICK_LINKS.map((item) => {
                const QIcon = item.icon;
                const active = currentTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    type="button"
                    onClick={() => handleNavClick(item.tab)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left truncate ${
                      active
                        ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] font-semibold'
                        : 'bg-[var(--hub-bg)]/70 border border-[var(--hub-line)]/70 text-[var(--hub-ink)] hover:border-[var(--hub-accent)]/50'
                    }`}
                  >
                    <QIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filtered Search Results OR 6 Structured Destinations */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1" aria-label="Primary navigation">
        {trimmedNavFilter ? (
          <div className="space-y-1">
            {filteredNavRoutes.length === 0 ? (
              <div className="px-3 py-4 text-xs text-[var(--hub-muted)] text-center">
                No page matching &ldquo;{navFilter}&rdquo;
              </div>
            ) : (
              filteredNavRoutes.map((route) => {
                const routeActive = currentTab === route.tab;
                return (
                  <button
                    key={`${route.groupLabel}-${route.tab}`}
                    type="button"
                    onClick={() => handleNavClick(route.tab)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer ${
                      routeActive
                        ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] font-semibold'
                        : 'text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                    }`}
                  >
                    <div className="font-semibold">{route.label}</div>
                    <div className="text-[10px] opacity-75 truncate">
                      {route.groupLabel} · {route.description}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        ) : (
          HUB_DESTINATIONS.map((dest) => {
          const Icon = DESTINATION_ICONS[dest.id];
          const isActiveDest = activeDest.id === dest.id;
          const badge = badgeForDestination(dest.id);
          const isOpenGroup = expandedDestId === dest.id;
          const primaryRoutes = dest.routes.filter((r) => r.tier === 'primary');
          const secondaryRoutes = dest.routes.filter((r) => r.tier === 'secondary');
          const visibleRoutes =
            focus.enabled
              ? primaryRoutes.slice(0, 2)
              : isActiveDest && showSecondaryInDrawer
              ? dest.routes
              : primaryRoutes;

          return (
            <div key={dest.id} className="space-y-1">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setExpandedDestId(dest.id);
                    handleNavClick(dest.defaultTab);
                  }}
                  aria-current={isActiveDest ? 'page' : undefined}
                  className={`flex-1 flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer text-left ${
                    isActiveDest
                      ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] shadow-xs font-semibold'
                      : dest.id === 'ai-studio'
                      ? 'text-[var(--hub-ink)] border border-[var(--hub-line)] bg-[var(--hub-bg)]/50 hover:bg-[var(--hub-bg)] hover:border-[var(--hub-accent)]/40'
                      : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-4 h-4 flex-none ${
                        isActiveDest
                          ? 'text-[var(--hub-accent-ink)]'
                          : dest.id === 'ai-studio'
                          ? 'text-[var(--hub-accent)]'
                          : ''
                      }`}
                    />
                    <span className="truncate">{dest.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {badge !== undefined && (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                          isActiveDest
                            ? 'bg-[var(--hub-accent-ink)]/15 text-[var(--hub-accent-ink)]'
                            : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-ink)]'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </div>
                </button>

                {dest.routes.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpandedDestId((prev) => (prev === dest.id ? ('' as HubDestinationId) : dest.id))}
                    aria-label={isOpenGroup ? `Collapse ${dest.label}` : `Expand ${dest.label}`}
                    aria-expanded={isOpenGroup}
                    className="p-2 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer shrink-0"
                  >
                    {isOpenGroup ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {/* Contextual sub-routes inside the active/expanded destination */}
              {isOpenGroup && dest.routes.length > 1 && (
                <div className="ml-4 pl-3 border-l border-[var(--hub-line)] space-y-0.5 py-0.5">
                  {visibleRoutes.map((route) => {
                    const routeActive = currentTab === route.tab;
                    return (
                      <button
                        key={route.tab}
                        type="button"
                        onClick={() => handleNavClick(route.tab)}
                        aria-current={routeActive ? 'page' : undefined}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer truncate ${
                          routeActive
                            ? 'bg-[var(--hub-accent)]/14 text-[var(--hub-accent)] font-semibold'
                            : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                        }`}
                      >
                        {route.label}
                      </button>
                    );
                  })}
                  {!focus.enabled && secondaryRoutes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSecondaryInDrawer((v) => !v)}
                      className="w-full text-left px-2.5 py-1 text-[11px] font-medium text-[var(--hub-muted)] hover:text-[var(--hub-accent)] cursor-pointer"
                    >
                      {showSecondaryInDrawer ? 'Less options' : `+ ${secondaryRoutes.length} more`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
          })
        )}

        {/* Quick Focus Mode & Global Search */}
        <div className="pt-3 mt-2 border-t border-[var(--hub-line)]/70 space-y-1">
          <button
            type="button"
            onClick={() => {
              focus.toggleFocusMode();
              if (onCloseMobile) onCloseMobile();
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-left ${
              focus.enabled
                ? 'bg-[var(--hub-accent)]/14 text-[var(--hub-accent)] border border-[var(--hub-accent)]/35'
                : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
            }`}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Crosshair className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {focus.enabled ? `Focus: ${focus.workspace.shortLabel}` : 'Focus Mode'}
              </span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--hub-bg)] border border-[var(--hub-line)] rounded text-[var(--hub-muted)]">
              {focus.enabled ? 'ON' : '1x'}
            </kbd>
          </button>

          {onOpenCommandPalette && (
            <button
              type="button"
              onClick={() => {
                onOpenCommandPalette();
                if (onCloseMobile) onCloseMobile();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Search className="w-4 h-4 flex-none" />
                <span className="truncate">Search</span>
              </div>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--hub-bg)] border border-[var(--hub-line)] rounded text-[var(--hub-muted)]">
                Ctrl K
              </kbd>
            </button>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="pt-3 mt-auto border-t border-[var(--hub-line)] flex items-center justify-between px-2">
        <span className="text-[11px] font-medium text-[var(--hub-muted)]">
          Jarvis OS 3.0
        </span>
        <button
          type="button"
          onClick={() => handleNavClick('settings')}
          className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {compactRail ? (
        /* 64px Glass Icon Rail on Home (Desktop): 6 Primary Destinations + Focus Mode + Browse + Search */
        <aside
          aria-label="HUD Quick Rail"
          className="hud-enter-rail hidden lg:flex flex-col items-center w-16 flex-none relative z-30 border-r border-[rgba(59,232,255,0.18)] bg-[rgba(10,16,28,0.55)] backdrop-blur-xl py-3 gap-1.5"
        >
          <nav className="flex-1 flex flex-col items-center gap-1.5 w-full px-2" aria-label="Primary HUD navigation">
            {HUB_DESTINATIONS.map((dest) => {
              const Icon = DESTINATION_ICONS[dest.id];
              const isActive = activeDest.id === dest.id;
              const badge = badgeForDestination(dest.id);
              return (
                <div key={dest.id} className="relative group w-full flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleNavClick(dest.defaultTab)}
                    aria-label={dest.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] ${
                      isActive
                        ? 'bg-[#3BE8FF]/18 text-[#3BE8FF] border border-[#3BE8FF]/55 shadow-[0_0_16px_-2px_rgba(59,232,255,0.5)]'
                        : dest.id === 'ai-studio'
                        ? 'text-[#7C5CFF] bg-[#7C5CFF]/12 border border-[#7C5CFF]/30 hover:bg-[#7C5CFF]/22'
                        : 'text-[#7A8BA6] hover:text-[#E6F1FF] hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5" aria-hidden="true" />
                    {badge !== undefined && !focus.enabled && (
                      <span className="hud-tabular absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#3BE8FF] text-[#05070D] text-[9px] font-bold flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-14 top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg hud-glass-pill text-[11px] font-medium text-[#E6F1FF] z-50 shadow-lg"
                  >
                    {dest.code} · {dest.label}
                  </span>
                </div>
              );
            })}

            {/* Focus Mode Trigger */}
            <div className="relative group w-full flex justify-center mt-1 pt-2 border-t border-[rgba(59,232,255,0.12)]">
              <button
                type="button"
                onClick={focus.toggleFocusMode}
                aria-pressed={focus.enabled}
                aria-label={focus.enabled ? 'Exit Focus Mode' : 'Enter Focus Mode'}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] ${
                  focus.enabled
                    ? 'bg-[#7C5CFF]/25 text-[#E6F1FF] border border-[#7C5CFF]/60 shadow-[0_0_14px_rgba(124,92,255,0.45)]'
                    : 'text-[#7A8BA6] hover:text-[#3BE8FF] hover:bg-white/5 border border-transparent'
                }`}
              >
                <Crosshair className="w-4 h-4" aria-hidden="true" />
              </button>
              <span
                role="tooltip"
                className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-14 top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg hud-glass-pill text-[11px] font-medium text-[#E6F1FF] z-50"
              >
                {focus.enabled ? `Exit Focus (${focus.workspace.shortLabel})` : 'Focus Mode (Ctrl+Shift+F)'}
              </span>
            </div>

            {onOpenCommandPalette && (
              <div className="relative group w-full flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setFlyoutOpen(false);
                    onOpenCommandPalette();
                  }}
                  aria-label="Search (Ctrl+K)"
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-[#7A8BA6] hover:text-[#E6F1FF] hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF]"
                >
                  <Search className="w-4 h-4" aria-hidden="true" />
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-14 top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg hud-glass-pill text-[11px] font-medium text-[#E6F1FF] z-50"
                >
                  Search (Ctrl+K)
                </span>
              </div>
            )}

            {/* All Destinations Flyout Trigger */}
            <div className="relative group w-full flex justify-center">
              <button
                type="button"
                onClick={() => setFlyoutOpen((v) => !v)}
                aria-expanded={flyoutOpen}
                aria-label="Browse all pages"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] ${
                  flyoutOpen
                    ? 'bg-[#3BE8FF]/15 text-[#3BE8FF] border border-[#3BE8FF]/45'
                    : 'text-[#7A8BA6] hover:text-[#E6F1FF] hover:bg-white/5 border border-transparent'
                }`}
              >
                <Grid className="w-4 h-4" aria-hidden="true" />
              </button>
              {!flyoutOpen && (
                <span
                  role="tooltip"
                  className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-14 top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg hud-glass-pill text-[11px] font-medium text-[#E6F1FF] z-50"
                >
                  All views
                </span>
              )}

              {flyoutOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFlyoutOpen(false)} aria-hidden="true" />
                  <div
                    role="dialog"
                    aria-label="Browse all destinations"
                    className="hud-glass fixed left-[72px] top-[76px] z-50 w-72 max-h-[calc(100vh-110px)] overflow-y-auto p-3.5 space-y-3 shadow-2xl"
                  >
                    <div className="flex items-center justify-between border-b border-[rgba(59,232,255,0.14)] pb-2">
                      <span className="font-heading text-xs font-bold uppercase tracking-wider text-[#E6F1FF]">
                        All Pages
                      </span>
                      <button
                        type="button"
                        onClick={() => setFlyoutOpen(false)}
                        aria-label="Close views menu"
                        className="p-1 rounded-lg text-[#7A8BA6] hover:text-[#E6F1FF] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#7A8BA6] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={navFilter}
                        onChange={(e) => setNavFilter(e.target.value)}
                        aria-label="Filter pages"
                        placeholder="Filter pages..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[rgba(59,232,255,0.18)] bg-black/30 text-xs text-[#E6F1FF] placeholder:text-[#7A8BA6] focus:outline-none focus:border-[#3BE8FF]"
                      />
                    </div>
                    {(trimmedNavFilter
                      ? [{ id: 'filtered' as HubDestinationId, code: 'MATCH', label: 'Matching Pages', routes: filteredNavRoutes }]
                      : HUB_DESTINATIONS.filter((d) => d.id !== 'home')
                    ).map((dest) => (
                      <div key={dest.id} className="space-y-1">
                        <div className="px-2 text-[10px] font-mono uppercase tracking-[0.14em] text-[#7A8BA6]">
                          {dest.code} · {dest.label}
                        </div>
                        {dest.routes.map((route) => {
                          const routeActive = currentTab === route.tab;
                          return (
                            <button
                              key={`${dest.id}-${route.tab}`}
                              type="button"
                              onClick={() => handleNavClick(route.tab)}
                              className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left ${
                                routeActive
                                  ? 'bg-[#3BE8FF]/18 text-[#3BE8FF]'
                                  : 'text-[#E6F1FF]/85 hover:bg-white/5 hover:text-[#E6F1FF]'
                              }`}
                            >
                              <span className="truncate">{route.label}</span>
                              {route.tier === 'secondary' && (
                                <span className="text-[9px] font-mono uppercase text-[#7A8BA6]">More</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </nav>

          {/* Bottom Settings Icon */}
          <div className="relative group w-full flex justify-center pt-2 border-t border-[rgba(59,232,255,0.12)]">
            <button
              type="button"
              onClick={() => handleNavClick('settings')}
              aria-label="Settings"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[#7A8BA6] hover:text-[#E6F1FF] hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF]"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-14 top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg hud-glass-pill text-[11px] font-medium text-[#E6F1FF] z-50"
            >
              Settings
            </span>
          </div>
        </aside>
      ) : (
        /* Standard Expanded Desktop Sidebar for non-Home destinations */
        <aside className="hidden lg:block w-60 flex-none bg-[var(--hub-surface)] border-r border-[var(--hub-line)] min-h-[calc(100vh-57px)]">
          {navContent}
        </aside>
      )}

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-[var(--hub-surface)] border-r border-[var(--hub-line)] shadow-2xl z-50">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
