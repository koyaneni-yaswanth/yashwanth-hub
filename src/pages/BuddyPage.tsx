/**
 * PROJECT JARVIS 4.0 — Dedicated Companion Interface (/buddy)
 * Minimalist focal stage: 3D companion core, natural conversation stream,
 * voice toggle, quick shortcuts, and progressive disclosure drawers for
 * Activity Timeline, Memory Vault, Platform Awareness, Proactive Schedule & Personality.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Brain,
  Check,
  Clock,
  Download,
  FileText,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Shield,
  Sparkles,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { BuddyCoreScene } from '../components/buddy/BuddyCoreScene';
import { ProviderGatewayModal } from '../components/buddy/ProviderGatewayModal';
import { CompanionService } from '../services/companion/companionService';
import { AIGateway } from '../services/ai/aiGateway';
import { LocalAgentClient } from '../services/ai/localAgentClient';
import { VoiceCompanionController, getVoiceCapabilities } from '../services/voiceCompanionService';
import type { TaskRouteCategory } from '../lib/modelRouter5';
import {
  BUDDY_VISUAL_STATES,
  DEFAULT_COMPANION_SETTINGS,
  JARVIS_IDENTITY,
  PERSONALITY_PRESETS,
  type PersonalityPresetKey,
} from '../lib/companionIdentity';
import { COMPANION_AGENTS } from '../lib/companionAgents';
import { COMPANION_MEMORY_CATEGORIES } from '../lib/memoryExtractor';
import { EXTRA_CLOUD_UPDATE_EVENT, listenExtraBroadcasts } from '../services/sync/extraCloudSync';
import type { CredentialStatusItem } from '../lib/awarenessCore';
import type {
  AIChatMessage,
  AwarenessSourceRecord,
  BuddyAgentRole,
  BuddyVisualState,
  CompanionMemoryCategory,
  CompanionMemoryRecord,
  CompanionTimelineItem,
  CompanionTimelineKind,
  JarvisCompanionSettings,
  NavigationTab,
} from '../types';

interface BuddyPageProps {
  onNavigate?: (tab: NavigationTab) => void;
}

const KIND_BADGE: Record<CompanionTimelineKind, { label: string; cls: string }> = {
  live_observation: { label: 'Observed', cls: 'bg-sky-500/15 text-sky-300 border-sky-400/30' },
  historical_info: { label: 'Historical', cls: 'bg-slate-500/15 text-slate-300 border-slate-400/30' },
  ai_inference: { label: 'Inferred', cls: 'bg-violet-500/15 text-violet-300 border-violet-400/30' },
  recommendation: { label: 'Recommended', cls: 'bg-amber-500/15 text-amber-300 border-amber-400/30' },
  pending_approval: { label: 'Approval Needed', cls: 'bg-orange-500/20 text-orange-200 border-orange-400/40' },
  executed_action: { label: 'Executed', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' },
  learned_memory: { label: 'Learned', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30' },
  error: { label: 'Error', cls: 'bg-rose-500/15 text-rose-300 border-rose-400/30' },
};

export const BuddyPage: React.FC<BuddyPageProps> = ({ onNavigate }) => {
  const [settings, setSettings] = useState<JarvisCompanionSettings>(DEFAULT_COMPANION_SETTINGS);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streamingReply, setStreamingReply] = useState('');
  const [selectedAgent, setSelectedAgent] = useState<BuddyAgentRole | 'auto'>('auto');
  const [visualState, setVisualState] = useState<BuddyVisualState>('idle');
  const [micActive, setMicActive] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speakingActive, setSpeakingActive] = useState(false);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [memories, setMemories] = useState<CompanionMemoryRecord[]>([]);
  const [timeline, setTimeline] = useState<CompanionTimelineItem[]>([]);
  const [awarenessSources, setAwarenessSources] = useState<AwarenessSourceRecord[]>([]);
  const [credentials, setCredentials] = useState<CredentialStatusItem[]>([]);
  const [topInsight, setTopInsight] = useState<{
    title: string;
    detail: string;
    kind: 'critical' | 'attention' | 'briefing' | 'clear';
  }>({
    title: 'Standing by across your workspace',
    detail: 'Ask what matters right now or tap a shortcut below.',
    kind: 'clear',
  });

  // Progressive disclosure UI drawers (hidden until opened)
  const [showTimelineDrawer, setShowTimelineDrawer] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState<'all' | CompanionTimelineKind>('all');
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [studioTab, setStudioTab] = useState<'personality' | 'memory' | 'awareness' | 'schedule' | 'security'>('personality');
  const [showGatewayModal, setShowGatewayModal] = useState(false);
  const [gatewayInitialTab, setGatewayInitialTab] = useState<'reliability' | 'providers' | 'local'>('providers');

  // JARVIS 5.0 Gateway / Local Runtime & Stream Control state
  const [routeCategory, setRouteCategory] = useState<'AUTO' | TaskRouteCategory>('AUTO');
  const [privateOfflineOnly, setPrivateOfflineOnly] = useState(false);
  const [systemStatusPill, setSystemStatusPill] = useState<'LOCAL ONLINE' | 'CLOUD ONLINE' | 'DEGRADED' | 'OFFLINE'>('DEGRADED');
  const [showAllHistory, setShowAllHistory] = useState(false);
  const streamAbortRef = useRef<AbortController | null>(null);

  // Memory editing state inside modal
  const [memSearch, setMemSearch] = useState('');
  const [memCategoryFilter, setMemCategoryFilter] = useState<'all' | CompanionMemoryCategory>('all');
  const [newMemCat, setNewMemCat] = useState<CompanionMemoryCategory>('preference');
  const [newMemTitle, setNewMemTitle] = useState('');
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemProject, setNewMemProject] = useState('');
  const [memNotice, setMemNotice] = useState<string | null>(null);

  const voiceRef = useRef<VoiceCompanionController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const voiceCaps = useMemo(() => getVoiceCapabilities(), []);

  const refreshLocalState = useCallback(async () => {
    const [mems, tl, aware, cfg, proactive] = await Promise.all([
      CompanionService.loadMemories(),
      CompanionService.loadTimeline(60),
      CompanionService.loadCachedAwareness(),
      CompanionService.loadSettings(),
      CompanionService.evaluateLocalProactiveStatus(),
    ]);
    setMemories(mems);
    setTimeline(tl);
    setAwarenessSources(aware);
    setSettings(cfg);
    setTopInsight(proactive.topInsight);
  }, []);

  const refreshSystemStatusPill = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const loc = await LocalAgentClient.probeHealth();
      setSystemStatusPill(loc.online && loc.ollamaReachable ? 'LOCAL ONLINE' : 'OFFLINE');
      return;
    }
    const [loc, cloud] = await Promise.all([
      LocalAgentClient.probeHealth(),
      AIGateway.healthCheck({ includeLocalOllama: false }).catch(() => null),
    ]);
    if (loc.online && loc.ollamaReachable) {
      setSystemStatusPill('LOCAL ONLINE');
      return;
    }
    const hasHealthyCloud = Boolean(cloud?.providers?.some((p) => p.configured && p.status === 'connected'));
    if (hasHealthyCloud) {
      setSystemStatusPill('CLOUD ONLINE');
      return;
    }
    setSystemStatusPill(cloud ? 'DEGRADED' : 'OFFLINE');
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [history, overview, proactive] = await Promise.all([
        CompanionService.loadConversationHistory(),
        CompanionService.syncOverview(),
        CompanionService.evaluateLocalProactiveStatus(),
      ]);
      if (!alive) return;
      setMessages(history);
      setMemories(overview.memories);
      setTimeline(overview.timeline);
      setAwarenessSources(overview.awarenessSources);
      setCredentials(overview.credentials);
      setSettings(overview.settings);
      setTopInsight(proactive.topInsight);

      const pendingCount = overview.timeline.filter(
        (t) => t.kind === 'pending_approval' && t.status === 'pending_approval'
      ).length;
      if (pendingCount > 0 || proactive.topInsight.kind === 'critical') {
        setVisualState('attention');
      }
      refreshSystemStatusPill().catch(() => {});
    })();

    const onOnlineChange = () => refreshSystemStatusPill().catch(() => {});
    window.addEventListener('online', onOnlineChange);
    window.addEventListener('offline', onOnlineChange);

    const onExtra = () => {
      refreshLocalState().catch(() => {});
    };
    window.addEventListener(EXTRA_CLOUD_UPDATE_EVENT, onExtra);
    const unsubBroadcast = listenExtraBroadcasts(() => {
      refreshLocalState().catch(() => {});
    });

    // Live WebSocket telemetry from local-agent daemon (only when explicitly paired via token)
    let unsubLocalWs: (() => void) | null = null;
    try {
      if (LocalAgentClient.getConfig().token) {
        unsubLocalWs = LocalAgentClient.subscribeEvents((ev) => {
          if (ev?.type === 'status' || ev?.type === 'ollama_ready' || ev?.type === 'model_loaded' || ev?.type === 'task_completed') {
            refreshSystemStatusPill().catch(() => {});
          }
          if (ev?.type === 'task_completed' || ev?.type === 'task_failed' || ev?.type === 'warning') {
            refreshLocalState().catch(() => {});
          }
        });
      }
    } catch {
      // ignore storage errors in restricted environments
    }

    return () => {
      alive = false;
      window.removeEventListener('online', onOnlineChange);
      window.removeEventListener('offline', onOnlineChange);
      window.removeEventListener(EXTRA_CLOUD_UPDATE_EVENT, onExtra);
      unsubBroadcast();
      unsubLocalWs?.();
      voiceRef.current?.dispose();
    };
  }, [refreshLocalState, refreshSystemStatusPill]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, streamingReply]);

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || visualState === 'thinking' || visualState === 'working') return;

      // Barge-in stop voice output
      voiceRef.current?.stopSpeaking();
      setErrorBanner(null);
      if (!overrideText) setInput('');

      const userMsg: AIChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };
      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      setStreamingReply('');
      setVisualState('thinking');
      setBusyText('Thinking across your workspace & memory...');

      const abortCtrl = new AbortController();
      streamAbortRef.current = abortCtrl;

      try {
        const res = await CompanionService.sendCompanionMessage({
          userMessage: text,
          history: messages,
          explicitAgent: selectedAgent === 'auto' ? undefined : selectedAgent,
          routeCategory: routeCategory === 'AUTO' ? undefined : routeCategory,
          privateOfflineOnly,
          allowCloudFallback: !privateOfflineOnly,
          signal: abortCtrl.signal,
          onToken: (partial) => setStreamingReply(partial),
        });
        streamAbortRef.current = null;

        const updatedMessages = [...nextHistory, res.replyMessage];
        setMessages(updatedMessages);
        setStreamingReply('');
        setBusyText(null);
        await CompanionService.saveConversationMessages(updatedMessages, res.agentUsed);
        await refreshLocalState();

        if (res.proposedTimelineItem) {
          setVisualState('attention');
        } else if (settings.voiceEnabled && settings.autoSpeakReplies && voiceCaps.ttsSupported) {
          voiceRef.current?.speak(res.replyMessage.content, settings.voiceRate);
        } else {
          setVisualState('idle');
        }
      } catch (err: any) {
        streamAbortRef.current = null;
        setBusyText(null);
        setStreamingReply('');
        if (err?.name === 'AbortError') {
          setVisualState('idle');
          return;
        }
        setVisualState('error');
        setErrorBanner(err?.message || 'Unable to generate reply.');
      }
    },
    [input, messages, privateOfflineOnly, refreshLocalState, routeCategory, selectedAgent, settings.autoSpeakReplies, settings.voiceEnabled, settings.voiceRate, visualState, voiceCaps.ttsSupported]
  );

  const handleStopStream = () => {
    streamAbortRef.current?.abort();
    AIGateway.cancel();
    streamAbortRef.current = null;
    setStreamingReply('');
    setBusyText(null);
    setVisualState('idle');
  };

  // Initialize Voice controller lazily
  const ensureVoiceController = useCallback(() => {
    if (!voiceRef.current) {
      voiceRef.current = new VoiceCompanionController({
        onInterimTranscript: (interim) => setInput(interim),
        onFinalTranscript: (finalText) => {
          setInput(finalText);
          handleSend(finalText);
        },
        onMicLevel: (lvl) => setMicLevel(lvl),
        onListeningChange: (isOn) => {
          setMicActive(isOn);
          setVisualState(isOn ? 'listening' : 'idle');
        },
        onSpeakingChange: (isSpeaking) => {
          setSpeakingActive(isSpeaking);
          setVisualState(isSpeaking ? 'speaking' : 'idle');
        },
        onError: (msg) => {
          setErrorBanner(msg);
          setVisualState('error');
        },
      });
    }
    return voiceRef.current;
  }, [handleSend]);

  const toggleMic = async () => {
    const vc = ensureVoiceController();
    if (micActive) {
      vc.stopListening();
    } else {
      setErrorBanner(null);
      await vc.startListening();
    }
  };

  const handleRefreshAwareness = async () => {
    setVisualState('observing');
    setBusyText('Checking connected platforms...');
    const res = await CompanionService.refreshAwareness();
    setAwarenessSources(res.sources);
    if (res.error) setErrorBanner(res.error);
    await refreshLocalState();
    setBusyText(null);
    setVisualState(res.observationsCreated.length > 0 ? 'attention' : 'idle');
  };

  const handleCreateHandover = async () => {
    setVisualState('working');
    setBusyText('Compiling verified handover document...');
    const bodyLines = [
      `# JARVIS Companion Handover (${new Date().toISOString().slice(0, 10)})`,
      '',
      `## Top Priority`,
      `- ${topInsight.title}: ${topInsight.detail}`,
      '',
      `## Recent Active Memories (${memories.length})`,
      ...memories.slice(0, 8).map((m) => `- **[${m.category}] ${m.title}**: ${m.content}`),
      '',
      `## Connected Platforms`,
      ...awarenessSources.map((s) => `- **${s.id}**: ${s.status}${s.latest_summary ? ` — ${s.latest_summary}` : ''}`),
    ];
    const res = await CompanionService.executeOrProposeAction({
      toolName: 'create_handover_doc',
      args: {
        title: `JARVIS Handover — ${new Date().toISOString().slice(0, 10)}`,
        body: bodyLines.join('\n'),
        area: 'General',
      },
      approvedByHuman: true,
    });
    setBusyText(null);
    await refreshLocalState();
    if (res.status === 'executed') {
      setMessages((prev) => [
        ...prev,
        {
          id: `sys_${Date.now()}`,
          role: 'assistant',
          content: `**Handover document created & verified.** ${res.message} You can open it anytime inside Workspace -> Notes.`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setVisualState('idle');
    } else {
      setErrorBanner(res.message);
      setVisualState('error');
    }
  };

  const handleApproveTimeline = async (item: CompanionTimelineItem) => {
    const toolName = String(item.metadata?.toolName || '');
    const args = (item.metadata?.args || {}) as Record<string, any>;
    setVisualState('working');
    setBusyText(`Executing approved action (${toolName})...`);
    const res = await CompanionService.executeOrProposeAction({
      toolName,
      args,
      approvedByHuman: true,
      timelineId: item.id,
    });
    setBusyText(null);
    await refreshLocalState();
    setVisualState(res.status === 'executed' ? 'idle' : 'error');
    if (res.status !== 'executed') setErrorBanner(res.message);
  };

  const handleRejectTimeline = async (item: CompanionTimelineItem) => {
    await CompanionService.rejectTimelineItem(item.id);
    await refreshLocalState();
  };

  const handleSaveManualMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemNotice(null);
    const res = await CompanionService.saveMemory({
      category: newMemCat,
      title: newMemTitle,
      content: newMemContent,
      project: newMemProject.trim() || undefined,
      verified_by_user: true,
      importance: 8,
      source: 'manual',
    });
    if (!res.saved) {
      setMemNotice(res.error || 'Could not save memory.');
      return;
    }
    setNewMemTitle('');
    setNewMemContent('');
    setNewMemProject('');
    setMemNotice('Saved & verified in long-term memory.');
    await refreshLocalState();
  };

  const handleExportMemories = async () => {
    const json = await CompanionService.exportMemoriesJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-memories-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const applyPersonalityPreset = async (presetKey: PersonalityPresetKey) => {
    const next = await CompanionService.saveSettings(PERSONALITY_PRESETS[presetKey].patch);
    setSettings(next);
  };

  const pendingApprovals = useMemo(
    () => timeline.filter((t) => t.kind === 'pending_approval' && t.status === 'pending_approval'),
    [timeline]
  );

  const filteredMemories = useMemo(() => {
    const q = memSearch.trim().toLowerCase();
    return memories.filter((m) => {
      if (memCategoryFilter !== 'all' && m.category !== memCategoryFilter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.content.toLowerCase().includes(q) ||
        (m.project || '').toLowerCase().includes(q)
      );
    });
  }, [memories, memCategoryFilter, memSearch]);

  const filteredTimeline = useMemo(
    () => (timelineFilter === 'all' ? timeline : timeline.filter((t) => t.kind === timelineFilter)),
    [timeline, timelineFilter]
  );

  return (
    <div className="min-h-[calc(100vh-4rem)] max-w-5xl mx-auto px-3 sm:px-6 py-4 flex flex-col gap-4">
      {/* Compact Top Companion Header */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300 shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-100">
                {JARVIS_IDENTITY.name}
              </h1>
              <span className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-slate-300">
                {settings.personalityTone} · {settings.personalityStyle}
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">{JARVIS_IDENTITY.tagline}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setGatewayInitialTab('reliability');
              setShowGatewayModal(true);
            }}
            data-system-status={systemStatusPill}
            title="Open System Reliability & Local/Cloud Diagnostics"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide transition ${
              systemStatusPill === 'LOCAL ONLINE'
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                : systemStatusPill === 'CLOUD ONLINE'
                ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                : systemStatusPill === 'DEGRADED'
                ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
                : 'bg-rose-500/15 border-rose-400/40 text-rose-300'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            <span>{systemStatusPill}</span>
          </button>

          <select
            aria-label="Task Routing Mode"
            value={routeCategory}
            onChange={(e) => {
              const v = e.target.value as 'AUTO' | TaskRouteCategory;
              setRouteCategory(v);
              setPrivateOfflineOnly(v === 'LOCAL');
            }}
            className="text-xs rounded-lg border border-white/10 bg-[#10151d] text-slate-200 px-2 py-1.5"
          >
            <option value="AUTO">Route: Smart Auto</option>
            <option value="FAST">FAST</option>
            <option value="REASONING">REASONING</option>
            <option value="CODING">CODING</option>
            <option value="MULTIMODAL">MULTIMODAL</option>
            <option value="LOCAL">LOCAL (Private)</option>
          </select>

          <select
            aria-label="Active Specialist Agent"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value as BuddyAgentRole | 'auto')}
            className="text-xs rounded-lg border border-white/10 bg-[#10151d] text-slate-200 px-2.5 py-1.5"
          >
            <option value="auto">Agent: Auto Route</option>
            {Object.values(COMPANION_AGENTS).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setGatewayInitialTab('providers');
              setShowGatewayModal(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#10151d] hover:bg-white/10 px-2.5 py-1.5 text-xs text-slate-200 transition"
          >
            <Zap className="h-3.5 w-3.5 text-amber-300" />
            <span className="hidden sm:inline">Providers</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTimelineDrawer(true)}
            className="relative inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#10151d] hover:bg-white/10 px-2.5 py-1.5 text-xs text-slate-200 transition"
          >
            <Activity className="h-3.5 w-3.5 text-sky-400" />
            <span>Activity</span>
            {pendingApprovals.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-amber-500 text-black">
                {pendingApprovals.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setStudioTab('memory');
              setShowStudioModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#10151d] hover:bg-white/10 px-2.5 py-1.5 text-xs text-slate-200 transition"
          >
            <Brain className="h-3.5 w-3.5 text-cyan-400" />
            <span>Memory ({memories.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setStudioTab('personality');
              setShowStudioModal(true);
            }}
            aria-label="Open Companion Settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#10151d] hover:bg-white/10 px-2.5 py-1.5 text-xs text-slate-200 transition"
          >
            <Settings2 className="h-3.5 w-3.5 text-amber-300" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* Central 3D Companion Core */}
      <BuddyCoreScene
        visualState={visualState}
        micLevel={micActive ? micLevel : 0}
        speakingEnergy={speakingActive ? 0.7 : 0}
        onCoreClick={() => {
          if (pendingApprovals.length > 0) setShowTimelineDrawer(true);
          else handleRefreshAwareness();
        }}
      />

      {/* Single Calm Top Contextual Insight (Plus inline pending approval CTA if waiting) */}
      <section className="rounded-xl border border-white/10 bg-[#10151d]/90 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
            <span
              className={`h-2 w-2 rounded-full ${
                topInsight.kind === 'critical'
                  ? 'bg-rose-400'
                  : topInsight.kind === 'attention'
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span>{busyText || topInsight.title}</span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{topInsight.detail}</p>
        </div>

        <div className="flex items-center gap-2">
          {pendingApprovals.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowTimelineDrawer(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/30"
            >
              Review Approval ({pendingApprovals.length})
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRefreshAwareness}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200"
            >
              <RefreshCw className="h-3 w-3" />
              <span>Sync Awareness</span>
            </button>
          )}
        </div>
      </section>

      {errorBanner && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200 flex items-center justify-between gap-2">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)} className="text-rose-300 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Natural Conversation Panel */}
      <section className="flex-1 min-h-[260px] max-h-[420px] overflow-y-auto rounded-2xl border border-white/10 bg-[#0b0f17]/90 p-4 space-y-3">
        {messages.length === 0 && !streamingReply ? (
          <div className="text-center py-8 px-4 space-y-2">
            <p className="text-sm text-slate-200 font-medium">
              Hey Yashwanth — I'm ready whenever you want to check in.
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Ask about Pawan Shakti, AgileX PiPER, research papers, GitHub commits, or today's priorities.
            </p>
          </div>
        ) : (
          <>
            {messages.length > 40 && !showAllHistory && (
              <button
                type="button"
                onClick={() => setShowAllHistory(true)}
                className="w-full text-center text-[11px] text-sky-400 hover:underline py-1"
              >
                Load {messages.length - 40} earlier message(s)
              </button>
            )}
            {(showAllHistory ? messages : messages.slice(-40)).map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-amber-500/15 border border-amber-400/25 text-slate-100'
                    : 'bg-white/5 border border-white/10 text-slate-200'
                }`}
              >
                {m.content}
                {m.role === 'assistant' && m.provider && (
                  <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-slate-400">
                    <span>
                      {m.provider}
                      {m.modelId ? ` · ${m.modelId}` : ''}
                    </span>
                    {voiceCaps.ttsSupported && (
                      <button
                        type="button"
                        onClick={() => ensureVoiceController().speak(m.content, settings.voiceRate)}
                        className="hover:text-slate-200 inline-flex items-center gap-1"
                        title="Speak this reply"
                      >
                        <Volume2 className="h-3 w-3" /> Speak
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            ))}
          </>
        )}

        {streamingReply && (
          <div className="flex flex-col items-start">
            <div className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-white/5 border border-cyan-400/25 text-slate-100">
              {streamingReply}
              <span className="inline-block w-1.5 h-3.5 bg-cyan-400 ml-1 animate-pulse align-middle" />
            </div>
          </div>
        )}

        {/* Inline Approval Cards when an action is waiting */}
        {pendingApprovals.slice(0, 2).map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-amber-400/35 bg-amber-500/10 p-3 flex flex-wrap items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-amber-200">{item.title}</div>
              <div className="text-xs text-slate-300">{item.summary}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApproveTimeline(item)}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs hover:bg-emerald-500/30"
              >
                Approve & Execute
              </button>
              <button
                type="button"
                onClick={() => handleRejectTimeline(item)}
                className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs hover:bg-white/10"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}

        <div ref={chatEndRef} />
      </section>

      {/* Quick-Action Shortcuts + Input + Explicit Voice Controls */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: "What's happening?", prompt: "Hey Jarvis, what's happening across my projects and priorities?" },
            { label: 'Morning Briefing', prompt: 'Give me a crisp executive morning briefing with top actions.' },
            { label: 'Check Dev & CI', prompt: 'Inspect latest GitHub commits, workflow runs, and Vercel deployment state.' },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => handleSend(q.prompt)}
              className="text-xs px-3 py-1 rounded-full border border-white/10 bg-[#10151d] hover:bg-white/10 text-slate-300 transition"
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleCreateHandover}
            className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-amber-400/25 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 transition"
          >
            <FileText className="h-3 w-3" />
            <span>Create Handover Doc</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2 rounded-2xl border border-white/15 bg-[#10151d] px-3 py-2 focus-within:border-amber-400/50"
        >
          <button
            type="button"
            onClick={toggleMic}
            disabled={!voiceCaps.sttSupported}
            aria-label={micActive ? 'Stop microphone listening' : 'Start microphone listening'}
            title={
              !voiceCaps.sttSupported
                ? 'Speech input unavailable in this browser'
                : micActive
                ? 'Listening — click to stop microphone'
                : 'Mic off — click to speak'
            }
            className={`p-2 rounded-xl border transition shrink-0 ${
              micActive
                ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 animate-pulse'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 disabled:opacity-40'
            }`}
          >
            {micActive ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </button>

          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={micActive ? 'Listening... speak naturally' : 'Talk to JARVIS...'}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none min-w-0"
          />

          <button
            type="button"
            onClick={async () => {
              if (speakingActive) {
                voiceRef.current?.stopSpeaking();
              } else {
                const next = await CompanionService.saveSettings({
                  voiceEnabled: !settings.voiceEnabled,
                  autoSpeakReplies: !settings.voiceEnabled,
                });
                setSettings(next);
              }
            }}
            aria-label={settings.voiceEnabled ? 'Disable spoken replies' : 'Enable spoken replies'}
            title={speakingActive ? 'Stop speaking' : settings.voiceEnabled ? 'Auto-speak ON' : 'Auto-speak OFF'}
            className={`p-2 rounded-xl border transition shrink-0 ${
              speakingActive || settings.voiceEnabled
                ? 'bg-sky-500/15 border-sky-400/40 text-sky-300'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
            }`}
          >
            {speakingActive || settings.voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>

          {visualState === 'thinking' ? (
            <button
              type="button"
              onClick={handleStopStream}
              aria-label="Stop generating"
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/85 hover:bg-rose-500 text-white font-semibold text-xs px-3 py-2 transition shrink-0"
            >
              <Square className="h-3 w-3" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message to JARVIS"
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-semibold text-xs px-3.5 py-2 transition shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          )}
        </form>
      </div>

      {/* ===================================================================== */}
      {/* PROGRESSIVE DISCLOSURE 1: ACTIVITY TIMELINE DRAWER                     */}
      {/* ===================================================================== */}
      {showTimelineDrawer && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-lg bg-[#0d121a] border-l border-white/10 h-full flex flex-col p-4 gap-3 overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">Companion Activity Timeline</h2>
                <p className="text-[11px] text-slate-400">
                  Observed facts, inferences, recommendations, approvals & executed work kept strictly separate.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close Timeline"
                onClick={() => setShowTimelineDrawer(false)}
                className="p-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {(['all', 'live_observation', 'recommendation', 'pending_approval', 'executed_action', 'learned_memory', 'error'] as const).map(
                (k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTimelineFilter(k)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap ${
                      timelineFilter === k
                        ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {k === 'all' ? 'All' : KIND_BADGE[k].label}
                  </button>
                )
              )}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {filteredTimeline.length === 0 ? (
                <div className="text-center text-xs text-slate-400 py-10">No timeline entries recorded yet.</div>
              ) : (
                filteredTimeline.map((item) => {
                  const badge = KIND_BADGE[item.kind] || KIND_BADGE.historical_info;
                  return (
                    <div key={item.id} className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                        <span className="text-[10px] text-slate-500">
                          {item.source} · {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-slate-100">{item.title}</div>
                      <div className="text-xs text-slate-400">{item.summary}</div>
                      {item.status === 'pending_approval' && (
                        <div className="pt-1 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleApproveTimeline(item)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs"
                          >
                            Approve & Execute
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectTimeline(item)}
                            className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {item.action_url && (
                        <a
                          href={item.action_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-[11px] text-sky-400 hover:underline pt-0.5"
                        >
                          Open verified link
                        </a>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PROGRESSIVE DISCLOSURE 2: COMPANION SETTINGS / MEMORY / AWARENESS     */}
      {/* ===================================================================== */}
      {showStudioModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
          <div className="w-full max-w-3xl max-h-[88vh] rounded-2xl border border-white/15 bg-[#0d121a] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-amber-300" />
                <h2 className="text-sm font-semibold text-slate-100">JARVIS Companion Studio</h2>
              </div>
              <button
                type="button"
                aria-label="Close Companion Studio"
                onClick={() => setShowStudioModal(false)}
                className="p-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 px-4 py-2 border-b border-white/10 overflow-x-auto bg-black/20">
              {(
                [
                  { id: 'personality', label: 'Personality & Voice' },
                  { id: 'memory', label: `Memory (${memories.length})` },
                  { id: 'awareness', label: 'Awareness & Credentials' },
                  { id: 'schedule', label: 'Proactive & Quiet Hours' },
                  { id: 'security', label: 'Agents, Routing & Guardrails' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStudioTab(tab.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border whitespace-nowrap ${
                    studioTab === tab.id
                      ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs text-slate-200">
              {studioTab === 'personality' && (
                <div className="space-y-4">
                  <div>
                    <div className="text-slate-300 font-medium mb-2">Personality Presets</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(Object.keys(PERSONALITY_PRESETS) as PersonalityPresetKey[]).map((key) => {
                        const preset = PERSONALITY_PRESETS[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => applyPersonalityPreset(key)}
                            className="text-left rounded-xl border border-white/10 bg-[#121923] hover:border-amber-400/40 p-3 space-y-1"
                          >
                            <div className="font-semibold text-slate-100">{preset.label}</div>
                            <div className="text-[11px] text-slate-400">{preset.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-slate-400">Tone</span>
                      <select
                        value={settings.personalityTone}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ personalityTone: e.target.value as any }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#121923] px-3 py-2"
                      >
                        <option value="friendly">Friendly (Default)</option>
                        <option value="professional">Professional</option>
                        <option value="technical">Technical Partner</option>
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-slate-400">Reply Style</span>
                      <select
                        value={settings.personalityStyle}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ personalityStyle: e.target.value as any }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#121923] px-3 py-2"
                      >
                        <option value="concise">Concise (Default)</option>
                        <option value="detailed">Detailed</option>
                      </select>
                    </label>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-2">
                    <div className="font-medium text-slate-100">Visual State Preview (8 Core States)</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.keys(BUDDY_VISUAL_STATES) as BuddyVisualState[]).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setVisualState(st)}
                          className={`px-2.5 py-1 rounded-full border text-[11px] ${
                            visualState === st
                              ? 'bg-white/15 border-amber-400/50 text-white'
                              : 'border-white/10 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {BUDDY_VISUAL_STATES[st].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {studioTab === 'memory' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <input
                      type="text"
                      value={memSearch}
                      onChange={(e) => setMemSearch(e.target.value)}
                      placeholder="Search memories..."
                      className="flex-1 min-w-[180px] rounded-lg border border-white/10 bg-[#121923] px-3 py-1.5 text-slate-100"
                    />
                    <select
                      value={memCategoryFilter}
                      onChange={(e) => setMemCategoryFilter(e.target.value as any)}
                      className="rounded-lg border border-white/10 bg-[#121923] px-2.5 py-1.5"
                    >
                      <option value="all">All 10 Categories</option>
                      {COMPANION_MEMORY_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleExportMemories}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 hover:bg-white/10"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export JSON</span>
                    </button>
                  </div>

                  <form onSubmit={handleSaveManualMemory} className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-2">
                    <div className="font-medium text-slate-100 flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5 text-amber-300" />
                      <span>Add Long-Term Memory (Secret-Protected)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <select
                        value={newMemCat}
                        onChange={(e) => setNewMemCat(e.target.value as CompanionMemoryCategory)}
                        className="rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5"
                      >
                        {COMPANION_MEMORY_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        required
                        value={newMemTitle}
                        onChange={(e) => setNewMemTitle(e.target.value)}
                        placeholder="Short memory title..."
                        className="rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5"
                      />
                      <input
                        type="text"
                        value={newMemProject}
                        onChange={(e) => setNewMemProject(e.target.value)}
                        placeholder="Project tag (optional)"
                        className="rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newMemContent}
                        onChange={(e) => setNewMemContent(e.target.value)}
                        placeholder="Fact, preference, architecture choice, or milestone (never enter passwords or API keys)"
                        className="flex-1 rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400"
                      >
                        Save
                      </button>
                    </div>
                    {memNotice && <div className="text-[11px] text-amber-300">{memNotice}</div>}
                  </form>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {filteredMemories.map((m) => (
                      <div key={m.id} className="rounded-xl border border-white/10 bg-[#121923] p-3 flex justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px]">
                              {m.category}
                            </span>
                            {m.project && (
                              <span className="px-2 py-0.5 rounded-full bg-white/5 text-slate-300 text-[10px]">
                                {m.project}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-500">
                              {m.durability === 'temporary' ? 'Temp' : 'Long-term'} · Imp {m.importance}/10
                            </span>
                            {m.verified_by_user && <span className="text-[10px] text-emerald-400">✓ Verified</span>}
                          </div>
                          <div className="font-medium text-slate-100">{m.title}</div>
                          <div className="text-slate-400">{m.content}</div>
                        </div>
                        <div className="flex items-start gap-1 shrink-0">
                          {!m.verified_by_user && (
                            <button
                              type="button"
                              onClick={async () => {
                                await CompanionService.saveMemory({ ...m, verified_by_user: true });
                                await refreshLocalState();
                              }}
                              title="Verify memory"
                              className="p-1.5 rounded-lg border border-white/10 text-emerald-300 hover:bg-emerald-500/15"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => {
                              await CompanionService.deleteMemory(m.id);
                              await refreshLocalState();
                            }}
                            title="Delete memory"
                            className="p-1.5 rounded-lg border border-white/10 text-rose-300 hover:bg-rose-500/15"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {studioTab === 'awareness' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-slate-300">
                      Connected platform monitors (strictly truthful status — unconfigured sources never claim live telemetry).
                    </div>
                    <button
                      type="button"
                      onClick={handleRefreshAwareness}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-400/40 px-2.5 py-1 text-amber-200"
                    >
                      <RefreshCw className="h-3 w-3" /> Poll Now
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {awarenessSources.map((src) => (
                      <div key={src.id} className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-100">{src.id}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              src.status === 'connected'
                                ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                                : src.status === 'degraded' || src.status === 'error'
                                ? 'bg-rose-500/15 border-rose-400/30 text-rose-300'
                                : 'bg-white/5 border-white/10 text-slate-400'
                            }`}
                          >
                            {src.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">{src.latest_summary || 'Awaiting configuration'}</div>
                      </div>
                    ))}
                  </div>

                  {credentials.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-2">
                      <div className="font-semibold text-slate-100">Missing vs Configured Integration Secrets</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {credentials.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-white/5">
                            <span className="text-slate-300 truncate">{c.label}</span>
                            <span className={c.configured ? 'text-emerald-400' : 'text-amber-300'}>
                              {c.configured ? 'Configured' : c.envVar}
                            </span>
                          </div>
                        ))}
                      </div>
                      {onNavigate && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowStudioModal(false);
                            onNavigate('integrations');
                          }}
                          className="text-[11px] text-sky-400 hover:underline"
                        >
                          Manage OAuth connections in Integrations & Sync
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {studioTab === 'schedule' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="rounded-xl border border-white/10 bg-[#121923] p-3 flex items-center justify-between">
                      <span>Proactive companion alerts</span>
                      <input
                        type="checkbox"
                        checked={settings.proactiveEnabled}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ proactiveEnabled: e.target.checked }))
                        }
                      />
                    </label>
                    <label className="rounded-xl border border-white/10 bg-[#121923] p-3 flex items-center justify-between">
                      <span>Respect Quiet Hours (IST)</span>
                      <input
                        type="checkbox"
                        checked={settings.quietHoursEnabled}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ quietHoursEnabled: e.target.checked }))
                        }
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Morning Briefing Time
                      </span>
                      <input
                        type="time"
                        value={settings.morningBriefingTime}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ morningBriefingTime: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#121923] px-3 py-1.5"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Evening Wrap-Up Time
                      </span>
                      <input
                        type="time"
                        value={settings.eveningBriefingTime}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ eveningBriefingTime: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#121923] px-3 py-1.5"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400">Quiet Hours Start</span>
                      <input
                        type="time"
                        value={settings.quietHoursStart}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ quietHoursStart: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#121923] px-3 py-1.5"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400">Quiet Hours End</span>
                      <input
                        type="time"
                        value={settings.quietHoursEnd}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ quietHoursEnd: e.target.value }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#121923] px-3 py-1.5"
                      />
                    </label>
                  </div>
                </div>
              )}

              {studioTab === 'security' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1">
                      <span className="text-slate-400">Preferred AI Provider</span>
                      <select
                        value={settings.preferredProvider}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ preferredProvider: e.target.value as any }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#121923] px-3 py-2"
                      >
                        <option value="auto">Auto Route (Configured & Healthy Fastest)</option>
                        <option value="gemini">Google Gemini</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic Claude</option>
                        <option value="huggingface">Hugging Face</option>
                        <option value="ollama">Ollama Local</option>
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400">Routing Cost / Depth Strategy</span>
                      <select
                        value={settings.costBudget}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ costBudget: e.target.value as any }))
                        }
                        className="w-full rounded-lg border border-white/10 bg-[#121923] px-3 py-2"
                      >
                        <option value="low">Low Cost / Fast Flash</option>
                        <option value="balanced">Balanced (Default)</option>
                        <option value="best">Best Reasoning Depth</option>
                      </select>
                    </label>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-100">
                      <Shield className="h-3.5 w-3.5 text-emerald-400" />
                      <span>3-Tier Execution Guardrails & Privacy</span>
                    </div>
                    <ul className="space-y-1 text-slate-300 list-disc pl-4">
                      <li>Tier 1 (Automatic): summaries, diagnostics, memory extraction (secret-scrubbed), handover notes.</li>
                      <li>Tier 2 (Approval Required): task creation/updates, calendar events, external alerts, GitHub issues.</li>
                      <li>Tier 3 (Strictly Restricted): destructive table wipes, billing transfers, secret/RLS changes.</li>
                      <li>External emails, web articles, and repo data are sandboxed inside `&lt;untrusted_external_data&gt;`.</li>
                    </ul>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="rounded-xl border border-white/10 bg-[#121923] p-3 flex items-center justify-between">
                      <span>Auto-extract non-secret memories from chats</span>
                      <input
                        type="checkbox"
                        checked={settings.autoExtractMemories}
                        onChange={async (e) =>
                          setSettings(await CompanionService.saveSettings({ autoExtractMemories: e.target.checked }))
                        }
                      />
                    </label>
                    <label className="rounded-xl border border-white/10 bg-[#121923] p-3 flex items-center justify-between">
                      <span>Allow contact memories when explicitly shared</span>
                      <input
                        type="checkbox"
                        checked={settings.allowExternalContactsMemory}
                        onChange={async (e) =>
                          setSettings(
                            await CompanionService.saveSettings({ allowExternalContactsMemory: e.target.checked })
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ProviderGatewayModal
        isOpen={showGatewayModal}
        onClose={() => setShowGatewayModal(false)}
        initialTab={gatewayInitialTab}
        onStatusRefresh={() => {
          refreshSystemStatusPill().catch(() => {});
        }}
      />
    </div>
  );
};
