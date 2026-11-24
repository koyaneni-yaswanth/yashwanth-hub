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
  Sun,
  Search,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Grid,
  Target,
  Compass,
  Timer,
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
}) => {
  // Core 5 everyday views — simple, direct, no numbering clutter
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
        { id: 'my-day', label: 'Daily Compass', icon: Compass },
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
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const allSecondaryIds = groupedTools.flatMap((g) => g.items.map((i) => i.id));
  const isCurrentInMore = allSecondaryIds.includes(currentTab);
  const [isMoreExpanded, setIsMoreExpanded] = useState<boolean>(isCurrentInMore);

  useEffect(() => {
    if (isCurrentInMore) {
      setIsMoreExpanded(true);
    }
  }, [currentTab, isCurrentInMore]);

  const handleNavClick = (tab: NavigationTab) => {
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
      <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
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
                    isActive ? 'text-white' : item.highlight ? 'text-teal-700 dark:text-teal-400' : ''
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
                          <Icon className={`w-3.5 h-3.5 flex-none ${isActive ? 'text-white' : ''}`} />
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
          Jarvis OS v3.0
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
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-60 flex-none bg-[var(--hub-surface)] border-r border-[var(--hub-line)] min-h-[calc(100vh-57px)]">
        {navContent}
      </aside>

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
