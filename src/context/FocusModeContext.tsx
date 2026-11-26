import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  FOCUS_WORKSPACES,
  type FocusWorkspaceId,
  type FocusWorkspaceOption,
} from '../lib/hubArchitecture';

const STORAGE_KEY = 'yash_focus_mode_state_v1';

interface PersistedFocusState {
  enabled: boolean;
  workspaceId: FocusWorkspaceId;
}

function readInitialState(): PersistedFocusState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, workspaceId: 'startup-pawan' };
    const parsed = JSON.parse(raw) as Partial<PersistedFocusState>;
    const validWs = FOCUS_WORKSPACES.some((w) => w.id === parsed.workspaceId)
      ? (parsed.workspaceId as FocusWorkspaceId)
      : 'startup-pawan';
    return {
      enabled: Boolean(parsed.enabled),
      workspaceId: validWs,
    };
  } catch {
    return { enabled: false, workspaceId: 'startup-pawan' };
  }
}

export interface FocusModeContextValue {
  enabled: boolean;
  workspaceId: FocusWorkspaceId;
  workspace: FocusWorkspaceOption;
  isPickerOpen: boolean;
  openPicker: () => void;
  closePicker: () => void;
  enableFocusMode: (workspaceId?: FocusWorkspaceId) => void;
  disableFocusMode: () => void;
  toggleFocusMode: () => void;
  selectWorkspace: (workspaceId: FocusWorkspaceId) => void;
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null);

export const FocusModeProvider: React.FC<{
  children: React.ReactNode;
  onAreaChange?: (area: string) => void;
}> = ({ children, onAreaChange }) => {
  const [state, setState] = useState<PersistedFocusState>(readInitialState);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const workspace =
    FOCUS_WORKSPACES.find((w) => w.id === state.workspaceId) || FOCUS_WORKSPACES[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage blocked */
    }
  }, [state]);

  const applyAreaForWorkspace = useCallback(
    (wsId: FocusWorkspaceId) => {
      if (!onAreaChange) return;
      const opt = FOCUS_WORKSPACES.find((w) => w.id === wsId);
      if (opt?.globalArea) onAreaChange(opt.globalArea);
    },
    [onAreaChange]
  );

  const enableFocusMode = useCallback(
    (wsId?: FocusWorkspaceId) => {
      const targetId = wsId || state.workspaceId;
      setState({ enabled: true, workspaceId: targetId });
      applyAreaForWorkspace(targetId);
      setIsPickerOpen(false);
    },
    [state.workspaceId, applyAreaForWorkspace]
  );

  const disableFocusMode = useCallback(() => {
    setState((prev) => ({ ...prev, enabled: false }));
    onAreaChange?.('All');
    setIsPickerOpen(false);
  }, [onAreaChange]);

  const selectWorkspace = useCallback(
    (wsId: FocusWorkspaceId) => {
      setState((prev) => ({ ...prev, workspaceId: wsId }));
      if (state.enabled) {
        applyAreaForWorkspace(wsId);
      }
    },
    [state.enabled, applyAreaForWorkspace]
  );

  const toggleFocusMode = useCallback(() => {
    if (state.enabled) {
      disableFocusMode();
    } else {
      setIsPickerOpen(true);
    }
  }, [state.enabled, disableFocusMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFocusMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFocusMode]);

  return (
    <FocusModeContext.Provider
      value={{
        enabled: state.enabled,
        workspaceId: state.workspaceId,
        workspace,
        isPickerOpen,
        openPicker: () => setIsPickerOpen(true),
        closePicker: () => setIsPickerOpen(false),
        enableFocusMode,
        disableFocusMode,
        toggleFocusMode,
        selectWorkspace,
      }}
    >
      {children}
    </FocusModeContext.Provider>
  );
};

export function useFocusMode(): FocusModeContextValue {
  const ctx = useContext(FocusModeContext);
  if (!ctx) {
    return {
      enabled: false,
      workspaceId: 'startup-pawan',
      workspace: FOCUS_WORKSPACES[0],
      isPickerOpen: false,
      openPicker: () => {},
      closePicker: () => {},
      enableFocusMode: () => {},
      disableFocusMode: () => {},
      toggleFocusMode: () => {},
      selectWorkspace: () => {},
    };
  }
  return ctx;
}
