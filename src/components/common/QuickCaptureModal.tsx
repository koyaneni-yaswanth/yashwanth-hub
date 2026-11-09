import React, { useState, useEffect } from 'react';
import { db } from '../../db';
import type { Task, EventItem, Note, Expense, Area } from '../../types';
import { generateId, getTodayISO } from '../../lib/utils';
import {
  Sparkles,
  CheckCircle2,
  Calendar,
  FileText,
  IndianRupee,
  Lightbulb,
  X,
  ArrowRight,
  Tag,
  Check,
} from 'lucide-react';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  areas?: Area[];
  onSuccess?: (type: string, message: string) => void;
}

type CaptureType = 'task' | 'event' | 'note' | 'expense' | 'idea';

interface ParsedEntity {
  type: CaptureType;
  title: string;
  date?: string;
  time?: string;
  area: string;
  amount?: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({
  isOpen,
  onClose,
  areas = [],
  onSuccess,
}) => {
  const [rawText, setRawText] = useState('');
  const [selectedType, setSelectedType] = useState<CaptureType>('task');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Heuristic NLP parser
  const parseInput = (text: string): ParsedEntity => {
    const lower = text.toLowerCase();
    const todayStr = getTodayISO();

    let type: CaptureType = selectedType;
    let title = text.trim();
    let area = areas[0]?.name || 'Pawan Shakti';
    let date = todayStr;
    let time = '';
    let amount: number | undefined;
    let priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium';

    // Auto-detect type if not manually overridden by user pill selection
    if (lower.includes('₹') || lower.includes(' rs') || lower.includes('rs.') || lower.includes('inr')) {
      type = 'expense';
      const amtMatch = text.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)/i);
      if (amtMatch) amount = parseFloat(amtMatch[1]);
    } else if (lower.includes('meeting') || lower.includes('call') || lower.includes('sync with') || lower.includes('at ') && (lower.includes('am') || lower.includes('pm'))) {
      type = 'event';
    } else if (lower.startsWith('note:') || lower.startsWith('log:') || lower.includes('research paper')) {
      type = 'note';
    } else if (lower.startsWith('idea:')) {
      type = 'idea';
    }

    // Detect Priority
    if (lower.includes('urgent') || lower.includes('asap') || lower.includes('critical')) {
      priority = 'urgent';
    } else if (lower.includes('high priority') || lower.includes('important')) {
      priority = 'high';
    }

    // Detect Date keywords
    if (lower.includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      date = tomorrow.toISOString().split('T')[0];
    } else if (lower.includes('next week')) {
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      date = nextWeek.toISOString().split('T')[0];
    }

    // Detect Time
    const timeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
    if (timeMatch) {
      time = timeMatch[1].toUpperCase();
    }

    // Detect Area from hashtags or keywords
    if (lower.includes('#robotics') || lower.includes('piper') || lower.includes('drone') || lower.includes('radar')) {
      area = 'Robotics Lab';
    } else if (lower.includes('#startup') || lower.includes('#wind') || lower.includes('pawan') || lower.includes('v3f')) {
      area = 'Pawan Shakti';
    } else if (lower.includes('#personal') || lower.includes('#routine') || lower.includes('gym')) {
      area = 'Personal';
    } else if (lower.includes('#mg') || lower.includes('automation')) {
      area = 'MG Automation';
    }

    // Clean title of tags
    title = title.replace(/#[a-zA-Z0-9_-]+/g, '').trim();

    return { type, title, date, time, area, amount, priority };
  };

  const parsed = parseInput(rawText);

