import React from 'react';
import { Home, CheckSquare, Plus, Sparkles, MoreHorizontal } from 'lucide-react';
import type { NavigationTab } from '../../types';

interface MobileNavProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenMore: () => void;
  onOpenQuickCapture?: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenMore,
  onOpenQuickCapture,
}) => {
  const leftItems = [
    { id: 'dashboard' as NavigationTab, label: 'Home', icon: Home },
    { id: 'tasks' as NavigationTab, label: 'Tasks', icon: CheckSquare },
  ];

  const rightItems = [
    { id: 'ai-assistant' as NavigationTab, label: 'Ask AI', icon: Sparkles },
  ];

  return (
    <nav
      aria-label="Mobile Primary Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--hub-surface)]/95 border-t border-[var(--hub-line)] px-2 py-1.5 safe-area-bottom-nav flex items-center justify-around backdrop-blur-lg"
    >
      {leftItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
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

      {/* Center 1-Tap Quick Add / Voice Capture */}
      {onOpenQuickCapture && (
        <button
          onClick={onOpenQuickCapture}
          aria-label="Quick Add"
          className="-mt-4 flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] shadow-lg hover:bg-[var(--hub-accent-hover)] active:scale-95 transition-all cursor-pointer border-2 border-[var(--hub-surface)]"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {rightItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[11px] font-medium transition-colors cursor-pointer ${
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
        aria-label="More navigation views"
        className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-[11px] font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] transition-colors cursor-pointer"
      >
        <MoreHorizontal className="w-5 h-5 mb-0.5" />
        <span>More</span>
      </button>
    </nav>
  );
};
