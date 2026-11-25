import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { HudCoreState, HudWorkspaceSummary } from '../lib/jarvisHud';
import { JarvisHudContext, type HudPerfTelemetry } from './jarvisHudStore';

export const JarvisHudProvider: React.FC<{
  hudNodes: HudWorkspaceSummary[];
  coreState: HudCoreState;
  children: React.ReactNode;
}> = ({ hudNodes, coreState, children }) => {
  const [hoveredNodeId, setHoveredNodeIdRaw] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const panelPointerRef = useRef(false);
  const hoverClearTimerRef = useRef<number | null>(null);

  const setHoveredNodeId = useCallback((id: string | null) => {
    if (hoverClearTimerRef.current !== null) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
    if (id !== null) {
      setHoveredNodeIdRaw(id);
      return;
    }
    if (panelPointerRef.current) return;
    hoverClearTimerRef.current = window.setTimeout(() => {
      hoverClearTimerRef.current = null;
      if (!panelPointerRef.current) setHoveredNodeIdRaw(null);
    }, 280);
  }, []);

  const setRightPanelPointerInside = useCallback((inside: boolean) => {
    panelPointerRef.current = inside;
    if (inside) {
      if (hoverClearTimerRef.current !== null) {
        window.clearTimeout(hoverClearTimerRef.current);
        hoverClearTimerRef.current = null;
      }
      return;
    }
    hoverClearTimerRef.current = window.setTimeout(() => {
      hoverClearTimerRef.current = null;
      if (!panelPointerRef.current) setHoveredNodeIdRaw(null);
    }, 180);
  }, []);

  const clearWorkspacePreview = useCallback(() => {
    panelPointerRef.current = false;
    if (hoverClearTimerRef.current !== null) {
      window.clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
    setHoveredNodeIdRaw(null);
    setSelectedNodeId(null);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverClearTimerRef.current !== null) {
        window.clearTimeout(hoverClearTimerRef.current);
      }
    };
  }, []);
  const [isAiBarOpen, setIsAiBarOpen] = useState<boolean>(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string>('');
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(true);
  const [dockExpanded, setDockExpanded] = useState<boolean>(false);
  const [is3DEnabled, setIs3DEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yash_jarvis_scene') !== 'off';
    } catch {
      return true;
    }
  });
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
        setRightPanelPointerInside,
        clearWorkspacePreview,
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
        is3DEnabled,
        setIs3DEnabled,
      }}
    >
      {children}
    </JarvisHudContext.Provider>
  );
};
