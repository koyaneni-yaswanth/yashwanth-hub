import React from 'react';

/** Layout-shaped placeholder shown while a page's code chunk or local data loads. */
export const PageSkeleton: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div role="status" aria-live="polite" className="space-y-6">
    <span className="sr-only">{label}…</span>
    <div className="flex items-end justify-between gap-4">
      <div className="space-y-2.5 flex-1">
        <div className="hub-skeleton h-7 w-56 max-w-[70%] rounded-lg" />
        <div className="hub-skeleton h-3.5 w-72 max-w-[85%] rounded-md" />
      </div>
      <div className="hub-skeleton h-9 w-28 rounded-xl hidden sm:block" />
    </div>
    <div className="hub-skeleton h-14 w-full rounded-2xl" />
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1].map((col) => (
        <div key={col} className="rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)] p-4 space-y-3">
          <div className="hub-skeleton h-4 w-32 rounded-md" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <div className="hub-skeleton h-4 w-4 rounded" />
              <div className="flex-1 space-y-1.5">
                <div className="hub-skeleton h-3.5 rounded-md" style={{ width: `${85 - row * 15}%` }} />
                <div className="hub-skeleton h-2.5 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);
