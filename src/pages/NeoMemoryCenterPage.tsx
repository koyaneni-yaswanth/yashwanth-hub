import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Brain,
  Search,
  CheckCircle2,
  Clock,
  Mic,
  Calendar,
  Layers,
  Shield,
  Upload,
  RefreshCw,
  Laptop,
  CheckSquare,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { db } from '../db';
import type {
  NeoMemory,
  NeoActionItem,
  NeoPrivacySettings,
  Area,
} from '../types';
import { NeoSapienMemoryService } from '../services/neoSapienMemoryService';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { generateId, getTodayISO } from '../lib/utils';

interface NeoMemoryCenterPageProps {
  currentArea: string;
  areas: Area[];
  onNavigateToTasks?: () => void;
  onNavigateToCalendar?: () => void;
  onNavigateToAI?: (prompt?: string) => void;
}

export const NeoMemoryCenterPage: React.FC<NeoMemoryCenterPageProps> = ({
  currentArea,
  areas,
  onNavigateToTasks,
  onNavigateToCalendar,
  onNavigateToAI,
}) => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'reconciliation' | 'calendar' | 'sync_mcp'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all');
  const [selectedPlatformFilter, setSelectedPlatformFilter] = useState<string>('all');

  // Modals
  const [selectedMemory, setSelectedMemory] = useState<NeoMemory | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Live queries
  const allMemories = useLiveQuery(() => db.neo_memories.toArray(), []) || [];
  const auditLogs = useLiveQuery(() => db.neo_sync_audit.orderBy('timestamp').reverse().toArray(), []) || [];
  const events = useLiveQuery(() => db.events.toArray(), []) || [];

  // Privacy config
  const [privacySettings, setPrivacySettings] = useState<NeoPrivacySettings>(() =>
    NeoSapienMemoryService.getPrivacySettings()
  );

  useEffect(() => {
    setSelectedAreaFilter(currentArea);
  }, [currentArea]);

  // Filter memories with latency measurement
  const { filteredMemories, searchLatency } = React.useMemo(() => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const q = searchQuery.toLowerCase().trim();

    const res = allMemories.filter((mem) => {
      if (selectedAreaFilter !== 'All' && mem.associatedArea !== selectedAreaFilter) {
        return false;
      }
      if (selectedSourceFilter !== 'all' && mem.source !== selectedSourceFilter) {
        return false;
      }
      if (selectedPlatformFilter !== 'all' && mem.platform !== selectedPlatformFilter) {
        return false;
      }
      if (!q) return true;

      return (
        mem.title.toLowerCase().includes(q) ||
        mem.summary.toLowerCase().includes(q) ||
        (mem.transcript && mem.transcript.toLowerCase().includes(q)) ||
        mem.tags?.some((t) => t.toLowerCase().includes(q)) ||
        mem.peopleMentioned?.some((p) => p.toLowerCase().includes(q)) ||
        mem.actionItems?.some((a) => a.text.toLowerCase().includes(q)) ||
        mem.decisions?.some((d) => d.text.toLowerCase().includes(q))
      );
    });

    res.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
    const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
    return {
      filteredMemories: res,
      searchLatency: Math.max(0.1, Math.round((t1 - t0) * 10) / 10),
    };
  }, [allMemories, searchQuery, selectedAreaFilter, selectedSourceFilter, selectedPlatformFilter]);

  // Reconciliation data
  const [reconciliationData, setReconciliationData] = useState<{
    newCommitments: { memory: NeoMemory; item: NeoActionItem }[];
    existingMatches: { memory: NeoMemory; item: NeoActionItem; hubTaskTitle: string }[];
    overdueItems: { memory: NeoMemory; item: NeoActionItem }[];
    approvedItems: { memory: NeoMemory; item: NeoActionItem }[];
  }>({ newCommitments: [], existingMatches: [], overdueItems: [], approvedItems: [] });

  const refreshReconciliation = async () => {
    const rec = await NeoSapienMemoryService.reconcileActionItems();
    setReconciliationData(rec);
  };

  useEffect(() => {
    refreshReconciliation();
  }, [allMemories]);

  // Action item approval handlers
  const handleApproveActionItem = async (
    memoryId: string,
    actionItemId: string,
    syncToGoogle: boolean = false
  ) => {
    try {
      await NeoSapienMemoryService.approveAndCreateTask(memoryId, actionItemId, undefined, syncToGoogle);
      await refreshReconciliation();
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    }
  };

  const handleRejectActionItem = async (memoryId: string, actionItemId: string) => {
    await NeoSapienMemoryService.rejectActionItem(memoryId, actionItemId);
    await refreshReconciliation();
  };

  // Calendar auto-association
  const handleAutoAssociateCalendar = async () => {
    setIsSyncing(true);
    try {
      const res = await NeoSapienMemoryService.autoAssociateCalendarEvents();
      alert(`Associated ${res.linkedCount} memory records with Google Calendar events.`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Import JSON handler
  const handleImportJson = async () => {
    if (!importJsonText.trim()) return;
    try {
      const parsed = JSON.parse(importJsonText);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const audit = await NeoSapienMemoryService.importMemories(items, 'json_export');
      setImportMessage(`Success: Imported ${audit.memoriesImported}, updated ${audit.memoriesUpdated}.`);
      setImportJsonText('');
      setTimeout(() => {
        setIsImportModalOpen(false);
        setImportMessage(null);
      }, 1500);
    } catch (err: any) {
      setImportMessage(`Import parse error: ${err.message}`);
    }
  };

  // Seed sample meeting
  const handleLoadSampleMeeting = async () => {
    const sample: Partial<NeoMemory> = {
      title: 'IvLabs Autonomous Mobile Robot (AMR) Navigation Architecture',
      source: 'desktop_meeting',
      platform: 'google_meet',
      capturedAt: new Date().toISOString(),
      durationMinutes: 40,
      summary:
        'Reviewed ROS 2 Nav2 costmap layers and Livox LiDAR point cloud filtering for indoor industrial warehouse navigation. Agreed to switch to 2D occupancy grid fusion with EKF odometry for stability.',
      transcript:
        'Yashwanth: "Our point cloud SLAM is drifting near reflective metal surfaces."\nKavita (IvLabs): "Switching the local planner to TEB with costmap inflation radius 0.45m solves the jitter."\nYashwanth: "Understood. I will recompile the ROS 2 workspace and test in Gazebo by Friday."',
      speakers: [
        { speakerId: 's1', name: 'Yashwanth Koyaneni', isUser: true },
        { speakerId: 's4', name: 'Kavita Sundaram (Robotics Lead)', isUser: false },
      ],
      decisions: [{ id: generateId(), text: 'Approved TEB local planner and EKF odometry fusion for AMR' }],
      actionItems: [
        {
          id: generateId(),
          text: 'Recompile ROS 2 Humble workspace with Nav2 TEB planner and verify Gazebo simulation',
          assigneeName: 'Yashwanth Koyaneni',
          detectedDeadline: getTodayISO(),
          status: 'pending_approval',
          isCommitment: true,
          priority: 'high',
        },
      ],
      commitments: ['Run benchmark simulation in Gazebo by Friday afternoon'],
      followUps: ['Review Livox Mid-360 point cloud raw packet latency'],
      reminders: ['Check calibration board availability at IvLabs'],
      peopleMentioned: ['Kavita Sundaram'],
      associatedArea: 'IvLabs',
      tags: ['IvLabs', 'Robotics', 'ROS 2', 'AMR', 'Google Meet'],
    };

    await NeoSapienMemoryService.importMemories([sample], 'json_export');
    setIsImportModalOpen(false);
  };

  const discovery = NeoSapienMemoryService.getIntegrationDiscoveryReport();

  return (
    <div className="space-y-6">
      {/* Page Title & Status Header */}
      <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/30 flex items-center justify-center text-emerald-400 border border-emerald-500/30 shrink-0">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight">NeoSapien Personal Memory Center</h1>
                <Badge variant="emerald" className="gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Second Brain Active
                </Badge>
                <Badge variant="gray" className="text-xs">
                  Botless Capture
                </Badge>
              </div>
              <p className="text-sm text-[var(--hub-muted)] mt-1">
                Unified intelligence across <strong>Neo 1 Wearable</strong> and <strong>NeoSapien Desktop</strong>{' '}
                (Google Meet, Zoom, Teams & WhatsApp).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-card-bg)] hover:bg-[var(--hub-border)] text-sm font-medium transition-colors"
            >
              <Upload className="w-4 h-4 text-emerald-400" />
              Import Memories
            </button>
            <button
              onClick={() => setIsPrivacyModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--hub-border)] bg-[var(--hub-card-bg)] hover:bg-[var(--hub-border)] text-sm font-medium transition-colors"
            >
              <Shield className="w-4 h-4 text-blue-400" />
              Privacy & AI Controls
            </button>
            <button
              onClick={handleAutoAssociateCalendar}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-sm transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              Link Calendar Events
            </button>
          </div>
        </div>

        {/* Live Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-[var(--hub-border)]">
          <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
            <div className="text-xs text-[var(--hub-muted)] uppercase tracking-wider">Total Memories</div>
            <div className="text-xl font-bold mt-1 text-emerald-400">{allMemories.length}</div>
            <div className="text-[11px] text-[var(--hub-muted)] mt-0.5">Stored offline in IndexedDB</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
            <div className="text-xs text-[var(--hub-muted)] uppercase tracking-wider">Open Commitments</div>
            <div className="text-xl font-bold mt-1 text-amber-400">{reconciliationData.newCommitments.length}</div>
            <div className="text-[11px] text-[var(--hub-muted)] mt-0.5">Awaiting your approval</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
            <div className="text-xs text-[var(--hub-muted)] uppercase tracking-wider">Approved Tasks</div>
            <div className="text-xl font-bold mt-1 text-blue-400">{reconciliationData.approvedItems.length}</div>
            <div className="text-[11px] text-[var(--hub-muted)] mt-0.5">Synced to Yashwanth Hub</div>
          </div>
          <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
            <div className="text-xs text-[var(--hub-muted)] uppercase tracking-wider">Query Latency</div>
            <div className="text-xl font-bold mt-1 text-purple-400">{searchLatency} ms</div>
            <div className="text-[11px] text-[var(--hub-muted)] mt-0.5">Local compound indexing</div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--hub-border)] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('timeline')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'timeline'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <Layers className="w-4 h-4" />
          Memory Timeline ({filteredMemories.length})
        </button>
        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'reconciliation'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Commitment Reconciler
          {reconciliationData.newCommitments.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-black">
              {reconciliationData.newCommitments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'calendar'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Meeting & Calendar Intelligence
        </button>
        <button
          onClick={() => setActiveTab('sync_mcp')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'sync_mcp'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
          Sync, MCP & Webhooks
        </button>
      </div>

      {/* TAB 1: MEMORY TIMELINE */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          {/* Search & Filter Controls */}
          <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-4 flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--hub-muted)]" />
              <input
                type="text"
                placeholder="Search memories, transcripts, decisions, people, or wind turbine topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedAreaFilter}
                onChange={(e) => setSelectedAreaFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] text-xs font-medium focus:outline-none"
              >
                <option value="All">All Workspace Areas</option>
                {areas.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedSourceFilter}
                onChange={(e) => setSelectedSourceFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] text-xs font-medium focus:outline-none"
              >
                <option value="all">All Sources</option>
                <option value="wearable_neo1">Wearable (Neo 1)</option>
                <option value="desktop_meeting">Desktop App</option>
                <option value="web_import">Web App Sync</option>
                <option value="mcp_sync">MCP Sync</option>
              </select>

              <select
                value={selectedPlatformFilter}
                onChange={(e) => setSelectedPlatformFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] text-xs font-medium focus:outline-none"
              >
                <option value="all">All Platforms</option>
                <option value="google_meet">Google Meet</option>
                <option value="zoom">Zoom</option>
                <option value="microsoft_teams">Microsoft Teams</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="in_person">In-Person</option>
              </select>
            </div>
          </div>

          {/* Memories List */}
          {filteredMemories.length === 0 ? (
            <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-12 text-center">
              <Brain className="w-12 h-12 text-[var(--hub-muted)] mx-auto mb-3 opacity-40" />
              <h3 className="text-base font-semibold">No Neo memories match your filters</h3>
              <p className="text-sm text-[var(--hub-muted)] mt-1 max-w-md mx-auto">
                Capture conversations with your Neo 1 or record laptop calls with NeoSapien Desktop. You can also import
                your JSON export.
              </p>
              <button
                onClick={handleLoadSampleMeeting}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/25 transition-colors"
              >
                Load Sample AMR Robotics Desktop Meeting
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMemories.map((mem) => {
                const isWearable = mem.source === 'wearable_neo1';
                const hasPendingActions = mem.actionItems?.some((a) => a.status === 'pending_approval');

                return (
                  <div
                    key={mem.id}
                    className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 hover:border-emerald-500/40 transition-all cursor-pointer shadow-sm group"
                    onClick={() => setSelectedMemory(mem)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isWearable ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <Mic className="w-3 h-3" />
                            Neo 1 Wearable
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            <Laptop className="w-3 h-3" />
                            NeoSapien Desktop
                          </span>
                        )}

                        <span className="text-xs text-[var(--hub-muted)] uppercase tracking-wide font-mono">
                          {mem.platform.replace('_', ' ')}
                        </span>

                        {mem.associatedArea && (
                          <Badge variant="gray" className="text-xs">
                            {mem.associatedArea}
                          </Badge>
                        )}

                        {mem.associatedGoogleEventId && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                            <Calendar className="w-3 h-3" />
                            Google Calendar Linked
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-[var(--hub-muted)]">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {mem.capturedAt.slice(0, 10)} · {mem.durationMinutes || 15}m
                        </span>
                      </div>
                    </div>

                    <h3 className="text-base font-semibold text-[var(--hub-ink)] mt-2 group-hover:text-emerald-400 transition-colors">
                      {mem.title}
                    </h3>

                    <p className="text-sm text-[var(--hub-muted)] mt-1.5 line-clamp-2 leading-relaxed">
                      {mem.summary}
                    </p>

                    {/* Decisions & Commitments Preview */}
                    <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[var(--hub-border)]">
                      {mem.decisions?.slice(0, 1).map((dec, i) => (
                        <span
                          key={i}
                          className="text-xs text-[var(--hub-muted)] flex items-center gap-1 bg-[var(--hub-bg)] px-2.5 py-1 rounded-md border border-[var(--hub-border)]"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <strong>Decision:</strong> {dec.text}
                        </span>
                      ))}

                      {hasPendingActions && (
                        <span className="text-xs text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/20">
                          <AlertTriangle className="w-3 h-3" />
                          Action Items Awaiting Approval
                        </span>
                      )}

                      {mem.tags?.map((t) => (
                        <span key={t} className="text-[11px] text-[var(--hub-muted)] opacity-70">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: COMMITMENT & REMINDER RECONCILER */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-emerald-400" />
                Commitment Reconciliation Engine ("I Approve" Standard)
              </h2>
              <p className="text-sm text-[var(--hub-muted)] mt-1">
                NeoSapien ambiently captures spoken action items and reminders. Review and approve before committing them
                to Yashwanth Hub or pushing to Google Tasks.
              </p>
            </div>
            {onNavigateToTasks && (
              <button
                onClick={onNavigateToTasks}
                className="px-4 py-2 rounded-xl bg-[var(--hub-bg)] hover:bg-[var(--hub-surface-hover)] border border-[var(--hub-border)] text-xs font-semibold shrink-0"
              >
                Go to Tasks Page →
              </button>
            )}
          </div>

          {/* New Commitments Awaiting Approval */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              New Commitments Awaiting Approval ({reconciliationData.newCommitments.length})
            </h3>

            {reconciliationData.newCommitments.length === 0 ? (
              <div className="p-6 rounded-xl bg-[var(--hub-card-bg)] border border-[var(--hub-border)] text-sm text-[var(--hub-muted)] text-center">
                All spoken commitments and reminders are reconciled!
              </div>
            ) : (
              reconciliationData.newCommitments.map(({ memory, item }) => (
                <div
                  key={item.id}
                  className="bg-[var(--hub-card-bg)] border border-amber-500/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[var(--hub-ink)]">{item.text}</span>
                      <Badge variant="amber" className="text-xs">
                        {item.priority.toUpperCase()}
                      </Badge>
                      {item.detectedDeadline && (
                        <span className="text-xs text-[var(--hub-muted)] flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Due: {item.detectedDeadline}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--hub-muted)]">
                      Extracted from: <strong>"{memory.title}"</strong> ({memory.source}, {memory.capturedAt.slice(0, 10)})
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApproveActionItem(memory.id, item.id, false)}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs transition-colors"
                    >
                      Approve for Hub
                    </button>
                    {GoogleAuthService.isConnected() && (
                      <button
                        onClick={() => handleApproveActionItem(memory.id, item.id, true)}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-500/20 border border-blue-500/40 hover:bg-blue-500/30 text-blue-400 font-semibold text-xs transition-colors"
                      >
                        Approve & Push to Google
                      </button>
                    )}
                    <button
                      onClick={() => handleRejectActionItem(memory.id, item.id)}
                      className="px-3 py-1.5 rounded-xl border border-[var(--hub-border)] text-[var(--hub-muted)] hover:text-red-400 hover:border-red-400/40 text-xs transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Overdue Items */}
          {reconciliationData.overdueItems.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-[var(--hub-border)]">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-red-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Overdue Spoken Reminders ({reconciliationData.overdueItems.length})
              </h3>
              {reconciliationData.overdueItems.map(({ memory, item }) => (
                <div
                  key={item.id}
                  className="bg-[var(--hub-card-bg)] border border-red-500/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-red-400">{item.text}</div>
                    <div className="text-xs text-[var(--hub-muted)] mt-1">
                      Deadline was {item.detectedDeadline} (from: "{memory.title}")
                    </div>
                  </div>
                  <button
                    onClick={() => handleApproveActionItem(memory.id, item.id, false)}
                    className="px-3.5 py-1.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-semibold hover:bg-red-500/30 transition-colors"
                  >
                    Reschedule & Add Task
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MEETING & CALENDAR INTELLIGENCE */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                Pre-Meeting Intelligence & Google Calendar Sync
              </h2>
              <p className="text-sm text-[var(--hub-muted)] mt-1">
                Before jumping into calls, review prior discussions, past decisions, and open commitments made to
                attendees.
              </p>
            </div>
            {onNavigateToCalendar && (
              <button
                onClick={onNavigateToCalendar}
                className="px-4 py-2 rounded-xl bg-[var(--hub-bg)] hover:bg-[var(--hub-surface-hover)] border border-[var(--hub-border)] text-xs font-semibold shrink-0"
              >
                Open Calendar →
              </button>
            )}
          </div>

          {/* Upcoming Events Briefings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--hub-muted)]">
              Upcoming Calendar Events with Prior Memory Context
            </h3>

            {events.slice(0, 4).map((ev) => {
              const matchingMemories = allMemories.filter((m) =>
                m.associatedGoogleEventId === ev.google_event_id ||
                m.title.toLowerCase().includes(ev.title.toLowerCase())
              );

              return (
                <div
                  key={ev.id}
                  className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-5 space-y-3 shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold">{ev.title}</span>
                        <Badge variant="gray" className="text-xs">
                          {ev.area}
                        </Badge>
                      </div>
                      <div className="text-xs text-[var(--hub-muted)] mt-1">
                        📅 {ev.date} at {ev.start_time || 'All Day'} · {ev.place || 'Online'}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        onNavigateToAI?.(
                          `Prepare a pre-meeting intelligence brief for event "${ev.title}" on ${ev.date}. Summarize what we previously discussed and what action items remain open.`
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 hover:bg-purple-500/25 text-xs font-semibold transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Generate AI Meeting Brief
                    </button>
                  </div>

                  {matchingMemories.length > 0 ? (
                    <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] space-y-2">
                      <div className="text-xs font-semibold text-emerald-400">
                        Prior NeoSapien Memories Connected:
                      </div>
                      {matchingMemories.map((mm) => (
                        <div key={mm.id} className="text-xs text-[var(--hub-muted)] flex items-center justify-between">
                          <span>
                            • <strong>{mm.title}</strong> ({mm.capturedAt.slice(0, 10)})
                          </span>
                          <button
                            onClick={() => setSelectedMemory(mm)}
                            className="text-emerald-400 hover:underline"
                          >
                            View
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--hub-muted)] italic">
                      No prior NeoSapien memories automatically linked to this event.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: SYNC, MCP & WEBHOOKS */}
      {activeTab === 'sync_mcp' && (
        <div className="space-y-6">
          {/* Discovery & Architecture Card */}
          <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold flex items-center gap-2 text-emerald-400">
              <Shield className="w-5 h-5" />
              Official Product Architecture & Integration Protocol
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-xs leading-relaxed">
              <div className="p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] space-y-2">
                <div className="font-bold text-sm text-[var(--hub-ink)]">NeoSapien Official Capabilities</div>
                <p>• <strong>Neo 1 Wearable:</strong> Dual microphone array, ambient conversation transcription.</p>
                <p>• <strong>Desktop App:</strong> {discovery.captureTechnology}</p>
                <p>• <strong>Privacy Policy:</strong> {discovery.privacyArchitecture.audioPolicy}</p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] space-y-2">
                <div className="font-bold text-sm text-[var(--hub-ink)]">MCP & Ingestion Protocols</div>
                <p>• <strong>Neo MCP Status:</strong> {discovery.mcpServerStatus.officialPublicCloudMCP}</p>
                <p>• <strong>Supported Alternative:</strong> {discovery.mcpServerStatus.supportedAdapter}</p>
                <p>• <strong>Webhook Gateway:</strong> POST `/api/neosapien-webhook` with optional Bearer secret.</p>
              </div>
            </div>
          </div>

          {/* Sync Audit History Log */}
          <div className="bg-[var(--hub-card-bg)] border border-[var(--hub-border)] rounded-2xl p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--hub-muted)] mb-4">
              Idempotent Synchronization Audit History
            </h3>

            {auditLogs.length === 0 ? (
              <div className="text-xs text-[var(--hub-muted)] text-center py-4">No sync records logged yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[var(--hub-border)] text-[var(--hub-muted)]">
                    <tr>
                      <th className="pb-2">Timestamp</th>
                      <th className="pb-2">Method</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Imported</th>
                      <th className="pb-2">Updated</th>
                      <th className="pb-2">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--hub-border)]">
                    {auditLogs.slice(0, 8).map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 font-mono">{log.timestamp.slice(0, 16).replace('T', ' ')}</td>
                        <td className="py-2.5 uppercase font-semibold">{log.method}</td>
                        <td className="py-2.5">
                          <Badge variant={log.status === 'success' ? 'emerald' : 'amber'}>{log.status}</Badge>
                        </td>
                        <td className="py-2.5 text-emerald-400 font-bold">{log.memoriesImported}</td>
                        <td className="py-2.5 text-blue-400">{log.memoriesUpdated}</td>
                        <td className="py-2.5 text-[var(--hub-muted)]">{log.details || 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DETAIL MODAL: INSPECT MEMORY */}
      {selectedMemory && (
        <Modal
          isOpen={!!selectedMemory}
          onClose={() => setSelectedMemory(null)}
          title={selectedMemory.title}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--hub-muted)]">
              <Badge variant="gray">{selectedMemory.source}</Badge>
              <Badge variant="gray">{selectedMemory.platform}</Badge>
              <span>Captured: {selectedMemory.capturedAt.slice(0, 16).replace('T', ' ')}</span>
              <span>Duration: {selectedMemory.durationMinutes || 15} mins</span>
              {selectedMemory.associatedArea && (
                <Badge variant="emerald">{selectedMemory.associatedArea}</Badge>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-muted)] mb-1">
                Executive Discussion Summary
              </h4>
              <p className="text-sm leading-relaxed bg-[var(--hub-bg)] p-3.5 rounded-xl border border-[var(--hub-border)]">
                {selectedMemory.summary}
              </p>
            </div>

            {selectedMemory.decisions?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                  Key Decisions Agreed Upon
                </h4>
                <div className="space-y-1.5">
                  {selectedMemory.decisions.map((d, i) => (
                    <div
                      key={i}
                      className="text-xs p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[var(--hub-ink)] flex items-start gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{d.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedMemory.actionItems?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">
                  Action Items & Commitments
                </h4>
                <div className="space-y-2">
                  {selectedMemory.actionItems.map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[var(--hub-ink)]">{act.text}</div>
                        <div className="text-[var(--hub-muted)] mt-0.5">
                          Assignee: {act.assigneeName || 'Founder'} · Due: {act.detectedDeadline || 'TBD'}
                        </div>
                      </div>
                      <div className="shrink-0">
                        {act.status === 'approved' || act.status === 'synced_to_hub' ? (
                          <Badge variant="emerald">Approved</Badge>
                        ) : (
                          <button
                            onClick={() => handleApproveActionItem(selectedMemory.id, act.id, false)}
                            className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs transition-colors"
                          >
                            Approve Task
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedMemory.transcript && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-muted)] mb-1">
                  Verbatim Transcript Excerpt
                </h4>
                <pre className="text-xs font-mono p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] max-h-48 overflow-y-auto whitespace-pre-wrap leading-relaxed text-[var(--hub-muted)]">
                  {selectedMemory.transcript}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-[var(--hub-border)]">
              <button
                onClick={() => {
                  setSelectedMemory(null);
                  onNavigateToAI?.(`Analyze this NeoSapien memory: "${selectedMemory.title}". What are the critical engineering tradeoffs and next steps?`);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400 text-xs font-semibold hover:bg-purple-500/25 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Ask Yashwanth AI About This Memory
              </button>

              <button
                onClick={() => setSelectedMemory(null)}
                className="px-4 py-2 rounded-xl bg-[var(--hub-border)] text-xs font-medium hover:bg-[var(--hub-border)]/80 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* IMPORT MODAL */}
      {isImportModalOpen && (
        <Modal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Import NeoSapien Memories"
          maxWidth="max-w-xl"
        >
          <div className="space-y-4">
            <p className="text-xs text-[var(--hub-muted)]">
              Paste a JSON array exported from <strong>app.neosapien.ai</strong> or your desktop application. The
              idempotent import engine automatically deduplicates by <code>originalNeoId</code>.
            </p>

            <textarea
              rows={8}
              placeholder={`[\n  {\n    "title": "Meeting Title",\n    "summary": "...",\n    "capturedAt": "2026-11-04T12:00:00Z",\n    "actionItems": [{ "text": "Send contract" }]\n  }\n]`}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              className="w-full p-3 font-mono text-xs rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)] focus:outline-none focus:border-emerald-500 transition-colors"
            />

            {importMessage && (
              <div
                className={`text-xs p-3 rounded-xl ${
                  importMessage.startsWith('Success')
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/15 text-red-400 border border-red-500/30'
                }`}
              >
                {importMessage}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-[var(--hub-border)]">
              <button
                onClick={handleLoadSampleMeeting}
                className="text-xs text-emerald-400 hover:underline font-medium"
              >
                Load Sample Robotics Meeting
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--hub-border)] text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportJson}
                  className="px-4 py-1.5 rounded-xl bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-600 transition-colors"
                >
                  Import Records
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* PRIVACY & AI PERMISSIONS MODAL */}
      {isPrivacyModalOpen && (
        <Modal
          isOpen={isPrivacyModalOpen}
          onClose={() => setIsPrivacyModalOpen(false)}
          title="NeoSapien Privacy & Model Access Controls"
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 text-xs">
            <p className="text-[var(--hub-muted)]">
              Configure which external AI providers can access your authorized Neo memories during RAG retrieval.
              Unchecked models receive zero Neo context.
            </p>

            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
                <div>
                  <div className="font-semibold text-sm">Google Gemini 2.5 Flash / Pro</div>
                  <div className="text-[var(--hub-muted)] mt-0.5">Allow Gemini to retrieve Neo memories</div>
                </div>
                <input
                  type="checkbox"
                  checked={privacySettings.allowGeminiAccess}
                  onChange={(e) => {
                    const updated = { ...privacySettings, allowGeminiAccess: e.target.checked };
                    setPrivacySettings(updated);
                    NeoSapienMemoryService.savePrivacySettings(updated);
                  }}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
                <div>
                  <div className="font-semibold text-sm">OpenAI GPT-4o / o1-mini</div>
                  <div className="text-[var(--hub-muted)] mt-0.5">Allow OpenAI to retrieve Neo memories</div>
                </div>
                <input
                  type="checkbox"
                  checked={privacySettings.allowOpenAIAccess}
                  onChange={(e) => {
                    const updated = { ...privacySettings, allowOpenAIAccess: e.target.checked };
                    setPrivacySettings(updated);
                    NeoSapienMemoryService.savePrivacySettings(updated);
                  }}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
                <div>
                  <div className="font-semibold text-sm">Anthropic Claude 3.5 Sonnet</div>
                  <div className="text-[var(--hub-muted)] mt-0.5">Allow Claude to retrieve Neo memories</div>
                </div>
                <input
                  type="checkbox"
                  checked={privacySettings.allowClaudeAccess}
                  onChange={(e) => {
                    const updated = { ...privacySettings, allowClaudeAccess: e.target.checked };
                    setPrivacySettings(updated);
                    NeoSapienMemoryService.savePrivacySettings(updated);
                  }}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-border)]">
                <div>
                  <div className="font-semibold text-sm">Require Approval for Spoken Tasks</div>
                  <div className="text-[var(--hub-muted)] mt-0.5">
                    Never automatically create tasks without explicit click
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={privacySettings.requireExplicitApprovalForTasks}
                  onChange={(e) => {
                    const updated = { ...privacySettings, requireExplicitApprovalForTasks: e.target.checked };
                    setPrivacySettings(updated);
                    NeoSapienMemoryService.savePrivacySettings(updated);
                  }}
                  className="w-4 h-4 accent-emerald-500"
                />
              </label>
            </div>

            <div className="flex justify-end pt-3 border-t border-[var(--hub-border)]">
              <button
                onClick={() => setIsPrivacyModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
