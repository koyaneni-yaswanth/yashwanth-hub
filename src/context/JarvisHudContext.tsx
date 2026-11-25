import React, { useState } from 'react';
import type { HudCoreState, HudWorkspaceSummary } from '../lib/jarvisHud';
import { JarvisHudContext, type HudPerfTelemetry } from './jarvisHudStore';

export const JarvisHudProvider: React.FC<{
  hudNodes: HudWorkspaceSummary[];
  coreState: HudCoreState;
  children: React.ReactNode;
}> = ({ hudNodes, coreState, children }) => {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isAiBarOpen, setIsAiBarOpen] = useState<boolean>(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string>('');
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(true);
  const [dockExpanded, setDockExpanded] = useState<boolean>(false);
  const [perf, setPerf] = useState<HudPerfTelemetry>({
    tier: 'high',
    fps: 60,
    webglActive: false,
  });

  const openAiBar = (initialPrompt?: string) => {
    if (typeof initialPrompt === 'string') setPendingAiPrompt(initialPrompt);
    setIsAiBarOpen(true);
  };

  return (
    <JarvisHudContext.Provider
      value={{
        hudNodes,
        coreState,
        hoveredNodeId,
        setHoveredNodeId,
        selectedNodeId,
        setSelectedNodeId,
        isAiBarOpen,
        setIsAiBarOpen,
        openAiBar,
        pendingAiPrompt,
        setPendingAiPrompt,
        rightPanelOpen,
        setRightPanelOpen,
        dockExpanded,
        setDockExpanded,
        perf,
        setPerf,
      }}
    >
      {children}
    </JarvisHudContext.Provider>
  );
};
