// Shared Chief of Staff Tool Definitions, Workspace Search & Grounded Reasoning Engine
// Pure TypeScript (zero Node-only dependencies) so server (api/ai/chat.ts),
// client offline fallback (src/services/ai/aiGateway.ts), and tests share ONE exact implementation.

export interface AIToolSpec {
  name: string;
  level: 'read' | 'write_preview';
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface WorkspaceSnapshot {
  todayISO: string;
  areaFilter?: string;
  projectIdScope?: string;
  tasks: Array<Record<string, any>>;
  projects: Array<Record<string, any>>;
  notes: Array<Record<string, any>>;
  meetings: Array<Record<string, any>>;
  events: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  robotics_records: Array<Record<string, any>>;
  neo_memories: Array<Record<string, any>>;
  automations?: Array<Record<string, any>>;
}

export interface ProposedActionPreview {
  id: string;
  type: 'create_task' | 'schedule_event' | 'create_note' | 'log_decision' | 'trigger_automation';
  title: string;
  description: string;
  payload: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
}

export interface ToolExecutionResult {
  tool: string;
  args: Record<string, any>;
  summary: string;
  citations: string[];
  data: any;
  proposedAction?: ProposedActionPreview;
}

export const AI_TOOL_DEFINITIONS: AIToolSpec[] = [
  {
    name: 'query_tasks',
    level: 'read',
    description:
      'Queries the user tasks table by completion status, priority, area, project_id, or search query.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'done', 'overdue', 'all'], description: 'Filter by task status' },
        area: { type: 'string', description: 'Optional workspace area filter (e.g. PAWAN SHAKTI, IvLabs)' },
        project_id: { type: 'string', description: 'Optional project ID filter' },
        query: { type: 'string', description: 'Optional text filter' },
      },
    },
  },
  {
    name: 'query_projects',
    level: 'read',
    description:
      'Inspects projects including goals, milestones, decisions, risks, blockers, progress, and verification baseline notes.',
    parameters: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'Specific project ID if known' },
        query: { type: 'string', description: 'Search keyword against project title, area, blockers, or tags' },
      },
    },
  },
  {
    name: 'search_knowledge_and_decisions',
    level: 'read',
    description:
      'Searches notes, project decisions, documents, robotics experiment records, and permitted NeoSapien memories.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Topic or keywords (e.g. PiPER, AWR2944, planetary gearbox)' },
        limit: { type: 'number', description: 'Max matching items per source (default 6)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_schedule_and_routine',
    level: 'read',
    description: 'Returns upcoming calendar events and scheduled meetings starting from today.',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Optional YYYY-MM-DD date (defaults to today)' },
      },
    },
  },
  {
    name: 'propose_create_task',
    level: 'write_preview',
    description:
      'Level 2 Action Preview: Creates a draft task confirmation card requiring explicit user approval before saving.',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Clear actionable task title' },
        area: { type: 'string', description: 'Workspace area (e.g. PAWAN SHAKTI, IvLabs, MG Automation, Personal)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: 'Task priority' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        project_id: { type: 'string', description: 'Optional linked project ID' },
        description: { type: 'string', description: 'Optional task notes or acceptance criteria' },
      },
      required: ['text'],
    },
  },
  {
    name: 'propose_schedule_event',
    level: 'write_preview',
    description:
      'Level 2 Action Preview: Proposes a calendar event requiring explicit user approval before saving.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        date: { type: 'string', description: 'YYYY-MM-DD date' },
        start_time: { type: 'string', description: 'HH:mm 24h start time' },
        kind: { type: 'string', enum: ['Meeting', 'Travel', 'Deadline', 'Milestone', 'Other'], description: 'Event kind' },
        area: { type: 'string', description: 'Workspace area' },
        notes: { type: 'string', description: 'Optional agenda or notes' },
      },
      required: ['title', 'date'],
    },
  },
  {
    name: 'propose_create_note_or_decision',
    level: 'write_preview',
    description:
      'Level 2 Action Preview: Proposes logging a persistent workspace Note or Project Decision requiring user approval.',
    parameters: {
      type: 'object',
      properties: {
        target_type: { type: 'string', enum: ['note', 'decision'], description: 'Whether to create a standalone note or a project decision' },
        title: { type: 'string', description: 'Note or decision title' },
        content: { type: 'string', description: 'Body or decision statement' },
        rationale: { type: 'string', description: 'Optional decision rationale' },
        area: { type: 'string', description: 'Workspace area' },
        project_id: { type: 'string', description: 'Project ID when logging a decision' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'propose_automation_trigger',
    level: 'write_preview',
    description:
      'Level 2 Action Preview: Proposes dispatching a server automation job after explicit user confirmation.',
    parameters: {
      type: 'object',
      properties: {
        action_type: {
          type: 'string',
          enum: ['task_deadline_scan', 'morning_briefing', 'neosapien_mcp', 'google_calendar'],
          description: 'Automation action type',
        },
        title: { type: 'string', description: 'Human-readable summary of the automation run' },
      },
      required: ['action_type', 'title'],
    },
  },
];

function computeAddDaysISO(baseISO: string, days: number): string {
  const base = baseISO ? new Date(`${baseISO}T00:00:00Z`) : new Date();
  if (Number.isNaN(base.getTime())) return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function executeAiTool(
  toolName: string,
  args: Record<string, any> = {},
  snapshot: WorkspaceSnapshot
): ToolExecutionResult {
  const todayISO = snapshot.todayISO || new Date().toISOString().slice(0, 10);

  if (toolName === 'query_tasks') {
    const status = String(args.status || 'open').toLowerCase();
    const areaQ = args.area ? String(args.area).toLowerCase() : '';
    const projectQ = args.project_id ? String(args.project_id) : '';
    const q = args.query ? String(args.query).toLowerCase() : '';

    const matched = (snapshot.tasks || []).filter((t) => {
      if (status === 'open' && t.done) return false;
      if (status === 'done' && !t.done) return false;
      if (status === 'overdue' && (t.done || !t.due_date || t.due_date >= todayISO)) return false;
      if (areaQ && String(t.area || '').toLowerCase() !== areaQ) return false;
      if (projectQ && String(t.project_id || '') !== projectQ) return false;
      if (q && !`${t.text || ''} ${t.description || ''} ${t.area || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const top = matched.slice(0, 15).map((t) => ({
      id: t.id,
      text: t.text,
      area: t.area,
      priority: t.priority,
      due_date: t.due_date || null,
      done: Boolean(t.done),
      starred: Boolean(t.starred),
      project_id: t.project_id || null,
    }));

    return {
      tool: toolName,
      args,
      summary: `Found ${matched.length} matching task(s) (returning top ${top.length}).`,
      citations: top.slice(0, 5).map((t) => `[Task: "${t.text}" (${t.area || 'General'}, ${t.priority})]`),
      data: { totalMatched: matched.length, tasks: top },
    };
  }

  if (toolName === 'query_projects') {
    const pid = args.project_id ? String(args.project_id) : '';
    const q = args.query ? String(args.query).toLowerCase() : '';

    const matched = (snapshot.projects || []).filter((p) => {
      if (pid && p.id !== pid) return false;
      if (q) {
        const hay = `${p.title || ''} ${p.description || ''} ${p.area || ''} ${(p.tags || []).join(' ')} ${JSON.stringify(p.blockers || [])} ${JSON.stringify(p.risks || [])}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return {
      tool: toolName,
      args,
      summary: `Retrieved ${matched.length} project record(s).`,
      citations: matched.map((p) => `[Project: "${p.title}" (${p.area}, ${p.progress}%)]`),
      data: {
        projects: matched.map((p) => ({
          id: p.id,
          title: p.title,
          area: p.area,
          status: p.status,
          priority: p.priority,
          progress: p.progress,
          target_date: p.target_date,
          verification_note: p.verification_note,
          goals: p.goals || [],
          milestones: p.milestones || [],
          blockers: p.blockers || [],
          risks: p.risks || [],
          decisions: p.decisions || [],
        })),
      },
    };
  }

  if (toolName === 'search_knowledge_and_decisions') {
    const rawQuery = String(args.query || '').trim().toLowerCase();
    const tokens = rawQuery.split(/\s+/).filter((w) => w.length >= 2);
    const limit = Number(args.limit) || 6;

    const scoreText = (haystack: string): number => {
      if (!rawQuery) return 1;
      const lower = haystack.toLowerCase();
      if (lower.includes(rawQuery)) return 5;
      return tokens.reduce((acc, tok) => (lower.includes(tok) ? acc + 1 : acc), 0);
    };

    const hits: Array<{ sourceType: string; title: string; date?: string; excerpt: string; citation: string; score: number }> = [];

    for (const p of snapshot.projects || []) {
      for (const d of p.decisions || []) {
        const text = `${d.title || ''} ${d.decision || ''} ${d.rationale || ''} ${p.title || ''}`;
        const score = scoreText(text);
        if (score > 0) {
          hits.push({
            sourceType: 'project_decision',
            title: `${p.title}: ${d.title}`,
            date: d.decided_at,
            excerpt: `${d.decision}${d.rationale ? ` Rationale: ${d.rationale}` : ''}`,
            citation: `[Decision (${p.area}): "${d.title}" (${d.decided_at || 'undated'})]`,
            score: score + 1,
          });
        }
      }
    }

    for (const n of snapshot.notes || []) {
      const score = scoreText(`${n.title || ''} ${n.body || ''} ${n.area || ''}`);
      if (score > 0) {
        hits.push({
          sourceType: 'note',
          title: n.title || 'Untitled Note',
          date: (n.updated_at || n.created_at || '').slice(0, 10),
          excerpt: String(n.body || '').slice(0, 240),
          citation: `[Note: "${n.title}" (${(n.updated_at || n.created_at || '').slice(0, 10)})]`,
          score,
        });
      }
    }

    for (const r of snapshot.robotics_records || []) {
      const score = scoreText(`${r.project || ''} ${r.title || ''} ${r.description || ''} ${(r.tags || []).join(' ')}`);
      if (score > 0) {
        hits.push({
          sourceType: 'robotics_record',
          title: `[${r.project}] ${r.title}`,
          date: (r.updated_at || r.created_at || '').slice(0, 10),
          excerpt: String(r.description || '').slice(0, 240),
          citation: `[Robotics (${r.project}): "${r.title}" (${r.status})]`,
          score: score + 1,
        });
      }
    }

    for (const doc of snapshot.documents || []) {
      const score = scoreText(`${doc.title || ''} ${doc.file_name || ''} ${doc.notes || ''} ${doc.area || ''}`);
      if (score > 0) {
        hits.push({
          sourceType: 'document',
          title: doc.title || doc.file_name,
          date: (doc.updated_at || doc.created_at || '').slice(0, 10),
          excerpt: String(doc.notes || doc.file_name || '').slice(0, 200),
          citation: `[Document: "${doc.title || doc.file_name}"]`,
          score,
        });
      }
    }

    for (const m of snapshot.neo_memories || []) {
      if (m.allowAiUsage === false || m.includeInAi === false || m.privacy === 'private') continue;
      const score = scoreText(`${m.title || ''} ${m.summary || ''} ${m.transcript || ''} ${(m.tags || []).join(' ')}`);
      if (score > 0) {
        hits.push({
          sourceType: 'neo_memory',
          title: m.title || 'Neo Memory',
          date: (m.capturedAt || m.importedAt || '').slice(0, 10),
          excerpt: String(m.summary || m.transcript || '').slice(0, 240),
          citation: `[Neo Memory: "${m.title}" (${(m.capturedAt || '').slice(0, 10)})]`,
          score,
        });
      }
    }

    hits.sort((a, b) => b.score - a.score);
    const limited = hits.slice(0, limit * 2);

    return {
      tool: toolName,
      args,
      summary: `Found ${hits.length} knowledge match(es) across decisions, notes, robotics logs, docs, and Neo memories.`,
      citations: limited.slice(0, 6).map((h) => h.citation),
      data: { matches: limited },
    };
  }

  if (toolName === 'get_schedule_and_routine') {
    const targetDate = String(args.date || todayISO);
    const eventsToday = (snapshot.events || []).filter((e) => e.date >= targetDate).slice(0, 10);
    const meetingsToday = (snapshot.meetings || [])
      .filter((m) => m.status !== 'cancelled' && m.date >= targetDate)
      .slice(0, 10);

    return {
      tool: toolName,
      args,
      summary: `Found ${meetingsToday.length} scheduled meeting(s) and ${eventsToday.length} upcoming calendar event(s).`,
      citations: [
        ...meetingsToday.slice(0, 3).map((m) => `[Meeting: "${m.title}" (${m.date} ${m.start_time || ''})]`),
        ...eventsToday.slice(0, 3).map((e) => `[Event: "${e.title}" (${e.date})]`),
      ],
      data: { date: targetDate, meetings: meetingsToday, events: eventsToday },
    };
  }

  if (toolName === 'propose_create_task') {
    const text = String(args.text || '').trim();
    const dueDate = args.due_date ? String(args.due_date) : computeAddDaysISO(todayISO, 1);
    const area = String(args.area || 'PAWAN SHAKTI');
    const priority = ['low', 'medium', 'high', 'urgent'].includes(String(args.priority))
      ? String(args.priority)
      : 'high';

    const proposedAction: ProposedActionPreview = {
      id: `act_task_${Date.now().toString(36)}`,
      type: 'create_task',
      title: `Create Task: "${text}"`,
      description: `Area: ${area} • Priority: ${priority} • Due: ${dueDate}`,
      payload: {
        text,
        area,
        priority,
        due_date: dueDate,
        project_id: args.project_id || undefined,
        description: args.description || 'Created via AI Chief of Staff confirmation preview.',
      },
      status: 'pending',
    };

    return {
      tool: toolName,
      args,
      summary: `Prepared action preview to create task "${text}" (awaiting user approval).`,
      citations: [],
      data: { preview: proposedAction },
      proposedAction,
    };
  }

  if (toolName === 'propose_schedule_event') {
    const title = String(args.title || '').trim();
    const date = String(args.date || computeAddDaysISO(todayISO, 1));
    const area = String(args.area || 'Personal');
    const proposedAction: ProposedActionPreview = {
      id: `act_evt_${Date.now().toString(36)}`,
      type: 'schedule_event',
      title: `Schedule Event: "${title}"`,
      description: `Date: ${date}${args.start_time ? ` at ${args.start_time}` : ''} • Area: ${area}`,
      payload: {
        title,
        date,
        start_time: args.start_time || '10:00',
        kind: args.kind || 'Deadline',
        area,
        notes: args.notes || '',
      },
      status: 'pending',
    };

    return {
      tool: toolName,
      args,
      summary: `Prepared calendar event preview for "${title}" on ${date} (awaiting approval).`,
      citations: [],
      data: { preview: proposedAction },
      proposedAction,
    };
  }

  if (toolName === 'propose_create_note_or_decision') {
    const isDecision = args.target_type === 'decision' && Boolean(args.project_id);
    const proposedAction: ProposedActionPreview = {
      id: `act_doc_${Date.now().toString(36)}`,
      type: isDecision ? 'log_decision' : 'create_note',
      title: isDecision ? `Log Project Decision: "${args.title}"` : `Save Note: "${args.title}"`,
      description: String(args.content || '').slice(0, 140),
      payload: {
        title: String(args.title || 'AI Summary'),
        content: String(args.content || ''),
        rationale: args.rationale || '',
        area: args.area || 'PAWAN SHAKTI',
        project_id: args.project_id || undefined,
      },
      status: 'pending',
    };

    return {
      tool: toolName,
      args,
      summary: `Prepared ${isDecision ? 'decision' : 'note'} preview "${args.title}" (awaiting approval).`,
      citations: [],
      data: { preview: proposedAction },
      proposedAction,
    };
  }

  if (toolName === 'propose_automation_trigger') {
    const actionType = String(args.action_type || 'task_deadline_scan');
    const title = String(args.title || `Run server automation: ${actionType}`);
    const proposedAction: ProposedActionPreview = {
      id: `act_auto_${Date.now().toString(36)}`,
      type: 'trigger_automation',
      title,
      description: `Server action_type: ${actionType} (queued with confirmation)`,
      payload: { action_type: actionType },
      status: 'pending',
    };

    return {
      tool: toolName,
      args,
      summary: `Prepared automation preview for "${actionType}" (awaiting approval).`,
      citations: [],
      data: { preview: proposedAction },
      proposedAction,
    };
  }

  return {
    tool: toolName,
    args,
    summary: `Unknown tool "${toolName}".`,
    citations: [],
    data: { error: `Unknown tool: ${toolName}` },
  };
}

export interface GroundedResponsePayload {
  text: string;
  verified_facts: string[];
  estimates: string[];
  recommendations: string[];
  unknowns: string[];
  citations: string[];
  tool_calls: Array<{ tool: string; args: Record<string, any>; summary: string }>;
  proposed_actions: ProposedActionPreview[];
}

/**
 * Deterministic grounded Chief of Staff response engine used when external LLM API keys
 * are absent or unreachable. Every factual claim traces strictly to queried snapshot records.
 */
export function buildDeterministicGroundedResponse(
  query: string,
  snapshot: WorkspaceSnapshot,
  projectScopeId?: string
): GroundedResponsePayload {
  const lower = (query || '').toLowerCase();
  const todayISO = snapshot.todayISO || new Date().toISOString().slice(0, 10);
  const tomorrowISO = computeAddDaysISO(todayISO, 1);

  const toolResults: ToolExecutionResult[] = [];
  const verifiedFacts: string[] = [];
  const estimates: string[] = [];
  const recommendations: string[] = [];
  const unknowns: string[] = [];
  const proposedActions: ProposedActionPreview[] = [];

  const scopeProject = projectScopeId
    ? (snapshot.projects || []).find((p) => p.id === projectScopeId)
    : undefined;

  // Intent 1: Task / Event Creation Requests
  if (
    /\b(create|add|make|remind|schedule)\b/.test(lower) &&
    (/\btask\b|\btodo\b|\btest\b|\bfix\b|\bgenerator\b|\bmeeting\b/.test(lower))
  ) {
    const isTomorrow = lower.includes('tomorrow');
    const dueDate = isTomorrow ? tomorrowISO : todayISO;
    const cleanedTitle = query
      .replace(/^(please\s+)?(create|add|make)\s+(a\s+)?task(\s+to)?\s*/i, '')
      .replace(/\s+(tomorrow|today)\.?\s*$/i, '')
      .replace(/\.$/, '')
      .trim() || 'Follow up on action item';

    const pawanProject =
      scopeProject ||
      (snapshot.projects || []).find(
        (p) =>
          String(p.area || '').toLowerCase().includes('pawan') ||
          String(p.title || '').toLowerCase().includes('pawan')
      );

    const inferredArea =
      lower.includes('piper') || lower.includes('robot') || lower.includes('swarm') || lower.includes('radar')
        ? 'IvLabs'
        : lower.includes('plc')
        ? 'MG Automation'
        : pawanProject?.area || 'PAWAN SHAKTI';

    const res = executeAiTool(
      'propose_create_task',
      {
        text: cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1),
        area: inferredArea,
        priority: lower.includes('urgent') || lower.includes('generator') ? 'high' : 'medium',
        due_date: dueDate,
        project_id: pawanProject?.id,
      },
      snapshot
    );
    toolResults.push(res);
    if (res.proposedAction) proposedActions.push(res.proposedAction);

    verifiedFacts.push(`Resolved target date "${dueDate}" relative to workspace date ${todayISO}.`);
    if (pawanProject) {
      verifiedFacts.push(`Matched workspace context to [Project: "${pawanProject.title}" (${pawanProject.area})].`);
    }
    recommendations.push('Review the confirmation card below and click "Approve & Save" to persist this task to Dexie & sync queue.');

    return formatGroundedPayload({
      headline: `Drafted task confirmation for **${res.proposedAction?.payload.text}** (Due: ${dueDate}, Area: ${inferredArea}). Nothing has been saved until you approve.`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 2: Project Blocker Inquiry (e.g. "What is blocking Pawan Shakti?")
  if (lower.includes('blocking') || lower.includes('blocker') || lower.includes('pawan')) {
    const targetQuery = lower.includes('pawan') ? 'pawan' : scopeProject?.title || '';
    const projRes = executeAiTool('query_projects', { project_id: projectScopeId, query: targetQuery }, snapshot);
    const taskRes = executeAiTool('query_tasks', { status: 'open', area: lower.includes('pawan') ? 'PAWAN SHAKTI' : undefined }, snapshot);
    toolResults.push(projRes, taskRes);

    const matchedProjects = projRes.data.projects || [];
    for (const p of matchedProjects) {
      if (p.verification_note) {
        verifiedFacts.push(`${p.title}: ${p.verification_note}`);
      }
      for (const b of (p.blockers || []).filter((x: any) => x.status !== 'resolved')) {
        verifiedFacts.push(`Open Blocker in ${p.title}: "${b.title}" — Impact: ${b.impact}`);
      }
      for (const r of (p.risks || []).filter((x: any) => x.status === 'open')) {
        verifiedFacts.push(`Open Risk (${r.severity}): "${r.title}" — Mitigation: ${r.mitigation}`);
      }
      const openMilestones = (p.milestones || []).filter((m: any) => !m.done);
      if (openMilestones.length > 0) {
        estimates.push(
          `${openMilestones.length} uncompleted milestone(s) remain in ${p.title} (target date: ${p.target_date || 'unset'}).`
        );
      }
    }

    const openUrgent = (taskRes.data.tasks || []).filter((t: any) => t.priority === 'urgent' || t.priority === 'high');
    if (openUrgent.length > 0) {
      verifiedFacts.push(
        `Top open high-priority tasks: ${openUrgent.slice(0, 3).map((t: any) => `"${t.text}"`).join('; ')}.`
      );
    }

    if (matchedProjects.length === 0) {
      unknowns.push('No matching project record found in the current workspace snapshot.');
    } else if (!matchedProjects.some((p: any) => (p.blockers || []).length > 0)) {
      unknowns.push('No explicit blocker objects are logged on the matched project; check open tasks & risks.');
    }

    recommendations.push(
      'Prioritize closing the highest-impact open blocker before advancing TRL claims or external pilot commitments.'
    );

    return formatGroundedPayload({
      headline: matchedProjects[0]
        ? `Status & Blocker Brief for **${matchedProjects[0].title}**`
        : 'Project Blocker Assessment',
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 3: Knowledge / Decision Lookup (e.g. "Find my last decision about the PiPER setup")
  if (
    lower.includes('decision') ||
    lower.includes('find') ||
    lower.includes('search') ||
    lower.includes('piper') ||
    lower.includes('awr2944') ||
    lower.includes('memory')
  ) {
    const cleanTopic = query
      .replace(/find\s+(my\s+)?(last\s+)?decision(s)?\s+(about|on|for)\s+/i, '')
      .replace(/search\s+(for\s+)?/i, '')
      .replace(/\b(the|setup|please)\b/gi, ' ')
      .trim() || query;
    const searchRes = executeAiTool('search_knowledge_and_decisions', { query: cleanTopic }, snapshot);
    toolResults.push(searchRes);

    const hits = searchRes.data.matches || [];
    if (hits.length > 0) {
      for (const h of hits.slice(0, 5)) {
        verifiedFacts.push(`${h.citation}: ${h.excerpt}`);
      }
    } else {
      unknowns.push(
        `No saved decisions, notes, robotics logs, or permitted Neo memories matched "${cleanTopic}" in your current database.`
      );
      recommendations.push(
        'If you made this decision recently offline or verbally, log it in Projects -> Decisions Log or Robotics Lab -> Log Experiment so it becomes searchable.'
      );
    }

    return formatGroundedPayload({
      headline:
        hits.length > 0
          ? `Found ${hits.length} matching workspace record(s) for **"${cleanTopic}"**`
          : `No recorded match found for **"${cleanTopic}"**`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 4: Weekly Robotics Progress Report
  if (lower.includes('report') || lower.includes('robotics') || lower.includes('progress')) {
    const projRes = executeAiTool('query_projects', { project_id: projectScopeId }, snapshot);
    const knowRes = executeAiTool('search_knowledge_and_decisions', { query: 'PiPER Swarm AWR2944' }, snapshot);
    const taskRes = executeAiTool('query_tasks', { status: 'all', area: 'IvLabs' }, snapshot);
    toolResults.push(projRes, knowRes, taskRes);

    const robProjects = (projRes.data.projects || []).filter(
      (p: any) =>
        String(p.area || '').toLowerCase().includes('ivlabs') ||
        String(p.title || '').toLowerCase().includes('robot') ||
        p.id === projectScopeId
    );
    const robTasks = taskRes.data.tasks || [];
    const doneCount = robTasks.filter((t: any) => t.done).length;
    const openCount = robTasks.length - doneCount;

    verifiedFacts.push(`IvLabs tasks recorded: ${doneCount} completed, ${openCount} open.`);
    for (const p of robProjects) {
      verifiedFacts.push(`Project "${p.title}": status=${p.status}, logged progress=${p.progress}%.`);
    }
    if ((snapshot.robotics_records || []).length > 0) {
      verifiedFacts.push(`Robotics Lab experiment/hardware logs recorded: ${snapshot.robotics_records.length}.`);
      for (const r of snapshot.robotics_records.slice(0, 3)) {
        verifiedFacts.push(`[${r.project}] ${r.title} (${r.status})`);
      }
    } else {
      unknowns.push('Zero Robotics Lab experiment entries are persisted yet in Dexie `robotics_records`. Use Robotics Lab -> Log Experiment to record measured runs.');
    }
    unknowns.push('No automated ROS 2 telemetry stream or physical sensor bench logs are connected to the web database.');
    recommendations.push(
      'Log every bench run (CAN bitrate, firmware version, flight/test duration, pass/fail notes) in Robotics Lab before exporting stakeholder reports.'
    );

    return formatGroundedPayload({
      headline: `Grounded Robotics Progress Report (Generated ${todayISO})`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 5: Summarize Unfinished Work / Plan My Day (Default Executive Chief of Staff View)
  const taskRes = executeAiTool('query_tasks', { status: 'open', project_id: projectScopeId }, snapshot);
  const schedRes = executeAiTool('get_schedule_and_routine', { date: todayISO }, snapshot);
  const projRes = executeAiTool('query_projects', { project_id: projectScopeId }, snapshot);
  toolResults.push(taskRes, schedRes, projRes);

  const openTasks = taskRes.data.tasks || [];
  const overdue = openTasks.filter((t: any) => t.due_date && t.due_date < todayISO);
  const urgent = openTasks.filter((t: any) => t.priority === 'urgent' || t.priority === 'high');
  const meetings = schedRes.data.meetings || [];
  const events = schedRes.data.events || [];

  verifiedFacts.push(`Open tasks in workspace: ${openTasks.length} (${overdue.length} overdue, ${urgent.length} high/urgent priority).`);
  verifiedFacts.push(`Upcoming schedule entries from ${todayISO}: ${meetings.length} meeting(s), ${events.length} calendar event(s).`);

  if (overdue.length > 0) {
    verifiedFacts.push(`Overdue item(s): ${overdue.slice(0, 3).map((t: any) => `"${t.text}" (due ${t.due_date})`).join('; ')}.`);
  }
  if (urgent.length > 0) {
    verifiedFacts.push(`Top priority open tasks: ${urgent.slice(0, 4).map((t: any) => `"${t.text}" [${t.area}]`).join('; ')}.`);
  }

  const topActiveProjects = (projRes.data.projects || []).filter((p: any) => p.status === 'active');
  if (topActiveProjects.length > 0) {
    estimates.push(
      `Active project targets: ${topActiveProjects.map((p: any) => `${p.title} (${p.progress}%)`).join(' | ')}.`
    );
  }

  if (events.length === 0) {
    unknowns.push('No live Google Calendar events are loaded in Dexie yet; verify Google Workspace sync in Integrations if external meetings exist.');
  }

  if (urgent[0]) {
    recommendations.push(`Block your first deep-work slot today on: "${urgent[0].text}" (${urgent[0].area}).`);
  }
  if (overdue.length > 0) {
    recommendations.push(`Triage the ${overdue.length} overdue task(s) — complete, reschedule, or close them cleanly.`);
  }
  recommendations.push('Use Project Workspace or Quick Capture to log blockers before ending your day.');

  return formatGroundedPayload({
    headline: lower.includes('unfinished') || lower.includes('summary') || lower.includes('summarise')
      ? `Unfinished Work Summary (${openTasks.length} open task(s))`
      : `Daily Operating Brief for ${todayISO}`,
    verifiedFacts,
    estimates,
    recommendations,
    unknowns,
    toolResults,
    proposedActions,
  });
}

function formatGroundedPayload(params: {
  headline: string;
  verifiedFacts: string[];
  estimates: string[];
  recommendations: string[];
  unknowns: string[];
  toolResults: ToolExecutionResult[];
  proposedActions: ProposedActionPreview[];
}): GroundedResponsePayload {
  const citations = Array.from(new Set(params.toolResults.flatMap((t) => t.citations)));

  const lines: string[] = [params.headline, ''];
  if (params.verifiedFacts.length > 0) {
    lines.push('### Verified Facts (from your workspace records)');
    for (const f of params.verifiedFacts) lines.push(`- ${f}`);
    lines.push('');
  }
  if (params.estimates.length > 0) {
    lines.push('### Targets / Estimates (Unverified until completed)');
    for (const e of params.estimates) lines.push(`- ${e}`);
    lines.push('');
  }
  if (params.recommendations.length > 0) {
    lines.push('### Recommended Next Actions');
    for (const r of params.recommendations) lines.push(`- ${r}`);
    lines.push('');
  }
  if (params.unknowns.length > 0) {
    lines.push('### Unknowns / Missing Evidence');
    for (const u of params.unknowns) lines.push(`- ${u}`);
  }

  return {
    text: lines.join('\n').trim(),
    verified_facts: params.verifiedFacts,
    estimates: params.estimates,
    recommendations: params.recommendations,
    unknowns: params.unknowns,
    citations,
    tool_calls: params.toolResults.map((t) => ({ tool: t.tool, args: t.args, summary: t.summary })),
    proposed_actions: params.proposedActions,
  };
}
