import { createContext, useContext } from 'react';
import type { QualityTier } from '../components/momentum/cinema/cinemaConfig';
import type { HudCoreState, HudWorkspaceSummary } from '../lib/jarvisHud';

export interface HudPerfTelemetry {
  tier: QualityTier;
  fps: number;
  webglActive: boolean;
}

export interface JarvisHudContextValue {
  hudNodes: HudWorkspaceSummary[];
  coreState: HudCoreState;
  hoveredNodeId: string | null;
  setHoveredNodeId: (id: string | null) => void;
  setRightPanelPointerInside: (inside: boolean) => void;
  clearWorkspacePreview: () => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  isAiBarOpen: boolean;
  setIsAiBarOpen: (open: boolean) => void;
  openAiBar: (initialPrompt?: string) => void;
  pendingAiPrompt: string;
  setPendingAiPrompt: (text: string) => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  dockExpanded: boolean;
  setDockExpanded: (expanded: boolean) => void;
  perf: HudPerfTelemetry;
  setPerf: (perf: HudPerfTelemetry) => void;
  is3DEnabled: boolean;
  setIs3DEnabled: (enabled: boolean) => void;
}

export const DEFAULT_CORE: HudCoreState = {
  mode: 'idle',
  primaryHex: '#3BE8FF',
  secondaryHex: '#7C5CFF',
  pulseRate: 0.8,
  displacementAmp: 0.028,
  statusLabel: 'CORE STANDBY',
};

export const JarvisHudContext = createContext<JarvisHudContextValue | null>(null);

export function useJarvisHud(): JarvisHudContextValue | null {
  return useContext(JarvisHudContext);
}
