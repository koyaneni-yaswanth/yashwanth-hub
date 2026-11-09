import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
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

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  openTasksCount = 0,
  activeProjectsCount = 0,
  unreadNotifsCount = 0,
  isOpenMobile = false,
  onCloseMobile,
  onOpenCommandPalette,
}) => {
  // Primary 5 Navigation items
  const primaryItems: NavItem[] = [
    { id: 'dashboard', label: '1. Home', icon: LayoutDashboard },
    { id: 'my-day', label: '2. My Day', icon: Sun },
    {
      id: 'projects',
      label: '3. Projects',
      icon: FolderKanban,
      badge: activeProjectsCount > 0 ? activeProjectsCount : undefined,
    },
    { id: 'ai-assistant', label: '4. AI Assistant', icon: Sparkles, highlight: true },
    { id: 'automations', label: '5. Automations', icon: Zap },
  ];

  // Secondary Domain Hubs under "More"
  const moreItems: NavItem[] = [
    { id: 'startup-command', label: 'Startup Command', icon: Wind },
    { id: 'robotics-lab', label: 'Robotics Lab', icon: Bot },
    { id: 'learning-career', label: 'Learning & Career', icon: GraduationCap },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, badge: openTasksCount > 0 ? openTasksCount : undefined },
    { id: 'notes', label: 'Notes Vault', icon: FileText },
    { id: 'documents', label: 'Documents & Files', icon: FolderArchive },
    { id: 'finance', label: 'Finance & Capital', icon: IndianRupee },
    { id: 'health-routine', label: 'Health & Routine', icon: Heart },
    { id: 'knowledge-memory', label: 'Knowledge & Memory', icon: Brain },
    { id: 'integrations', label: 'Integrations & Sync', icon: Cloud },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  // Auto-expand "More" if currentTab belongs to moreItems
  const isCurrentInMore = moreItems.some((item) => item.id === currentTab);
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
      {/* Mobile Header with close button */}
      <div className="flex items-center justify-between px-3 pb-3 mb-2 border-b border-[var(--hub-line)] lg:hidden">
        <span className="font-heading font-bold text-base text-[var(--hub-ink)]">
          Yashwanth Hub OS
        </span>
        <button
          onClick={onCloseMobile}
          className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 space-y-1 overflow-y-auto pr-1">
        {/* Section Header: Primary Core */}
        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--hub-muted)]">
          Primary
        </div>

        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 cursor-pointer text-left ${
                isActive
                  ? 'bg-[var(--hub-accent)] text-white shadow-xs font-semibold'
                  : item.highlight
                  ? 'text-teal-700 dark:text-teal-300 bg-teal-500/10 hover:bg-teal-500/20'
                  : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
              }`}
            >
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 flex-none ${
                    isActive ? 'text-white' : item.highlight ? 'text-teal-600 dark:text-teal-400' : ''
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold flex-none ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--hub-line)] text-[var(--hub-ink)]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}

        {/* 6. Search Trigger */}
        {onOpenCommandPalette && (
          <button
            onClick={() => {
              onOpenCommandPalette();
              if (onCloseMobile) onCloseMobile();
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <Search className="w-4 h-4 flex-none" />
              <span className="truncate">6. Search & Commands</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded text-[var(--hub-muted)]">
              Ctrl K
            </kbd>
          </button>
        )}

        {/* 7. More Hubs Accordion / Section */}
        <div className="pt-2">
          <button
            onClick={() => setIsMoreExpanded(!isMoreExpanded)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer text-left ${
              isCurrentInMore
                ? 'bg-[var(--hub-bg)] text-[var(--hub-ink)] font-semibold border border-[var(--hub-line)]'
                : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
            }`}
          >
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <div className="w-4 h-4 flex items-center justify-center font-bold text-[11px] text-[var(--hub-accent)]">
                7
              </div>
              <span className="truncate">More Hubs</span>
            </div>
            {isMoreExpanded ? (
              <ChevronDown className="w-4 h-4 text-[var(--hub-muted)]" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--hub-muted)]" />
            )}
          </button>

          {/* Expanded Secondary Hubs List */}
          {isMoreExpanded && (
            <div className="pl-3 pr-1 pt-1 space-y-0.5 border-l-2 border-[var(--hub-line)] ml-4 mt-1">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 cursor-pointer text-left ${
                      isActive
                        ? 'bg-[var(--hub-accent)] text-white font-semibold'
                        : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className={`w-3.5 h-3.5 flex-none ${isActive ? 'text-white' : ''}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold flex-none ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : 'bg-[var(--hub-line)] text-[var(--hub-ink)]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Footer Info */}
      <div className="pt-3 mt-auto border-t border-[var(--hub-line)] px-2">
        <div className="text-[11px] text-[var(--hub-muted)] font-medium">
          <p className="font-semibold text-[var(--hub-ink)]">Jarvis AI OS v2.5</p>
          <p className="opacity-80">Local-First • Multi-Model</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-64 flex-none bg-[var(--hub-surface)] border-r border-[var(--hub-line)] min-h-[calc(100vh-57px)]">
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
