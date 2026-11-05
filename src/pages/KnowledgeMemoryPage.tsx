import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Brain,
  FileText,
  Video,
  FolderArchive,
  Search,
  Plus,
  Tag,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { db } from '../db';
import type { Area, Note, DocumentItem, Meeting } from '../types';
import { Badge } from '../components/common/Badge';
import { NeoMemoryCenterPage } from './NeoMemoryCenterPage';
import { NotesPage } from './NotesPage';
import { MeetingsPage } from './MeetingsPage';
import { FilesAndPhotosPage } from './FilesAndPhotosPage';

interface KnowledgeMemoryPageProps {
  currentArea: string;
  areas: Area[];
  onNavigateToTasks?: () => void;
  onNavigateToCalendar?: () => void;
  onNavigateToAI?: (prompt?: string) => void;
}

export const KnowledgeMemoryPage: React.FC<KnowledgeMemoryPageProps> = (props) => {
  const [subTab, setSubTab] = useState<'neo_memory' | 'notes' | 'meetings' | 'documents'>('neo_memory');

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--hub-line)] pb-2 overflow-x-auto">
        {[
          { id: 'neo_memory', label: 'Neo 1 Wearable & MCP Memory', icon: Brain },
          { id: 'notes', label: 'Engineering Notes Vault', icon: FileText },
          { id: 'meetings', label: 'Meeting Intelligence & MoMs', icon: Video },
          { id: 'documents', label: 'Documents & Research Vault', icon: FolderArchive },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--hub-accent)] text-white shadow-xs'
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
      {subTab === 'neo_memory' && <NeoMemoryCenterPage {...props} />}
      {subTab === 'notes' && <NotesPage currentArea={props.currentArea} areas={props.areas} />}
      {subTab === 'meetings' && <MeetingsPage currentArea={props.currentArea} areas={props.areas} />}
      {subTab === 'documents' && <FilesAndPhotosPage currentArea={props.currentArea} areas={props.areas} />}
    </div>
  );
};
