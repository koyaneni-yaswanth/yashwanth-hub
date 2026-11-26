/**
 * Deterministic Personal Knowledge Graph Builder
 *
 * Connects verified workspace entities without speculative text merging.
 * Every edge preserves link provenance (`explicit_id`, `milestone_of`, or `shared_area`)
 * so the user always sees WHY two items are connected.
 */

export type KnowledgeNodeKind =
  | 'project'
  | 'task'
  | 'note'
  | 'document'
  | 'robotics'
  | 'goal'
  | 'habit'
  | 'meeting'
  | 'neo_memory';

export type KnowledgeEdgeKind =
  | 'explicit_project_link'
  | 'explicit_goal_link'
  | 'explicit_meeting_link'
  | 'shared_area';

export interface KnowledgeGraphNode {
  id: string;
  rawId: string;
  kind: KnowledgeNodeKind;
  title: string;
  subtitle: string;
  area: string;
  timestamp: string;
  tags: string[];
  degree: number;
  targetTab: string;
}

export interface KnowledgeGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: KnowledgeEdgeKind;
  label: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    explicitEdges: number;
    byKind: Record<KnowledgeNodeKind, number>;
  };
}

export interface KnowledgeGraphInput {
  projects?: Array<Record<string, any>>;
  tasks?: Array<Record<string, any>>;
  notes?: Array<Record<string, any>>;
  documents?: Array<Record<string, any>>;
  robotics?: Array<Record<string, any>>;
  goals?: Array<Record<string, any>>;
  habits?: Array<Record<string, any>>;
  meetings?: Array<Record<string, any>>;
  neoMemories?: Array<Record<string, any>>;
}

const norm = (s: unknown) => String(s || '').trim().toLowerCase();

