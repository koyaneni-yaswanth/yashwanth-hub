import React from 'react';
import { Sparkles } from 'lucide-react';
import type { HudCoreState, HudWorkspaceSummary } from '../../lib/jarvisHud';
import { renderWorkspaceGlyph } from './workspaceGlyph';

interface JarvisRadial2DProps {
  nodes: HudWorkspaceSummary[];
  coreState: HudCoreState;
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (node: HudWorkspaceSummary) => void;
  onOpenCore: () => void;
}

/**
 * Clean 2D radial orbital layout used when 3D is turned off or WebGL is unavailable.
 * Every node is a keyboard-focusable button with live activity sizing & due-today beams.
 */
export const JarvisRadial2D: React.FC<JarvisRadial2DProps> = ({
  nodes,
  coreState,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
  onOpenCore,
}) => {
  const count = Math.max(1, nodes.length);
  const rx = 35; // % horizontal ellipse radius
  const ry = 33; // % vertical ellipse radius

  return (
    <div className="relative w-full h-full min-h-[260px] flex items-center justify-center select-none overflow-hidden">
      {/* Radial orbital guide + SVG beams to due-today workspaces */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="jarvis2d-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={coreState.primaryHex} stopOpacity="0.24" />
            <stop offset="65%" stopColor={coreState.secondaryHex} stopOpacity="0.06" />
            <stop offset="100%" stopColor="#05070d" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill="url(#jarvis2d-core-glow)" />
        <ellipse
          cx="50"
          cy="50"
          rx={rx}
          ry={ry}
          fill="none"
          stroke="rgba(59,232,255,0.16)"
          strokeWidth="0.35"
          strokeDasharray="1.5 1.5"
        />
        <circle cx="50" cy="50" r="16" fill="none" stroke={coreState.primaryHex} strokeOpacity="0.28" strokeWidth="0.35" />
        <circle cx="50" cy="50" r="21" fill="none" stroke={coreState.secondaryHex} strokeOpacity="0.18" strokeWidth="0.25" />
        {nodes.map((node, i) => {
          if (!node.hasDueTodayBeam && hoveredId !== node.id && selectedId !== node.id) return null;
          const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
          const x = 50 + Math.cos(angle) * rx;
          const y = 50 + Math.sin(angle) * ry;
          return (
            <line
              key={node.id}
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              stroke={node.overdueCount > 0 ? '#FF4D6D' : node.hasDueTodayBeam ? '#FFB547' : node.color}
              strokeWidth={hoveredId === node.id ? '0.65' : '0.45'}
              strokeOpacity="0.72"
              strokeDasharray="1.4 1.2"
            />
          );
        })}
      </svg>

      {/* Interactive Core Orb */}
      <button
        type="button"
        onClick={onOpenCore}
        aria-label="Open Jarvis AI & Quick Capture Bar"
        className="hud-enter-core relative z-10 flex flex-col items-center justify-center w-24 h-24 sm:w-28 sm:h-28 rounded-full border transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] cursor-pointer"
        style={{
          borderColor: `${coreState.primaryHex}70`,
          background: `radial-gradient(circle at 35% 35%, ${coreState.primaryHex}33, rgba(10,16,28,0.88) 72%)`,
          boxShadow: `0 0 36px -6px ${coreState.primaryHex}66, inset 0 0 24px ${coreState.secondaryHex}30`,
        }}
      >
        <Sparkles className="w-5 h-5 mb-1" style={{ color: coreState.primaryHex }} aria-hidden="true" />
        <span className="font-heading text-xs font-bold tracking-wider uppercase text-[#E6F1FF]">
          JARVIS
        </span>
        <span className="hud-tabular text-[9px] text-[#7A8BA6] mt-0.5">
          {coreState.mode === 'idle' ? 'ASK / CMD' : coreState.statusLabel.split(' ')[0]}
        </span>
      </button>

      {/* Orbital Workspace Nodes arranged radially */}
      <ul className="hud-enter-nodes absolute inset-0 pointer-events-none" aria-label="Workspaces">
        {nodes.map((node, i) => {
          const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
          const x = 50 + Math.cos(angle) * rx;
          const y = 50 + Math.sin(angle) * ry;
          const active = hoveredId === node.id || selectedId === node.id;
          const scale = active ? 1.08 : 0.94 + node.activityLevel * 0.14;
          return (
            <li
              key={node.id}
              className="hidden md:block absolute pointer-events-auto"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: `translate(-50%, -50%) scale(${scale.toFixed(3)})`,
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(node)}
                onMouseEnter={() => onHover(node.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(node.id)}
                onBlur={() => onHover(null)}
                aria-label={`${node.label}${node.statusText ? `, ${node.statusText}` : ''}. Open workspace`}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-full hud-glass-pill text-xs font-medium text-[#E6F1FF] transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3BE8FF] ${
                  active ? 'border-[#3BE8FF]/70 shadow-[0_0_20px_-4px_rgba(59,232,255,0.45)]' : ''
                }`}
              >
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-full shrink-0"
                  style={{
                    color: node.color,
                    background: `${node.color}22`,
                    boxShadow: `0 0 10px ${node.color}44`,
                  }}
                >
                  {renderWorkspaceGlyph(node.glyph, 'w-3 h-3')}
                </span>
                <span className="whitespace-nowrap font-heading text-xs">{node.label}</span>
                {node.statusText && (
                  <span className="hud-tabular text-[10px] text-[#7A8BA6]">{node.statusText}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
