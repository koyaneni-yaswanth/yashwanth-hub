import React, { useState } from 'react';
import { Brain, FileText, Video, FolderArchive, Lightbulb, GitBranch } from 'lucide-react';
import type { Area, NavigationTab } from '../types';
import { NeoMemoryCenterPage } from './NeoMemoryCenterPage';
import { NotesPage } from './NotesPage';
import { MeetingsPage } from './MeetingsPage';
import { FilesAndPhotosPage } from './FilesAndPhotosPage';
import { JournalVault } from '../components/vault/JournalVault';
import { KnowledgeGraphView } from '../components/vault/KnowledgeGraphView';

interface KnowledgeMemoryPageProps {
  currentArea: string;
  areas: Area[];
  onNavigate?: (tab: NavigationTab) => void;
  onNavigateToTasks?: () => void;
  onNavigateToCalendar?: () => void;
  onNavigateToAI?: (prompt?: string) => void;
}

export const KnowledgeMemoryPage: React.FC<KnowledgeMemoryPageProps> = (props) => {
  const [subTab, setSubTab] = useState<'journal' | 'graph' | 'neo_memory' | 'notes' | 'meetings' | 'documents'>('journal');

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
          <Brain className="w-6 h-6 text-[var(--hub-accent)] shrink-0" />
          Knowledge &amp; Memory Vault
        </h1>
        <p className="text-sm text-[var(--hub-muted)] mt-1">
          Reflections, entity Knowledge Graph, decisions, notes, meetings, documents, and Neo 1 memories.
        </p>
      </div>

      {/* Navigation Sub-Tabs */}
      <div role="tablist" aria-label="Memory Vault sections" className="flex items-center gap-2 border-b border-[var(--hub-line)] pb-2 overflow-x-auto">
        {[
          { id: 'journal', label: 'Journal', icon: Lightbulb },
          { id: 'graph', label: 'Knowledge Graph', icon: GitBranch },
          { id: 'neo_memory', label: 'Neo 1 Memory', icon: Brain },
          { id: 'notes', label: 'Notes', icon: FileText },
          { id: 'meetings', label: 'Meetings', icon: Video },
          { id: 'documents', label: 'Documents', icon: FolderArchive },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`vault-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls="vault-panel"
              onClick={() => setSubTab(tab.id as typeof subTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] shadow-xs'
                  : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render Selected Sub-View */}
      <div id="vault-panel" role="tabpanel" aria-labelledby={`vault-tab-${subTab}`}>
        {subTab === 'journal' && <JournalVault currentArea={props.currentArea} areas={props.areas} />}
        {subTab === 'graph' && <KnowledgeGraphView onNavigate={props.onNavigate} />}
        {subTab === 'neo_memory' && <NeoMemoryCenterPage {...props} />}
        {subTab === 'notes' && <NotesPage currentArea={props.currentArea} areas={props.areas} />}
        {subTab === 'meetings' && <MeetingsPage currentArea={props.currentArea} areas={props.areas} />}
        {subTab === 'documents' && <FilesAndPhotosPage currentArea={props.currentArea} areas={props.areas} />}
      </div>
    </div>
  );
};
