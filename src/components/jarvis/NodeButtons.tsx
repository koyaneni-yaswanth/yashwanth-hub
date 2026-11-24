import type { WorkspaceNode } from '../../lib/jarvisWorkspaces';

/** Workspace buttons: the direct, no-3D way to open each workspace (also the fallback). */
export function NodeButtons({ nodes, onOpen, className = '' }: { nodes: WorkspaceNode[]; onOpen: (n: WorkspaceNode) => void; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`} aria-label="Workspaces">
      {nodes.map((n) => (
        <li key={n.id}>
          <button
            type="button"
            onClick={() => onOpen(n)}
            className="group flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-full border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-medium text-[var(--hub-ink)] hover:border-[var(--hub-accent)]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)] cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full" style={{ background: n.color }} aria-hidden="true" />
            <span>{n.label}</span>
            {n.status && <span className="text-[var(--hub-muted)] font-normal hidden sm:inline">· {n.status}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
