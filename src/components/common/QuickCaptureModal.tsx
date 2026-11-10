import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db';
import type { Task, EventItem, Note, Expense, Area } from '../../types';
import { generateId, getTodayISO } from '../../lib/utils';
import { SyncQueueService } from '../../services/sync/syncQueueService';
import {
  parseQuickCaptureInput,
  type CaptureType,
} from '../../services/voiceCaptureParser';
import {
  Sparkles,
  Calendar,
  IndianRupee,
  X,
  ArrowRight,
  Tag,
  Check,
  Mic,
  MicOff,
  FolderKanban,
  AlertCircle,
} from 'lucide-react';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  areas?: Area[];
  onSuccess?: (type: string, message: string) => void;
}

export const QuickCaptureModal: React.FC<QuickCaptureModalProps> = ({
  isOpen,
  onClose,
  areas = [],
  onSuccess,
}) => {
  const [rawText, setRawText] = useState('');
  const [manualType, setManualType] = useState<CaptureType | undefined>(undefined);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDate, setEditedDate] = useState(getTodayISO());
  const [editedTime, setEditedTime] = useState('');
  const [editedArea, setEditedArea] = useState('PAWAN SHAKTI');
  const [editedProjectId, setEditedProjectId] = useState<string>('');
  const [hasManualEdits, setHasManualEdits] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const parsed = parseQuickCaptureInput(rawText, {
    projects: allProjects,
    areas,
    todayISO: getTodayISO(),
    manualType,
  });

  // Sync extracted suggestions into confirmation fields until manually overridden
  useEffect(() => {
    if (!hasManualEdits) {
      setEditedTitle(parsed.title);
      setEditedDate(parsed.date);
      setEditedTime(parsed.time);
      setEditedArea(parsed.area);
      setEditedProjectId(parsed.projectId || '');
    }
  }, [rawText, manualType, parsed.title, parsed.date, parsed.time, parsed.area, parsed.projectId, hasManualEdits]);

  useEffect(() => {
    if (!isOpen && isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore stop errors
      }
      setIsListening(false);
    }
  }, [isOpen, isListening]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const toggleVoiceInput = () => {
    setVoiceError(null);
    if (!speechSupported) {
      setVoiceError('Browser Web Speech recognition is unavailable here. Type or paste your transcript directly below.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Safe stop
      }
      setIsListening(false);
      return;
    }

    try {
      const SpeechCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechCtor();
      recognition.lang = 'en-IN';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setHasManualEdits(false);
        setRawText(transcript.trim());
      };

      recognition.onerror = (err: any) => {
        setIsListening(false);
        setVoiceError(`Voice input error: ${err?.error || 'microphone permission denied'}`);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      setIsListening(false);
      setVoiceError(err?.message || 'Unable to start speech recognition.');
    }
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = (editedTitle || parsed.title).trim();
    if (!finalTitle) return;

    setIsSubmitting(true);
    const nowISO = new Date().toISOString();
    const activeType = parsed.type;
    const finalArea = editedArea || parsed.area;
    const finalDate = editedDate || parsed.date || getTodayISO();
    const finalTime = editedTime || parsed.time;
    const finalProjectId = editedProjectId || parsed.projectId || undefined;

    try {
      if (activeType === 'task') {
        const newTask: Task = {
          id: generateId(),
          text: finalTitle,
          area: finalArea,
          priority: parsed.priority,
          due_date: finalDate,
          project_id: finalProjectId,
          starred: parsed.priority === 'urgent' || parsed.priority === 'high',
          done: false,
          created_at: nowISO,
          updated_at: nowISO,
        };
        await db.tasks.add(newTask);
        SyncQueueService.enqueueChange('tasks', newTask.id, 'INSERT', newTask).catch(() => {});
      } else if (activeType === 'event') {
        const newEvent: EventItem = {
          id: generateId(),
          title: finalTitle,
          date: finalDate,
          start_time: finalTime || '10:00',
          kind: 'Meeting',
          area: finalArea,
          project_id: finalProjectId,
          created_at: nowISO,
          updated_at: nowISO,
        };
        await db.events.add(newEvent);
        SyncQueueService.enqueueChange('events', newEvent.id, 'INSERT', newEvent).catch(() => {});
      } else if (activeType === 'expense') {
        const newExpense: Expense = {
          id: generateId(),
          amount: parsed.amount || 0,
          category: 'Parts',
          note: finalTitle,
          date: finalDate,
          area: finalArea,
          created_at: nowISO,
          updated_at: nowISO,
        };
        await db.expenses.add(newExpense);
        SyncQueueService.enqueueChange('expenses', newExpense.id, 'INSERT', newExpense).catch(() => {});
      } else {
        const newNote: Note = {
          id: generateId(),
          title: finalTitle,
          body: `Captured via Quick Capture on ${new Date().toLocaleString()}${rawText !== finalTitle ? `\n\nTranscript: ${rawText}` : ''}`,
          area: finalArea,
          pinned: false,
          created_at: nowISO,
          updated_at: nowISO,
        };
        await db.notes.add(newNote);
        SyncQueueService.enqueueChange('notes', newNote.id, 'INSERT', newNote).catch(() => {});
      }

      setSuccessMessage(`Saved verified ${activeType.toUpperCase()}`);
      if (onSuccess) onSuccess(activeType, finalTitle);

      setTimeout(() => {
        setSuccessMessage(null);
        setRawText('');
        setManualType(undefined);
        setHasManualEdits(false);
        setIsSubmitting(false);
        onClose();
      }, 650);
    } catch (err) {
      console.error('Quick capture commit error:', err);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hub-line)] bg-[var(--hub-bg)]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[var(--hub-accent)]/10 text-[var(--hub-accent)]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--hub-ink)] font-heading">
                Voice & Natural-Language Quick Capture
              </h3>
              <p className="text-[11px] text-[var(--hub-muted)]">
                Speak or type — extracts intent, project link & due date with confirmation before save
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close quick capture"
            className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCommit} className="p-5 space-y-4">
          <div className="relative">
            <textarea
              autoFocus
              rows={3}
              value={rawText}
              onChange={(e) => {
                setHasManualEdits(false);
                setRawText(e.target.value);
              }}
              placeholder="Speak or type: e.g. Create a task to test Pawan Shakti generator tomorrow at 4pm&#10;or: Meet Dr. Rao Friday 11am #robotics"
              className="w-full px-4 py-3 pr-12 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-sm text-[var(--hub-ink)] placeholder-[var(--hub-muted)] focus:outline-none focus:border-[var(--hub-accent)] font-medium leading-relaxed resize-none"
            />
            <button
              type="button"
              onClick={toggleVoiceInput}
              title={isListening ? 'Stop voice capture' : 'Start voice dictation'}
              aria-label={isListening ? 'Stop voice dictation' : 'Start voice dictation'}
              className={`absolute right-2.5 bottom-2.5 p-2 rounded-lg transition-colors cursor-pointer ${
                isListening
                  ? 'bg-red-500 text-white animate-pulse'
                  : 'bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[var(--hub-accent)] hover:border-[var(--hub-accent)]'
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          {voiceError && (
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{voiceError}</span>
            </div>
          )}

          {/* Type Selector */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-[var(--hub-muted)] mr-1">Intent:</span>
            {(['task', 'event', 'expense', 'note', 'idea'] as CaptureType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setManualType(t)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                  parsed.type === t
                    ? 'bg-[var(--hub-accent)] text-white shadow-xs'
                    : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Editable Confirmation Preview Before Save */}
          {rawText.trim() && (
            <div className="p-3.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-2.5 text-xs">
              <div className="flex items-center justify-between text-[11px] font-bold text-[var(--hub-muted)]">
                <span>CONFIRM BEFORE SAVING</span>
                <span className="capitalize text-teal-500 font-mono">
                  Detected Intent: {parsed.type}
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-[var(--hub-muted)] mb-0.5">
                  Title (Editable)
                </label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => {
                    setHasManualEdits(true);
                    setEditedTitle(e.target.value);
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-[var(--hub-muted)] mb-0.5">
                    <FolderKanban className="w-3 h-3" /> Project
                  </label>
                  <select
                    value={editedProjectId}
                    onChange={(e) => {
                      setHasManualEdits(true);
                      setEditedProjectId(e.target.value);
                      const proj = allProjects.find((p) => p.id === e.target.value);
                      if (proj) setEditedArea(proj.area);
                    }}
                    className="w-full px-2 py-1 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)]"
                  >
                    <option value="">No project link</option>
                    {allProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title.slice(0, 26)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-[var(--hub-muted)] mb-0.5">
                    <Tag className="w-3 h-3" /> Area
                  </label>
                  <select
                    value={editedArea}
                    onChange={(e) => {
                      setHasManualEdits(true);
                      setEditedArea(e.target.value);
                    }}
                    className="w-full px-2 py-1 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)]"
                  >
                    {areas.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-1 text-[10px] font-bold uppercase text-[var(--hub-muted)] mb-0.5">
                    <Calendar className="w-3 h-3" /> Date
                  </label>
                  <input
                    type="date"
                    value={editedDate}
                    onChange={(e) => {
                      setHasManualEdits(true);
                      setEditedDate(e.target.value);
                    }}
                    className="w-full px-2 py-1 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)]"
                  />
                </div>
              </div>

              {parsed.amount !== undefined && (
                <div className="flex items-center gap-1 text-emerald-500 font-mono font-bold">
                  <IndianRupee className="w-3 h-3" />
                  <span>Detected Amount: ₹{parsed.amount}</span>
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-[var(--hub-muted)]">
              {speechSupported ? 'Click mic for voice dictation • Esc closes' : 'Voice dictation unsupported in this browser • Esc closes'}
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
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors shadow-sm cursor-pointer disabled:opacity-50"
              >
                {successMessage ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>{successMessage}</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Save</span>
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
