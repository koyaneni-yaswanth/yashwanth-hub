/**
 * Client-Side Companion Orchestrator for PROJECT JARVIS 4.0 (/buddy)
 * Unifies:
 * - Long-term companion memory (IndexedDB + Supabase /api/buddy + secret scrubbing)
 * - Proactive client/server checks (quiet hours + dedup + morning/evening/weekly briefings)
 * - 7 Specialized agents + smart complexity/cost routing
 * - Tiered execution (Tier 1 Auto, Tier 2 Human Approval, Tier 3 Blocked)
 * - Activity Timeline persistence
 */
import { db } from '../../db';
import { getSupabaseClient } from '../../lib/supabase';
import { generateId, getTodayISO, toDueKey } from '../../lib/utils';
import { beginAiThinking, endAiThinking } from '../../lib/aiActivity';
import { DEFAULT_COMPANION_SETTINGS, buildJarvisSystemPrompt } from '../../lib/companionIdentity';
import { containsSensitiveSecret, redactSensitiveSecrets } from '../../lib/companionSecurity';
import {
  extractCandidateMemories,
  reconcileCandidateMemory,
  selectRelevantMemories,
} from '../../lib/memoryExtractor';
import { evaluateProactiveNotification, isScheduledBriefingDue } from '../../lib/notificationPolicy';
import {
  classifyCompanionActionTier,
  selectCompanionAgent,
} from '../../lib/companionAgents';
import { AWARENESS_PLATFORMS, summarizeHonestAwareness, type CredentialStatusItem } from '../../lib/awarenessCore';
import { saveSyncedPreference, reconcileCompanionTables } from '../sync/extraCloudSync';
import { AIGateway } from '../ai/aiGateway';
import type {
  AwarenessSourceRecord,
  BuddyAgentRole,
  CompanionMemoryCategory,
  CompanionMemoryRecord,
  CompanionTimelineItem,
  JarvisCompanionSettings,
  AIChatMessage,
} from '../../types';

const SETTINGS_KEY = 'jarvis_companion_settings_v1';
const AWARENESS_CACHE_KEY = 'jarvis_awareness_sources_v1';
const BUDDY_THREAD_ID = 'jarvis-buddy-primary-thread';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const client = getSupabaseClient();
  if (!client) return { 'Content-Type': 'application/json' };
  const res = await client.auth.getSession().catch(() => null);
  const token = res?.data?.session?.access_token;
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

export class CompanionService {
  public static async loadSettings(): Promise<JarvisCompanionSettings> {
    try {
      const row = await db.settings.get(SETTINGS_KEY);
      if (row?.value && typeof row.value === 'object') {
        return {
          ...DEFAULT_COMPANION_SETTINGS,
          ...(row.value as Partial<JarvisCompanionSettings>),
        };
      }
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_COMPANION_SETTINGS };
  }

  public static async saveSettings(next: Partial<JarvisCompanionSettings>): Promise<JarvisCompanionSettings> {
    const current = await this.loadSettings();
    const merged: JarvisCompanionSettings = {
      ...current,
      ...next,
      updated_at: new Date().toISOString(),
    };
    await saveSyncedPreference(SETTINGS_KEY, merged, merged.updated_at);
    return merged;
  }

  public static async loadMemories(): Promise<CompanionMemoryRecord[]> {
    const all = await db.companion_memories.toArray().catch(() => []);
    return all
      .filter((m) => m.status !== 'archived')
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  }

