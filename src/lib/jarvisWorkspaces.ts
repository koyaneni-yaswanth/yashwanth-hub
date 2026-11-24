/**
 * Workspace nodes for the Jarvis command scene on Home.
 *
 * Only real destinations: the workspace pages that exist, plus the user's own areas
 * (opened as an area-filtered Projects view). Status lines are counted from stored
 * records; when there is nothing to count, the status is null, never invented.
 * Pure, so it is unit-tested.
 */

export type WorkspaceNode = {
  id: string;
  label: string;
  description: string;
  /** Hex colour for the node (area colour or the brand palette). */
  color: string;
  /** Where clicking goes. */
  target: { tab: string; area?: string };
  /** A short status counted from real data, or null when there is nothing to report. */
  status: string | null;
};

type TaskLike = { area?: string; done?: boolean };
type ProjectLike = { area?: string; status?: string };
type AreaLike = { name: string; color?: string; description?: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const norm = (s: string | undefined) => String(s ?? '').trim().toLowerCase();

/** The workspace area that has its own page (its tasks/projects count there). */
const PAWAN_AREA = 'pawan shakti';

export function areaStatus(area: string, tasks: TaskLike[], projects: ProjectLike[]): string | null {
  const a = norm(area);
  const open = tasks.filter((t) => !t.done && norm(t.area) === a).length;
  const active = projects.filter((p) => norm(p.area) === a && p.status !== 'completed').length;
  const parts = [open ? plural(open, 'open task') : '', active ? plural(active, 'active project') : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export const MAX_NODES = 8;

export function buildWorkspaceNodes(input: {
  areas: AreaLike[];
  tasks: TaskLike[];
  projects: ProjectLike[];
  roboticsRecords: number;
}): WorkspaceNode[] {
  const { areas, tasks, projects, roboticsRecords } = input;
  const pawan = areas.find((a) => norm(a.name) === PAWAN_AREA);
  const nodes: WorkspaceNode[] = [
    {
      id: 'tab:startup-command',
      label: 'Pawan Shakti',
      description: 'Wind-turbine programme: milestones, prototypes and proof.',
      color: '#c6a46b',
      target: { tab: 'startup-command' },
      status: areaStatus(pawan?.name ?? 'PAWAN SHAKTI', tasks, projects),
    },
    {
      id: 'tab:robotics-lab',
      label: 'Robotics Lab',
      description: 'Robotics records, experiments and builds.',
      color: '#8ba8c8',
      target: { tab: 'robotics-lab' },
      status: roboticsRecords > 0 ? plural(roboticsRecords, 'record') : null,
    },
    {
      id: 'tab:learning-career',
      label: 'Learning & Career',
      description: 'Courses, skills and career plans.',
      color: '#b9b4a8',
      target: { tab: 'learning-career' },
      status: null,
    },
  ];
  // The user's own areas (except the one that already has a workspace page), as filtered Projects views.
  for (const a of areas) {
    if (nodes.length >= MAX_NODES) break;
    if (!a.name || norm(a.name) === PAWAN_AREA || norm(a.name) === 'all') continue;
    nodes.push({
      id: `area:${a.name}`,
      label: a.name,
      description: a.description?.trim() || `Everything in the ${a.name} area.`,
      color: /^#[0-9a-f]{6}$/i.test(a.color ?? '') ? (a.color as string) : '#8ba8c8',
      target: { tab: 'projects', area: a.name },
      status: areaStatus(a.name, tasks, projects),
    });
  }
  return nodes;
}

/** Evenly spaced angles on the node ring, starting at the front (towards the camera). */
export function nodeAngles(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.PI / 2 + (i / Math.max(1, count)) * Math.PI * 2);
}
