import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Bot,
  Box,
  Compass,
  Cpu,
  Eye,
  FolderKanban,
  Gamepad2,
  MoreHorizontal,
  PenTool,
  Sparkles,
  User,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { db } from '../db';
import { StudioAudioEngine } from '../lib/studioAudio';
import {
  UNIVERSE_EIGHT_ENVIRONMENTS,
  YASHWANTH_IDENTITY_PROFILE,
  stationById,
  type UniverseStationId,
} from '../lib/universeConfig';
import { StudioMonitorOverlay, type CubeActionCommand } from '../components/universe/StudioMonitorOverlay';
import { LocalAgentClient } from '../services/ai/localAgentClient';
import type { NavigationTab } from '../types';

const UniverseStudioScene = lazy(() =>
  import('../components/universe/UniverseStudioScene').then((m) => ({ default: m.UniverseStudioScene }))
);

interface UniversePageProps {
  onNavigate: (tab: NavigationTab) => void;
}

const ENTRY_DISMISSED_KEY = 'yash_universe_entered_v1';

const DOCK_PRIMARY: Array<{ id: UniverseStationId; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Studio', icon: Compass },
  { id: 'about', label: 'About Me', icon: User },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'whiteboard', label: 'Whiteboard', icon: PenTool },
  { id: 'experiment', label: 'Experiments', icon: Gamepad2 },
  { id: 'jarvis', label: 'JARVIS Core', icon: Bot },
];

const DOCK_EXTRA: Array<{ id: UniverseStationId; label: string; icon: React.ElementType }> = [
  { id: 'robotics', label: 'Robotics Lab', icon: Cpu },
  { id: 'energy', label: 'Energy Lab', icon: Wind },
  { id: 'research', label: 'System / Labs', icon: Box },
  { id: 'cube', label: 'Rubik Cube', icon: Compass },
];

