import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, GitBranch, Search } from 'lucide-react';
import { db } from '../../db';
import {
  buildKnowledgeGraph,
  type KnowledgeGraphNode,
  type KnowledgeNodeKind,
} from '../../lib/knowledgeGraph';
import { Badge } from '../common/Badge';
import type { NavigationTab } from '../../types';

const KIND_COLOR: Record<KnowledgeNodeKind, string> = {
  project: '#3BE8FF',
  goal: '#FFB547',
  habit: '#10b981',
  task: '#8ba8c8',
  note: '#c6a46b',
  document: '#7C5CFF',
  robotics: '#a855f7',
  meeting: '#ec4899',
  neo_memory: '#14b8a6',
};

interface KnowledgeGraphViewProps {
  onNavigate?: (tab: NavigationTab) => void;
}

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({ onNavigate }) => {
  const [filterKind, setFilterKind] = useState<'all' | KnowledgeNodeKind>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const projects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const notes = useLiveQuery(() => db.notes.toArray(), []) || [];
  const documents = useLiveQuery(() => db.documents.toArray(), []) || [];
  const robotics = useLiveQuery(() => db.robotics_records.toArray(), []) || [];
  const goals = useLiveQuery(() => db.goals.toArray(), []) || [];
  const habits = useLiveQuery(() => db.habits.toArray(), []) || [];
  const meetings = useLiveQuery(() => db.meetings.toArray(), []) || [];
  const neoMemories = useLiveQuery(() => db.neo_memories.toArray(), []) || [];

  const graph = useMemo(
    () =>
      buildKnowledgeGraph({
        projects,
        tasks,
        notes,
        documents,
        robotics,
        goals,
        habits,
        meetings,
        neoMemories,
      }),
    [projects, tasks, notes, documents, robotics, goals, habits, meetings, neoMemories]
  );

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return graph.nodes.filter((n) => {
      if (filterKind !== 'all' && n.kind !== filterKind) return false;
      if (!q) return true;
      return `${n.title} ${n.area} ${n.subtitle} ${n.tags.join(' ')}`.toLowerCase().includes(q);
    });
  }, [graph.nodes, filterKind, search]);

  const selectedNode: KnowledgeGraphNode | null =
    graph.nodes.find((n) => n.id === selectedId) || filteredNodes[0] || null;

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return graph.edges
      .filter((e) => e.from === selectedNode.id || e.to === selectedNode.id)
      .map((e) => {
        const peerId = e.from === selectedNode.id ? e.to : e.from;
        const peer = graph.nodes.find((n) => n.id === peerId);
        return peer ? { edge: e, peer } : null;
      })
      .filter((x): x is { edge: typeof graph.edges[number]; peer: KnowledgeGraphNode } => x !== null);
  }, [graph, selectedNode]);

  // Radial preview coordinates for up to 12 neighbors around the selected hub node
  const radialNeighbors = connectedEdges.slice(0, 12);

  return (
    <div className="space-y-4">
      {/* Graph Summary Bar */}
      <div className="rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <GitBranch className="w-5 h-5 text-[var(--hub-accent)]" />
          <div>
            <h2 className="font-heading text-sm font-bold text-[var(--hub-ink)]">
              Workspace Knowledge Graph
            </h2>
            <p className="text-xs text-[var(--hub-muted)]">
              {graph.stats.nodeCount} entities · {graph.stats.edgeCount} verified connections ({graph.stats.explicitEdges} explicit ID links)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--hub-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter entities..."
              className="pl-8 pr-3 py-1.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]"
            />
          </div>
          <select
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value as any)}
            aria-label="Filter graph entity type"
            className="px-2.5 py-1.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]"
          >
            <option value="all">All Types ({graph.stats.nodeCount})</option>
            <option value="project">Projects ({graph.stats.byKind.project})</option>
            <option value="goal">Goals ({graph.stats.byKind.goal})</option>
            <option value="task">Tasks ({graph.stats.byKind.task})</option>
            <option value="note">Notes ({graph.stats.byKind.note})</option>
            <option value="robotics">Robotics ({graph.stats.byKind.robotics})</option>
            <option value="document">Documents ({graph.stats.byKind.document})</option>
            <option value="neo_memory">Neo 1 ({graph.stats.byKind.neo_memory})</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Interactive Entity Index */}
        <div className="lg:col-span-5 rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] p-3 space-y-1.5 max-h-[460px] overflow-y-auto">
          {filteredNodes.length === 0 ? (
            <p className="p-4 text-xs text-[var(--hub-muted)]">No matching knowledge nodes.</p>
          ) : (
            filteredNodes.slice(0, 45).map((node) => {
              const active = selectedNode?.id === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  className={`w-full text-left px-3 py-2 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                    active
                      ? 'bg-[var(--hub-accent)]/12 border-[var(--hub-accent)]/50'
                      : 'bg-[var(--hub-bg)] border-transparent hover:border-[var(--hub-line)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: KIND_COLOR[node.kind] }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--hub-ink)] truncate">{node.title}</div>
                      <div className="text-[10px] text-[var(--hub-muted)] truncate">
                        {node.kind.replace('_', ' ')} · {node.area}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--hub-muted)] shrink-0">
                    {node.degree} links
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Selected Node Visual Constellation & Backlinks */}
        <div className="lg:col-span-7 rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] p-4 space-y-4">
          {selectedNode ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--hub-line)] pb-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="blue">{selectedNode.kind.replace('_', ' ')}</Badge>
                    <span className="text-[11px] font-mono text-[var(--hub-muted)]">{selectedNode.area}</span>
                  </div>
                  <h3 className="font-heading text-base font-bold text-[var(--hub-ink)]">{selectedNode.title}</h3>
                  <p className="text-xs text-[var(--hub-muted)]">{selectedNode.subtitle}</p>
                </div>

                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate(selectedNode.targetTab as NavigationTab)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shrink-0"
                  >
                    <span>Open Source</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Clean Radial Graph SVG */}
              <div className="rounded-xl bg-[#05070D] border border-white/10 p-2">
                <svg viewBox="0 0 440 220" className="w-full h-48" role="img" aria-label={`Relationships for ${selectedNode.title}`}>
                  {radialNeighbors.map((item, idx) => {
                    const angle = (idx / Math.max(1, radialNeighbors.length)) * Math.PI * 2 - Math.PI / 2;
                    const x = 220 + Math.cos(angle) * 145;
                    const y = 110 + Math.sin(angle) * 78;
                    const col = KIND_COLOR[item.peer.kind];
                    return (
                      <g key={item.edge.id} className="cursor-pointer" onClick={() => setSelectedId(item.peer.id)}>
                        <line
                          x1={220}
                          y1={110}
                          x2={x}
                          y2={y}
                          stroke={item.edge.kind === 'shared_area' ? '#7A8BA6' : '#3BE8FF'}
                          strokeOpacity={item.edge.kind === 'shared_area' ? 0.35 : 0.75}
                          strokeDasharray={item.edge.kind === 'shared_area' ? '3 3' : undefined}
                        />
                        <circle cx={x} cy={y} r={8} fill={col} fillOpacity={0.85} />
                        <text x={x} y={y + 18} textAnchor="middle" fill="#E6F1FF" fontSize="9">
                          {item.peer.title.slice(0, 18)}
                        </text>
                      </g>
                    );
                  })}
                  <circle cx={220} cy={110} r={16} fill={KIND_COLOR[selectedNode.kind]} />
                  <text x={220} y={138} textAnchor="middle" fill="#E6F1FF" fontSize="10" fontWeight="bold">
                    {selectedNode.title.slice(0, 26)}
                  </text>
                </svg>
              </div>

              {/* Provenance Backlinks List */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--hub-muted)]">
                  Backlinks &amp; Provenance ({connectedEdges.length})
                </div>
                {connectedEdges.length === 0 ? (
                  <p className="text-xs text-[var(--hub-muted)]">
                    No linked records yet. Assign a `project_id` or matching workspace area to connect entities.
                  </p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {connectedEdges.map(({ edge, peer }) => (
                      <button
                        key={edge.id}
                        type="button"
                        onClick={() => setSelectedId(peer.id)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-left hover:border-[var(--hub-accent)] cursor-pointer"
                      >
                        <span className="truncate font-medium text-[var(--hub-ink)]">{peer.title}</span>
                        <span className="text-[10px] font-mono text-[var(--hub-muted)] shrink-0">
                          {edge.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--hub-muted)]">Select an entity on the left to inspect its connections.</p>
          )}
        </div>
      </div>
    </div>
  );
};
