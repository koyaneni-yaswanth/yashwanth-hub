import type {
  AIProvider,
  AIMode,
  AIComparisonResult,
  AIUsageLog,
  AIConversation,
  AIProposedAction,
  Task,
  EventItem,
  Note,
} from '../../types';
import { db } from '../../db';
import { generateId, getTodayISO } from '../../lib/utils';
import { SUPPORTED_MODELS, getRecommendedModel } from './aiModels';
import { NeoSapienMemoryService } from '../neoSapienMemoryService';
import { SupabaseAuthService } from '../auth/supabaseAuthService';
import { SyncQueueService } from '../sync/syncQueueService';
import { AutomationService } from '../automationService';
import {
  AI_TOOL_DEFINITIONS,
  buildDeterministicGroundedResponse,
  type AIToolSpec,
  type WorkspaceSnapshot,
} from '../../../api/_lib/aiTools';

export interface AISendOptions {
  provider?: AIProvider;
  modelId?: string;
  mode: AIMode;
  complexity?: 'simple' | 'moderate' | 'complex';
  systemPrompt?: string;
  contextData?: any;
  projectId?: string;
  history?: Array<{ role: string; content: string }>;
}

export interface AIResponse {
  text: string;
  provider: AIProvider;
  modelId: string;
  providerMode?: 'server_llm' | 'grounded_deterministic' | 'grounded_fallback_after_error' | 'client_override';
  providerNotice?: string;
  latencyMs: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUSD: number;
  toolCalls?: Array<{ tool: string; args?: Record<string, any>; summary?: string }>;
  proposedActions?: AIProposedAction[];
  citations?: string[];
  verifiedFacts?: string[];
  estimates?: string[];
  recommendations?: string[];
  unknowns?: string[];
  configuredProviders?: Record<string, boolean>;
}

