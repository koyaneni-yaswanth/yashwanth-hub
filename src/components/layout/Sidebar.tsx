import React from 'react';
import {
  LayoutDashboard,
  Calendar,
  Video,
  Plane,
  CheckSquare,
  FileText,
  FolderArchive,
  IndianRupee,
  Users,
  Wind,
  Sparkles,
  BarChart3,
  Settings,
  FolderKanban,
  Bell,
  X,
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
}) => {
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'projects',
      label: 'Projects & Engineering',
      icon: FolderKanban,
      badge: activeProjectsCount > 0 ? activeProjectsCount : undefined,
    },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, badge: openTasksCount > 0 ? openTasksCount : undefined },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'meetings', label: 'Meetings & Calls', icon: Video },
    { id: 'travel', label: 'Travel & Trips', icon: Plane },
    { id: 'notes', label: 'Notes & Directives', icon: FileText },
    { id: 'documents', label: 'Documents Vault', icon: FolderArchive },
    { id: 'expenses', label: 'Expenses & Burn', icon: IndianRupee },
    { id: 'contacts', label: 'Contacts Rolodex', icon: Users },
    { id: 'wind-plan', label: 'Wind Plan (90-Day)', icon: Wind, highlight: true },
    { id: 'ai-assistant', label: 'Jarvis AI Copilot', icon: Sparkles },
    {
      id: 'notifications',
      label: 'Reminders & Alerts',
      icon: Bell,
      badge: unreadNotifsCount > 0 ? unreadNotifsCount : undefined,
    },
    { id: 'analytics', label: 'Executive Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings & Cloud', icon: Settings },
  ];

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
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all duration-150 cursor-pointer text-left ${
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
