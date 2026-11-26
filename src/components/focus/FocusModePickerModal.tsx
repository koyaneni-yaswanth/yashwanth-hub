import React from 'react';
import { Bot, Check, Crosshair, FolderKanban, GraduationCap, Wind, Compass } from 'lucide-react';
import { Modal } from '../common/Modal';
import { FOCUS_WORKSPACES, type FocusWorkspaceId } from '../../lib/hubArchitecture';
import { useFocusMode } from '../../context/FocusModeContext';
import type { NavigationTab } from '../../types';

const WORKSPACE_ICONS: Record<FocusWorkspaceId, React.ElementType> = {
  'startup-pawan': Wind,
  'robotics-engineering': Bot,
  'research-learning': GraduationCap,
  'career-development': Compass,
};

interface FocusModePickerModalProps {
  onNavigate?: (tab: NavigationTab) => void;
}

export const FocusModePickerModal: React.FC<FocusModePickerModalProps> = ({ onNavigate }) => {
  const focus = useFocusMode();

  return (
    <Modal
      isOpen={focus.isPickerOpen}
      onClose={focus.closePicker}
      title="Focus Mode — One Thing at a Time"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
          Hide nonessential dashboards and secondary alerts while working inside one workspace.
        </p>

        <div className="space-y-2" role="radiogroup" aria-label="Select Focus Workspace">
          {FOCUS_WORKSPACES.map((ws) => {
            const Icon = WORKSPACE_ICONS[ws.id] || FolderKanban;
            const selected = focus.workspaceId === ws.id;
            return (
              <button
                key={ws.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => focus.selectWorkspace(ws.id)}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                  selected
                    ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10 shadow-xs'
                    : 'border-[var(--hub-line)] bg-[var(--hub-bg)] hover:border-[var(--hub-accent)]/40'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    selected
                      ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                      : 'bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[var(--hub-muted)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--hub-ink)]">{ws.label}</span>
                    {selected && <Check className="w-4 h-4 text-[var(--hub-accent)] shrink-0" />}
                  </div>
                  <p className="text-xs text-[var(--hub-muted)] mt-0.5">{ws.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Workspace Preview */}
        <div className="p-3.5 rounded-2xl bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--hub-accent)]">
            Active workspace preview
          </div>
          <div className="text-sm font-semibold text-[var(--hub-ink)]">{focus.workspace.label}</div>
          <div className="text-xs text-[var(--hub-muted)]">{focus.workspace.previewSummary}</div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={focus.closePicker}
            className="px-4 py-2 rounded-xl border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              focus.enableFocusMode(focus.workspaceId);
              onNavigate?.('dashboard');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>Enter Focus Mode</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