  public static async loadTimeline(limit = 60): Promise<CompanionTimelineItem[]> {
    const all = await db.companion_timeline.toArray().catch(() => []);
    return all
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, limit);
  }

  public static async loadCachedAwareness(): Promise<AwarenessSourceRecord[]> {
    try {
      const row = await db.settings.get(AWARENESS_CACHE_KEY);
      if (Array.isArray(row?.value) && row.value.length > 0) {
        return row.value as AwarenessSourceRecord[];
      }
    } catch {
      /* ignore */
    }
    const now = new Date().toISOString();
    return AWARENESS_PLATFORMS.map((p) => ({
      id: p.id,
      status: p.id === 'workspace_hub' ? 'connected' : 'not_configured',
      enabled: p.id === 'workspace_hub',
      poll_interval_minutes: p.defaultIntervalMinutes,
      latest_summary: p.requiredCredentialsHint,
      updated_at: now,
    }));
  }

  public static async loadConversationHistory(): Promise<AIChatMessage[]> {
    const conv = await db.ai_conversations.get(BUDDY_THREAD_ID).catch(() => null);
    if (conv?.messages?.length) return conv.messages;
    return [];
  }

  public static async saveConversationMessages(messages: AIChatMessage[], activeAgent: BuddyAgentRole): Promise<void> {
    const now = new Date().toISOString();
    await db.ai_conversations.put({
      id: BUDDY_THREAD_ID,
      title: 'JARVIS Companion',
      agent_id: activeAgent,
      mode: 'personal',
      messages: messages.slice(-60),
      total_tokens: 0,
      total_cost_usd: 0,
      created_at: now,
      updated_at: now,
    });
  }

  public static async syncOverview(): Promise<{
    authenticated: boolean;
    memories: CompanionMemoryRecord[];
    timeline: CompanionTimelineItem[];
    awarenessSources: AwarenessSourceRecord[];
    credentials: CredentialStatusItem[];
    settings: JarvisCompanionSettings;
  }> {
    const client = getSupabaseClient();
    const session = client ? await client.auth.getSession().catch(() => null) : null;
    const userId = session?.data?.session?.user?.id;

    if (client && userId) {
      await reconcileCompanionTables(client, userId).catch(() => {});
    }

    const headers = await getAuthHeaders();
    try {
      const res = await fetch('/api/buddy?action=overview', { headers, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.awarenessSources) && data.awarenessSources.length > 0) {
          await db.settings.put({
            key: AWARENESS_CACHE_KEY,
            value: data.awarenessSources,
            updated_at: new Date().toISOString(),
          });
        }
        if (Array.isArray(data.memories)) {
          for (const m of data.memories) await db.companion_memories.put(m).catch(() => {});
        }
        if (Array.isArray(data.timeline)) {
          for (const t of data.timeline) await db.companion_timeline.put(t).catch(() => {});
        }
        const [memories, timeline, awarenessSources, settings] = await Promise.all([
          this.loadMemories(),
          this.loadTimeline(),
          this.loadCachedAwareness(),
          this.loadSettings(),
        ]);
        return {
          authenticated: Boolean(data.authenticated),
          memories,
          timeline,
          awarenessSources,
          credentials: Array.isArray(data.credentials) ? data.credentials : [],
          settings,
        };
      }
    } catch {
      /* fallback cleanly to local-first store */
    }

    const [memories, timeline, awarenessSources, settings] = await Promise.all([
      this.loadMemories(),
      this.loadTimeline(),
      this.loadCachedAwareness(),
      this.loadSettings(),
    ]);
    return {
      authenticated: Boolean(userId),
      memories,
      timeline,
      awarenessSources,
      credentials: [],
      settings,
    };
  }

  public static async refreshAwareness(): Promise<{
    sources: AwarenessSourceRecord[];
    observationsCreated: CompanionTimelineItem[];
    error?: string;
  }> {
    const headers = await getAuthHeaders();
    try {
      const res = await fetch('/api/buddy?action=awareness_refresh', {
        method: 'POST',
        headers,
        body: '{}',
        signal: AbortSignal.timeout(9000),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.sources)) {
        await db.settings.put({
          key: AWARENESS_CACHE_KEY,
          value: data.sources,
          updated_at: new Date().toISOString(),
        });
        for (const item of data.observationsCreated || []) {
          await db.companion_timeline.put(item).catch(() => {});
        }
        return { sources: data.sources, observationsCreated: data.observationsCreated || [] };
      }
      if (res.status === 401) {
        return {
          sources: await this.loadCachedAwareness(),
          observationsCreated: [],
          error: 'Sign in with Supabase to persist live cloud awareness cursors.',
        };
      }
      return {
        sources: await this.loadCachedAwareness(),
        observationsCreated: [],
        error: data?.error || 'Could not reach awareness endpoint.',
      };
    } catch (err: any) {
      return {
        sources: await this.loadCachedAwareness(),
        observationsCreated: [],
        error: err?.message || 'Offline — using cached awareness state.',
      };
    }
  }

  public static async saveMemory(input: {
    id?: string;
    category: CompanionMemoryCategory;
    title: string;
    content: string;
    project?: string;
    importance?: number;
    durability?: 'long_term' | 'temporary';
    verified_by_user?: boolean;
    source?: CompanionMemoryRecord['source'];
    contradicts_id?: string;
    tags?: string[];
  }): Promise<{ saved: CompanionMemoryRecord | null; error?: string }> {
    if (containsSensitiveSecret(input.content) || containsSensitiveSecret(input.title)) {
      const redacted = redactSensitiveSecrets(input.content).redacted;
      if (redacted.includes('[REDACTED')) {
        return {
          saved: null,
          error: 'Secrets, passwords, API keys, and tokens cannot be saved into JARVIS memory.',
        };
      }
    }

    const now = new Date().toISOString();
    const record: CompanionMemoryRecord = {
      id: input.id || generateId(),
      category: input.category,
      title: input.title.trim().slice(0, 180),
      content: input.content.trim().slice(0, 1500),
      source: input.source || 'manual',
      project: input.project,
      importance: Math.min(10, Math.max(1, input.importance ?? 7)),
      confidence: input.verified_by_user ? 1.0 : 0.85,
      durability: input.durability || 'long_term',
      verified_by_user: Boolean(input.verified_by_user),
      contradicts_id: input.contradicts_id,
      status: 'active',
      tags: input.tags || [input.category],
      created_at: now,
      updated_at: now,
    };

    if (record.contradicts_id) {
      await db.companion_memories.update(record.contradicts_id, {
        status: 'superseded',
        updated_at: now,
      }).catch(() => {});
    }

    await db.companion_memories.put(record);
    await this.recordLocalTimeline({
      kind: 'learned_memory',
      source: record.source,
      project: record.project,
      title: `Memory saved: ${record.title}`,
      summary: `[${record.category}] ${record.content.slice(0, 180)}`,
      importance: record.importance >= 8 ? 'high' : 'normal',
      status: 'recorded',
      metadata: { memoryId: record.id },
    });

    // Best-effort cloud sync + pgvector embedding
    try {
      const headers = await getAuthHeaders();
      if (headers.Authorization) {
        await fetch('/api/buddy?action=memory', {
          method: 'POST',
          headers,
          body: JSON.stringify(record),
        });
      }
    } catch {
      /* offline-safe */
    }

    return { saved: record };
  }

  public static async deleteMemory(id: string): Promise<void> {
    await db.companion_memories.delete(id);
    try {
      const headers = await getAuthHeaders();
      if (headers.Authorization) {
        await fetch('/api/buddy?action=memory', {
          method: 'POST',
          headers,
          body: JSON.stringify({ op: 'delete', id }),
        });
      }
    } catch {
      /* ignore */
    }
  }

  public static async recordLocalTimeline(
    item: Omit<CompanionTimelineItem, 'id' | 'created_at' | 'updated_at'> & { id?: string }
  ): Promise<CompanionTimelineItem> {
    const now = new Date().toISOString();
    const row: CompanionTimelineItem = {
      id: item.id || generateId(),
      kind: item.kind,
      source: item.source || 'jarvis',
      agent_id: item.agent_id,
      project: item.project,
      title: item.title,
      summary: item.summary,
      importance: item.importance || 'normal',
      status: item.status || 'recorded',
      action_url: item.action_url,
      metadata: item.metadata || {},
      created_at: now,
      updated_at: now,
    };
    await db.companion_timeline.put(row).catch(() => {});
    return row;
  }

  public static async evaluateLocalProactiveStatus(): Promise<{
    topInsight: { title: string; detail: string; kind: 'critical' | 'attention' | 'briefing' | 'clear'; ctaTool?: string };
    newAlerts: CompanionTimelineItem[];
  }> {
    const [tasks, projects, goals, settings, timeline] = await Promise.all([
      db.tasks.toArray().catch(() => []),
      db.projects.toArray().catch(() => []),
      db.goals.toArray().catch(() => []),
      this.loadSettings(),
      this.loadTimeline(40),
    ]);

    const today = getTodayISO();
    const openTasks = tasks.filter((t) => !t.done);
    const overdue = openTasks.filter((t) => {
      const k = toDueKey(t.due_date);
      return Boolean(k && k < today);
    });
    const dueToday = openTasks.filter((t) => toDueKey(t.due_date) === today);
    const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planning');
    const now = new Date();
    const newAlerts: CompanionTimelineItem[] = [];

    // Check morning/evening/weekly scheduled briefing
    const cadences: Array<{ key: 'morning' | 'evening' | 'weekly'; time: string; title: string }> = [
      { key: 'morning', time: settings.morningBriefingTime, title: 'Morning Briefing' },
      { key: 'evening', time: settings.eveningBriefingTime, title: 'Evening Wrap-Up' },
      { key: 'weekly', time: settings.weeklyReviewTime, title: 'Weekly Review' },
    ];

    for (const c of cadences) {
      const last = timeline.find((t) => t.metadata?.briefingCadence === c.key)?.created_at || null;
      if (
        settings.proactiveEnabled &&
        isScheduledBriefingDue({
          cadence: c.key,
          scheduleTimeHHmm: c.time,
          weeklyDay: settings.weeklyReviewDay,
          lastSentAt: last,
          now,
        })
      ) {
        const policy = evaluateProactiveNotification(
          {
            dedupKey: `brief_${c.key}_${today}`,
            title: `${c.title} (${today})`,
            summary: `${dueToday.length} due today, ${overdue.length} overdue across ${activeProjects.length} active projects.`,
            importanceScore: 7,
            severity: overdue.length > 0 ? 'high' : 'normal',
            source: 'jarvis',
          },
          { settings, recentTimeline: timeline, now }
        );
        if (policy.decision === 'deliver_now') {
          const item = await this.recordLocalTimeline({
            kind: 'recommendation',
            source: 'jarvis',
            agent_id: 'executive',
            title: `${c.title} (${today})`,
            summary: `${dueToday.length} task(s) due today · ${overdue.length} overdue · ${goals.filter((g) => g.status === 'active').length} active goals.`,
            importance: overdue.length > 0 ? 'high' : 'normal',
            status: 'recorded',
            metadata: { briefingCadence: c.key, dedupKey: `brief_${c.key}_${today}` },
          });
          newAlerts.push(item);
        }
        break;
      }
    }

    const pendingApprovals = timeline.filter((t) => t.kind === 'pending_approval' && t.status === 'pending_approval');
    if (pendingApprovals.length > 0) {
      return {
        topInsight: {
          title: `${pendingApprovals.length} proposed action waiting for approval`,
          detail: pendingApprovals[0].title,
          kind: 'attention',
        },
        newAlerts,
      };
    }

    if (overdue.length > 0) {
      return {
        topInsight: {
          title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''} need attention`,
          detail: `Top item: "${overdue[0].text}" (${overdue[0].area || 'Personal'})`,
          kind: overdue.length >= 3 ? 'critical' : 'attention',
        },
        newAlerts,
      };
    }

    if (dueToday.length > 0) {
      return {
        topInsight: {
          title: `${dueToday.length} priority item${dueToday.length > 1 ? 's' : ''} scheduled today`,
          detail: `Next up: "${dueToday[0].text}"`,
          kind: 'briefing',
        },
        newAlerts,
      };
    }

    return {
      topInsight: {
        title: `All clear across ${activeProjects.length} active project${activeProjects.length === 1 ? '' : 's'}`,
        detail: 'Quiet focus window — ask JARVIS for research, planning, or code triage.',
        kind: 'clear',
      },
      newAlerts,
    };
  }

  public static async sendCompanionMessage(options: {
    userMessage: string;
    history: AIChatMessage[];
    explicitAgent?: BuddyAgentRole;
    onToken?: (partial: string) => void;
  }): Promise<{
    replyMessage: AIChatMessage;
    agentUsed: BuddyAgentRole;
    extractedCount: number;
    memoriesUsedCount: number;
    proposedTimelineItem?: CompanionTimelineItem;
    error?: string;
  }> {
    const cleanInput = String(options.userMessage || '').trim();
    const settings = await this.loadSettings();
    const agent = selectCompanionAgent(cleanInput, options.explicitAgent);

    beginAiThinking();
    try {
      const [memories, tasks, projects, awareness, goals] = await Promise.all([
        this.loadMemories(),
        db.tasks.toArray().catch(() => []),
        db.projects.toArray().catch(() => []),
        this.loadCachedAwareness(),
        db.goals.toArray().catch(() => []),
      ]);

      // 1. Extract & reconcile memories if enabled (strictly secret-filtered)
      let extractedCount = 0;
      if (settings.autoExtractMemories) {
        const candidates = extractCandidateMemories({
          text: cleanInput,
          allowContacts: settings.allowExternalContactsMemory,
        });
        for (const cand of candidates) {
          const rec = reconcileCandidateMemory(cand, memories);
          if (rec.action === 'skip_duplicate') continue;
          const res = await this.saveMemory({
            category: cand.category,
            title: cand.title,
            content: cand.content,
            project: cand.project,
            importance: cand.importance,
            durability: cand.durability,
            source: 'conversation',
            contradicts_id: rec.action === 'supersede' ? rec.supersedesId : undefined,
            tags: cand.tags,
          });
          if (res.saved) extractedCount++;
        }
      }

      // 2. Hybrid retrieve relevant memories
      const relevantMemories = selectRelevantMemories(cleanInput, memories, { limit: 8 });

      // 3. Build verified Hub workspace summary
      const today = getTodayISO();
      const openTasks = tasks.filter((t) => !t.done);
      const overdue = openTasks.filter((t) => {
        const k = toDueKey(t.due_date);
        return Boolean(k && k < today);
      });
      const dueToday = openTasks.filter((t) => toDueKey(t.due_date) === today);
      const pawan = projects.find((p) => p.area === 'PAWAN SHAKTI');
      const snapshotLines = [
        `Today: ${today} (Asia/Kolkata)`,
        `Open tasks: ${openTasks.length} (${overdue.length} overdue, ${dueToday.length} due today). Top: ${openTasks.slice(0, 3).map((t) => t.text).join('; ') || 'None'}`,
        `Active projects (${projects.filter((p) => p.status === 'active').length}): ${projects.filter((p) => p.status === 'active').map((p) => `${p.title} (${p.progress}%)`).join(', ') || 'None'}`,
        pawan ? `Pawan Shakti: ${pawan.verification_note || `${pawan.progress}% TRL track`}` : '',
        `Active goals: ${goals.filter((g) => g.status === 'active').map((g) => g.title).join(', ') || 'None set'}`,
      ].filter(Boolean);

      const awarenessSummary = summarizeHonestAwareness(awareness).promptBanner;
      const systemPrompt = buildJarvisSystemPrompt({
        settings,
        agentName: agent.name,
        agentPrompt: agent.systemGuidance,
        memories: relevantMemories,
        workspaceSnapshot: snapshotLines.join('\n'),
        awarenessSummary,
        structuredTradeoffMode: /should|trade|plan|problem|bug|architecture|what's happening|brief/i.test(cleanInput),
      });

      const chatPrompt = `${systemPrompt}\n\nRECENT CONVERSATION:\n${options.history
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'Yashwanth' : 'JARVIS'}: ${m.content}`)
        .join('\n')}\nYashwanth: ${cleanInput}\nJARVIS:`;

      let replyText = '';
      let providerUsed = 'local_heuristic';
      let modelUsed = 'jarvis-offline';

      try {
        const aiRes = await AIGateway.streamPrompt(
          chatPrompt,
          {
            mode: agent.id === 'startup' ? 'startup' : agent.id === 'research' ? 'research' : 'personal',
            provider: settings.preferredProvider === 'auto' ? 'auto' : (settings.preferredProvider as any),
            complexity: agent.preferredComplexity,
          },
          {
            onToken: (_delta, accumulated) => options.onToken?.(accumulated),
          }
        );
        replyText = aiRes.text;
        providerUsed = aiRes.provider;
        modelUsed = aiRes.modelId;
      } catch {
        // Honest verified offline reply
        replyText = `I'm running in local workspace mode right now.\n\n**What I verified locally:**\n- Open tasks: ${openTasks.length} (${overdue.length} overdue, ${dueToday.length} due today)\n- Active projects: ${projects.filter((p) => p.status === 'active').length}\n- Loaded ${relevantMemories.length} relevant long-term memory notes.\n\nConnect or unlock your server AI provider if you'd like live LLM reasoning on top of these facts.`;
      }

      const replyMessage: AIChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: replyText,
        timestamp: new Date().toISOString(),
        provider: providerUsed,
        modelId: modelUsed,
      };

      // Optional explicit action proposal if user asked to create task or handover doc
      let proposedTimelineItem: CompanionTimelineItem | undefined;
      if (/\b(?:create\s+(?:a\s+)?task|remind\s+me\s+to|add\s+task)\b/i.test(cleanInput)) {
        const taskTitle = cleanInput
          .replace(/^.*?\b(?:create\s+(?:a\s+)?task\s*(?:to|:)?|remind\s+me\s+to|add\s+task\s*(?:to|:)?)\s*/i, '')
          .slice(0, 120);
        if (taskTitle.length >= 4) {
          const execRes = await this.executeOrProposeAction({
            toolName: 'create_task',
            args: { text: taskTitle, priority: 'high', area: 'Personal' },
            approvedByHuman: false,
          });
          proposedTimelineItem = execRes.timelineItem;
        }
      }

      endAiThinking(true);
      return {
        replyMessage,
        agentUsed: agent.id,
        extractedCount,
        memoriesUsedCount: relevantMemories.length,
        proposedTimelineItem,
      };
    } catch (err: any) {
      endAiThinking(false);
      throw err;
    }
  }

  public static async executeOrProposeAction(options: {
    toolName: string;
    args: Record<string, any>;
    approvedByHuman?: boolean;
    timelineId?: string;
  }): Promise<{
    status: 'executed' | 'pending_approval' | 'blocked' | 'failed';
    message: string;
    timelineItem?: CompanionTimelineItem;
    verifiedRecordId?: string;
  }> {
    const { level } = classifyCompanionActionTier(options.toolName);
    if (level === 3) {
      const item = await this.recordLocalTimeline({
        kind: 'error',
        source: 'agent',
        title: `Blocked Tier 3 action: ${options.toolName}`,
        summary: 'Restricted destructive, financial, or secret modification actions cannot be automated.',
        importance: 'high',
        status: 'rejected',
      });
      return { status: 'blocked', message: item.summary, timelineItem: item };
    }

    if (level === 2 && !options.approvedByHuman) {
      const pending = await this.recordLocalTimeline({
        id: options.timelineId,
        kind: 'pending_approval',
        source: 'agent',
        title: `Approval needed: ${String(options.args?.title || options.args?.text || options.toolName)}`,
        summary: `Proposed Tier 2 action (${options.toolName}). Click Approve to execute & verify.`,
        importance: 'high',
        status: 'pending_approval',
        metadata: { toolName: options.toolName, args: options.args, tier: 2 },
      });
      return {
        status: 'pending_approval',
        message: 'Awaiting your approval before executing.',
        timelineItem: pending,
      };
    }

    // Try server execution first when authenticated
    const headers = await getAuthHeaders();
    if (headers.Authorization) {
      try {
        const res = await fetch('/api/buddy?action=execute', {
          method: 'POST',
          headers,
          body: JSON.stringify(options),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.timelineItem) {
          await db.companion_timeline.put(data.timelineItem).catch(() => {});
        }
        return {
          status: data.status || (res.ok ? 'executed' : 'failed'),
          message: data.message || data.error || 'Action processed.',
          timelineItem: data.timelineItem,
          verifiedRecordId: data.verifiedRecordId,
        };
      } catch {
        /* fallback cleanly to local-first for local notes/tasks when offline */
      }
    }

    // Local-first verified execution for safe local entities (note, handover doc, task)
    const now = new Date().toISOString();
    if (options.toolName === 'create_task') {
      const id = generateId();
      await db.tasks.put({
        id,
        text: String(options.args?.text || options.args?.title || 'Task'),
        area: String(options.args?.area || 'Personal'),
        priority: options.args?.priority || 'medium',
        due_date: options.args?.due_date,
        starred: false,
        done: false,
        created_at: now,
        updated_at: now,
      });
      const verified = await db.tasks.get(id);
      const item = await this.recordLocalTimeline({
        id: options.timelineId,
        kind: 'executed_action',
        source: 'jarvis',
        title: `Created task: ${verified?.text || id}`,
        summary: `Verified saved locally (${id}).`,
        importance: 'normal',
        status: 'executed',
        metadata: { toolName: 'create_task', verifiedRecordId: id },
      });
      return { status: 'executed', message: item.summary, timelineItem: item, verifiedRecordId: id };
    }

    if (options.toolName === 'create_handover_doc' || options.toolName === 'save_note') {
      const id = generateId();
      const title = String(options.args?.title || 'JARVIS Handover Brief');
      const body = String(options.args?.body || options.args?.content || 'Summary prepared by JARVIS.');
      await db.notes.put({
        id,
        title,
        body,
        area: String(options.args?.area || 'General'),
        pinned: options.toolName === 'create_handover_doc',
        created_at: now,
        updated_at: now,
      });
      const item = await this.recordLocalTimeline({
        id: options.timelineId,
        kind: 'executed_action',
        source: 'jarvis',
        title: `Saved handover document: ${title}`,
        summary: `Verified stored in Notes & Memory Vault (${id}).`,
        importance: 'normal',
        status: 'executed',
        metadata: { toolName: options.toolName, verifiedRecordId: id },
      });
      return { status: 'executed', message: item.summary, timelineItem: item, verifiedRecordId: id };
    }

    return {
      status: 'failed',
      message: `Action "${options.toolName}" requires signing in so server integrations can execute securely.`,
    };
  }

  public static async rejectTimelineItem(timelineId: string): Promise<void> {
    const now = new Date().toISOString();
    await db.companion_timeline.update(timelineId, { status: 'rejected', updated_at: now }).catch(() => {});
    const headers = await getAuthHeaders();
    if (headers.Authorization) {
      await fetch('/api/buddy?action=approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ timelineId, decision: 'reject' }),
      }).catch(() => {});
    }
  }

  public static async exportMemoriesJson(): Promise<string> {
    const memories = await db.companion_memories.toArray();
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        companion: 'JARVIS 4.0',
        count: memories.length,
        memories,
      },
      null,
      2
    );
  }
}
