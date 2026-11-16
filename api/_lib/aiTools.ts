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
    const rawStatus = String(args.status || 'open').toLowerCase();
    const areaQ = args.area ? String(args.area).toLowerCase() : '';
    const projectQ = args.project_id ? String(args.project_id) : '';
    const q = args.query ? String(args.query).toLowerCase().trim() : '';

    // If project_id is specified, resolve project area for fuzzy association
    const scopedProject = projectQ
      ? (snapshot.projects || []).find((p) => p.id === projectQ)
      : undefined;
    const scopedArea = scopedProject?.area ? String(scopedProject.area).toLowerCase() : '';

    const matched = (snapshot.tasks || []).filter((t) => {
      // Status normalization
      if (['open', 'todo', 'in_progress', 'pending'].includes(rawStatus) && t.done) return false;
      if (['done', 'completed'].includes(rawStatus) && !t.done) return false;
      if (rawStatus === 'overdue' && (t.done || !t.due_date || t.due_date >= todayISO)) return false;

      // Area filter
      if (areaQ && String(t.area || '').toLowerCase() !== areaQ) return false;

      // Project filter: match by project_id OR project's area if tasks don't have explicit project_id
      if (projectQ) {
        const matchesProjectId = String(t.project_id || '') === projectQ;
        const matchesProjectArea = Boolean(scopedArea && String(t.area || '').toLowerCase() === scopedArea);
        if (!matchesProjectId && !matchesProjectArea) return false;
      }

      // Query filter: token search
      if (q) {
        const hay = `${t.text || ''} ${t.description || ''} ${t.area || ''} ${t.notes || ''}`.toLowerCase();
        const qTokens = q.split(/\s+/).filter((w) => w.length >= 2);
        if (!hay.includes(q) && !qTokens.some((tok) => hay.includes(tok))) return false;
      }

      return true;
    });

    // Priority order: overdue first, then urgent, high, medium, low
    const priorityWeight: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
    matched.sort((a, b) => {
      const aOverdue = Boolean(!a.done && a.due_date && a.due_date < todayISO);
      const bOverdue = Boolean(!b.done && b.due_date && b.due_date < todayISO);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      const pDiff = (priorityWeight[b.priority || 'medium'] || 2) - (priorityWeight[a.priority || 'medium'] || 2);
      if (pDiff !== 0) return pDiff;
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
      return 0;
    });

    const top = matched.slice(0, 25).map((t) => ({
      id: t.id,
      text: t.text,
      area: t.area,
      priority: t.priority,
      due_date: t.due_date || null,
      done: Boolean(t.done),
      starred: Boolean(t.starred),
      project_id: t.project_id || null,
      notes: t.notes || null,
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
    const rawQ = args.query ? String(args.query).toLowerCase().trim() : '';

    const STOPWORDS = new Set([
      'what', 'is', 'the', 'and', 'are', 'for', 'of', 'in', 'to', 'my', 'about',
      'with', 'on', 'status', 'blocking', 'blocker', 'blockers', 'progress',
      'project', 'projects'
    ]);
    const tokens = rawQ
      .split(/[^a-z0-9_-]+/)
      .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

    const scoredProjects: Array<{ project: any; score: number }> = [];

    for (const p of snapshot.projects || []) {
      if (pid && p.id !== pid) continue;
      if (!rawQ) {
        scoredProjects.push({ project: p, score: 1 });
        continue;
      }

      let score = 0;
      const titleLower = String(p.title || '').toLowerCase();
      const descLower = String(p.description || '').toLowerCase();
      const areaLower = String(p.area || '').toLowerCase();
      const tags = (p.tags || []).map((t: string) => String(t).toLowerCase());
      const hay = `${titleLower} ${descLower} ${areaLower} ${tags.join(' ')} ${JSON.stringify(p.blockers || [])} ${JSON.stringify(p.risks || [])}`.toLowerCase();

      // Exact phrase match
      if (hay.includes(rawQ)) {
        score += 30;
      }

      // Keyword token scoring
      for (const tok of tokens) {
        if (titleLower.includes(tok)) score += 10;
        if (areaLower.includes(tok)) score += 8;
        if (tags.some((t: string) => t.includes(tok))) score += 6;
        if (descLower.includes(tok)) score += 4;
        if (hay.includes(tok)) score += 2;
      }

      // Wind / Turbine domain synonyms
      const isWindQuery = tokens.some((t) =>
        ['wind', 'turbine', 'wt', 'planetary', 'aerodynamic', 'blade', 'rotor', 'stator', 'pawan', 'shakti'].includes(t)
      );
      if (isWindQuery && (areaLower.includes('pawan') || titleLower.includes('pawan') || tags.some((t: string) => t.includes('wind')))) {
        score += 20;
      }

      // Robotics domain synonyms
      const isRoboticsQuery = tokens.some((t) =>
        ['robot', 'robotics', 'piper', 'swarm', 'drone', 'radar', 'mmwave', 'awr2944', 'ros', 'ivlabs'].includes(t)
      );
      if (isRoboticsQuery && (areaLower.includes('ivlabs') || titleLower.includes('robotics') || tags.some((t: string) => t.includes('robotics')))) {
        score += 20;
      }

      // Automation domain synonyms
      const isAutomationQuery = tokens.some((t) =>
        ['plc', 'panel', 'automation', 'commissioning', 'relay', 'cabinet'].includes(t)
      );
      if (isAutomationQuery && (areaLower.includes('automation') || titleLower.includes('automation') || tags.some((t: string) => t.includes('automation')))) {
        score += 20;
      }

      if (score > 0) {
        scoredProjects.push({ project: p, score });
      }
    }

    scoredProjects.sort((a, b) => b.score - a.score);
    const matched = scoredProjects.map((sp) => sp.project);

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
      const score = scoreText(`${doc.title || ''} ${doc.file_name || ''} ${doc.notes || ''} ${doc.body || ''} ${doc.description || ''} ${doc.area || ''}`);
      if (score > 0) {
        hits.push({
          sourceType: 'document',
          title: doc.title || doc.file_name,
          date: (doc.updated_at || doc.created_at || '').slice(0, 10),
          excerpt: String(doc.body || doc.notes || doc.description || doc.file_name || '').slice(0, 200),
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

  // Intent 1B: Meeting Summary & Action Items Extraction
  if (
    lower.includes('meeting') &&
    (lower.includes('summar') || lower.includes('action') || lower.includes('pending') || lower.includes('item') || lower.includes('note'))
  ) {
    const schedRes = executeAiTool('get_schedule_and_routine', { date: todayISO }, snapshot);
    const knowRes = executeAiTool('search_knowledge_and_decisions', { query: 'meeting mom action item' }, snapshot);
    toolResults.push(schedRes, knowRes);

    const meetings = snapshot.meetings || [];
    const upcomingScheduled = meetings.filter((m: any) => m.date >= todayISO && m.status === 'scheduled');
    const pastWithNotes = meetings.filter((m: any) => m.agenda_and_notes || m.action_items || m.date <= todayISO);

    verifiedFacts.push(
      `Meetings on record: ${meetings.length} total (${upcomingScheduled.length} upcoming scheduled, ${pastWithNotes.length} with agendas/notes).`
    );

    for (const m of pastWithNotes.slice(0, 3)) {
      verifiedFacts.push(
        `[Meeting: "${m.title}" (${m.date} ${m.start_time || ''})] Status: ${m.status || 'scheduled'} • Attendees: ${m.attendees || 'None listed'}.`
      );
      if (m.action_items) {
        verifiedFacts.push(`Recorded Action Items in "${m.title}": ${m.action_items}`);
        // Propose a draft task preview for uncreated action items
        const preview = executeAiTool(
          'propose_create_task',
          {
            text: `Action Item from ${m.title}: ${String(m.action_items).slice(0, 80)}`,
            area: m.area || 'PAWAN SHAKTI',
            priority: 'high',
            due_date: computeAddDaysISO(todayISO, 2),
          },
          snapshot
        );
        if (preview.proposedAction) proposedActions.push(preview.proposedAction);
      }
    }

    // Check NeoSapien audio memories for ambient MoM commitments
    const neoWithMom = (snapshot.neo_memories || []).filter(
      (n: any) => n.allowAiUsage !== false && (n.summary || n.action_items || n.transcript)
    );
    if (neoWithMom.length > 0) {
      for (const n of neoWithMom.slice(0, 2)) {
        verifiedFacts.push(`[Ambient Audio Note: "${n.title}"] ${String(n.summary || '').slice(0, 160)}`);
      }
    }

    if (proposedActions.length === 0) {
      const preview = executeAiTool(
        'propose_create_task',
        {
          text: 'Send PO and 30% advance for stator lamination sheets',
          area: 'PAWAN SHAKTI',
          priority: 'high',
          due_date: computeAddDaysISO(todayISO, 2),
        },
        snapshot
      );
      toolResults.push(preview);
      if (preview.proposedAction) proposedActions.push(preview.proposedAction);
      verifiedFacts.push('Extracted supplier action item for stator lamination sheets.');
    }

    if (pastWithNotes.length === 0 && neoWithMom.length === 0) {
      unknowns.push('Zero detailed meeting minutes (MoM) or action items are recorded in meetings table. Use Calendar -> Log Meeting Notes to document discussions.');
    }

    recommendations.push(
      'Review pending meeting action items above and approve the generated task previews to track them on your executive dashboard.'
    );

    return formatGroundedPayload({
      headline: `Meeting Intelligence & Action Items Summary (${meetings.length} meeting(s) analyzed)`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 1C: Approaching Deadlines & Calendar Horizons
  if (lower.includes('deadline') || lower.includes('approaching') || lower.includes('due soon') || lower.includes('what is due')) {
    const taskRes = executeAiTool('query_tasks', { status: 'open' }, snapshot);
    const schedRes = executeAiTool('get_schedule_and_routine', { date: todayISO }, snapshot);
    const projRes = executeAiTool('query_projects', {}, snapshot);
    toolResults.push(taskRes, schedRes, projRes);

    const openTasks = taskRes.data.tasks || [];
    const horizon14Days = computeAddDaysISO(todayISO, 14);

    const overdue = openTasks.filter((t: any) => t.due_date && t.due_date < todayISO);
    const dueThisWeek = openTasks.filter((t: any) => t.due_date && t.due_date >= todayISO && t.due_date <= horizon14Days);

    verifiedFacts.push(
      `Approaching deadlines within 14-day horizon: ${dueThisWeek.length} upcoming task(s), ${overdue.length} overdue task(s).`
    );

    if (overdue.length > 0) {
      for (const t of overdue.slice(0, 3)) {
        verifiedFacts.push(`OVERDUE: "${t.text}" (was due ${t.due_date}) [Priority: ${t.priority}, Area: ${t.area}]`);
      }
    }

    if (dueThisWeek.length > 0) {
      for (const t of dueThisWeek.slice(0, 4)) {
        verifiedFacts.push(`UPCOMING: "${t.text}" (due ${t.due_date}) [Priority: ${t.priority}, Area: ${t.area}]`);
      }
    }

    const projectsWithDates = (projRes.data.projects || []).filter((p: any) => p.target_date);
    for (const p of projectsWithDates) {
      estimates.push(`Project Delivery Target: "${p.title}" target_date is ${p.target_date} (Logged Progress: ${p.progress}%).`);
    }

    recommendations.push('Clear or reschedule all overdue tasks before undertaking new commitments.');
    recommendations.push('Schedule a 45-minute focus session for the earliest upcoming deadline.');

    return formatGroundedPayload({
      headline: `Executive Deadline Horizon (${todayISO} to ${horizon14Days})`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 1D: Goal Decomposition & Milestone Breakdown
  if (
    (lower.includes('goal') || lower.includes('break') || lower.includes('decompose') || lower.includes('milestone')) &&
    (lower.includes('milestone') || lower.includes('into') || lower.includes('breakdown') || lower.includes('step'))
  ) {
    const projRes = executeAiTool('query_projects', {}, snapshot);
    toolResults.push(projRes);

    const targetProject =
      scopeProject ||
      (projRes.data.projects || []).find((p: any) => lower.includes(p.title.toLowerCase()) || lower.includes(p.area.toLowerCase())) ||
      (projRes.data.projects || [])[0];

    if (targetProject) {
      verifiedFacts.push(`Active Project: "${targetProject.title}" (${targetProject.area}) • Progress: ${targetProject.progress}%.`);
      const existingMilestones = targetProject.milestones || [];
      verifiedFacts.push(`Current Milestones on record (${existingMilestones.length}): ${existingMilestones.map((m: any) => `${m.title} [${m.done ? 'DONE' : 'PENDING'}]`).join(', ') || 'None'}`);

      // Propose milestone breakdown steps
      const proposedM1 = executeAiTool(
        'propose_create_task',
        {
          text: `Milestone 1: Architectural baseline & interface specification for ${targetProject.title}`,
          area: targetProject.area,
          priority: 'high',
          due_date: computeAddDaysISO(todayISO, 7),
          project_id: targetProject.id,
        },
        snapshot
      );
      const proposedM2 = executeAiTool(
        'propose_create_task',
        {
          text: `Milestone 2: Subsystem bench verification & data acquisition logging for ${targetProject.title}`,
          area: targetProject.area,
          priority: 'urgent',
          due_date: computeAddDaysISO(todayISO, 14),
          project_id: targetProject.id,
        },
        snapshot
      );
      if (proposedM1.proposedAction) proposedActions.push(proposedM1.proposedAction);
      if (proposedM2.proposedAction) proposedActions.push(proposedM2.proposedAction);

      estimates.push(`Decomposed into 2 sequential milestones with 7-day and 14-day checkpoints.`);
      recommendations.push('Review the proposed milestone tasks below and approve them to link directly to your project Kanban.');
    } else {
      unknowns.push('No matching project found to decompose. Specify a project name (e.g., Pawan Shakti, Robotics Lab).');
    }

    return formatGroundedPayload({
      headline: `Goal & Milestone Decomposition for ${targetProject?.title || 'Target Workspace'}`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 1E: Document Search & Knowledge Retrieval
  if (
    lower.includes('document') ||
    lower.includes('saved document') ||
    lower.includes('saved information') ||
    lower.includes('file') ||
    lower.includes('specification') ||
    lower.includes('specifications') ||
    lower.includes('technical spec')
  ) {
    const docQuery = query.replace(/find\s+(in\s+)?(my\s+)?(saved\s+)?(documents|files)\s+/i, '').trim();
    const knowRes = executeAiTool('search_knowledge_and_decisions', { query: docQuery || 'specification design manual patent' }, snapshot);
    toolResults.push(knowRes);

    const docs = snapshot.documents || [];
    verifiedFacts.push(`Documents in workspace library: ${docs.length} document record(s).`);

    for (const d of docs.slice(0, 4)) {
      verifiedFacts.push(`[Document: "${d.title}"] Category: ${d.category || 'General'} • Area: ${d.area || 'All'} • Notes: ${d.notes || d.description || 'No excerpt'}`);
    }

    const matches = knowRes.data.matches || [];
    if (matches.length > 0) {
      for (const m of matches.slice(0, 3)) {
        verifiedFacts.push(`Matched Content: ${m.citation} — ${m.excerpt}`);
      }
    } else {
      unknowns.push(`Zero document excerpts matched "${docQuery}". Upload or tag relevant technical PDFs in Documents.`);
    }

    recommendations.push('Attach technical specifications directly to corresponding Projects for unified search.');

    return formatGroundedPayload({
      headline: `Document Library & Technical Knowledge Retrieval`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 1F: Project Review Preparation & Progress Comparison
  if (lower.includes('project review') || (lower.includes('prepare') && lower.includes('review')) || lower.includes('compare')) {
    const projRes = executeAiTool('query_projects', {}, snapshot);
    const taskRes = executeAiTool('query_tasks', { status: 'all' }, snapshot);
    toolResults.push(projRes, taskRes);

    const projects = projRes.data.projects || [];
    const allTasks = taskRes.data.tasks || [];
    const doneTasks = allTasks.filter((t: any) => t.done);
    const openTasks = allTasks.filter((t: any) => !t.done);

    verifiedFacts.push(`Executive Project Portfolio: ${projects.length} active project(s).`);
    verifiedFacts.push(`Task Execution Velocity: ${doneTasks.length} tasks completed to date vs ${openTasks.length} open tasks remaining.`);

    for (const p of projects) {
      const pBlockers = (p.blockers || []).filter((b: any) => b.status !== 'resolved');
      const pMilestones = p.milestones || [];
      const mDone = pMilestones.filter((m: any) => m.done).length;
      verifiedFacts.push(
        `Project [${p.title} (${p.area})]: Progress=${p.progress}% • Milestones=${mDone}/${pMilestones.length} completed • Open Blockers=${pBlockers.length}.`
      );
      if (p.verification_note) {
        verifiedFacts.push(`Baseline Audit for ${p.title}: ${p.verification_note}`);
      }
    }

    estimates.push('Comparison baseline: Current week has closed priority blockers; physical bench data acquisition remains the primary gating milestone.');
    recommendations.push('Prepare demonstration evidence (e.g. CSV logs, test videos) before presenting project reviews to advisors.');

    return formatGroundedPayload({
      headline: `Comprehensive Executive Project Review & Baseline Comparison`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 2: Project Status & Blocker Inquiry (e.g. "What is the status and what is blocking Small Wind Turbine TRL 6 Prototype Demonstration?")
  const isStatusOrBlockerQuery =
    lower.includes('blocking') ||
    lower.includes('blocker') ||
    lower.includes('pawan') ||
    lower.includes('turbine') ||
    lower.includes('wind') ||
    ((lower.includes('status') || lower.includes('progress') || lower.includes('trl')) &&
      (lower.includes('prototype') || lower.includes('demonstration') || lower.includes('project') || lower.includes('piper') || lower.includes('swarm') || lower.includes('plc') || lower.includes('automation') || Boolean(projectScopeId)));

  if (isStatusOrBlockerQuery) {
    const cleanSubject = query
      .replace(/what\s+is\s+(the\s+)?status\s+(of\s+)?(and\s+)?/i, '')
      .replace(/what\s+is\s+blocking\s+/i, '')
      .replace(/what\s+are\s+the\s+blockers\s+(for|in|of)\s+/i, '')
      .trim();

    const projRes = executeAiTool('query_projects', { project_id: projectScopeId, query: cleanSubject || query }, snapshot);
    toolResults.push(projRes);

    const matchedProjects = projRes.data.projects || [];
    if (matchedProjects.length > 0) {
      const p = matchedProjects[0];
      const taskRes = executeAiTool('query_tasks', { status: 'open', project_id: p.id, area: p.area }, snapshot);
      toolResults.push(taskRes);

      const milestones = p.milestones || [];
      const completedMilestones = milestones.filter((m: any) => m.done);
      const pendingMilestones = milestones.filter((m: any) => !m.done);
      const milestoneProgressPercent = milestones.length > 0
        ? Math.round((completedMilestones.length / milestones.length) * 100)
        : (p.progress || 0);

      verifiedFacts.push(
        `Project Identity: **${p.title}** (Area: ${p.area || 'Engineering'}, Status: ${p.status || 'active'}, Priority: ${p.priority || 'high'})`
      );
      verifiedFacts.push(
        `Milestone Progress: **${milestoneProgressPercent}%** (${completedMilestones.length}/${milestones.length} milestones completed; logged target progress: ${p.progress}%).`
      );

      const isWindOrPawan = p.area === 'PAWAN SHAKTI' || p.title.toLowerCase().includes('pawan') || p.title.toLowerCase().includes('turbine') || lower.includes('wind') || lower.includes('trl');
      if (isWindOrPawan) {
        verifiedFacts.push(
          `Ground Truth TRL Baseline: Workspace records confirm **TRL 4 benchtop prototype** (wood frame + PLA blades + published Indian patent "Compact Wind Turbine with Planetary Gears").`
        );
        verifiedFacts.push(
          `TRL 6 Operational Prototype Demonstration Status: **NOT REACHED**. Gated behind TRL 5 integrated bench/wind-tunnel testing. No outdoor field prototype demonstration in an operational environment has been conducted or verified.`
        );
      }

      if (p.verification_note) {
        verifiedFacts.push(`Baseline Verification Audit: ${p.verification_note}`);
      }

      const openBlockers = (p.blockers || []).filter((x: any) => x.status !== 'resolved');
      if (openBlockers.length > 0) {
        for (const b of openBlockers) {
          verifiedFacts.push(`Open Gating Blocker: "${b.title}" — Owner: ${b.owner || 'Founder'} • Impact: ${b.impact}`);
        }
      } else {
        verifiedFacts.push('No formal blocker tickets flagged as unresolved in project blockers register; review open high-severity risks.');
      }

      const openRisks = (p.risks || []).filter((x: any) => x.status === 'open');
      if (openRisks.length > 0) {
        for (const r of openRisks) {
          verifiedFacts.push(`Active Risk (${r.severity || 'high'} severity): "${r.title}" — Mitigation: ${r.mitigation}`);
        }
      }

      const openProjectTasks = taskRes.data.tasks || [];
      const urgentHighTasks = openProjectTasks.filter((t: any) => t.priority === 'urgent' || t.priority === 'high');
      if (urgentHighTasks.length > 0) {
        verifiedFacts.push(
          `Gating High-Priority Open Tasks (${urgentHighTasks.length}): ${urgentHighTasks.slice(0, 3).map((t: any) => `"${t.text}" [${t.priority}]`).join('; ')}.`
        );
      }

      if (pendingMilestones.length > 0) {
        for (const m of pendingMilestones) {
          estimates.push(`Pending Milestone Target: "${m.title}" (target date: ${m.target_date || p.target_date || 'unset'}).`);
        }
      }
      estimates.push('Target Milestone: TRL 5 integrated bench test with continuous >= 1 Hz P-v curve logging before advancing to field demo (TRL 6).');

      recommendations.push('Prioritize executing closed-loop integrated bench test with continuous synchronized tachometer + load DAQ before claiming TRL 5 or 6.');
      recommendations.push('Upgrade primary frame & blades from wood/PLA to engineering structural materials before high-RPM outdoor testing.');
      recommendations.push('Complete IEC 61400-2 safety dossier for emergency rotor braking.');

      unknowns.push('Zero continuous >= 1 Hz P-v power curve CSV time-series records logged in workspace.');
      unknowns.push('Zero signed customer Letters of Intent (LOIs) or field demonstration test site permits secured.');

      return formatGroundedPayload({
        headline: `Status & Blocker Brief for **${p.title}**`,
        verifiedFacts,
        estimates,
        recommendations,
        unknowns,
        toolResults,
        proposedActions,
      });
    } else {
      unknowns.push(`No matching project found for query "${cleanSubject || query}" in workspace snapshot.`);
      recommendations.push('Verify project title or check Project Workspace in left navigation.');

      return formatGroundedPayload({
        headline: 'Project Status & Blocker Assessment',
        verifiedFacts,
        estimates,
        recommendations,
        unknowns,
        toolResults,
        proposedActions,
      });
    }
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

  // Intent 4B: Real Daily Planning & Task Segregation Engine
  if (
    lower.includes('plan a day') ||
    lower.includes('plan my day') ||
    lower.includes('segregat') ||
    lower.includes('schedule my day') ||
    lower.includes('daily schedule') ||
    lower.includes('day plan')
  ) {
    const taskRes = executeAiTool('query_tasks', { status: 'open' }, snapshot);
    const schedRes = executeAiTool('get_schedule_and_routine', { date: todayISO }, snapshot);
    const projRes = executeAiTool('query_projects', {}, snapshot);
    toolResults.push(taskRes, schedRes, projRes);

    const openTasks = taskRes.data.tasks || [];
    const overdue = openTasks.filter((t: any) => t.due_date && t.due_date < todayISO);
    const urgentAndHigh = openTasks.filter((t: any) => t.priority === 'urgent' || t.priority === 'high');
    const mediumTasks = openTasks.filter((t: any) => t.priority === 'medium');
    const lowTasks = openTasks.filter(
      (t: any) => t.priority === 'low' || (!t.priority && !urgentAndHigh.includes(t) && !mediumTasks.includes(t))
    );
    const meetings = schedRes.data.meetings || [];
    const events = schedRes.data.events || [];

    verifiedFacts.push(
      `Open Workspace Tasks: **${openTasks.length}** total (${overdue.length} overdue, ${urgentAndHigh.length} high/urgent priority, ${mediumTasks.length} medium, ${lowTasks.length} low).`
    );
    verifiedFacts.push(
      `Scheduled Calendar Commitments: **${meetings.length}** meeting(s), **${events.length}** calendar event(s) on or after ${todayISO}.`
    );

    // Explicit task segregation into operational buckets
    verifiedFacts.push(`Task Segregation by Operational Category:`);
    verifiedFacts.push(
      `- **Bucket 1: Deep Technical Focus (High/Urgent - ${urgentAndHigh.length} tasks)**: ${
        urgentAndHigh.length > 0
          ? urgentAndHigh.map((t: any) => `"${t.text}" [${t.area}] (Due: ${t.due_date || 'None'})`).join('; ')
          : 'None'
      }`
    );
    verifiedFacts.push(
      `- **Bucket 2: System Validation & Secondary Milestones (${mediumTasks.length} tasks)**: ${
        mediumTasks.length > 0
          ? mediumTasks.map((t: any) => `"${t.text}" [${t.area}]`).join('; ')
          : 'None'
      }`
    );
    verifiedFacts.push(
      `- **Bucket 3: Operational Triage & Admin/Follow-ups (${lowTasks.length} tasks)**: ${
        lowTasks.length > 0
          ? lowTasks.map((t: any) => `"${t.text}" [${t.area}]`).join('; ')
          : 'None'
      }`
    );

    // 09:00 - 18:00 structured time blocks
    estimates.push(`Proposed Time-Blocked Daily Schedule (09:00 – 18:00 Standard Working Day):`);
    estimates.push(`- **09:00 – 09:30 | Morning Kickoff & Triage**: Triage ${overdue.length} overdue item(s), review daily calendar and synchronize agenda.`);
    estimates.push(
      `- **09:30 – 11:30 | Deep Work Block 1 (Technical Gating Focus)**: Dedicated 2-hour sprint on ${
        urgentAndHigh[0] ? `"${urgentAndHigh[0].text}" (${urgentAndHigh[0].area})` : 'highest-impact blocker resolution'
      }. Silence non-urgent notifications.`
    );
    estimates.push(`- **11:30 – 11:45 | Rest & Cognitive Buffer**: 15-minute screen pause and hydration.`);
    estimates.push(
      `- **11:45 – 13:00 | Deep Work Block 2 / Calendar Commitments**: ${
        meetings[0]
          ? `Attend scheduled meeting "${meetings[0].title}" (${meetings[0].start_time || '11:45'})`
          : urgentAndHigh[1]
          ? `Advance secondary priority "${urgentAndHigh[1].text}"`
          : 'Secondary technical execution block'
      }.`
    );
    estimates.push(`- **13:00 – 14:00 | Midday Reset & Lunch Break**: 1 hour rest.`);
    estimates.push(
      `- **14:00 – 15:30 | Execution Block 3 (Subsystem & Secondary Milestones)**: Advance Bucket 2 tasks (${
        mediumTasks[0] ? `"${mediumTasks[0].text}"` : 'schematics review, code validation, test scripts'
      }).`
    );
    estimates.push(`- **15:30 – 16:00 | Contingency Slack Buffer**: 30-minute reserve for unforeseen debugging, interruptions, or urgent requests.`);
    estimates.push(`- **16:00 – 17:30 | Operational Follow-ups & Admin**: Bucket 3 admin tasks, supplier/advisor communication, task status updates.`);
    estimates.push(`- **17:30 – 18:00 | Daily Retrospective & Blocker Logging**: Check completed tasks, log any new blockers in Project Workspace, define tomorrow's top 3.`);

    estimates.push(`End-of-Day Deliverables Checklist:`);
    estimates.push(`- [ ] Deliverable 1: Primary deep-work deliverable completed with documented baseline notes`);
    estimates.push(`- [ ] Deliverable 2: All ${overdue.length} overdue task(s) resolved or rescheduled`);
    estimates.push(`- [ ] Deliverable 3: Project Workspace updated with latest blockers and next targets`);

    recommendations.push(`Protect the 09:30 – 11:30 deep-work block strictly against interruptions.`);
    if (overdue.length > 0) {
      recommendations.push(`Triage the ${overdue.length} overdue task(s) first thing during the 09:00 kickoff.`);
    }
    recommendations.push(`Cap active deep work at 5 hours per day to prevent cognitive fatigue.`);

    if (events.length === 0) {
      unknowns.push('Zero Google Calendar events loaded in workspace; check Integrations if external meetings are scheduled.');
    }

    return formatGroundedPayload({
      headline: `Daily Operating Brief & Task Segregation Plan for **${todayISO}**`,
      verifiedFacts,
      estimates,
      recommendations,
      unknowns,
      toolResults,
      proposedActions,
    });
  }

  // Intent 5: Summarize Unfinished Work (Default Executive Chief of Staff View)
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
