import React from 'react';
import { LayoutDashboard, FolderKanban, CheckSquare, Sparkles, MoreHorizontal } from 'lucide-react';
import type { NavigationTab } from '../../types';

interface MobileNavProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenMore: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenMore,
}) => {
  const quickItems = [
    { id: 'dashboard' as NavigationTab, label: 'Today', icon: LayoutDashboard },
    { id: 'projects' as NavigationTab, label: 'Projects', icon: FolderKanban },
    { id: 'tasks' as NavigationTab, label: 'Tasks', icon: CheckSquare },
    { id: 'ai-assistant' as NavigationTab, label: 'Jarvis', icon: Sparkles },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--hub-surface)] border-t border-[var(--hub-line)] px-2 py-1.5 safe-area-bottom-nav flex items-center justify-around backdrop-blur-lg">
      {quickItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[11px] font-medium transition-colors ${
              isActive
                ? 'text-[var(--hub-accent)] font-semibold'
                : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <Icon className="w-5 h-5 mb-0.5" />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button
        onClick={onOpenMore}
        className="flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[11px] font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] transition-colors"
      >
        <MoreHorizontal className="w-5 h-5 mb-0.5" />
        <span>More</span>
      </button>
    </nav>
  );
};
