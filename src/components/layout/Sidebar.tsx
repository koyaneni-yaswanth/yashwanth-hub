import React, { useState, useEffect } from 'react';
import {
  Home,
  Calendar,
  CheckSquare,
  FileText,
  FolderArchive,
  IndianRupee,
  Sparkles,
  BarChart3,
  Settings,
  FolderKanban,
  Cloud,
  X,
  Brain,
  Zap,
  Wind,
  Bot,
  Heart,
  Search,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Grid,
  Target,
  Timer,
  Compass,
} from 'lucide-react';
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

interface NavItem {
  id: NavigationTab;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
  highlight?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  openTasksCount = 0,
  activeProjectsCount = 0,
  isOpenMobile = false,
  onCloseMobile,
  onOpenCommandPalette,
  compactRail = false,
}) => {
  // Core 7 primary everyday views
  const primaryItems: NavItem[] = [
    { id: 'dashboard', label: 'Home', icon: Home },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: CheckSquare,
      badge: openTasksCount > 0 ? openTasksCount : undefined,
    },
    { id: 'goals', label: 'Goals & Habits', icon: Target },
    { id: 'momentum', label: 'Momentum', icon: Sparkles },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    {
      id: 'projects',
      label: 'Projects',
      icon: FolderKanban,
      badge: activeProjectsCount > 0 ? activeProjectsCount : undefined,
    },
    { id: 'ai-assistant', label: 'Ask AI', icon: Sparkles, highlight: true },
  ];

  const groupedTools: NavGroup[] = [
    {
      title: 'Daily & Notes',
      items: [
        { id: 'my-day', label: 'My Day', icon: Compass },
        { id: 'focus', label: 'Deep Work', icon: Timer },
        { id: 'notes', label: 'Notes', icon: FileText },
        { id: 'documents', label: 'Files & Docs', icon: FolderArchive },
        { id: 'knowledge-memory', label: 'Memory Vault', icon: Brain },
      ],
    },
    {
      title: 'Workspaces',
      items: [
        { id: 'startup-command', label: 'Pawan Shakti', icon: Wind },
        { id: 'robotics-lab', label: 'Robotics Lab', icon: Bot },
        { id: 'learning-career', label: 'Learning & Career', icon: GraduationCap },
      ],
    },
    {
      title: 'Life & Ops',
      items: [
        { id: 'finance', label: 'Finance', icon: IndianRupee },
        { id: 'health-routine', label: 'Routine & Health', icon: Heart },
        { id: 'automations', label: 'Automations', icon: Zap },
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      ],
    },
    {
      title: 'System',
      items: [
        { id: 'integrations', label: 'Integrations & Sync', icon: Cloud },
        { id: 'system-health', label: 'Sync Health & Devices', icon: Zap },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const allSecondaryIds = groupedTools.flatMap((g) => g.items.map((i) => i.id));
  const isCurrentInMore = allSecondaryIds.includes(currentTab);
  const [isMoreExpanded, setIsMoreExpanded] = useState<boolean>(isCurrentInMore);
  const [flyoutOpen, setFlyoutOpen] = useState(false);

  useEffect(() => {
    if (isCurrentInMore) {
      setIsMoreExpanded(true);
    }
  }, [currentTab, isCurrentInMore]);

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
    onSelectTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col h-full py-4 px-3">
      {/* Mobile Drawer Header */}
      <div className="flex items-center justify-between px-3 pb-3 mb-2 border-b border-[var(--hub-line)] lg:hidden">
        <span className="font-heading font-bold text-base text-[var(--hub-ink)]">
          Yashwanth Hub
        </span>
        <button
          onClick={onCloseMobile}
          aria-label="Close menu"
          className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 space-y-1 overflow-y-auto pr-1" aria-label="Primary navigation">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer text-left ${
                isActive
                  ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] shadow-xs font-semibold'
                  : item.highlight
                  ? 'text-teal-700 dark:text-teal-300 bg-teal-500/10 hover:bg-teal-500/15'
                  : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 flex-none ${
                    isActive ? 'text-[var(--hub-accent-ink)]' : item.highlight ? 'text-teal-700 dark:text-teal-400' : ''
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold flex-none ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-ink)]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* Quick Search shortcut inside drawer */}
        {onOpenCommandPalette && (
          <button
            onClick={() => {
              onOpenCommandPalette();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Search className="w-4 h-4 flex-none" />
              <span className="truncate">Search</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--hub-bg)] border border-[var(--hub-line)] rounded text-[var(--hub-muted)]">
              Ctrl K
            </kbd>
          </button>
        )}

        {/* Collapsible All Tools Section */}
        <div className="pt-3 mt-2 border-t border-[var(--hub-line)]/70">
          <button
            onClick={() => setIsMoreExpanded(!isMoreExpanded)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer text-left ${
              isCurrentInMore
                ? 'text-[var(--hub-ink)]'
                : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <span className="flex items-center gap-2">
              <Grid className="w-3.5 h-3.5" />
              <span>All Tools</span>
            </span>
            {isMoreExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>

          {isMoreExpanded && (
            <div className="mt-1 space-y-3 pb-2">
              {groupedTools.map((group) => (
                <div key={group.title} className="space-y-0.5">
                  <div className="px-3 pt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--hub-muted)]">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer text-left ${
                          isActive
                            ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] font-semibold'
                            : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Icon className={`w-3.5 h-3.5 flex-none ${isActive ? 'text-[var(--hub-accent-ink)]' : ''}`} />
                          <span className="truncate">{item.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Minimal Settings shortcut in Footer */}
      <div className="pt-3 mt-auto border-t border-[var(--hub-line)] flex items-center justify-between px-2">
        <span className="text-[11px] font-medium text-[var(--hub-muted)]">
          Jarvis OS v4
        </span>
        <button
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
        /* 64px Glass Icon Rail on Home (Desktop) */
        <aside
          aria-label="HUD Quick Rail"
          className="hud-enter-rail hidden lg:flex flex-col items-center w-16 flex-none relative z-30 border-r border-[rgba(59,232,255,0.18)] bg-[rgba(10,16,28,0.55)] backdrop-blur-xl py-3 gap-1.5"
        >
          <nav className="flex-1 flex flex-col items-center gap-1.5 w-full px-2" aria-label="Primary HUD navigation">
            {primaryItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <div key={item.id} className="relative group w-full flex justify-center">
                  <button
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] ${
                      isActive
                        ? 'bg-[#3BE8FF]/18 text-[#3BE8FF] border border-[#3BE8FF]/55 shadow-[0_0_16px_-2px_rgba(59,232,255,0.5)]'
                        : item.highlight
                        ? 'text-[#7C5CFF] bg-[#7C5CFF]/12 border border-[#7C5CFF]/30 hover:bg-[#7C5CFF]/22'
                        : 'text-[#7A8BA6] hover:text-[#E6F1FF] hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5" aria-hidden="true" />
                    {item.badge !== undefined && (
                      <span className="hud-tabular absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#3BE8FF] text-[#05070D] text-[9px] font-bold flex items-center justify-center">
                        {item.badge}
                      </span>
                    )}
                  </button>
                  <span
                    role="tooltip"
                    className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150 absolute left-14 top-1/2 -translate-y-1/2 whitespace-nowrap px-2.5 py-1 rounded-lg hud-glass-pill text-[11px] font-medium text-[#E6F1FF] z-50 shadow-lg"
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}

            {onOpenCommandPalette && (
              <div className="relative group w-full flex justify-center mt-1 pt-2 border-t border-[rgba(59,232,255,0.12)]">
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

            {/* All Tools Flyout Trigger */}
            <div className="relative group w-full flex justify-center">
              <button
                type="button"
                onClick={() => setFlyoutOpen((v) => !v)}
                aria-expanded={flyoutOpen}
                aria-label="All tools"
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] ${
                  flyoutOpen || isCurrentInMore
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
                  All tools
                </span>
              )}

              {flyoutOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setFlyoutOpen(false)} aria-hidden="true" />
                  <div
                    role="dialog"
                    aria-label="All tools navigation"
                    className="hud-glass fixed left-[72px] top-[76px] z-50 w-72 max-h-[calc(100vh-110px)] overflow-y-auto p-3.5 space-y-3 shadow-2xl"
                  >
                    <div className="flex items-center justify-between border-b border-[rgba(59,232,255,0.14)] pb-2">
                      <span className="font-heading text-xs font-bold uppercase tracking-wider text-[#E6F1FF]">
                        All Tools
                      </span>
                      <button
                        type="button"
                        onClick={() => setFlyoutOpen(false)}
                        aria-label="Close tools menu"
                        className="p-1 rounded-lg text-[#7A8BA6] hover:text-[#E6F1FF] cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {groupedTools.map((group) => (
                      <div key={group.title} className="space-y-1">
                        <div className="px-2 text-[10px] font-mono uppercase tracking-[0.14em] text-[#7A8BA6]">
                          {group.title}
                        </div>
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = currentTab === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleNavClick(item.id)}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer text-left ${
                                isActive
                                  ? 'bg-[#3BE8FF]/18 text-[#3BE8FF]'
                                  : 'text-[#E6F1FF]/85 hover:bg-white/5 hover:text-[#E6F1FF]'
                              }`}
                            >
                              <Icon className="w-3.5 h-3.5 shrink-0 text-[#3BE8FF]/80" />
                              <span className="truncate">{item.label}</span>
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
        /* Standard Expanded Desktop Sidebar for non-Home pages */
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
