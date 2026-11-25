import React, { useEffect, useState } from 'react';
import { useSync } from '../../context/SyncContext';
import { formatSyncHudStatus } from '../../lib/jarvisHud';
import type { HudCoreState } from '../../lib/jarvisHud';
import type { HudPerfTelemetry } from '../../context/jarvisHudStore';

interface HudFrameOverlayProps {
  coreState: HudCoreState;
  perf: HudPerfTelemetry;
  is3DEnabled: boolean;
}

export const HudFrameOverlay: React.FC<HudFrameOverlayProps> = ({
  coreState,
  perf,
  is3DEnabled,
}) => {
  const { status, queueCount, failedCount } = useSync();
  const [clock, setClock] = useState(() =>
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date())
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(
        new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date())
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const syncBadge = formatSyncHudStatus(status, queueCount, failedCount);
  const dotColor =
    syncBadge.tone === 'danger'
      ? 'bg-[#FF4D6D] shadow-[0_0_8px_#FF4D6D]'
      : syncBadge.tone === 'amber'
      ? 'bg-[#FFB547] shadow-[0_0_8px_#FFB547]'
      : 'bg-[#3BE8FF] shadow-[0_0_8px_#3BE8FF]';

  const coreBadgeColor =
    coreState.mode === 'overdue'
      ? 'text-[#FF4D6D]'
      : coreState.mode === 'attention'
      ? 'text-[#FFB547]'
      : coreState.mode === 'talking'
      ? 'text-[#7C5CFF]'
      : 'text-[#3BE8FF]';

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {/* Subtle scanline film overlay */}
      <div className="hud-scanlines absolute inset-0" />

      {/* Outer HUD corner brackets */}
      <div className="hidden md:block absolute top-[62px] left-[76px] w-4 h-4 border-t border-l border-[#3BE8FF]/30" />
      <div className="hidden md:block absolute top-[62px] right-4 w-4 h-4 border-t border-r border-[#3BE8FF]/30" />
      <div className="hidden md:block absolute bottom-4 left-[76px] w-4 h-4 border-b border-l border-[#3BE8FF]/30" />
      <div className="hidden md:block absolute bottom-4 right-4 w-4 h-4 border-b border-r border-[#3BE8FF]/30" />

      {/* Top HUD Telemetry Bar (inset cleanly below Header) */}
      <div className="hidden sm:flex items-center justify-between px-4 lg:pl-20 lg:pr-6 pt-2 text-[10px] tracking-[0.14em] uppercase hud-tabular">
        <div className="flex items-center gap-3 text-[#7A8BA6]">
          <span className="inline-flex items-center gap-1.5 text-[#E6F1FF]">
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            <span>{syncBadge.label}</span>
          </span>
          <span className="opacity-40">/</span>
          <span className={coreBadgeColor}>{coreState.statusLabel}</span>
        </div>

        <div className="flex items-center gap-3 text-[#7A8BA6]">
          <span>
            {is3DEnabled && perf.webglActive
              ? `${perf.tier.toUpperCase()} · ${perf.fps} FPS`
              : is3DEnabled
              ? 'STAGE INIT'
              : '2D RADIAL MODE'}
          </span>
          <span className="opacity-40">|</span>
          <span className="text-[#E6F1FF] font-medium">{clock} IST</span>
        </div>
      </div>
    </div>
  );
};
