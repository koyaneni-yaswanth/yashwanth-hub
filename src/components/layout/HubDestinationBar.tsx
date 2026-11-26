import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Crosshair, X } from 'lucide-react';
import { destinationForTab } from '../../lib/hubArchitecture';
import { useFocusMode } from '../../context/FocusModeContext';
import type { NavigationTab } from '../../types';

interface HubDestinationBarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

/**
 * Contextual destination header + progressive-disclosure sub-navigation shown inside
 * the 5 non-Home hubs (`Command`, `AI Studio`, `Workspace`, `Intelligence`, `System`).
 */
export const HubDestinationBar: React.FC<HubDestinationBarProps> = ({
  currentTab,
  onSelectTab,
}) => {
  const focus = useFocusMode();
  const dest = destinationForTab(currentTab);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMoreOpen(false);
  }, [currentTab]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const primaryRoutes = dest.routes.filter((r) => r.tier === 'primary');
  const secondaryRoutes = dest.routes.filter((r) => r.tier === 'secondary');
  const isCurrentSecondary = secondaryRoutes.some((r) => r.tab === currentTab);
  const activeSecondary = secondaryRoutes.find((r) => r.tab === currentTab);

  // When Focus Mode is active on a sub-page, keep chrome ultra-minimal (one-line focus banner).
  if (focus.enabled) {
    return (
      <div
        role="region"
        aria-label="Active Focus Mode Banner"
        className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--hub-accent)]/35 bg-[var(--hub-accent)]/10 px-4 py-2.5 text-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Crosshair className="w-4 h-4 text-[var(--hub-accent)] shrink-0" aria-hidden="true" />
          <span className="font-semibold text-[var(--hub-ink)] truncate">
            Focus Mode · {focus.workspace.label}
          </span>
          <span className="hidden sm:inline text-[var(--hub-muted)]">
            — {focus.workspace.previewSummary}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className="px-2.5 py-1 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)]/50 font-medium cursor-pointer"
          >
            Home Focus
          </button>
          <button
            type="button"
            onClick={focus.disableFocusMode}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Exit Focus</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={`${dest.label} destination navigation`}
      className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hub-line)] pb-3"
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] px-2 py-1 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[var(--hub-muted)] shrink-0">
          {dest.code} · {dest.label}
        </span>

        <nav aria-label={`${dest.label} views`} className="flex flex-wrap items-center gap-1.5">
          {primaryRoutes.map((route) => {
            const active = route.tab === currentTab;
            return (
              <button
                key={route.tab}
                type="button"
                onClick={() => onSelectTab(route.tab)}
                aria-current={active ? 'page' : undefined}
                title={route.description}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] shadow-xs'
                    : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)] border border-transparent hover:border-[var(--hub-line)]'
                }`}
              >
                {route.label}
              </button>
            );
          })}

          {secondaryRoutes.length > 0 && (
            <div ref={moreRef} className="relative">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  isCurrentSecondary || moreOpen
                    ? 'bg-[var(--hub-accent)]/12 border-[var(--hub-accent)]/40 text-[var(--hub-accent)]'
                    : 'border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                <span>{activeSecondary ? activeSecondary.label : 'More'}</span>
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              {moreOpen && (
                <div
                  role="menu"
                  aria-label={`More in ${dest.label}`}
                  className="absolute left-0 mt-1.5 w-60 rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface)] p-1.5 shadow-xl z-40 space-y-0.5"
                >
                  {secondaryRoutes.map((route) => {
                    const active = route.tab === currentTab;
                    return (
                      <button
                        key={route.tab}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false);
                          onSelectTab(route.tab);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer ${
                          active
                            ? 'bg-[var(--hub-accent)]/15 text-[var(--hub-accent)] font-semibold'
                            : 'text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                        }`}
                      >
                        <div className="text-xs font-semibold">{route.label}</div>
                        <div className="text-[11px] text-[var(--hub-muted)]">{route.description}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </nav>
      </div>

      <p className="hidden xl:block text-xs text-[var(--hub-muted)] truncate max-w-xs">
        {dest.tagline}
      </p>
    </div>
  );
};
