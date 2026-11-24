/**
 * Home's command centre panel: the Jarvis 3D core with orbiting workspace nodes.
 *
 * - The 3D scene (three.js, lazy chunk) loads after the page has painted, never on the critical path.
 * - Every node is also a real button (keyboard, screen readers, no-WebGL fallback), so the
 *   3D is an enhancement, never the only way to navigate.
 * - The panel can be collapsed to a compact row of the same buttons (remembered per device).
 */
import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { db } from '../../db';
import { buildWorkspaceNodes, type WorkspaceNode } from '../../lib/jarvisWorkspaces';
import { NodeButtons } from './NodeButtons';
import type { Area } from '../../types';

const JarvisScene = lazy(() => import('./JarvisScene').then((m) => ({ default: m.JarvisScene })));

const PREF_KEY = 'yash_jarvis_scene';
const NO_TASKS: never[] = [];
const NO_PROJECTS: never[] = [];

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export const JarvisCommandCenter: React.FC<{
  areas: Area[];
  onNavigate: (tab: string) => void;
  onSelectArea?: (area: string) => void;
}> = ({ areas, onNavigate, onSelectArea }) => {
  const tasks = useLiveQuery(() => db.tasks.toArray(), []) ?? NO_TASKS;
  const projects = useLiveQuery(() => db.projects.toArray(), []) ?? NO_PROJECTS;
  const roboticsRecords = useLiveQuery(() => db.robotics_records.count(), []) ?? 0;
  const nodes = useMemo(() => buildWorkspaceNodes({ areas, tasks, projects, roboticsRecords }), [areas, tasks, projects, roboticsRecords]);
  const [expanded, setExpanded] = useState(readPref);
  // Start the 3D only once the browser is idle after first paint (keeps Home's LCP fast).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 300);
    return () => window.clearTimeout(t);
  }, [expanded]);

  const toggle = () => {
    setExpanded((v) => {
      try {
        localStorage.setItem(PREF_KEY, v ? 'off' : 'on');
      } catch {
        /* storage unavailable: preference lasts this visit only */
      }
      return !v;
    });
  };

  const open = (n: WorkspaceNode) => {
    if (n.target.area) onSelectArea?.(n.target.area);
    onNavigate(n.target.tab);
  };

  return (
    <section aria-labelledby="jarvis-cc-title" className="relative overflow-hidden rounded-2xl border border-[var(--hub-line)] bg-[var(--hub-surface-subtle)]">
      <div className="flex items-center justify-between px-4 pt-3 sm:px-5">
        <div>
          <p className="type-eyebrow">Command centre</p>
          <h3 id="jarvis-cc-title" className="font-heading text-base font-semibold text-[var(--hub-ink)]">
            Your workspaces
          </h3>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          className="flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)] cursor-pointer"
        >
          {expanded ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
          {expanded ? 'Hide 3D view' : 'Show 3D view'}
        </button>
      </div>

      {expanded ? (
        <div className="relative h-[260px] sm:h-[340px]">
          {ready ? (
            <Suspense fallback={<NodeButtons nodes={nodes} onOpen={open} className="absolute inset-x-4 bottom-4 sm:inset-x-5" />}>
              <JarvisScene nodes={nodes} onOpen={open} onOpenCore={() => onNavigate('ai-assistant')} />
            </Suspense>
          ) : (
            <NodeButtons nodes={nodes} onOpen={open} className="absolute inset-x-4 bottom-4 sm:inset-x-5" />
          )}
        </div>
      ) : (
        <NodeButtons nodes={nodes} onOpen={open} className="px-4 pb-4 pt-3 sm:px-5" />
      )}
    </section>
  );
};
