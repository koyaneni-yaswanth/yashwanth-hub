import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Box,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Cpu,
  ExternalLink,
  FolderKanban,
  Layers,
  Link2,
  PenTool,
  Plus,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  User,
  Wind,
} from 'lucide-react';
import { db } from '../../db';
import { generateId, getTodayISO } from '../../lib/utils';
import { SyncQueueService } from '../../services/sync/syncQueueService';
import {
  FLAGSHIP_PORTFOLIO_SHOWCASES,
  GUIDED_TOUR_ORDER,
  JARVIS_STUDIO_STARTERS,
  YASHWANTH_IDENTITY_PROFILE,
  stationById,
  toFlagshipProjectRecord,
  type UniverseStationId,
} from '../../lib/universeConfig';
import { CompanionService } from '../../services/companion/companionService';
import { LocalAgentClient } from '../../services/ai/localAgentClient';
import { SafeMarkdown } from '../common/SafeMarkdown';
import { StudioWhiteboardPanel } from './StudioWhiteboardPanel';
import { StudioExperimentConsole } from './StudioExperimentConsole';
import type { AIChatMessage, NavigationTab } from '../../types';
import type { ProviderHealthReport } from '../../../api/_lib/aiProviderAdapters';

const EngineeringModelViewer = lazy(() =>
  import('../three/EngineeringModelViewer').then((m) => ({ default: m.EngineeringModelViewer }))
);

export interface CubeActionCommand {
  seq: number;
  type: 'scramble' | 'reset' | 'turn' | 'solve';
  axis?: 'x' | 'y' | 'z';
  layer?: -1 | 0 | 1;
  dir?: 1 | -1;
}

interface StudioMonitorOverlayProps {
  activeStation: UniverseStationId;
  onSelectStation: (id: UniverseStationId) => void;
  onNavigate: (tab: NavigationTab) => void;
  onWhiteboardTextureChange: (dataUrl: string) => void;
  onCubeCommand: (cmd: Omit<CubeActionCommand, 'seq'>) => void;
  turbineWindMs?: number;
  onChangeTurbineWindMs?: (v: number) => void;
  piperPose?: { shoulderDeg: number; elbowDeg: number } | null;
  onChangePiperPose?: (pose: { shoulderDeg: number; elbowDeg: number } | null) => void;
}