export function buildKnowledgeGraph(input: KnowledgeGraphInput): KnowledgeGraphData {
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];
  const edgeSeen = new Set<string>();
  const projectByArea = new Map<string, string[]>();
  const projectById = new Set<string>();
  const goalById = new Set<string>();
  const meetingById = new Set<string>();

  const addNode = (node: Omit<KnowledgeGraphNode, 'degree'>) => {
    nodes.push({ ...node, degree: 0 });
  };

  const addEdge = (from: string, to: string, kind: KnowledgeEdgeKind, label: string) => {
    if (from === to) return;
    const key = from < to ? `${from}::${to}::${kind}` : `${to}::${from}::${kind}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push({ id: `edge_${edges.length + 1}`, from, to, kind, label });
  };

  for (const p of input.projects || []) {
    if (!p?.id) continue;
    const nid = `project:${p.id}`;
    projectById.add(String(p.id));
    const areaKey = norm(p.area);
    if (areaKey) {
      const list = projectByArea.get(areaKey) || [];
      list.push(nid);
      projectByArea.set(areaKey, list);
    }
    addNode({
      id: nid,
      rawId: String(p.id),
      kind: 'project',
      title: String(p.title || 'Project'),
      subtitle: `${String(p.status || 'active')} · ${Number(p.progress || 0)}%`,
      area: String(p.area || 'General'),
      timestamp: String(p.updated_at || p.created_at || ''),
      tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
      targetTab: p.area === 'PAWAN SHAKTI' ? 'startup-command' : 'projects',
    });
  }

  for (const g of input.goals || []) {
    if (!g?.id) continue;
    goalById.add(String(g.id));
    const nid = `goal:${g.id}`;
    addNode({
      id: nid,
      rawId: String(g.id),
      kind: 'goal',
      title: String(g.title || 'Goal'),
      subtitle: `${String(g.status || 'active')}${g.target_date ? ` · target ${g.target_date}` : ''}`,
      area: String(g.area || 'Personal'),
      timestamp: String(g.updated_at || g.created_at || ''),
      tags: ['goal'],
      targetTab: 'goals',
    });
    const matchedProjects = projectByArea.get(norm(g.area)) || [];
    if (matchedProjects[0]) addEdge(nid, matchedProjects[0], 'shared_area', 'Workspace area');
  }

  for (const h of input.habits || []) {
    if (!h?.id || h.archived) continue;
    const nid = `habit:${h.id}`;
    addNode({
      id: nid,
      rawId: String(h.id),
      kind: 'habit',
      title: String(h.title || 'Habit'),
      subtitle: `${Number(h.weekly_target || 7)}x / week`,
      area: String(h.area || 'Personal'),
      timestamp: String(h.updated_at || h.created_at || ''),
      tags: ['habit'],
      targetTab: 'goals',
    });
    if (h.goal_id && goalById.has(String(h.goal_id))) {
      addEdge(nid, `goal:${h.goal_id}`, 'explicit_goal_link', 'Supports goal');
    }
  }

  for (const m of input.meetings || []) {
    if (!m?.id) continue;
    meetingById.add(String(m.id));
    const nid = `meeting:${m.id}`;
    addNode({
      id: nid,
      rawId: String(m.id),
      kind: 'meeting',
      title: String(m.title || 'Meeting'),
      subtitle: `${m.date || ''} ${m.start_time || ''}`.trim(),
      area: String(m.area || 'General'),
      timestamp: String(m.updated_at || m.created_at || ''),
      tags: ['meeting'],
      targetTab: 'meetings',
    });
    if (m.project_id && projectById.has(String(m.project_id))) {
      addEdge(nid, `project:${m.project_id}`, 'explicit_project_link', 'Project meeting');
    } else {
      const matched = projectByArea.get(norm(m.area)) || [];
      if (matched[0]) addEdge(nid, matched[0], 'shared_area', 'Workspace area');
    }
  }

  for (const t of (input.tasks || []).slice(0, 60)) {
    if (!t?.id) continue;
    const nid = `task:${t.id}`;
    addNode({
      id: nid,
      rawId: String(t.id),
      kind: 'task',
      title: String(t.text || 'Task'),
      subtitle: `${t.done ? 'Completed' : t.priority || 'medium'}${t.due_date ? ` · ${t.due_date}` : ''}`,
      area: String(t.area || 'Personal'),
      timestamp: String(t.updated_at || t.created_at || ''),
      tags: t.starred ? ['starred'] : [],
      targetTab: 'tasks',
    });
    if (t.project_id && projectById.has(String(t.project_id))) {
      addEdge(nid, `project:${t.project_id}`, 'explicit_project_link', 'Task in project');
    } else {
      const matched = projectByArea.get(norm(t.area)) || [];
      if (matched[0]) addEdge(nid, matched[0], 'shared_area', 'Workspace area');
    }
  }

  for (const n of (input.notes || []).slice(0, 50)) {
    if (!n?.id) continue;
    const nid = `note:${n.id}`;
    addNode({
      id: nid,
      rawId: String(n.id),
      kind: 'note',
      title: String(n.title || 'Note'),
      subtitle: String(n.kind || (n.pinned ? 'Pinned note' : 'Note')),
      area: String(n.area || 'General'),
      timestamp: String(n.updated_at || n.created_at || ''),
      tags: Array.isArray(n.tags) ? n.tags.map(String) : [],
      targetTab: 'notes',
    });
    if (n.project_id && projectById.has(String(n.project_id))) {
      addEdge(nid, `project:${n.project_id}`, 'explicit_project_link', 'Project note');
    } else {
      const matched = projectByArea.get(norm(n.area)) || [];
      if (matched[0]) addEdge(nid, matched[0], 'shared_area', 'Workspace area');
    }
  }

  for (const d of (input.documents || []).slice(0, 40)) {
    if (!d?.id) continue;
    const nid = `document:${d.id}`;
    addNode({
      id: nid,
      rawId: String(d.id),
      kind: 'document',
      title: String(d.title || d.file_name || 'Document'),
      subtitle: String(d.file_name || 'File'),
      area: String(d.area || 'General'),
      timestamp: String(d.updated_at || d.created_at || ''),
      tags: Array.isArray(d.tags) ? d.tags.map(String) : [],
      targetTab: 'documents',
    });
    if (d.project_id && projectById.has(String(d.project_id))) {
      addEdge(nid, `project:${d.project_id}`, 'explicit_project_link', 'Project file');
    } else {
      const matched = projectByArea.get(norm(d.area)) || [];
      if (matched[0]) addEdge(nid, matched[0], 'shared_area', 'Workspace area');
    }
  }

  for (const r of (input.robotics || []).slice(0, 30)) {
    if (!r?.id) continue;
    const nid = `robotics:${r.id}`;
    addNode({
      id: nid,
      rawId: String(r.id),
      kind: 'robotics',
      title: String(r.title || 'Experiment'),
      subtitle: `${String(r.project || 'Robotics')} · ${String(r.status || 'planning')}`,
      area: 'IvLabs',
      timestamp: String(r.updated_at || r.created_at || ''),
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      targetTab: 'robotics-lab',
    });
    const matched = projectByArea.get('ivlabs') || [];
    if (matched[0]) addEdge(nid, matched[0], 'shared_area', 'Robotics workspace');
  }

  for (const nm of (input.neoMemories || []).slice(0, 30)) {
    if (!nm?.id) continue;
    const nid = `neo_memory:${nm.id}`;
    addNode({
      id: nid,
      rawId: String(nm.id),
      kind: 'neo_memory',
      title: String(nm.title || 'Neo Memory'),
      subtitle: String(nm.platform || nm.source || 'Neo 1'),
      area: String(nm.associatedArea || 'Personal'),
      timestamp: String(nm.capturedAt || nm.importedAt || ''),
      tags: Array.isArray(nm.tags) ? nm.tags.map(String) : [],
      targetTab: 'knowledge-memory',
    });
    if (nm.associatedProjectId && projectById.has(String(nm.associatedProjectId))) {
      addEdge(nid, `project:${nm.associatedProjectId}`, 'explicit_project_link', 'Memory linked to project');
    } else if (nm.associatedArea) {
      const matched = projectByArea.get(norm(nm.associatedArea)) || [];
      if (matched[0]) addEdge(nid, matched[0], 'shared_area', 'Workspace area');
    }
  }

  const degreeMap = new Map<string, number>();
  for (const e of edges) {
    degreeMap.set(e.from, (degreeMap.get(e.from) || 0) + 1);
    degreeMap.set(e.to, (degreeMap.get(e.to) || 0) + 1);
  }
  for (const n of nodes) {
    n.degree = degreeMap.get(n.id) || 0;
  }

  nodes.sort((a, b) => {
    if (b.degree !== a.degree) return b.degree - a.degree;
    return a.title.localeCompare(b.title);
  });

  const byKind: Record<KnowledgeNodeKind, number> = {
    project: 0,
    task: 0,
    note: 0,
    document: 0,
    robotics: 0,
    goal: 0,
    habit: 0,
    meeting: 0,
    neo_memory: 0,
  };
  for (const n of nodes) byKind[n.kind] += 1;

  return {
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      explicitEdges: edges.filter((e) => e.kind !== 'shared_area').length,
      byKind,
    },
  };
}
