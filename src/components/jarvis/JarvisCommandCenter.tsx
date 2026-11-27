/**
 * Home's command centre stage: full-bleed interactive Jarvis core with orbiting workspace nodes.
 *
 * - The 3D scene (three.js, lazy chunk) loads after the page has painted, never on the critical path.
 * - Every node is also a real button (keyboard, screen readers, 2D radial / no-WebGL fallback), so the
 *   3D is an enhancement, never the only way to navigate.
 * - Toggling 3D off shows the clean 2D radial orbital layout (`JarvisRadial2D`).
 */
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Compass, Eye, Sparkles } from 'lucide-react';
import { db } from '../../db';
import { buildWorkspaceNodes, type WorkspaceNode } from '../../lib/jarvisWorkspaces';
import { DEFAULT_CORE, useJarvisHud } from '../../context/jarvisHudStore';
import type { HudWorkspaceSummary } from '../../lib/jarvisHud';
import { NodeButtons } from './NodeButtons';
import { JarvisRadial2D } from './JarvisRadial2D';
import { renderWorkspaceGlyph } from './workspaceGlyph';
import type { Area } from '../../types';

const JarvisScene = lazy(() => import('./JarvisScene').then((m) => ({ default: m.JarvisScene })));

const PREF_KEY = 'yash_jarvis_scene';
const NO_TASKS: never[] = [];
const NO_PROJECTS: never[] = [];

// Persist the user's 3D stage choice, defaulting ON so the Jarvis HUD core renders after first paint.
function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const JarvisCommandCenter: React.FC<{
  areas: Area[];
  onNavigate: (tab: string) => void;
  onSelectArea?: (area: string) => void;
}> = ({ areas, onNavigate, onSelectArea }) => {
  const hud = useJarvisHud();
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NO_TASKS;
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? NO_PROJECTS;
  const roboticsRecords = useLiveQuery(() => db.robotics_records.count(), []) ?? 0;
  const nodes = useMemo(
    () => buildWorkspaceNodes({ areas, tasks, projects, roboticsRecords }),
    [areas, tasks, projects, roboticsRecords]
  );

  const hudNodes = hud?.hudNodes ?? [];
  const coreState = hud?.coreState ?? DEFAULT_CORE;
  const hoveredId = hud?.hoveredNodeId ?? null;
  const selectedId = hud?.selectedNodeId ?? null;

  const [expanded, setExpanded] = useState(readPref);
  // Start the 3D only once the browser is idle after first paint (keeps Home's LCP fast).
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 250);
    return () => window.clearTimeout(t);
  }, [expanded]);

  const toggle = () => {
    setExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem(PREF_KEY, next ? 'on' : 'off');
      } catch {
        /* storage unavailable: preference lasts this visit only */
      }
      hud?.setIs3DEnabled(next);
      return next;
    });
  };

  const openLegacyNode = (n: WorkspaceNode) => {
    if (n.target.area) onSelectArea?.(n.target.area);
    onNavigate(n.target.tab);
  };

  const openHudNode = (n: HudWorkspaceSummary) => {
    hud?.setSelectedNodeId(n.id);
    if (n.target.area) onSelectArea?.(n.target.area);
    onNavigate(n.target.tab);
  };

  const handleOpenCore = () => {
    if (hud) {
      hud.openAiBar();
    } else {
      onNavigate('ai-assistant');
    }
  };

  const renderFallback = () =>
    hudNodes.length > 0 ? (
      <JarvisRadial2D
        nodes={hudNodes}
        coreState={coreState}
        hoveredId={hoveredId}
        selectedId={selectedId}
        onHover={(id) => hud?.setHoveredNodeId(id)}
        onSelect={openHudNode}
        onOpenCore={handleOpenCore}
      />
    ) : (
      <NodeButtons nodes={nodes} onOpen={openLegacyNode} className="p-4" />
    );

  return (
    <section
      aria-labelledby="jarvis-cc-title"
      className="relative flex flex-col w-full h-[42vh] min-h-[270px] max-h-[380px] md:h-full md:max-h-none md:min-h-[380px] overflow-hidden rounded-2xl border border-[rgba(59,232,255,0.18)] bg-[rgba(5,7,13,0.45)]"
    >
      {/* Subtle Top HUD Stage Controls */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-3.5 sm:px-5 pt-3">
        <div className="min-w-0">
          <p className="hud-tabular text-[10px] uppercase tracking-[0.14em] text-[#7A8BA6] truncate">
            <span className="sm:hidden">Orbital HUD</span>
            <span className="hidden sm:inline">Jarvis HUD · Orbital Stage</span>
          </p>
          <h2 id="jarvis-cc-title" className="font-heading text-sm sm:text-base font-semibold text-[#E6F1FF] truncate">
            {hud?.hoveredNodeId
              ? hudNodes.find((n) => n.id === hud.hoveredNodeId)?.label || 'Command Centre'
              : 'Command Centre'}
          </h2>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('universe')}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-xl hud-glass-pill text-xs font-semibold text-[#E9D7AE] hover:border-[#C6A46B]/70 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            title="Enter Interactive 3D Engineering Studio"
          >
            <Compass className="w-3.5 h-3.5 text-[#C6A46B] shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">3D Studio</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCore}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 sm:px-3 rounded-xl hud-glass-pill text-xs font-semibold text-[#3BE8FF] hover:border-[#3BE8FF]/60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Ask / Capture</span>
          </button>

          <button
            type="button"
            onClick={toggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Switch to 2D radial layout' : 'Enable 3D scene'}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-xl hud-glass-pill text-xs font-medium text-[#E6F1FF] hover:border-[#3BE8FF]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] cursor-pointer whitespace-nowrap shrink-0"
          >
            <Eye className="w-3.5 h-3.5 text-[#3BE8FF] shrink-0" aria-hidden="true" />
            <span className="hud-tabular">{expanded ? '3D: ON' : '3D: OFF'}</span>
          </button>
        </div>
      </div>

      {/* Main Center Stage (3D WebGL OR 2D Radial Orbital Layout) */}
      <div className="relative flex-1 min-h-[190px] sm:min-h-[260px]">
        {expanded ? (
          ready ? (
            <Suspense fallback={renderFallback()}>
              <JarvisScene nodes={nodes} onOpen={openLegacyNode} onOpenCore={handleOpenCore} />
            </Suspense>
          ) : (
            renderFallback()
          )
        ) : (
          renderFallback()
        )}
      </div>

      {/* Mobile (<768px) Horizontal Workspace Chip Row directly beneath core */}
      {hudNodes.length > 0 && (
        <nav
          aria-label="Mobile Workspace Shortcuts"
          className="md:hidden relative z-20 flex items-center gap-2 px-3 py-2.5 border-t border-[rgba(59,232,255,0.14)] overflow-x-auto"
        >
          {hudNodes.map((n) => {
            const active = selectedId === n.id || hoveredId === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => openHudNode(n)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full hud-glass-pill text-xs font-medium transition-colors cursor-pointer ${
                  active ? 'border-[#3BE8FF] text-[#3BE8FF]' : 'text-[#E6F1FF]'
                }`}
              >
                <span style={{ color: n.color }}>{renderWorkspaceGlyph(n.glyph, 'w-3.5 h-3.5')}</span>
                <span>{n.shortLabel}</span>
                {n.statusText && (
                  <span className="hud-tabular text-[10px] text-[#7A8BA6]">{n.statusText}</span>
                )}
              </button>
            );
          })}
        </nav>
      )}
    </section>
  );
};
