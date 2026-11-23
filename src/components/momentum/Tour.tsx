import React, { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react';
import type { TourStop } from './LifeConstellation';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Where the 3D camera goes for this step. */
  stop: TourStop;
  /** Element id to scroll into view (the scene stays the default). */
  scrollTo?: string;
}

/**
 * The onboarding tour's caption card: one short step at a time while the
 * camera glides to what it describes. Not modal — the page stays usable — but
 * focus moves into the card so keyboard and screen-reader users follow along.
 * Escape ends the tour.
 */
export const TourCard: React.FC<{
  steps: TourStep[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}> = ({ steps, index, onIndex, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!step) return null;
  return (
    <div className="fixed inset-x-0 bottom-20 lg:bottom-6 z-50 flex justify-center px-4 pointer-events-none">
      <div
        ref={cardRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        className="os-glass hub-rise pointer-events-auto w-full max-w-md p-5 space-y-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)]"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--hub-accent)] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Tour · {index + 1} of {steps.length}
          </p>
          <button type="button" onClick={onClose} className="os-chip p-1.5 cursor-pointer" aria-label="End the tour">
            <X className="w-4 h-4" />
          </button>
        </div>
        <h2 id="tour-step-title" className="text-lg font-semibold text-[var(--hub-ink)]" aria-live="polite">
          {step.title}
        </h2>
        <p id="tour-step-body" className="text-sm text-[var(--hub-ink)] leading-relaxed">
          {step.body}
        </p>
        <div className="flex items-center justify-between gap-3 pt-1">
          <ol className="flex gap-1.5" aria-label="Tour progress">
            {steps.map((s, i) => (
              <li key={s.id}>
                <span
                  className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-[var(--hub-accent)]' : 'w-1.5 bg-[var(--hub-line)]'}`}
                  aria-hidden="true"
                />
                <span className="sr-only">
                  {s.title}
                  {i === index ? ' (current)' : ''}
                </span>
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            {index > 0 && (
              <button type="button" onClick={() => onIndex(index - 1)} className="os-chip px-3 py-2 text-sm cursor-pointer inline-flex items-center gap-1.5">
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onClose() : onIndex(index + 1))}
              className="px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer inline-flex items-center gap-1.5"
            >
              {last ? 'Finish' : 'Next'}
              {!last && <ArrowRight className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
