import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Compass,
  Eye,
  Layers,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { db } from '../db';
import { StudioAudioEngine } from '../lib/studioAudio';
import {
  UNIVERSE_EIGHT_ENVIRONMENTS,
  UNIVERSE_STATIONS,
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

  // Quick non-blocking entry readiness + live status probe
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
      {/* Persistent Top Studio Navigation Banner */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-2.5 bg-[#080B12]/88 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-semibold text-slate-200 hover:border-[#C6A46B] hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#C6A46B]" />
            <span className="hidden sm:inline">HUD</span>
          </button>
          <div className="min-w-0">
            <span className="font-mono text-[10px] tracking-[0.22em] uppercase text-[#C6A46B] block">
              YASHWANTH · DIGITAL UNIVERSE
            </span>
          </div>
        </div>

        {/* Scrollable Station Banner (Keyboard + Mobile Accessible) */}
        <nav
          aria-label="Digital Universe Stations"
          className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5"
        >
          {UNIVERSE_STATIONS.map((s) => {
            const active = activeStation === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => selectStation(s.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer border ${
                  active
                    ? 'bg-[#C6A46B] text-[#050608] border-[#C6A46B]'
                    : 'bg-white/5 text-slate-300 border-white/10 hover:text-white hover:border-white/30'
                }`}
              >
                {s.shortLabel}
              </button>
            );
          })}
        </nav>

        {/* Controls: Audio Opt-In + 3D/2D Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void toggleAudio()}
            aria-pressed={audioEnabled}
            aria-label={audioEnabled ? 'Mute studio ambient audio' : 'Enable studio ambient audio'}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
              audioEnabled
                ? 'bg-[#C6A46B]/20 border-[#C6A46B]/50 text-[#E9D7AE]'
                : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
            }`}
          >
            {audioEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">{audioEnabled ? 'Audio On' : 'Audio'}</span>
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
              className="w-16 accent-[#C6A46B]"
            />
          )}

          {!webglUnavailable && (
            <button
              type="button"
              onClick={() => setUse3D((v) => !v)}
              aria-pressed={use3D}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/15 text-xs font-medium text-slate-200 hover:border-[#3BE8FF]/60 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5 text-[#3BE8FF]" />
              <span className="font-mono text-[11px]">{use3D ? `3D · ${perfMetrics.fps} FPS` : '2D Studio'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Spatial Canvas OR Accessible 2D Fallback Mode */}
      <div className="relative w-full h-[calc(100%-3.1rem)]">
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
              statsSummary={statsSummary}
              onMetricsUpdate={setPerfMetrics}
              onWebglUnavailable={() => {
                setWebglUnavailable(true);
                setUse3D(false);
              }}
            />
          </Suspense>
        ) : (
          /* Clean 2D Spatial Fallback — full touch/mobile accessibility */
          <div className="h-full overflow-y-auto p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {(['whiteboard', 'experiment', 'cube'] as const).map((sid) => {
                const st = stationById(sid);
                return (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => selectStation(sid)}
                    className="text-left p-4 rounded-xl bg-[#0B101B] border border-white/10 hover:border-[#3BE8FF] space-y-1 cursor-pointer"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-wider text-[#3BE8FF]">{st.shortLabel}</span>
                    <h3 className="text-sm font-bold text-white">{st.label}</h3>
                    <p className="text-xs text-slate-400">{st.description}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Hovered 3D Object Hint */}
        {hoveredMeta && hoveredStation !== activeStation && use3D && !webglUnavailable && (
          <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-[#090D16]/90 border border-[#C6A46B]/45 backdrop-blur-md text-xs flex items-center gap-2 shadow-xl">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hoveredMeta.accentHex }} />
            <span className="font-bold text-white">{hoveredMeta.label}</span>
            <span className="text-slate-400 hidden sm:inline">· Click to focus</span>
          </div>
        )}

        {/* Bottom Spatial Hint Pill in Overview */}
        {activeStation === 'overview' && use3D && !webglUnavailable && entered && (
          <div className="pointer-events-none hidden sm:flex items-center gap-3 absolute bottom-5 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-[#080B12]/80 border border-white/10 backdrop-blur-md text-[11px] text-slate-300">
            <Layers className="w-3.5 h-3.5 text-[#C6A46B]" />
            <span>Drag to orbit · Click any monitor, PiPER arm, wind turbine, whiteboard, experiment deck, or Rubik cube</span>
          </div>
        )}

        {/* Interactive Monitor / Station Panel */}
        <StudioMonitorOverlay
          activeStation={activeStation}
          onSelectStation={selectStation}
          onNavigate={onNavigate}
          onWhiteboardTextureChange={setWhiteboardDataUrl}
          onCubeCommand={(cmd) => setCubeCommand({ ...cmd, seq: Date.now() })}
        />

        {/* Refined Non-Blocking Entry Experience */}
        {!entered && (
          <div
            className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-[#050608]/95 backdrop-blur-xl px-6 text-center"
            data-testid="universe-entry-screen"
          >
            <div className="max-w-lg space-y-6">
              <div className="space-y-2">
                <p className="font-mono text-xs tracking-[0.28em] uppercase text-[#C6A46B]">
                  INTERACTIVE ENGINEERING UNIVERSE · 5.0
                </p>
                <h1 className="font-serif text-4xl sm:text-5xl text-[#F5F3EF] tracking-tight">
                  Yashwanth’s Studio
                </h1>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Explore four live physical monitors, robotics & wind-energy hardware benches, functional whiteboard,
                  simulation console, calibration cube, and JARVIS AI companion.
                </p>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={handleEnterStudio}
                  className="group relative w-28 h-28 rounded-full flex items-center justify-center bg-[#0D1119] border border-[#C6A46B]/60 text-xs font-bold tracking-[0.2em] text-[#F5F3EF] hover:scale-105 hover:border-[#C6A46B] transition-all cursor-pointer shadow-[0_0_40px_rgba(198,164,107,0.22)]"
                >
                  <Sparkles className="w-4 h-4 text-[#C6A46B] mr-1.5" />
                  START
                </button>
                <span className="font-mono text-[11px] text-slate-400">
                  Engine Ready · {bootProgress}% · Zero Wait Lock
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setUse3D(false);
                    handleEnterStudio();
                  }}
                  className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 text-xs font-medium text-slate-200 hover:border-white/35 cursor-pointer"
                >
                  Enter 2D Accessible Studio
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleEnterStudio();
                    onNavigate('dashboard');
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
                >
                  Return to Classic HUD
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
