import React, { useEffect, useState } from 'react';
import { AgentPresenceService, type AgentPresenceState } from '../../services/agentPresenceService';

export const AgentCursor: React.FC = () => {
  const [presence, setPresence] = useState<AgentPresenceState>(() => AgentPresenceService.getState());
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const unsubscribe = AgentPresenceService.subscribe((newState) => {
      setPresence(newState);
      if (newState.targetSelector) {
        try {
          const el = document.querySelector(newState.targetSelector);
          if (el) {
            setTargetRect(el.getBoundingClientRect());
            return;
          }
        } catch {
          // Ignored if invalid selector
        }
      }
      setTargetRect(null);
    });

    return () => unsubscribe();
  }, []);

  if (!presence.isVisible) return null;

  const isSuccess = presence.phase === 'success';
  const isWorking = presence.phase === 'working';
  const isError = presence.phase === 'error';

  return (
    <>
      {/* 1. Target Element Focus Ring / Glow */}
      {targetRect && (
        <div
          style={{
            top: `${targetRect.top + window.scrollY - 4}px`,
            left: `${targetRect.left + window.scrollX - 4}px`,
            width: `${targetRect.width + 8}px`,
            height: `${targetRect.height + 8}px`,
            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="fixed pointer-events-none z-40 rounded-2xl border-2 border-dashed border-indigo-500/80 bg-indigo-500/5 shadow-[0_0_25px_rgba(99,102,241,0.25)] animate-pulse"
        />
      )}

      {/* 2. Floating Collaborative Cursor (Figma Style) */}
      <div
        style={{
          transform: `translate3d(${presence.x}px, ${presence.y}px, 0)`,
          transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        className="fixed top-0 left-0 pointer-events-none z-50 flex items-start gap-1 select-none will-change-transform"
      >
        {/* SVG Figma-style Arrow Pointer */}
        <div className="relative">
          <svg
            className={`w-6 h-6 filter drop-shadow-md transition-colors duration-300 ${
              isSuccess
                ? 'text-emerald-500 fill-emerald-500'
                : isError
                ? 'text-rose-500 fill-rose-500'
                : 'text-indigo-600 fill-indigo-600'
            }`}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinejoin="round"
              d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"
            />
          </svg>

          {/* Click / Pulse Action Wave */}
          {isWorking && (
            <span className="absolute -top-1 -left-1 w-8 h-8 rounded-full border-2 border-indigo-400 animate-ping opacity-60" />
          )}
        </div>

        {/* Floating Collaborative Badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium text-white shadow-xl backdrop-blur-md transition-all duration-300 border ${
            isSuccess
              ? 'bg-emerald-600/95 border-emerald-400/40 shadow-emerald-500/20'
              : isError
              ? 'bg-rose-600/95 border-rose-400/40 shadow-rose-500/20'
              : 'bg-indigo-600/95 border-indigo-400/40 shadow-indigo-500/25'
          }`}
        >
          {/* Pulsing Status Dot */}
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isSuccess
                ? 'bg-emerald-200 animate-none'
                : isError
                ? 'bg-rose-200'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />

          {/* Agent Tag */}
          <span className="font-bold tracking-tight text-white/90">
            {presence.agentName || 'Jarvis Agent'}:
          </span>

          {/* Dynamic Status Text */}
          <span className="text-white font-normal truncate max-w-[260px]">
            {presence.status}
          </span>

          {/* Subsystem Tag / Pill */}
          {presence.subsystem && (
            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono tracking-wider bg-black/20 text-white/80 border border-white/10">
              {presence.subsystem}
            </span>
          )}
        </div>
      </div>
    </>
  );
};