export const UniversePage: React.FC<UniversePageProps> = ({ onNavigate }) => {
  const [entered, setEntered] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ENTRY_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [bootProgress, setBootProgress] = useState(40);
  const [activeStation, setActiveStation] = useState<UniverseStationId>('overview');
  const [hoveredStation, setHoveredStation] = useState<UniverseStationId | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [use3D, setUse3D] = useState(true);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.22);
  const [whiteboardDataUrl, setWhiteboardDataUrl] = useState<string | null>(null);
  const [cubeCommand, setCubeCommand] = useState<CubeActionCommand | null>(null);
  const [providersReady, setProvidersReady] = useState(0);
  const [localOnline, setLocalOnline] = useState(false);
  const [perfMetrics, setPerfMetrics] = useState<{ tier: string; fps: number; webglActive: boolean }>({
    tier: 'high',
    fps: 60,
    webglActive: false,
  });

  const audioRef = useRef<StudioAudioEngine | null>(null);
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const projects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const roboticsCount = useLiveQuery(() => db.robotics_records.count(), []) ?? 0;

  useEffect(() => {
    const t1 = window.setTimeout(() => setBootProgress(100), 180);
    fetch('/api/ai/chat?action=health')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.providers)) {
          setProvidersReady(d.providers.filter((p: { configured?: boolean }) => p.configured).length);
        }
      })
      .catch(() => {});
    LocalAgentClient.probeHealth()
      .then((res) => setLocalOnline(Boolean(res.online)))
      .catch(() => {});

    void db.settings.get('universe_whiteboard_v1').then((row) => {
      if (typeof row?.value?.dataUrl === 'string') setWhiteboardDataUrl(row.value.dataUrl);
    });

    return () => {
      window.clearTimeout(t1);
      audioRef.current?.dispose();
    };
  }, []);

  const handleEnterStudio = () => {
    setEntered(true);
    try {
      sessionStorage.setItem(ENTRY_DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const selectStation = (id: UniverseStationId) => {
    setActiveStation(id);
    setMoreOpen(false);
    audioRef.current?.playTone(id === 'overview' ? 392 : 528, 0.08);
  };

  const toggleAudio = async () => {
    if (!audioRef.current) audioRef.current = new StudioAudioEngine();
    const ok = await audioRef.current.setEnabled(!audioEnabled);
    setAudioEnabled(ok);
  };

  const statsSummary = useMemo(
    () => ({
      openTasks: tasks.filter((t) => !t.done).length,
      projectCount: projects.length,
      roboticsCount,
      providersReady,
      localOnline,
    }),
    [tasks, projects.length, roboticsCount, providersReady, localOnline]
  );

  const hoveredMeta = hoveredStation ? stationById(hoveredStation) : null;

  return (
    <div
      className="relative w-full h-[calc(100vh-3.5rem)] min-h-[600px] overflow-hidden bg-[#050608] text-[#F5F3EF] select-none"
      data-testid="digital-universe-root"
    >
      {/* Ultra-Clean Floating Top Studio Header (>90% Pure 3D Viewport, clears left w-16 sidebar) */}
      <header className="pointer-events-none fixed top-14 left-0 md:left-16 right-0 z-20 flex items-center justify-between px-4 sm:px-6 pt-3">
        <div className="pointer-events-auto flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#080B12]/78 backdrop-blur-md border border-white/10 shadow-lg">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-200 hover:text-[#C6A46B] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#C6A46B]" />
            <span>HUD</span>
          </button>
          <span className="h-3 w-px bg-white/15" />
          <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#C6A46B]">
            Yashwanth · 3D Studio
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-[#080B12]/78 backdrop-blur-md border border-white/10 shadow-lg">
          <button
            type="button"
            onClick={() => void toggleAudio()}
            aria-pressed={audioEnabled}
            aria-label={audioEnabled ? 'Mute studio ambient audio' : 'Enable studio ambient audio'}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
              audioEnabled ? 'text-[#E9D7AE] bg-[#C6A46B]/20' : 'text-slate-300 hover:text-white'
            }`}
          >
            {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Audio' : 'Muted'}</span>
          </button>

          {audioEnabled && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioVolume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setAudioVolume(v);
                audioRef.current?.setVolume(v);
              }}
              aria-label="Studio ambient volume"
              className="w-14 accent-[#C6A46B]"
            />
          )}

          {!webglUnavailable && (
            <>
              {use3D && (
                <>
                  <span className="h-3 w-px bg-white/15 hidden sm:inline-block" />
                  <button
                    type="button"
                    onClick={() => setShowPins((p) => !p)}
                    aria-pressed={showPins}
                    className={`hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                      showPins ? 'text-[#E9D7AE] bg-[#C6A46B]/18' : 'text-slate-400 hover:text-white'
                    }`}
                    title="Toggle 3D object labels"
                  >
                    <span>Labels</span>
                  </button>
                </>
              )}
              <span className="h-3 w-px bg-white/15" />
              <button
                type="button"
                onClick={() => setUse3D((v) => !v)}
                aria-pressed={use3D}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-mono text-slate-200 hover:text-[#3BE8FF] cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-[#3BE8FF]" />
                <span>{use3D ? `${perfMetrics.fps} FPS` : '2D'}</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Spatial Canvas OR Accessible 2D Fallback Mode */}
      <div className="relative w-full h-full">
        {use3D && !webglUnavailable ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-slate-400">
                Booting WebGL Engineering Studio...
              </div>
            }
          >
            <UniverseStudioScene
              activeStation={activeStation}
              hoveredStation={hoveredStation}
              onHoverStation={setHoveredStation}
              onSelectStation={selectStation}
              whiteboardDataUrl={whiteboardDataUrl}
              cubeCommand={cubeCommand}
              showPins={showPins}
              statsSummary={statsSummary}
              onMetricsUpdate={setPerfMetrics}
              onWebglUnavailable={() => {
                setWebglUnavailable(true);
                setUse3D(false);
              }}
            />
          </Suspense>
        ) : (
          <div className="h-full overflow-y-auto pt-20 pb-24 px-4 sm:px-8 max-w-5xl mx-auto space-y-6">
            <div className="rounded-2xl border border-[#C6A46B]/30 bg-[#0B101B] p-6 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs uppercase tracking-widest text-[#C6A46B]">
                  {webglUnavailable ? '2D Engineering Mode (WebGL Unavailable)' : '2D Accessible Studio Mode'}
                </span>
                <Compass className="w-5 h-5 text-[#C6A46B]" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold font-heading">{YASHWANTH_IDENTITY_PROFILE.name}</h1>
              <p className="text-sm text-slate-300">{YASHWANTH_IDENTITY_PROFILE.title}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {UNIVERSE_EIGHT_ENVIRONMENTS.map((env) => (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => selectStation(env.stationId)}
                  className="text-left p-4 rounded-xl bg-white/5 border border-white/10 hover:border-[#C6A46B] transition-colors space-y-1.5 cursor-pointer"
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#8BA8C8]">Environment</span>
                  <h2 className="text-sm font-bold text-white">{env.name}</h2>
                  <p className="text-xs text-slate-400">{env.role}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Hovered 3D Object Minimal Tooltip */}
        {hoveredMeta && hoveredStation !== activeStation && use3D && !webglUnavailable && (
          <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-full bg-[#090D16]/88 border border-[#C6A46B]/50 backdrop-blur-md text-xs flex items-center gap-2 shadow-xl">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredMeta.accentHex }} />
            <span className="font-semibold text-white">{hoveredMeta.label}</span>
          </div>
        )}

        {/* Simple, Attractive Bottom Spatial Dock */}
        <div className="pointer-events-none fixed bottom-20 md:bottom-5 left-0 md:left-16 right-0 z-30 flex flex-col items-center gap-2 px-3">
          {moreOpen && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 p-2 rounded-2xl bg-[#0A0E17]/92 backdrop-blur-xl border border-white/15 shadow-2xl">
              {DOCK_EXTRA.map((item) => {
                const Icon = item.icon;
                const active = activeStation === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectStation(item.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? 'bg-[#C6A46B] text-[#050608]'
                        : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <nav
            aria-label="Digital Universe Stations"
            className="pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl bg-[#080B12]/85 backdrop-blur-xl border border-white/12 shadow-[0_12px_40px_rgba(0,0,0,0.65)] overflow-x-auto max-w-full"
          >
            {DOCK_PRIMARY.map((item) => {
              const Icon = item.icon;
              const active = activeStation === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectStation(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    active
                      ? 'bg-[#C6A46B] text-[#050608] shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-white/8'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <span className="h-4 w-px bg-white/12 mx-0.5 shrink-0" />

            <button
              type="button"
              onClick={() => setMoreOpen((m) => !m)}
              aria-expanded={moreOpen}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                moreOpen || DOCK_EXTRA.some((d) => d.id === activeStation)
                  ? 'bg-[#8BA8C8]/25 text-[#E1E9F2] border border-[#8BA8C8]/40'
                  : 'text-slate-300 hover:text-white hover:bg-white/8'
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span>Labs & Cube</span>
            </button>
          </nav>
        </div>

        {/* Interactive Monitor / Station Panel */}
        <StudioMonitorOverlay
          activeStation={activeStation}
          onSelectStation={selectStation}
          onNavigate={onNavigate}
          onWhiteboardTextureChange={setWhiteboardDataUrl}
          onCubeCommand={(cmd) => setCubeCommand({ ...cmd, seq: Date.now() })}
        />

        {/* Minimal, Cinematic START Screen */}
        {!entered && (
          <div
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#050608]/95 backdrop-blur-xl px-6 text-center"
            data-testid="universe-entry-screen"
          >
            <div className="max-w-md space-y-7">
              <div className="space-y-2.5">
                <p className="font-mono text-[11px] tracking-[0.3em] uppercase text-[#C6A46B]">
                  Engineering · Robotics · AI
                </p>
                <h1 className="font-serif text-5xl sm:text-6xl text-[#F5F3EF] tracking-tight">
                  Yashwanth
                </h1>
                <p className="text-sm text-slate-400">
                  An interactive 3D studio for hardware engineering, JARVIS AI, and creative work.
                </p>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleEnterStudio}
                  className="group relative w-32 h-32 rounded-full flex flex-col items-center justify-center gap-1 bg-gradient-to-b from-[#131924] to-[#080B12] border border-[#C6A46B]/70 text-xs font-bold tracking-[0.22em] text-[#F5F3EF] hover:scale-105 hover:border-[#C6A46B] transition-all cursor-pointer shadow-[0_0_50px_rgba(198,164,107,0.28)]"
                >
                  <Sparkles className="w-4 h-4 text-[#C6A46B]" />
                  <span>START</span>
                </button>
                <span className="font-mono text-[11px] text-slate-500">
                  Studio Ready · {bootProgress}%
                </span>
              </div>

              <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => {
                    setUse3D(false);
                    handleEnterStudio();
                  }}
                  className="hover:text-white underline underline-offset-4 cursor-pointer"
                >
                  Enter 2D Accessible Studio
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => {
                    handleEnterStudio();
                    onNavigate('dashboard');
                  }}
                  className="hover:text-white cursor-pointer"
                >
                  Classic HUD
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
