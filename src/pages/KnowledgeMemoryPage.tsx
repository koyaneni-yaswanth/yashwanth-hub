import React, { useEffect, useState } from 'react';
import { Brain, FileText, Video, FolderArchive, Lightbulb, GitBranch, Sparkles, RefreshCw } from 'lucide-react';
import type { Area, NavigationTab } from '../types';
import { NeoMemoryCenterPage } from './NeoMemoryCenterPage';
import { NotesPage } from './NotesPage';
import { MeetingsPage } from './MeetingsPage';
import { FilesAndPhotosPage } from './FilesAndPhotosPage';
import { JournalVault } from '../components/vault/JournalVault';
import { KnowledgeGraphView } from '../components/vault/KnowledgeGraphView';
import { SemanticMemoryService } from '../services/semanticMemoryService';
import { toast } from '../lib/toast';

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
  const [vectorCount, setVectorCount] = useState(0);
  const [isIndexingSemantic, setIsIndexingSemantic] = useState(false);

  useEffect(() => {
    void SemanticMemoryService.getIndexStats().then((s) => setVectorCount(s.localVectorCount));
  }, []);

  const handleIndexSemanticVault = async () => {
    setIsIndexingSemantic(true);
    try {
      const res = await SemanticMemoryService.indexWorkspaceKnowledge(15);
      setVectorCount(res.totalStored);
      if (res.indexed > 0) {
        toast(`Indexed ${res.indexed} entries into semantic pgvector memory (${res.totalStored} total)`, 'success');
      } else if (res.error) {
        toast(res.error, 'info');
      } else {
        toast(`Semantic index up to date (${res.totalStored} vectors)`, 'info');
      }
    } finally {
      setIsIndexingSemantic(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <Brain className="w-6 h-6 text-[var(--hub-accent)] shrink-0" />
            Knowledge &amp; Memory Vault
          </h1>
          <p className="text-sm text-[var(--hub-muted)] mt-1">
            Reflections, entity Knowledge Graph, decisions, notes, meetings, documents, and Neo 1 memories.
          </p>
        </div>

        <button
          type="button"
          onClick={handleIndexSemanticVault}
          disabled={isIndexingSemantic}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          {isIndexingSemantic ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-[var(--hub-accent)]" />}
          <span>{isIndexingSemantic ? 'Indexing Vectors...' : `Index Semantic Vault (${vectorCount})`}</span>
        </button>
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
