import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { dismissToast, subscribeToasts, type ToastItem } from '../../lib/toast';

const ICONS = { info: Info, success: CheckCircle2, error: AlertTriangle } as const;

/**
 * Renders toasts from src/lib/toast.ts. Info/success use a polite live region;
 * errors use role="alert" so screen readers announce them straight away.
 */
export const Toaster: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => subscribeToasts(setItems), []);

  const renderItem = (t: ToastItem) => {
    const Icon = ICONS[t.tone];
    return (
      <div
        key={t.id}
        className="hub-toast-enter pointer-events-auto relative overflow-hidden flex items-start gap-3 max-w-md w-full pl-4 pr-2 py-2.5 rounded-2xl bg-[var(--hub-ink)] text-[var(--hub-bg)] shadow-xl"
      >
        <Icon
          aria-hidden="true"
          className={`w-4 h-4 mt-0.5 shrink-0 ${t.tone === 'error' ? 'text-red-400' : t.tone === 'success' ? 'text-emerald-400' : 'opacity-70'}`}
        />
        <span className="text-sm min-w-0 flex-1 break-words">{t.message}</span>
        <button
          type="button"
          onClick={() => dismissToast(t.id)}
          aria-label="Dismiss message"
          className="shrink-0 p-1.5 rounded-lg opacity-70 hover:opacity-100 hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
        <span
          aria-hidden="true"
          className="hub-toast-timer absolute left-0 bottom-0 h-0.5 bg-[var(--hub-accent)]"
          style={{ animationDuration: `${t.durationMs}ms` }}
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-x-0 bottom-40 lg:bottom-20 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
      <div role="alert" aria-live="assertive" className="flex flex-col items-center gap-2 w-full">
        {items.filter((t) => t.tone === 'error').map(renderItem)}
      </div>
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-2 w-full">
        {items.filter((t) => t.tone !== 'error').map(renderItem)}
      </div>
    </div>
  );
};