export class AIGateway {
  private static getOptionalClientOverrideKey(provider: AIProvider): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(`yash_ai_key_${provider}`) || localStorage.getItem('yash_ai_key') || '';
  }

  /**
   * Builds a permission-aware workspace snapshot across Dexie tables for AI grounding.
   */
  public static async buildWorkspaceSnapshot(
    provider: AIProvider,
    projectIdScope?: string
  ): Promise<WorkspaceSnapshot> {
    const todayISO = getTodayISO();
    const privacy = NeoSapienMemoryService.getPrivacySettings();
    const allowNeo =
      provider === 'gemini'
        ? privacy.allowGeminiAccess
        : provider === 'openai'
        ? privacy.allowOpenAIAccess
        : provider === 'anthropic'
        ? privacy.allowClaudeAccess
        : true;

    const [tasks, projects, notes, meetings, events, documents, robotics, neoMemories] =
      await Promise.all([
        db.tasks.toArray(),
        db.projects.toArray(),
        db.notes.toArray(),
        db.meetings.toArray(),
        db.events.toArray(),
        db.documents.toArray(),
        db.robotics_records.toArray().catch(() => []),
        allowNeo ? db.neo_memories.toArray() : Promise.resolve([]),
      ]);

    return {
      todayISO,
      projectIdScope,
      tasks,
      projects,
      notes,
      meetings,
      events,
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        file_name: d.file_name,
        area: d.area,
        notes: d.notes,
        updated_at: d.updated_at,
      })),
      robotics_records: robotics,
      neo_memories: neoMemories,
    };
  }

  /**
   * Discovers structured Chief of Staff tools and server LLM provider readiness.
   */
  public static async discoverTools(): Promise<{
    tools: AIToolSpec[];
    configuredProviders: Record<string, boolean>;
    source: 'server' | 'local_manifest';
  }> {
    try {
      const resp = await fetch('/api/ai/chat?action=tools');
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await resp.json();
          if (Array.isArray(data.tools)) {
            return {
              tools: data.tools,
              configuredProviders: data.configuredProviders || {},
              source: 'server',
            };
          }
        }
      }
    } catch {
      // Fallback below when Vite runs without /api serverless proxy
    }

    return {
      tools: AI_TOOL_DEFINITIONS,
      configuredProviders: { gemini: false, openai: false, anthropic: false },
      source: 'local_manifest',
    };
  }

  /**
   * Primary V2 entry point: calls server /api/ai/chat first, falling back cleanly to
   * grounded deterministic workspace reasoning (or optional local override if configured).
   */
  public static async executePrompt(
    userPrompt: string,
    options: AISendOptions
  ): Promise<AIResponse> {
    const startTime = performance.now();
    const mode = options.mode || 'personal';
    const complexity = options.complexity || 'moderate';

    const selectedModel =
      options.modelId
        ? SUPPORTED_MODELS.find((m) => m.modelId === options.modelId) || getRecommendedModel(mode, complexity)
        : getRecommendedModel(mode, complexity);

    const provider = options.provider || selectedModel.provider;
    const workspaceSnapshot = await this.buildWorkspaceSnapshot(provider, options.projectId);

    // 1. Primary path: Server-side /api/ai/chat (keeps keys off client & executes tool calling)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const jwt = await SupabaseAuthService.getAccessToken();
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: userPrompt,
          provider,
          modelId: selectedModel.modelId,
          mode,
          projectId: options.projectId,
          history: options.history || [],
          systemPrompt: options.systemPrompt,
          workspaceSnapshot,
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (resp.ok && contentType.includes('application/json')) {
        const data = await resp.json();
        const tokensIn = Number(data.tokensInput || 0);
        const tokensOut = Number(data.tokensOutput || 0);
        const latencyMs = Number(data.latencyMs || Math.round(performance.now() - startTime));
        const estimatedCost =
          (tokensIn / 1000) * selectedModel.costPer1kInputTokensUSD +
          (tokensOut / 1000) * selectedModel.costPer1kOutputTokensUSD;

        if (tokensIn > 0 || tokensOut > 0) {
          const logEntry: AIUsageLog = {
            id: generateId(),
            provider: (data.provider || provider) as AIProvider,
            modelId: data.modelId || selectedModel.modelId,
            taskMode: mode,
            tokensInput: tokensIn,
            tokensOutput: tokensOut,
            latencyMs,
            estimatedCostUSD: estimatedCost,
            timestamp: new Date().toISOString(),
          };
          await db.ai_logs.add(logEntry).catch(() => {});
        }

        return {
          text: data.text,
          provider: (data.provider || provider) as AIProvider,
          modelId: data.modelId || selectedModel.modelId,
          providerMode: data.providerMode,
          providerNotice: data.providerNotice || data.providerError,
          latencyMs,
          tokensInput: tokensIn,
          tokensOutput: tokensOut,
          estimatedCostUSD: estimatedCost,
          toolCalls: data.tool_calls || [],
          proposedActions: (data.proposed_actions || []) as AIProposedAction[],
          citations: data.citations || [],
          verifiedFacts: data.verified_facts,
          estimates: data.estimates,
          recommendations: data.recommendations,
          unknowns: data.unknowns,
          configuredProviders: data.configuredProviders,
        };
      }
    } catch {
      // Static Vite dev without Vercel API proxy falls through gracefully below
    }

    // 2. Optional manual Settings override key (only if explicitly entered by user in Settings)
    const overrideKey = this.getOptionalClientOverrideKey(provider);
    if (overrideKey && provider === 'gemini') {
      try {
        const direct = await this.callGeminiDirectOverride(
          overrideKey,
          selectedModel.modelId,
          userPrompt,
          options.systemPrompt,
          workspaceSnapshot
        );
        const latencyMs = Math.round(performance.now() - startTime);
        const estimatedCost =
          (direct.tokensIn / 1000) * selectedModel.costPer1kInputTokensUSD +
          (direct.tokensOut / 1000) * selectedModel.costPer1kOutputTokensUSD;

        await db.ai_logs
          .add({
            id: generateId(),
            provider: 'gemini',
            modelId: selectedModel.modelId,
            taskMode: mode,
            tokensInput: direct.tokensIn,
            tokensOutput: direct.tokensOut,
            latencyMs,
            estimatedCostUSD: estimatedCost,
            timestamp: new Date().toISOString(),
          })
          .catch(() => {});

        return {
          text: direct.text,
          provider: 'gemini',
          modelId: selectedModel.modelId,
          providerMode: 'client_override',
          latencyMs,
          tokensInput: direct.tokensIn,
          tokensOutput: direct.tokensOut,
          estimatedCostUSD: estimatedCost,
        };
      } catch {
        // Fall through cleanly to grounded deterministic synthesis
      }
    }

    // 3. Deterministic Grounded Engine over real workspace data (zero fabricated facts)
    const grounded = buildDeterministicGroundedResponse(
      userPrompt,
      workspaceSnapshot,
      options.projectId
    );
    return {
      text: grounded.text,
      provider: 'local_heuristic',
      modelId: 'grounded-chief-of-staff-v2',
      providerMode: 'grounded_deterministic',
      providerNotice:
        'Using local grounded Chief of Staff reasoning over verified workspace records (server LLM API keys not active).',
      latencyMs: Math.round(performance.now() - startTime),
      tokensInput: 0,
      tokensOutput: 0,
      estimatedCostUSD: 0,
      toolCalls: grounded.tool_calls,
      proposedActions: grounded.proposed_actions as AIProposedAction[],
      citations: grounded.citations,
      verifiedFacts: grounded.verified_facts,
      estimates: grounded.estimates,
      recommendations: grounded.recommendations,
      unknowns: grounded.unknowns,
    };
  }

  /**
   * Executes an approved Level-2 Action Preview cleanly in Dexie + SyncQueue
   * and verifies creation by immediate database readback.
   */
  public static async executeApprovedAction(
    action: AIProposedAction
  ): Promise<{ success: boolean; verifiedRecordId?: string; message: string }> {
    const now = new Date().toISOString();
    const payload = action.payload || {};

    try {
      if (action.type === 'create_task') {
        const taskId = generateId();
        const taskRecord: Task = {
          id: taskId,
          text: String(payload.text || action.title),
          description: payload.description ? String(payload.description) : undefined,
          area: String(payload.area || 'PAWAN SHAKTI'),
          priority: (payload.priority || 'high') as Task['priority'],
          due_date: payload.due_date ? String(payload.due_date) : undefined,
          project_id: payload.project_id ? String(payload.project_id) : undefined,
          starred: payload.priority === 'urgent' || payload.priority === 'high',
          done: false,
          created_at: now,
          updated_at: now,
        };
        await db.tasks.add(taskRecord);
        const verified = await db.tasks.get(taskId);
        if (!verified) {
          return { success: false, message: 'Write verification failed: task not found after save.' };
        }
        await SyncQueueService.enqueueChange('tasks', taskId, 'INSERT', taskRecord).catch(() => {});
        return {
          success: true,
          verifiedRecordId: verified.id,
          message: `Verified saved task "${verified.text}" (ID: ${verified.id.slice(0, 8)}).`,
        };
      }

      if (action.type === 'schedule_event') {
        const eventId = generateId();
        const eventRecord: EventItem = {
          id: eventId,
          title: String(payload.title || action.title),
          date: String(payload.date || getTodayISO()),
          start_time: payload.start_time ? String(payload.start_time) : '10:00',
          kind: (payload.kind || 'Deadline') as EventItem['kind'],
          area: String(payload.area || 'Personal'),
          notes: payload.notes ? String(payload.notes) : undefined,
          created_at: now,
          updated_at: now,
        };
        await db.events.add(eventRecord);
        const verified = await db.events.get(eventId);
        if (!verified) {
          return { success: false, message: 'Write verification failed: event not found after save.' };
        }
        await SyncQueueService.enqueueChange('events', eventId, 'INSERT', eventRecord).catch(() => {});
        return {
          success: true,
          verifiedRecordId: verified.id,
          message: `Verified scheduled event "${verified.title}" on ${verified.date}.`,
        };
      }

      if (action.type === 'log_decision' && payload.project_id) {
        const project = await db.projects.get(String(payload.project_id));
        if (!project) {
          return { success: false, message: 'Target project not found for decision logging.' };
        }
        const decisionId = generateId();
        const nextDecisions = [
          {
            id: decisionId,
            title: String(payload.title || action.title),
            decision: String(payload.content || action.description),
            rationale: payload.rationale ? String(payload.rationale) : undefined,
            decided_at: getTodayISO(),
            author: 'Yashwanth (via Chief of Staff)',
          },
          ...(project.decisions || []),
        ];
        const nextHistory = [
          {
            id: generateId(),
            action: 'Decision Logged',
            details: String(payload.title || action.title),
            timestamp: now,
            actor: 'AI Chief of Staff (Approved)',
          },
          ...(project.activity_history || []),
        ];
        await db.projects.update(project.id, {
          decisions: nextDecisions,
          activity_history: nextHistory,
          updated_at: now,
        });
        const verifiedProj = await db.projects.get(project.id);
        const found = verifiedProj?.decisions?.some((d) => d.id === decisionId);
        if (!found) {
          return { success: false, message: 'Decision verification failed after project update.' };
        }
        await SyncQueueService.enqueueChange('projects', project.id, 'UPDATE', verifiedProj).catch(() => {});
        return {
          success: true,
          verifiedRecordId: decisionId,
          message: `Verified decision logged in "${project.title}".`,
        };
      }

      if (action.type === 'create_note' || action.type === 'log_decision') {
        const noteId = generateId();
        const noteRecord: Note = {
          id: noteId,
          title: String(payload.title || action.title),
          body: String(payload.content || action.description),
          area: String(payload.area || 'PAWAN SHAKTI'),
          pinned: false,
          created_at: now,
          updated_at: now,
        };
        await db.notes.add(noteRecord);
        const verified = await db.notes.get(noteId);
        if (!verified) {
          return { success: false, message: 'Write verification failed: note not found after save.' };
        }
        await SyncQueueService.enqueueChange('notes', noteId, 'INSERT', noteRecord).catch(() => {});
        return {
          success: true,
          verifiedRecordId: verified.id,
          message: `Verified saved note "${verified.title}".`,
        };
      }

      if (action.type === 'trigger_automation') {
        const res = await AutomationService.triggerServerAutomation(
          String(payload.action_type || 'task_deadline_scan'),
          undefined,
          payload
        );
        if (!res.success) {
          return { success: false, message: res.error || 'Automation dispatch failed.' };
        }
        return {
          success: true,
          verifiedRecordId: res.log?.id || 'queued',
          message: res.queued
            ? 'Automation job verified in server approval queue.'
            : `Automation executed in ${res.log?.duration_ms ?? 0}ms.`,
        };
      }

      return { success: false, message: `Unsupported action type: ${action.type}` };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Execution error.' };
    }
  }

  public static async saveConversation(conv: AIConversation): Promise<void> {
    const existing = await db.ai_conversations.get(conv.id);
    await db.ai_conversations.put(conv);
    await SyncQueueService.enqueueChange(
      'ai_conversations',
      conv.id,
      existing ? 'UPDATE' : 'INSERT',
      conv
    ).catch(() => {});
  }

  public static async compareModels(
    userPrompt: string,
    modelIds: string[]
  ): Promise<AIComparisonResult[]> {
    const tasks = modelIds.map(async (modelId) => {
      const model = SUPPORTED_MODELS.find((m) => m.modelId === modelId);
      if (!model) return null;
      const resp = await this.executePrompt(userPrompt, {
        provider: model.provider,
        modelId: model.modelId,
        mode: 'research',
      });
      return {
        provider: resp.provider,
        modelId: resp.modelId,
        response: resp.text,
        latencyMs: resp.latencyMs,
        tokensUsed: resp.tokensInput + resp.tokensOutput,
      };
    });

    const results = await Promise.all(tasks);
    return results.filter(Boolean) as AIComparisonResult[];
  }

  private static async callGeminiDirectOverride(
    apiKey: string,
    modelId: string,
    prompt: string,
    systemPrompt: string | undefined,
    snapshot: WorkspaceSnapshot
  ): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    const contextSummary = `Verified workspace snapshot (${snapshot.todayISO}): ${snapshot.tasks.length} tasks, ${snapshot.projects.length} projects, ${snapshot.notes.length} notes, ${snapshot.meetings.length} meetings.
Open high tasks: ${JSON.stringify(snapshot.tasks.filter((t) => !t.done).slice(0, 12).map((t) => ({ text: t.text, area: t.area, due: t.due_date, priority: t.priority })))}
Projects: ${JSON.stringify(snapshot.projects.map((p) => ({ title: p.title, area: p.area, progress: p.progress, blockers: p.blockers || [], risks: p.risks || [], verification_note: p.verification_note })))}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: `${systemPrompt || ''}\n${contextSummary}` }],
          },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Gemini API returned status ${res.status}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    const usage = data.usageMetadata || {};
    return {
      text,
      tokensIn: usage.promptTokenCount || 0,
      tokensOut: usage.candidatesTokenCount || 0,
    };
  }
}