export const StudioMonitorOverlay: React.FC<StudioMonitorOverlayProps> = ({
  activeStation,
  onSelectStation,
  onNavigate,
  onWhiteboardTextureChange,
  onCubeCommand,
  turbineWindMs = 6.5,
  onChangeTurbineWindMs,
  piperPose = null,
  onChangePiperPose,
}) => {
  const station = stationById(activeStation);
  const projects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const roboticsRecords = useLiveQuery(() => db.robotics_records.toArray(), []) || [];
  const notes = useLiveQuery(() => db.notes.toArray(), []) || [];

  // Inline JARVIS state for Monitor 03
  const [chatHistory, setChatHistory] = useState<AIChatMessage[]>([]);
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);

  // Live system health for Monitor 04 + inline helpers
  const [providers, setProviders] = useState<ProviderHealthReport[]>([]);
  const [localOnline, setLocalOnline] = useState(false);
  const [localModel, setLocalModel] = useState<string | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [copiedBio, setCopiedBio] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [inlineCadStation, setInlineCadStation] = useState<'robotics' | 'energy' | null>(null);

  const refreshSystemDiagnostics = async () => {
    setCheckingHealth(true);
    try {
      const [apiRes, localRes] = await Promise.all([
        fetch('/api/ai/chat?action=health')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        LocalAgentClient.probeHealth().catch(() => ({ online: false, ollamaReachable: false, ollamaStatus: undefined })),
      ]);
      if (Array.isArray(apiRes?.providers)) setProviders(apiRes.providers);
      setLocalOnline(Boolean(localRes.online));
      setLocalModel(localRes.ollamaReachable ? localRes.ollamaStatus || 'Ollama Ready' : null);
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (activeStation === 'jarvis' || activeStation === 'research') {
      void refreshSystemDiagnostics();
    }
    if (activeStation === 'jarvis' && chatHistory.length === 0) {
      void CompanionService.loadConversationHistory()
        .then((hist) => {
          if (Array.isArray(hist) && hist.length > 0) setChatHistory(hist.slice(-8));
        })
        .catch(() => {});
    }
  }, [activeStation, chatHistory.length]);

  const sendJarvisText = async (rawText: string) => {
    const clean = rawText.trim();
    if (!clean || busy) return;
    setPrompt('');
    const userMsg: AIChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: clean,
      timestamp: new Date().toISOString(),
    };
    const next = [...chatHistory, userMsg];
    setChatHistory(next);
    setBusy(true);
    setStreaming('');

    try {
      const res = await CompanionService.sendCompanionMessage({
        userMessage: clean,
        history: chatHistory,
        onToken: (p: string) => setStreaming(p),
      });
      const updated = [...next, res.replyMessage];
      setChatHistory(updated);
      setStreaming('');
      await CompanionService.saveConversationMessages(updated, res.agentUsed);
    } catch (err) {
      const errMsg: AIChatMessage = {
        id: `e_${Date.now()}`,
        role: 'assistant',
        content: `Unable to reach configured AI provider: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
      };
      setChatHistory([...next, errMsg]);
      setStreaming('');
    } finally {
      setBusy(false);
    }
  };

  const handleSendJarvis = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendJarvisText(prompt);
  };

  if (activeStation === 'overview') return null;

  const isWide = activeStation === 'whiteboard' || activeStation === 'experiment';

  return (
    <aside
      aria-label={station.label}
      className={`fixed bottom-32 md:bottom-24 left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 z-25 w-[calc(100vw-1.5rem)] ${
        isWide ? 'max-w-3xl' : 'max-w-xl'
      } max-h-[calc(100vh-12.5rem)] flex flex-col rounded-2xl border border-white/15 bg-[#0A0E17]/92 backdrop-blur-xl text-[#F5F3EF] shadow-2xl overflow-hidden`}
      data-testid={`studio-panel-${activeStation}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/10 bg-black/30">
        <div className="min-w-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectStation('overview')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/15 text-xs font-semibold text-slate-200 hover:border-[#C6A46B] hover:text-white cursor-pointer shrink-0"
            aria-label="Back to studio overview"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>
          <div className="hidden sm:inline-flex items-center rounded-lg border border-white/15 bg-white/5 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => {
                const idx = GUIDED_TOUR_ORDER.indexOf(activeStation);
                const prevIdx = idx <= 0 ? GUIDED_TOUR_ORDER.length - 1 : idx - 1;
                onSelectStation(GUIDED_TOUR_ORDER[prevIdx]);
              }}
              className="p-1 text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              aria-label="Previous station"
              title="Previous station (Left arrow)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="w-px h-3.5 bg-white/15" />
            <button
              type="button"
              onClick={() => {
                const idx = GUIDED_TOUR_ORDER.indexOf(activeStation);
                const nextIdx = idx < 0 || idx >= GUIDED_TOUR_ORDER.length - 1 ? 0 : idx + 1;
                onSelectStation(GUIDED_TOUR_ORDER[nextIdx]);
              }}
              className="p-1 text-slate-300 hover:text-white hover:bg-white/10 cursor-pointer"
              aria-label="Next station"
              title="Next station (Right arrow)"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#C6A46B]">
              STATION {station.code} · {station.shortLabel}
            </p>
            <h2 className="text-sm font-bold font-heading truncate">{station.label}</h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-testid="station-copy-link-btn"
            onClick={() => {
              const link =
                typeof window !== 'undefined'
                  ? `${window.location.origin}/universe?station=${activeStation}`
                  : `/universe?station=${activeStation}`;
              void navigator.clipboard?.writeText(link);
              setCopiedLink(true);
              window.setTimeout(() => setCopiedLink(false), 1800);
            }}
            className="hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/15 hover:border-[#3BE8FF]/60 text-[11px] font-semibold text-slate-200 cursor-pointer"
            title="Copy direct ?station= permalink"
          >
            {copiedLink ? <Check className="w-3 h-3 text-emerald-300" /> : <Link2 className="w-3 h-3 text-[#3BE8FF]" />}
            <span>{copiedLink ? 'Copied' : 'Link'}</span>
          </button>
          {station.linkedTab && (
            <button
              type="button"
              onClick={() => onNavigate(station.linkedTab!)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#C6A46B] text-[#050608] text-xs font-bold hover:bg-[#dcc08a] cursor-pointer"
            >
              <span>Open Full Module</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 overflow-y-auto space-y-4 text-xs leading-relaxed">
        {activeStation === 'about' && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#C6A46B]/15 border border-[#C6A46B]/40 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[#C6A46B]" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-heading text-white">{YASHWANTH_IDENTITY_PROFILE.name}</h3>
                  <p className="text-slate-300 mt-0.5">{YASHWANTH_IDENTITY_PROFILE.title}</p>
                  <p className="font-mono text-[11px] text-[#8BA8C8] mt-1">{YASHWANTH_IDENTITY_PROFILE.education}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const md = `# ${YASHWANTH_IDENTITY_PROFILE.name}\n**${YASHWANTH_IDENTITY_PROFILE.title}**\n${YASHWANTH_IDENTITY_PROFILE.education}\n\n## Core Focus\n${YASHWANTH_IDENTITY_PROFILE.coreFocus.map((c) => `- ${c}`).join('\n')}\n\n## Stack\n${YASHWANTH_IDENTITY_PROFILE.stack.join(' · ')}\n`;
                  void navigator.clipboard?.writeText(md);
                  setCopiedBio(true);
                  window.setTimeout(() => setCopiedBio(false), 2200);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/15 hover:border-[#C6A46B] text-[11px] font-semibold text-slate-200 cursor-pointer shrink-0"
              >
                {copiedBio ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5 text-[#C6A46B]" />}
                <span>{copiedBio ? 'Copied' : 'Copy Bio'}</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A46B] font-bold">
                Active Engineering Mission
              </span>
              <ul className="space-y-1.5 text-slate-200">
                {YASHWANTH_IDENTITY_PROFILE.coreFocus.map((item) => (
                  <li key={item} className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#8BA8C8] font-bold block mb-2">
                Core Stack
              </span>
              <div className="flex flex-wrap gap-1.5">
                {YASHWANTH_IDENTITY_PROFILE.stack.map((tech) => (
                  <span key={tech} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 font-mono text-[11px] text-slate-200">
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={() => onSelectStation('projects')}
                className="px-3 py-1.5 rounded-lg bg-[#C6A46B]/15 border border-[#C6A46B]/40 text-[#E8D5B0] font-semibold cursor-pointer"
              >
                Flagship Projects →
              </button>
              <button
                type="button"
                onClick={() => onNavigate('learning-career')}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 hover:border-[#3BE8FF] text-slate-200 font-semibold cursor-pointer"
              >
                Grants & Opportunities →
              </button>
            </div>
          </div>
        )}

        {activeStation === 'projects' && (
          <div className="space-y-3.5" data-testid="studio-projects-list">
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#C6A46B] font-bold">
                Flagship Engineering Pillars
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FLAGSHIP_PORTFOLIO_SHOWCASES.map((item) => {
                  const isTracked = projects.some((p) => p.title === item.title);
                  return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-white/[0.04] border border-white/10 hover:border-white/25 transition-colors flex flex-col justify-between gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: item.accentHex }}>
                          {item.domain}
                        </span>
                        <span className="font-mono text-[9px] text-slate-400">{item.stage}</span>
                      </div>
                      <h3 className="font-bold text-slate-100 leading-snug">{item.title}</h3>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{item.summary}</p>
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {item.stack.map((tech) => (
                          <span key={tech} className="px-1.5 py-0.5 rounded bg-white/5 font-mono text-[9px] text-slate-300">
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => onSelectStation(item.stationId)}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-white/8 hover:bg-white/15 text-[11px] font-semibold text-slate-100 cursor-pointer"
                      >
                        Focus 3D Station
                      </button>
                      <button
                        type="button"
                        disabled={isTracked}
                        onClick={async () => {
                          if (isTracked) return;
                          const now = new Date().toISOString();
                          const id = generateId();
                          const newProj = toFlagshipProjectRecord(item, id, getTodayISO(), now, generateId);
                          await db.projects.add(newProj);
                          await SyncQueueService.enqueueChange('projects', id, 'INSERT', newProj);
                        }}
                        className={`inline-flex items-center gap-1 py-1.5 px-2 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                          isTracked
                            ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300 cursor-default'
                            : 'border-white/15 hover:border-[#3BE8FF] text-slate-200'
                        }`}
                        title={isTracked ? 'Tracked in local Projects' : 'Track in local Projects workspace'}
                      >
                        {isTracked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        <span>{isTracked ? 'Tracked' : 'Track'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate(item.tab)}
                        className="py-1.5 px-2.5 rounded-lg border border-white/15 hover:border-[#C6A46B] text-[11px] font-semibold text-[#C6A46B] cursor-pointer"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 pt-1 border-t border-white/10">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#8BA8C8] font-bold">
                  Local Dexie Tracked Initiatives ({projects.length})
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('projects')}
                  className="text-[11px] text-[#C6A46B] hover:underline cursor-pointer"
                >
                  Manage in Projects →
                </button>
              </div>
              {projects.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No personal local projects added in this browser yet — use Manage in Projects to track custom milestones.
                </p>
              ) : (
                <div className="space-y-2">
                  {projects.slice(0, 4).map((p) => (
                    <div key={p.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-100 flex items-center gap-1.5">
                          <FolderKanban className="w-3.5 h-3.5 text-[#8BA8C8]" />
                          {p.title}
                        </span>
                        <span className="font-mono text-[11px] text-[#C6A46B]">{p.progress}%</span>
                      </div>
                      <p className="text-slate-400 line-clamp-1">{p.description}</p>
                      <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-[#C6A46B]" style={{ width: `${Math.min(100, Math.max(0, p.progress))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeStation === 'jarvis' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10 font-mono text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <Bot className="w-4 h-4 text-[#3BE8FF]" />
                Cloud Providers Ready: {providers.filter((p) => p.configured).length}
              </span>
              <span className={localOnline ? 'text-emerald-300' : 'text-amber-300'}>
                Local Agent: {localOnline ? `ONLINE${localModel ? ` (${localModel})` : ''}` : 'Unpaired'}
              </span>
            </div>

            <div className="max-h-44 overflow-y-auto space-y-2 pr-1">
              {chatHistory.length === 0 ? (
                <p className="text-slate-400 p-3 rounded-xl bg-white/5 border border-white/10">
                  Ask JARVIS directly from Monitor 03 about your projects, notes, tasks, or engineering specs.
                </p>
              ) : (
                chatHistory.map((m) => (
                  <div
                    key={m.id}
                    className={`p-2.5 rounded-xl border ${
                      m.role === 'user'
                        ? 'bg-[#C6A46B]/15 border-[#C6A46B]/30 ml-6'
                        : 'bg-white/5 border-white/10 mr-4'
                    }`}
                  >
                    <SafeMarkdown content={m.content} className="text-xs" />
                  </div>
                ))
              )}
              {streaming && (
                <div className="p-2.5 rounded-xl bg-white/5 border border-[#3BE8FF]/30 mr-4">
                  <SafeMarkdown content={streaming} className="text-xs" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {JARVIS_STUDIO_STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  disabled={busy}
                  onClick={() => void sendJarvisText(starter)}
                  className="px-2.5 py-1 rounded-full bg-white/5 border border-white/12 hover:border-[#3BE8FF]/60 text-[10px] text-slate-300 hover:text-white cursor-pointer disabled:opacity-45"
                >
                  {starter.slice(0, 44)}{starter.length > 44 ? '…' : ''}
                </button>
              ))}
            </div>

            <form onSubmit={handleSendJarvis} className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask JARVIS across workspace & multi-AI..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/15 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#3BE8FF]"
              />
              <button
                type="submit"
                disabled={busy || !prompt.trim()}
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-[#3BE8FF] text-[#05070D] font-bold text-xs cursor-pointer disabled:opacity-45"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        )}

        {activeStation === 'research' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-300 font-semibold">Live Multi-AI & Runtime Diagnostics</span>
              <button
                type="button"
                onClick={() => void refreshSystemDiagnostics()}
                disabled={checkingHealth}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/15 text-[11px] hover:border-[#C6A46B] cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${checkingHealth ? 'animate-spin' : ''}`} />
                Probe Live
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {providers.map((p) => (
                <div key={p.id} className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{p.name}</span>
                    <span className={`font-mono text-[10px] ${p.configured ? 'text-emerald-300' : 'text-slate-400'}`}>
                      {p.configured ? 'ACTIVE' : 'UNCONFIGURED'}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-slate-400 mt-1">
                    {p.latencyMs != null ? `${p.latencyMs} ms` : 'Reachability unchecked'}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-base font-bold text-[#3BE8FF]">{tasks.filter((t) => !t.done).length}</span>
                <span className="text-[10px] text-slate-400">Open Tasks</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-base font-bold text-[#C6A46B]">{roboticsRecords.length}</span>
                <span className="text-[10px] text-slate-400">Lab Logs</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-base font-bold text-[#8BA8C8]">{notes.length}</span>
                <span className="text-[10px] text-slate-400">Notes</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onNavigate('research-feed')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:border-[#8BA8C8] cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#8BA8C8]" />
                Open Research Feed
              </button>
              <button
                type="button"
                onClick={() => onNavigate('system-health')}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:border-[#C6A46B] cursor-pointer"
              >
                <Cpu className="w-3.5 h-3.5 text-[#C6A46B]" />
                System Health & CI
              </button>
            </div>
          </div>
        )}

        {activeStation === 'robotics' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-400/25 flex items-start gap-2.5">
              <Radio className="w-4 h-4 text-sky-300 shrink-0 mt-0.5" />
              <p className="text-slate-200">
                Inspecting <strong>AgileX PiPER 6-DOF Arm</strong>, <strong>3-Drone PX4 Swarm</strong> &{' '}
                <strong>TI AWR2944 mmWave Radar</strong> bench. Drag joints below to articulate the 3D studio arm live, or launch full URDF/GLB CAD inspection.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-[#38BDF8] font-bold">Live 3D PiPER Joint Control</span>
                <button
                  type="button"
                  onClick={() => onChangePiperPose?.(null)}
                  className="text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Auto Sweep
                </button>
              </div>
              <label className="block space-y-1 font-mono text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span>J2 Shoulder Pitch</span>
                  <span>{piperPose?.shoulderDeg ?? -7}°</span>
                </div>
                <input
                  type="range"
                  min={-55}
                  max={55}
                  value={piperPose?.shoulderDeg ?? -7}
                  onChange={(e) =>
                    onChangePiperPose?.({
                      shoulderDeg: Number(e.target.value),
                      elbowDeg: piperPose?.elbowDeg ?? 22,
                    })
                  }
                  className="w-full accent-[#38BDF8]"
                />
              </label>
              <label className="block space-y-1 font-mono text-[11px] text-slate-300">
                <div className="flex justify-between">
                  <span>J3 Elbow Articulation</span>
                  <span>{piperPose?.elbowDeg ?? 22}°</span>
                </div>
                <input
                  type="range"
                  min={-15}
                  max={85}
                  value={piperPose?.elbowDeg ?? 22}
                  onChange={(e) =>
                    onChangePiperPose?.({
                      shoulderDeg: piperPose?.shoulderDeg ?? -7,
                      elbowDeg: Number(e.target.value),
                    })
                  }
                  className="w-full accent-[#38BDF8]"
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInlineCadStation((prev) => (prev === 'robotics' ? null : 'robotics'))}
                aria-expanded={inlineCadStation === 'robotics'}
                className="px-3 py-2.5 rounded-xl bg-white/8 border border-white/15 hover:border-[#38BDF8] text-slate-100 font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Layers className="w-4 h-4 text-[#38BDF8]" />
                <span>{inlineCadStation === 'robotics' ? 'Hide 3D CAD' : 'Inline 3D CAD'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('robotics-lab')}
                className="flex-1 py-2.5 rounded-xl bg-[#38BDF8] text-[#05070D] font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Box className="w-4 h-4" />
                <span>Launch Robotics Lab</span>
              </button>
            </div>
            {inlineCadStation === 'robotics' && (
              <Suspense
                fallback={
                  <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-center font-mono text-[11px] text-slate-400">
                    Loading PiPER CAD Inspector...
                  </div>
                }
              >
                <EngineeringModelViewer compact preset="piper-arm" />
              </Suspense>
            )}
          </div>
        )}

        {activeStation === 'energy' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/25 flex items-start gap-2.5">
              <Wind className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
              <p className="text-slate-200">
                <strong>PAWAN SHAKTI</strong> — Compact Archimedes-inspired helical rotor & planetary/magnetic gear bench rig. Sweep wind speed below to drive the 3D studio rotor and inspect the calculated aerodynamic envelope.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-emerald-300 font-bold">Live 3D Rotor Wind Speed</span>
                <span>{turbineWindMs.toFixed(1)} m/s</span>
              </div>
              <input
                type="range"
                min={3.0}
                max={15.0}
                step={0.5}
                value={turbineWindMs}
                onChange={(e) => onChangeTurbineWindMs?.(Number(e.target.value))}
                aria-label="PAWAN SHAKTI wind speed m/s"
                className="w-full accent-emerald-400"
              />
              <div className="flex flex-wrap items-center justify-between gap-1.5 font-mono text-[10px]">
                <div className="flex gap-1.5">
                  {[
                    { label: 'Cut-In 3.8', v: 3.8 },
                    { label: 'Nominal 8.5', v: 8.5 },
                    { label: 'Peak 14.0', v: 14.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => onChangeTurbineWindMs?.(p.v)}
                      className={`px-2 py-1 rounded-lg border cursor-pointer ${
                        Math.abs(turbineWindMs - p.v) < 0.3
                          ? 'bg-emerald-400/20 border-emerald-400 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <span className="text-slate-400">
                  Calc Rel Flow: ~{Math.round(turbineWindMs * 52)} RPM eq
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setInlineCadStation((prev) => (prev === 'energy' ? null : 'energy'))}
                aria-expanded={inlineCadStation === 'energy'}
                className="px-3 py-2.5 rounded-xl bg-white/8 border border-white/15 hover:border-emerald-400 text-slate-100 font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Layers className="w-4 h-4 text-emerald-300" />
                <span>{inlineCadStation === 'energy' ? 'Hide 3D CAD' : 'Inline 3D CAD'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('startup-command')}
                className="flex-1 py-2.5 rounded-xl bg-emerald-400 text-[#05070D] font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Launch PAWAN SHAKTI Lab</span>
              </button>
            </div>
            {inlineCadStation === 'energy' && (
              <Suspense
                fallback={
                  <div className="p-4 rounded-xl bg-black/40 border border-white/10 text-center font-mono text-[11px] text-slate-400">
                    Loading Turbine CAD Inspector...
                  </div>
                }
              >
                <EngineeringModelViewer compact preset="pawan-turbine" />
              </Suspense>
            )}
          </div>
        )}

        {activeStation === 'whiteboard' && (
          <StudioWhiteboardPanel
            onTextureUpdate={onWhiteboardTextureChange}
            onSendSketchToJarvis={(dataUrl) => {
              localStorage.setItem(
                'yash_ai_prefill_prompt',
                'Analyze this engineering whiteboard sketch and suggest structured technical next actions.'
              );
              sessionStorage.setItem('yash_universe_sketch_dataurl', dataUrl);
              onNavigate('buddy');
            }}
          />
        )}

        {activeStation === 'experiment' && (
          <StudioExperimentConsole
            onClose={() => onSelectStation('overview')}
            turbineWindMs={turbineWindMs}
            onChangeTurbineWindMs={onChangeTurbineWindMs}
            piperPose={piperPose}
            onChangePiperPose={onChangePiperPose}
          />
        )}

        {activeStation === 'cube' && (
          <div className="space-y-3">
            <p className="text-slate-300">
              Drag directly across the cube in 3D to tumble it, rotate any of the 6 layers below, scramble, or run the animated reverse Auto-Solver.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 font-mono text-[11px]">
              {[
                { label: 'U (Top)', axis: 'y' as const, layer: 1 as const, dir: 1 as const },
                { label: 'D (Bot)', axis: 'y' as const, layer: -1 as const, dir: -1 as const },
                { label: 'R (Right)', axis: 'x' as const, layer: 1 as const, dir: 1 as const },
                { label: 'L (Left)', axis: 'x' as const, layer: -1 as const, dir: -1 as const },
                { label: 'F (Front)', axis: 'z' as const, layer: 1 as const, dir: 1 as const },
                { label: 'B (Back)', axis: 'z' as const, layer: -1 as const, dir: -1 as const },
              ].map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => onCubeCommand({ type: 'turn', axis: m.axis, layer: m.layer, dir: m.dir })}
                  className="py-2 px-2 rounded-xl bg-white/5 border border-white/15 hover:border-[#C6A46B] text-center cursor-pointer"
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onCubeCommand({ type: 'scramble' })}
                className="py-2 rounded-xl bg-[#F97316]/20 border border-[#F97316]/40 text-orange-200 font-semibold cursor-pointer"
              >
                Scramble
              </button>
              <button
                type="button"
                onClick={() => onCubeCommand({ type: 'solve' })}
                className="py-2 rounded-xl bg-[#3BE8FF]/20 border border-[#3BE8FF]/45 text-[#3BE8FF] font-semibold cursor-pointer"
              >
                Auto-Solve
              </button>
              <button
                type="button"
                onClick={() => onCubeCommand({ type: 'reset' })}
                className="py-2 rounded-xl bg-white/5 border border-white/15 text-slate-200 font-semibold cursor-pointer"
              >
                Reset Solved
              </button>
            </div>
          </div>
        )}

        {activeStation === 'workspace' && (
          <div className="grid grid-cols-2 gap-2">
            {[
              { tab: 'tasks' as const, label: 'Priority Tasks', icon: Layers },
              { tab: 'my-day' as const, label: 'Daily Compass', icon: PenTool },
              { tab: 'notes' as const, label: 'Markdown Notes Vault', icon: ExternalLink },
              { tab: 'knowledge-memory' as const, label: 'Knowledge Graph', icon: Sparkles },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => onNavigate(item.tab)}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#C6A46B] text-left cursor-pointer"
                >
                  <span className="font-semibold text-slate-100">{item.label}</span>
                  <Icon className="w-4 h-4 text-[#C6A46B]" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