  // Keyboard shortcut ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Handle Commit to Dexie
  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.title) return;

    setIsSubmitting(true);
    const nowISO = new Date().toISOString();

    try {
      if (parsed.type === 'task') {
        const newTask: Task = {
          id: generateId(),
          text: parsed.title,
          area: parsed.area,
          priority: parsed.priority,
          due_date: parsed.date,
          starred: parsed.priority === 'urgent' || parsed.priority === 'high',
          done: false,
          created_at: nowISO,
          updated_at: nowISO,
        };
        await db.tasks.add(newTask);
      } else if (parsed.type === 'event') {
        const newEvent: EventItem = {
          id: generateId(),
          title: parsed.title,
          date: parsed.date || getTodayISO(),
          start_time: parsed.time || '10:00 AM',
          kind: 'Meeting',
          area: parsed.area,
          created_at: nowISO,
          updated_at: nowISO,
        };
        await db.events.add(newEvent);
      } else if (parsed.type === 'expense') {
        const newExpense: Expense = {
          id: generateId(),
          amount: parsed.amount || 0,
          category: 'Parts',
          note: parsed.title,
          date: parsed.date || getTodayISO(),
          area: parsed.area,
          created_at: nowISO,
          updated_at: nowISO,
        };
        await db.expenses.add(newExpense);
      } else {
        // Note or Idea
        const newNote: Note = {
          id: generateId(),
          title: parsed.title,
          body: `Captured via Universal Quick Capture on ${new Date().toLocaleString()}`,
          area: parsed.area,
          pinned: false,
          created_at: nowISO,
          updated_at: nowISO,
        };
        await db.notes.add(newNote);
      }

      setSuccessMessage(`Saved as ${parsed.type.toUpperCase()}`);
      if (onSuccess) onSuccess(parsed.type, parsed.title);

      setTimeout(() => {
        setSuccessMessage(null);
        setRawText('');
        setIsSubmitting(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error('Quick capture commit error:', err);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-xl rounded-2xl bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hub-line)] bg-[var(--hub-bg)]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[var(--hub-accent)]/10 text-[var(--hub-accent)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--hub-ink)] font-heading">
                Universal Quick Capture
              </h3>
              <p className="text-[11px] text-[var(--hub-muted)]">
                Type naturally — task, event, expense, note or idea with NLP parsing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-card)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Body */}
        <form onSubmit={handleCommit} className="p-5 space-y-4">
          <div>
            <textarea
              autoFocus
              rows={3}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="e.g. Review Pawan Shakti gearbox test tomorrow at 3pm #startup&#10;or: Buy 10k potentiometer ₹150 for robotics arm"
              className="w-full px-4 py-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-sm text-[var(--hub-ink)] placeholder-[var(--hub-muted)] focus:outline-none focus:border-[var(--hub-accent)] font-medium leading-relaxed resize-none"
            />
          </div>

          {/* Type Selector Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-[var(--hub-muted)] mr-1">Type:</span>
            {(['task', 'event', 'expense', 'note', 'idea'] as CaptureType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelectedType(t)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  selectedType === t
                    ? 'bg-[var(--hub-accent)] text-white shadow-xs'
                    : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Natural Language Preview Card */}
          {rawText.trim() && (
            <div className="p-3.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-2">
              <div className="flex items-center justify-between text-[11px] font-bold text-[var(--hub-muted)]">
                <span>PARSED CONFIRMATION PREVIEW</span>
                <span className="capitalize text-teal-400 font-mono">Intent: {parsed.type}</span>
              </div>

              <div className="text-xs text-[var(--hub-ink)] font-semibold truncate">
                {parsed.title}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-[var(--hub-muted)] flex-wrap pt-1 border-t border-[var(--hub-line)]">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-teal-400" />
                  {parsed.date} {parsed.time && `• ${parsed.time}`}
                </span>
                <span className="flex items-center gap-1">
                  <Tag className="w-3 h-3 text-indigo-400" />
                  {parsed.area}
                </span>
                {parsed.amount && (
                  <span className="flex items-center gap-1 text-emerald-400 font-bold font-mono">
                    <IndianRupee className="w-3 h-3" />
                    {parsed.amount}
                  </span>
                )}
                {parsed.priority !== 'medium' && (
                  <span className="px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-400 font-bold uppercase text-[9px]">
                    {parsed.priority}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-[var(--hub-muted)]">
              Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--hub-bg)] border border-[var(--hub-line)] font-mono text-[10px]">Esc</kbd> to cancel
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!rawText.trim() || isSubmitting}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {successMessage ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>{successMessage}</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Commit</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
