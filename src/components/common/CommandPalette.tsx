import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
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
} from 'lucide-react';
import { db } from '../../db';
import type { NavigationTab, Area } from '../../types';
import { useTheme } from '../../context/ThemeContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onSelectArea: (area: string) => void;
  areas: Area[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSelectArea,
  areas,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toggleTheme } = useTheme();

  // Queries
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const allNotes = useLiveQuery(() => db.notes.toArray(), []) || [];
  const allMemories = useLiveQuery(() => db.neo_memories.toArray(), []) || [];

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Static Navigation Items
  const navItems = [
    { label: 'Go to 1. Home Dashboard', tab: 'dashboard' as NavigationTab, icon: Command, category: 'Navigation' },
    { label: 'Go to 2. My Day (Daily Operating System)', tab: 'my-day' as NavigationTab, icon: Sun, category: 'Navigation' },
    { label: 'Go to 3. Projects & Workspaces', tab: 'projects' as NavigationTab, icon: FolderKanban, category: 'Navigation' },
    { label: 'Go to 4. AI Assistant & Agents (Jarvis)', tab: 'ai-assistant' as NavigationTab, icon: Sparkles, category: 'Navigation' },
    { label: 'Go to 5. Automations Engine', tab: 'automations' as NavigationTab, icon: Zap, category: 'Navigation' },
    { label: 'Go to Startup Command (Pawan Shakti)', tab: 'startup-command' as NavigationTab, icon: Wind, category: 'Navigation' },
    { label: 'Go to Robotics Lab (PiPER, Drones, Radar)', tab: 'robotics-lab' as NavigationTab, icon: Bot, category: 'Navigation' },
    { label: 'Go to Learning & Career Hub', tab: 'learning-career' as NavigationTab, icon: Brain, category: 'Navigation' },
    { label: 'Go to Calendar & Schedule', tab: 'calendar' as NavigationTab, icon: Calendar, category: 'Navigation' },
    { label: 'Go to Tasks & Kanban', tab: 'tasks' as NavigationTab, icon: CheckSquare, category: 'Navigation' },
    { label: 'Go to Knowledge & Memory Hub', tab: 'knowledge-memory' as NavigationTab, icon: Brain, category: 'Navigation' },
    { label: 'Go to Finance & Grants Tracker', tab: 'finance' as NavigationTab, icon: IndianRupee, category: 'Navigation' },
    { label: 'Go to Health & Routine Protocol', tab: 'health-routine' as NavigationTab, icon: Heart, category: 'Navigation' },
    { label: 'Go to Integrations & MCP Hub', tab: 'integrations' as NavigationTab, icon: Cloud, category: 'Navigation' },
    { label: 'Go to System Analytics', tab: 'analytics' as NavigationTab, icon: BarChart3, category: 'Navigation' },
    { label: 'Go to Settings & Preferences', tab: 'settings' as NavigationTab, icon: Settings, category: 'Navigation' },
    // Specialized Views
    { label: 'Go to Neo Memory Center', tab: 'neo-memory' as NavigationTab, icon: Brain, category: 'Sub-Hub' },
    { label: 'Go to Notes Vault', tab: 'notes' as NavigationTab, icon: FileText, category: 'Sub-Hub' },
    { label: 'Go to Meetings Intelligence', tab: 'meetings' as NavigationTab, icon: Video, category: 'Sub-Hub' },
    { label: 'Go to Files & Photos Vault', tab: 'files' as NavigationTab, icon: FolderArchive, category: 'Sub-Hub' },
    { label: 'Go to Gmail Intelligence', tab: 'gmail' as NavigationTab, icon: Mail, category: 'Sub-Hub' },
    { label: 'Go to System Health & Sync Center', tab: 'system-health' as NavigationTab, icon: Activity, category: 'Sub-Hub' },
    { label: 'Go to Notifications', tab: 'notifications' as NavigationTab, icon: Bell, category: 'Sub-Hub' },
  ];

  // Quick Action Items
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

  // Dynamic Matching
  const q = query.toLowerCase().trim();

  const matchedNav = navItems.filter((i) => !q || i.label.toLowerCase().includes(q));
  const matchedActions = actionItems.filter((i) => !q || i.label.toLowerCase().includes(q));
  const matchedTasks = allTasks
    .filter((t) => !q || t.text.toLowerCase().includes(q))
    .slice(0, 4)
    .map((t) => ({
      label: `Task: ${t.text} (${t.area})`,
      action: () => onNavigate('tasks'),
      icon: CheckSquare,
      category: 'Tasks',
    }));

  const matchedProjects = allProjects
    .filter((p) => !q || p.title.toLowerCase().includes(q))
    .slice(0, 3)
    .map((p) => ({
      label: `Project: ${p.title} [${p.area}]`,
      action: () => onNavigate('projects'),
      icon: FolderKanban,
      category: 'Projects',
    }));

  const matchedNotes = allNotes
    .filter((n) => !q || n.title.toLowerCase().includes(q) || (n.body && n.body.toLowerCase().includes(q)))
    .slice(0, 3)
    .map((n) => ({
      label: `Note: ${n.title} (${n.area})`,
      action: () => onNavigate('notes'),
      icon: FileText,
      category: 'Notes',
    }));

  const matchedMemories = allMemories
    .filter((m) => !q || m.title.toLowerCase().includes(q) || m.summary.toLowerCase().includes(q))
    .slice(0, 3)
    .map((m) => ({
      label: `Neo Memory: ${m.title} [${m.source.replace('_', ' ')}]`,
      action: () => onNavigate('neo-memory'),
      icon: Brain,
      category: 'Neo Memories',
    }));

  const allResults = [...matchedNav, ...matchedActions, ...matchedProjects, ...matchedTasks, ...matchedNotes, ...matchedMemories];

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
      const selected = allResults[selectedIndex];
      if (selected) {
        if ('tab' in selected && selected.tab) {
          onNavigate(selected.tab);
        } else if ('action' in selected && selected.action) {
          selected.action();
        }
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4 bg-black/60 backdrop-blur-xs transition-opacity"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
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
            placeholder="Type a command, search tasks, projects or modules... (ESC to close)"
            className="flex-1 bg-transparent text-sm sm:text-base text-[var(--hub-ink)] focus:outline-none placeholder:text-[var(--hub-muted)]"
          />
          <kbd className="hidden sm:inline px-2 py-0.5 text-[10px] font-mono text-[var(--hub-muted)] bg-[var(--hub-bg)] border border-[var(--hub-line)] rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
          {allResults.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--hub-muted)]">
              No matching commands or records found for "{query}".
            </div>
          ) : (
            allResults.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={`${item.category}-${item.label}`}
                  onClick={() => {
                    if ('tab' in item && item.tab) {
                      onNavigate(item.tab);
                    } else if ('action' in item && item.action) {
                      item.action();
                    }
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
                    <span className="truncate">{item.label}</span>
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

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--hub-bg)] border-t border-[var(--hub-line)] text-[11px] text-[var(--hub-muted)]">
          <div className="flex items-center gap-2">
            <span>Navigate: <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd></span>
            <span>Select: <kbd className="font-mono">↵</kbd></span>
          </div>
          <span>Yashwanth Hub Command Palette</span>
        </div>
      </div>
    </div>
  );
};
