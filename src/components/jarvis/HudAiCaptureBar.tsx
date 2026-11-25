import React from 'react';
import { Mic, Plus, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import type { Area, Priority } from '../../types';

interface HudAiCaptureBarProps {
  isOpen: boolean;
  onClose: () => void;
  quickText: string;
  onQuickTextChange: (value: string) => void;
  quickArea: string;
  onQuickAreaChange: (area: string) => void;
  quickDate: string;
  onQuickDateChange: (date: string) => void;
  quickPriority: Priority;
  onQuickPriorityChange: (p: Priority) => void;
  showOptions: boolean;
  onToggleOptions: () => void;
  areas: Area[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmitTask: (e: React.FormEvent) => void;
  onSendToAI: () => void;
  onOpenQuickCapture?: () => void;
}

/**
 * Unified AI / task / voice input bar launched by clicking the Jarvis core or Quick Add CTA.
 */
export const HudAiCaptureBar: React.FC<HudAiCaptureBarProps> = ({
  isOpen,
  onClose,
  quickText,
  onQuickTextChange,
  quickArea,
  onQuickAreaChange,
  quickDate,
  onQuickDateChange,
  quickPriority,
  onQuickPriorityChange,
  showOptions,
  onToggleOptions,
  areas,
  inputRef,
  onSubmitTask,
  onSendToAI,
  onOpenQuickCapture,
}) => {
  if (!isOpen) return null;

  return (
    <div
      data-agent-target="quick-actions"
      role="region"
      aria-label="Unified AI and Quick Capture Bar"
      className="hud-glass hud-focus-glow hud-enter-core w-full max-w-xl mx-auto p-3 sm:p-3.5 shadow-2xl"
    >
      <form onSubmit={onSubmitTask} className="space-y-2.5">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={quickText}
            onChange={(e) => onQuickTextChange(e.target.value)}
            aria-label="Add a task, capture a thought, or ask AI"
            placeholder="Ask Jarvis AI, add a task, or dictate a thought..."
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-[rgba(5,7,13,0.7)] border border-[rgba(59,232,255,0.2)] focus:border-[#3BE8FF] text-[#E6F1FF] text-sm focus:outline-none placeholder:text-[#7A8BA6]"
          />

          {onOpenQuickCapture && (
            <button
              type="button"
              onClick={onOpenQuickCapture}
              title="Voice & Smart Capture (Ctrl+Q)"
              aria-label="Voice Capture"
              className="p-2 rounded-xl bg-white/5 border border-white/10 text-[#7A8BA6] hover:text-[#3BE8FF] hover:border-[#3BE8FF]/40 transition-colors cursor-pointer flex-none"
            >
              <Mic className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleOptions}
            title="Due date, area & priority"
            aria-label="Task options"
            aria-expanded={showOptions}
            className={`p-2 rounded-xl border transition-colors cursor-pointer flex-none ${
              showOptions
                ? 'bg-[#3BE8FF]/18 border-[#3BE8FF]/50 text-[#3BE8FF]'
                : 'bg-white/5 border-white/10 text-[#7A8BA6] hover:text-[#E6F1FF]'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onSendToAI}
            title="Send to Ask AI"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#7C5CFF]/20 border border-[#7C5CFF]/45 text-[#E6F1FF] hover:bg-[#7C5CFF]/35 text-xs font-semibold transition-colors cursor-pointer flex-none"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#3BE8FF]" />
            <span className="hidden sm:inline">Ask AI</span>
          </button>

          <button
            type="submit"
            disabled={!quickText.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-[#3BE8FF] text-[#05070D] text-xs font-bold hover:bg-[#70f0ff] transition-colors cursor-pointer flex-none disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close input bar"
            className="p-1.5 rounded-lg text-[#7A8BA6] hover:text-[#E6F1FF] cursor-pointer flex-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showOptions && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[rgba(59,232,255,0.14)] text-xs">
            <label className="flex items-center gap-1.5 text-[#7A8BA6]">
              <span>Area:</span>
              <select
                value={quickArea}
                onChange={(e) => onQuickAreaChange(e.target.value)}
                className="py-1 px-2 rounded-lg border border-[rgba(59,232,255,0.2)] bg-[#05070D] text-[#E6F1FF] text-xs font-medium cursor-pointer"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-[#7A8BA6]">
              <span>Due:</span>
              <input
                type="date"
                value={quickDate}
                onChange={(e) => onQuickDateChange(e.target.value)}
                className="py-1 px-2 rounded-lg border border-[rgba(59,232,255,0.2)] bg-[#05070D] text-[#E6F1FF] text-xs font-medium cursor-pointer hud-tabular"
              />
            </label>

            <label className="flex items-center gap-1.5 text-[#7A8BA6]">
              <span>Priority:</span>
              <select
                value={quickPriority}
                onChange={(e) => onQuickPriorityChange(e.target.value as Priority)}
                className="py-1 px-2 rounded-lg border border-[rgba(59,232,255,0.2)] bg-[#05070D] text-[#E6F1FF] text-xs font-medium cursor-pointer"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
        )}
      </form>
    </div>
  );
};
