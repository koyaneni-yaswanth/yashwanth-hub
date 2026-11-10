import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Command,
  CheckSquare,
  FolderKanban,
  Calendar,
  Video,
  FileText,
  IndianRupee,
  Wind,
  Sparkles,
  Settings,
  Bell,
  Sun,
  ArrowRight,
  Mail,
  FolderArchive,
  Cloud,
  Users,
  Brain,
  Activity,
  Zap,
  Bot,
  Heart,
  BarChart3,
  Gavel,
  AlertTriangle,
} from 'lucide-react';
import type { NavigationTab, Area } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { UniversalSearchService, type SearchHit } from '../../services/searchService';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onSelectArea: (area: string) => void;
  areas: Area[];
}

const ENTITY_ICON_MAP: Record<SearchHit['entityType'], React.ElementType> = {
  project: FolderKanban,
  decision: Gavel,
  risk: AlertTriangle,
  blocker: AlertTriangle,
  task: CheckSquare,
  note: FileText,
  document: FolderArchive,
  memory: Brain,
  robotics: Bot,
  meeting: Video,
  event: Calendar,
  contact: Users,
  expense: IndianRupee,
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSelectArea,
  areas,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchHits, setSearchHits] = useState<SearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toggleTheme } = useTheme();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchHits([]);
      return;
    }
    UniversalSearchService.searchAll(trimmed, 18).then((hits) => {
      if (active) setSearchHits(hits);
    });
    return () => {
      active = false;
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  const navItems = [
    { label: 'Go to Home Dashboard', tab: 'dashboard' as NavigationTab, icon: Command, category: 'Navigation' },
    { label: 'Go to My Day (Daily OS)', tab: 'my-day' as NavigationTab, icon: Sun, category: 'Navigation' },
    { label: 'Go to Projects & Workspaces', tab: 'projects' as NavigationTab, icon: FolderKanban, category: 'Navigation' },
    { label: 'Go to AI Chief of Staff', tab: 'ai-assistant' as NavigationTab, icon: Sparkles, category: 'Navigation' },
    { label: 'Go to Automations & Scheduler', tab: 'automations' as NavigationTab, icon: Zap, category: 'Navigation' },
    { label: 'Go to Startup Command (Pawan Shakti)', tab: 'startup-command' as NavigationTab, icon: Wind, category: 'Navigation' },
    { label: 'Go to Robotics Lab (PiPER, Swarm, Radar)', tab: 'robotics-lab' as NavigationTab, icon: Bot, category: 'Navigation' },
    { label: 'Go to Learning & Career Hub', tab: 'learning-career' as NavigationTab, icon: Brain, category: 'Navigation' },
    { label: 'Go to Calendar & Schedule', tab: 'calendar' as NavigationTab, icon: Calendar, category: 'Navigation' },
    { label: 'Go to Tasks Board', tab: 'tasks' as NavigationTab, icon: CheckSquare, category: 'Navigation' },
    { label: 'Go to Knowledge & Memory Hub', tab: 'knowledge-memory' as NavigationTab, icon: Brain, category: 'Navigation' },
    { label: 'Go to Finance & Capital Hub', tab: 'finance' as NavigationTab, icon: IndianRupee, category: 'Navigation' },
    { label: 'Go to Health & Routine Check-In', tab: 'health-routine' as NavigationTab, icon: Heart, category: 'Navigation' },
    { label: 'Go to Integrations & Auth Vault', tab: 'integrations' as NavigationTab, icon: Cloud, category: 'Navigation' },
    { label: 'Go to Analytics', tab: 'analytics' as NavigationTab, icon: BarChart3, category: 'Navigation' },
    { label: 'Go to Settings', tab: 'settings' as NavigationTab, icon: Settings, category: 'Navigation' },
    { label: 'Go to Neo Memory Center', tab: 'neo-memory' as NavigationTab, icon: Brain, category: 'Sub-Hub' },
    { label: 'Go to Notes Vault', tab: 'notes' as NavigationTab, icon: FileText, category: 'Sub-Hub' },
    { label: 'Go to Meetings Intelligence', tab: 'meetings' as NavigationTab, icon: Video, category: 'Sub-Hub' },
    { label: 'Go to Files & Documents', tab: 'files' as NavigationTab, icon: FolderArchive, category: 'Sub-Hub' },
    { label: 'Go to Gmail Intelligence', tab: 'gmail' as NavigationTab, icon: Mail, category: 'Sub-Hub' },
    { label: 'Go to System Health & Sync Center', tab: 'system-health' as NavigationTab, icon: Activity, category: 'Sub-Hub' },
    { label: 'Go to Notifications', tab: 'notifications' as NavigationTab, icon: Bell, category: 'Sub-Hub' },
  ];

  const actionItems = [
    {
      label: 'Toggle Light / Dark Mode',
      action: () => toggleTheme(),
      icon: Sun,
      category: 'Quick Actions',
    },
    ...areas.map((a) => ({
      label: `Switch Workspace Area: ${a.name}`,
      action: () => onSelectArea(a.name),
      icon: Command,
      category: 'Workspace Switcher',
    })),
  ];

  const q = query.toLowerCase().trim();
  const matchedNav = navItems.filter((i) => !q || i.label.toLowerCase().includes(q));
  const matchedActions = actionItems.filter((i) => !q || i.label.toLowerCase().includes(q));
  const mappedHits = searchHits.map((hit) => ({
    label: hit.title,
    sublabel: hit.subtitle,
    action: () => onNavigate(hit.targetTab),
    icon: ENTITY_ICON_MAP[hit.entityType] || Search,
    category: hit.entityType.toUpperCase(),
  }));

  const allResults = q
    ? [...mappedHits, ...matchedNav, ...matchedActions]
    : [...matchedNav.slice(0, 10), ...matchedActions];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, allResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allResults.length) % Math.max(1, allResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = allResults[selectedIndex] as any;
      if (selected) {
        if (selected.tab) onNavigate(selected.tab);
        else if (selected.action) selected.action();
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] p-4 bg-black/60 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--hub-line)]">
          <Search className="w-5 h-5 text-[var(--hub-muted)] flex-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Universal search across tasks, projects, decisions, risks, notes, memories, robotics... (ESC)"
            className="flex-1 bg-transparent text-sm sm:text-base text-[var(--hub-ink)] focus:outline-none placeholder:text-[var(--hub-muted)]"
          />
          <kbd className="hidden sm:inline px-2 py-0.5 text-[10px] font-mono text-[var(--hub-muted)] bg-[var(--hub-bg)] border border-[var(--hub-line)] rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
          {allResults.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--hub-muted)]">
              No matching records or commands found for "{query}".
            </div>
          ) : (
            allResults.map((item: any, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.category}-${item.label}-${idx}`}
                  onClick={() => {
                    if (item.tab) onNavigate(item.tab);
                    else if (item.action) item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer text-xs sm:text-sm transition-colors ${
                    isSelected
                      ? 'bg-[var(--hub-accent)] text-white font-medium'
                      : 'hover:bg-[var(--hub-bg)] text-[var(--hub-ink)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 flex-none ${isSelected ? 'text-white' : 'text-[var(--hub-muted)]'}`} />
                    <div className="min-w-0">
                      <div className="truncate">{item.label}</div>
                      {item.sublabel && (
                        <div className={`text-[11px] truncate ${isSelected ? 'text-white/80' : 'text-[var(--hub-muted)]'}`}>
                          {item.sublabel}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-none pl-2">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-line)]'
                      }`}
                    >
                      {item.category}
                    </span>
                    {isSelected && <ArrowRight className="w-3.5 h-3.5 text-white" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-[var(--hub-bg)] border-t border-[var(--hub-line)] text-[11px] text-[var(--hub-muted)]">
          <div className="flex items-center gap-2">
            <span>Navigate: <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd></span>
            <span>Open: <kbd className="font-mono">↵</kbd></span>
          </div>
          <span>Universal Ranked Search ({q ? `${searchHits.length} records` : 'Ready'})</span>
        </div>
      </div>
    </div>
  );
};
