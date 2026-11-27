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
import { SUPPORTED_MODELS, getRecommendedModel, normaliseModelId } from './aiModels';
import { chooseGeminiModels } from '../../../api/_lib/geminiRanking';
import type { CloudOrLocalProviderId, ProviderCapabilities, ProviderHealthReport } from '../../../api/_lib/aiProviderAdapters';
import { LocalAgentClient } from './localAgentClient';
import { parseDataUrlToBase64, type PreparedImageAttachment } from '../../lib/imageUpload';
import {
  ProviderCircuitBreaker,
  classifyTaskCategory,
  type CircuitStateRecord,
  type TaskRouteCategory,
} from '../../lib/modelRouter5';
import { NeoSapienMemoryService } from '../neoSapienMemoryService';
import { SupabaseAuthService } from '../auth/supabaseAuthService';
import { SyncQueueService } from '../sync/syncQueueService';
import { AutomationService } from '../automationService';
import { beginAiThinking, endAiThinking } from '../../lib/aiActivity';
import {
  AI_TOOL_DEFINITIONS,
  buildDeterministicGroundedResponse,
  type AIToolSpec,
  type WorkspaceSnapshot,
} from '../../../api/_lib/aiTools';

export interface ProviderConfigState {
  provider: CloudOrLocalProviderId;
  enabled: boolean;
  selected_model: string | null;
  key_hint: string | null;
  base_url: string | null;
  hasUserKey: boolean;
  hasServerEnvKey: boolean;
  last_health_status: string | null;
  last_latency_ms: number | null;
  last_checked_at: string | null;
  last_error: string | null;
}

export interface ReliabilityTrace {
  requestId: string;
  category: TaskRouteCategory;
  provider: string;
  status: 'ok' | 'failover' | 'cancelled' | 'error' | 'degraded';
  latencyMs: number;
  note?: string;
  timestamp: string;
}

export interface ReliabilitySnapshot {
  circuits: CircuitStateRecord[];
  recentTraces: ReliabilityTrace[];
}

export interface AISendOptions {
  provider?: AIProvider;
  modelId?: string;
  mode: AIMode;
  complexity?: 'simple' | 'moderate' | 'complex';
  routeCategory?: TaskRouteCategory;
  privateOfflineOnly?: boolean;
  allowCloudFallback?: boolean;
  signal?: AbortSignal;
  requestId?: string;
  systemPrompt?: string;
  contextData?: any;
  projectId?: string;
  history?: Array<{ role: string; content: string }>;
  images?: PreparedImageAttachment[];
}

export interface AIResponse {
  text: string;
  provider: AIProvider;
  modelId: string;
  requestId?: string;
  routeCategory?: TaskRouteCategory;
  routeRationale?: string;
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
  private static activeControllers = new Map<string, AbortController>();
  private static clientBreaker = new ProviderCircuitBreaker(3, 30000);
  private static traces: ReliabilityTrace[] = [];

  private static pushTrace(trace: ReliabilityTrace) {
    this.traces = [trace, ...this.traces].slice(0, 30);
  }

  public static getReliabilitySnapshot(): ReliabilitySnapshot {
    return {
      circuits: this.clientBreaker.snapshot(),
      recentTraces: [...this.traces],
    };
  }

  /** Standardized Gateway Contract: cancel active request(s) via AbortController */
  public static cancel(requestId?: string): number {
    let count = 0;
    if (requestId) {
      const ctrl = this.activeControllers.get(requestId);
      if (ctrl) {
        ctrl.abort(new DOMException('Cancelled by user', 'AbortError'));
        this.activeControllers.delete(requestId);
        count = 1;
      }
      return count;
    }
    for (const [id, ctrl] of this.activeControllers.entries()) {
      ctrl.abort(new DOMException('Cancelled by user', 'AbortError'));
      this.activeControllers.delete(id);
      count++;
    }
    return count;
  }

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
        : provider === 'local_heuristic' || provider === 'ollama'
        ? true
        : privacy.allowGeminiAccess && privacy.allowOpenAIAccess && privacy.allowClaudeAccess;

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
   * Discovers structured Chief of Staff tools, server LLM provider readiness & capabilities.
   */
  public static async discoverTools(): Promise<{
    tools: AIToolSpec[];
    configuredProviders: Record<string, boolean>;
    providerCapabilities?: Record<string, { capabilities: ProviderCapabilities; name: string; strengthSummary: string }>;
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
              providerCapabilities: data.providerCapabilities,
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
      configuredProviders: {
        gemini: false,
        openai: false,
        anthropic: false,
        openrouter: false,
        huggingface: false,
        ollama: false,
      },
      source: 'local_manifest',
    };
  }

  /** Unified gateway contract: AIProvider.generate() */
  public static async generate(prompt: string, options: AISendOptions): Promise<AIResponse> {
    return this.executePrompt(prompt, options);
  }

  /** Unified gateway contract: AIProvider.stream() */
  public static async stream(
    prompt: string,
    options: AISendOptions,
    callbacks: { onToken: (delta: string, accumulated: string) => void; onTool?: (toolMeta: { tool: string; summary: string }) => void }
  ): Promise<AIResponse> {
    return this.streamPrompt(prompt, options, callbacks);
  }

  /** Unified gateway contract: AIProvider.chat() */
  public static async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: Omit<AISendOptions, 'history'> & { stream?: boolean },
    callbacks?: { onToken: (delta: string, accumulated: string) => void; onTool?: (toolMeta: { tool: string; summary: string }) => void }
  ): Promise<AIResponse> {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content || messages[messages.length - 1]?.content || '';
    const priorHistory = messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
    const sysOverride = messages.find((m) => m.role === 'system')?.content;
    const sendOpts: AISendOptions = {
      ...options,
      history: priorHistory,
      systemPrompt: [sysOverride, options.systemPrompt].filter(Boolean).join('\n\n') || undefined,
    };
    if (options.stream && callbacks) {
      return this.streamPrompt(lastUser, sendOpts, callbacks);
    }
    return this.executePrompt(lastUser, sendOpts);
  }

  /** Unified gateway contract: AIProvider.listModels() */
  public static async listModels(): Promise<{
    supportedModels: Array<{ provider: string; modelId: string; displayName: string; isDefault?: boolean }>;
    localOllamaModels: string[];
  }> {
    let supportedModels: Array<{ provider: string; modelId: string; displayName: string; isDefault?: boolean }> = [];
    const localOllamaModels: string[] = [];
    try {
      const resp = await fetch('/api/ai/chat');
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data.supportedModels)) supportedModels = data.supportedModels;
      }
    } catch {
      /* ignore offline */
    }
    try {
      const st = await LocalAgentClient.listModels();
      for (const m of st.ollama.models || []) {
        if (m.name) localOllamaModels.push(m.name);
      }
    } catch {
      /* local agent offline */
    }
    return { supportedModels, localOllamaModels };
  }

  public static async getProviderConfigs(): Promise<{
    configs: ProviderConfigState[];
    vaultEncryptionReady: boolean;
  }> {
    const headers: Record<string, string> = {};
    const jwt = await SupabaseAuthService.getAccessToken();
    if (!jwt) return { configs: [], vaultEncryptionReady: false };
    headers.Authorization = `Bearer ${jwt}`;
    const resp = await fetch('/api/ai/chat?action=providers', { headers });
    if (!resp.ok) return { configs: [], vaultEncryptionReady: false };
    const data = await resp.json();
    return {
      configs: Array.isArray(data.configs) ? data.configs : [],
      vaultEncryptionReady: Boolean(data.vaultEncryptionReady),
    };
  }

  public static async saveProviderConfig(input: {
    provider: CloudOrLocalProviderId;
    enabled?: boolean;
    apiKey?: string;
    clearKey?: boolean;
    selectedModel?: string;
    baseUrl?: string;
  }): Promise<{ success: boolean; message?: string }> {
    const jwt = await SupabaseAuthService.getAccessToken();
    if (!jwt) throw new Error('Sign in with Supabase to save encrypted provider credentials.');
    const resp = await fetch('/api/ai/chat?action=provider_config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'provider_config', ...input }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || 'Failed saving provider configuration.');
    return { success: true, message: data.message };
  }

  public static async testProviderConnection(provider: CloudOrLocalProviderId): Promise<ProviderHealthReport> {
    const jwt = await SupabaseAuthService.getAccessToken();
    if (!jwt) throw new Error('Sign in with Supabase to run server-side provider test.');
    const resp = await fetch('/api/ai/chat?action=provider_test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ action: 'provider_test', provider }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.report) throw new Error(data?.error || 'Provider test failed.');
    if (data.report.status === 'connected') this.clientBreaker.recordSuccess(provider);
    else this.clientBreaker.recordFailure(provider, data.report.note, false);
    return data.report;
  }

  /** Unified gateway contract: AIProvider.analyze() */
  public static async analyze(
    subjectPrompt: string,
    options: Omit<AISendOptions, 'mode'> & { mode?: AIMode }
  ): Promise<AIResponse> {
    return this.executePrompt(subjectPrompt, {
      ...options,
      mode: options.mode || 'research',
      complexity: options.complexity || 'complex',
    });
  }

  /** Unified gateway contract: AIProvider.embed() with capability detection */
  public static async embed(
    text: string,
    options: { provider?: AIProvider } = {}
  ): Promise<{ success: boolean; unsupported?: boolean; provider?: string; model?: string; embedding?: number[]; error?: string }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const jwt = await SupabaseAuthService.getAccessToken();
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
      const resp = await fetch('/api/ai/chat?action=embed', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'embed', text, provider: options.provider || 'auto' }),
      });
      const data = await resp.json().catch(() => ({}));
      return data;
    } catch (err: any) {
      return { success: false, unsupported: true, error: err?.message || 'Embedding request failed' };
    }
  }

  /**
   * Unified gateway contract: AIProvider.healthCheck()
   * Checks real server provider latency & model discovery, plus local browser Ollama if running on localhost.
   */
  public static async healthCheck(
    options: { includeLocalOllama?: boolean } = {}
  ): Promise<{
    providers: ProviderHealthReport[];
    recommended: { provider: string; reason: string };
    checkedAt: string;
  }> {
    let serverProviders: ProviderHealthReport[] = [];
    let recommended = {
      provider: 'local_heuristic',
      reason: 'Offline or preview mode without server API.',
    };

    try {
      const resp = await fetch('/api/ai/chat?action=health');
      if (resp.ok && (resp.headers.get('content-type') || '').includes('application/json')) {
        const data = await resp.json();
        if (Array.isArray(data.providers)) {
          serverProviders = data.providers;
          recommended = data.recommended || recommended;
        }
      }
    } catch {
      // Static vite preview without /api falls through gracefully
    }

    const ollamaOptedIn =
      options.includeLocalOllama === true ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('yash_enable_local_ollama') === '1');

    // Check browser-local Ollama only when opted in or explicitly benchmarked on localhost
    if (
      ollamaOptedIn &&
      typeof window !== 'undefined' &&
      /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ) {
      const t0 = performance.now();
      try {
        const localRes = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1200) });
        if (localRes.ok) {
          const data = await localRes.json().catch(() => ({}));
          const models = Array.isArray(data.models) ? data.models.map((m: any) => String(m.name || '')) : [];
          const ollamaEntry: ProviderHealthReport = {
            id: 'ollama',
            name: 'Ollama (Local Desktop)',
            configured: true,
            status: 'connected',
            reachable: true,
            latencyMs: Math.round(performance.now() - t0),
            discoveredModelsCount: models.length,
            sampleModels: models.slice(0, 5),
            capabilities: { chat: true, tools: true, vision: false, embeddings: true, modelDiscovery: true, localPrivate: true },
            note: `Local daemon active (${models.length} model(s) ready at 127.0.0.1:11434)`,
          };
          serverProviders = [
            ...serverProviders.filter((p) => p.id !== 'ollama'),
            ollamaEntry,
          ];
        }
      } catch {
        // Local Ollama not running; keep honest server report
      }
    }

    return {
      providers: serverProviders,
      recommended,
      checkedAt: new Date().toISOString(),
    };
  }

  /** Unified gateway contract: AIProvider.getUsage() */
  public static async getUsage(): Promise<{
    totalCalls: number;
    totalTokens: number;
    totalCostUSD: number;
    byProvider: Record<string, { calls: number; tokens: number; avgLatencyMs: number; costUSD: number }>;
  }> {
    const logs = await db.ai_logs.toArray().catch(() => []);
    const byProvider: Record<string, { calls: number; tokens: number; avgLatencyMs: number; costUSD: number }> = {};
    let totalTokens = 0;
    let totalCostUSD = 0;
    const latencySums: Record<string, number> = {};

    for (const l of logs) {
      const key = l.provider || 'unknown';
      const toks = (l.tokensInput || 0) + (l.tokensOutput || 0);
      totalTokens += toks;
      totalCostUSD += l.estimatedCostUSD || 0;
      if (!byProvider[key]) {
        byProvider[key] = { calls: 0, tokens: 0, avgLatencyMs: 0, costUSD: 0 };
        latencySums[key] = 0;
      }
      byProvider[key].calls += 1;
      byProvider[key].tokens += toks;
      byProvider[key].costUSD += l.estimatedCostUSD || 0;
      latencySums[key] += l.latencyMs || 0;
    }

    for (const key of Object.keys(byProvider)) {
      byProvider[key].avgLatencyMs = Math.round(latencySums[key] / Math.max(1, byProvider[key].calls));
    }

    return {
      totalCalls: logs.length,
      totalTokens,
      totalCostUSD,
      byProvider,
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
    beginAiThinking();
    let responded = false;
    try {
      const response = await this.executePromptCore(userPrompt, options);
      responded = true;
      return response;
    } finally {
      endAiThinking(responded);
    }
  }

  private static async executePromptCore(
    userPrompt: string,
    options: AISendOptions
  ): Promise<AIResponse> {
    const startTime = performance.now();
    const mode = options.mode || 'personal';
    const complexity = options.complexity || 'moderate';

    const selectedModel =
      options.modelId
        ? SUPPORTED_MODELS.find((m) => m.modelId === normaliseModelId(options.modelId)) || getRecommendedModel(mode, complexity)
        : getRecommendedModel(mode, complexity);

    const provider = options.provider || selectedModel.provider;
    const workspaceSnapshot = await this.buildWorkspaceSnapshot(provider, options.projectId);

    // 1. Primary path: Server-side /api/ai/chat (keeps keys off client & executes tool calling)
    let signInNotice: string | undefined;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const jwt = await SupabaseAuthService.getAccessToken();
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

      const serializedImages = (options.images || [])
        .map((img) => {
          const parsed = parseDataUrlToBase64(img.dataUrl);
          return parsed ? { name: img.name, mimeType: parsed.mimeType, base64: parsed.base64 } : null;
        })
        .filter(Boolean);

      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: userPrompt,
          provider,
          modelId: selectedModel.modelId,
          mode,
          routeCategory: options.routeCategory,
          hasImageInput: serializedImages.length > 0,
          images: serializedImages.length > 0 ? serializedImages : undefined,
          projectId: options.projectId,
          history: options.history || [],
          systemPrompt: options.systemPrompt,
          workspaceSnapshot,
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (resp.status === 401) {
        signInNotice =
          'Sign in (Integrations & Sync) to use the AI model. This answer comes from local reasoning over your workspace.';
      }
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
          providerNotice: data.failoverNotice || data.providerNotice || data.providerError,
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

    // 1b. Direct browser-local Ollama when running locally on localhost
    if (
      provider === 'ollama' &&
      typeof window !== 'undefined' &&
      /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ) {
      try {
        const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel.modelId || 'llama3.2',
            messages: [
              ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
              { role: 'user', content: userPrompt },
            ],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content || '';
          if (text) {
            return {
              text,
              provider: 'ollama',
              modelId: selectedModel.modelId || 'llama3.2',
              providerMode: 'client_override',
              latencyMs: Math.round(performance.now() - startTime),
              tokensInput: data.usage?.prompt_tokens || 0,
              tokensOutput: data.usage?.completion_tokens || 0,
              estimatedCostUSD: 0,
            };
          }
        }
      } catch {
        // Local Ollama not active; fall back cleanly below
      }
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
        signInNotice ||
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
   * Streams real-time AI tokens via Server-Sent Events (`/api/ai/chat` with `stream: true`)
   * and fires `onToken(delta, accumulated)` incrementally as chunks arrive.
   * Gracefully falls back to `executePrompt` if the environment returns JSON or runs offline.
   */
  public static async streamPrompt(
    userPrompt: string,
    options: AISendOptions,
    callbacks: {
      onToken: (delta: string, accumulated: string) => void;
      onTool?: (toolMeta: { tool: string; summary: string }) => void;
    }
  ): Promise<AIResponse> {
    const startTime = performance.now();
    const requestId = options.requestId || `cli_${generateId().slice(0, 10)}`;
    const controller = new AbortController();
    this.activeControllers.set(requestId, controller);
    if (options.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else options.signal.addEventListener('abort', () => controller.abort(options.signal?.reason), { once: true });
    }

    const mode = options.mode || 'personal';
    const complexity = options.complexity || 'moderate';
    const routeCategory = classifyTaskCategory({
      prompt: userPrompt,
      explicitCategory: options.routeCategory,
      hasImageInput: Boolean(options.images?.length),
      privateOfflineOnly: options.privateOfflineOnly,
    });
    const selectedModel =
      options.modelId
        ? SUPPORTED_MODELS.find((m) => m.modelId === normaliseModelId(options.modelId)) || getRecommendedModel(mode, complexity)
        : getRecommendedModel(mode, complexity);
    const provider = options.provider || selectedModel.provider;
    const workspaceSnapshot = await this.buildWorkspaceSnapshot(provider, options.projectId);

    // Local-first private path through JARVIS Local Python Runtime -> Ollama
    if (options.privateOfflineOnly || routeCategory === 'LOCAL' || provider === 'ollama') {
      const localHealth = await LocalAgentClient.probeHealth();
      if (localHealth.online && localHealth.ollamaReachable) {
        try {
          const messages = [
            ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
            ...(options.history || []).slice(-6),
            { role: 'user', content: userPrompt },
          ];
          const localOut = await LocalAgentClient.streamChat(
            messages,
            options.modelId || undefined,
            callbacks.onToken,
            controller.signal
          );
          const latencyMs = Math.round(performance.now() - startTime);
          this.clientBreaker.recordSuccess('ollama');
          this.pushTrace({
            requestId,
            category: 'LOCAL',
            provider: 'ollama',
            status: 'ok',
            latencyMs,
            note: 'Executed via Local JARVIS Runtime',
            timestamp: new Date().toISOString(),
          });
          this.activeControllers.delete(requestId);
          return {
            text: localOut.text,
            provider: 'ollama',
            modelId: localOut.model,
            requestId,
            routeCategory: 'LOCAL',
            routeRationale: 'Routed locally through private JARVIS Python runtime & Ollama.',
            providerMode: 'client_override',
            latencyMs,
            tokensInput: 0,
            tokensOutput: 0,
            estimatedCostUSD: 0,
          };
        } catch (localErr: any) {
          if (controller.signal.aborted) {
            this.activeControllers.delete(requestId);
            throw localErr;
          }
          this.clientBreaker.recordFailure('ollama', localErr?.message || 'Local Ollama error', false);
          if (options.privateOfflineOnly || !options.allowCloudFallback) {
            this.pushTrace({
              requestId,
              category: 'LOCAL',
              provider: 'ollama',
              status: 'degraded',
              latencyMs: Math.round(performance.now() - startTime),
              note: localErr?.message || 'Private offline mode blocked cloud fallback',
              timestamp: new Date().toISOString(),
            });
            this.activeControllers.delete(requestId);
            return {
              text: `Local private runtime failed (${localErr?.message || 'Ollama offline'}) and cloud fallback is disabled in private mode.`,
              provider: 'local_heuristic',
              modelId: 'private-offline-guard',
              requestId,
              routeCategory: 'LOCAL',
              providerMode: 'grounded_fallback_after_error',
              latencyMs: Math.round(performance.now() - startTime),
              tokensInput: 0,
              tokensOutput: 0,
              estimatedCostUSD: 0,
            };
          }
        }
      } else if (options.privateOfflineOnly) {
        this.activeControllers.delete(requestId);
        return {
          text: 'Private / Offline mode is active, but neither Local JARVIS Runtime (127.0.0.1:8787) nor Ollama is running. Start `./local-agent/scripts/start_windows.ps1` and `ollama serve`, or disable Private Only mode to allow cloud AI.',
          provider: 'local_heuristic',
          modelId: 'private-offline-guard',
          requestId,
          routeCategory: 'LOCAL',
          providerMode: 'grounded_deterministic',
          latencyMs: Math.round(performance.now() - startTime),
          tokensInput: 0,
          tokensOutput: 0,
          estimatedCostUSD: 0,
        };
      }
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json',
        'X-Request-Id': requestId,
      };
      const jwt = await SupabaseAuthService.getAccessToken();
      if (jwt) headers['Authorization'] = `Bearer ${jwt}`;

      const serializedImages = (options.images || [])
        .map((img) => {
          const parsed = parseDataUrlToBase64(img.dataUrl);
          return parsed ? { name: img.name, mimeType: parsed.mimeType, base64: parsed.base64 } : null;
        })
        .filter(Boolean);

      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          prompt: userPrompt,
          provider,
          modelId: selectedModel.modelId,
          mode,
          routeCategory,
          hasImageInput: serializedImages.length > 0,
          images: serializedImages.length > 0 ? serializedImages : undefined,
          privateOfflineOnly: Boolean(options.privateOfflineOnly),
          allowCloudFallback: Boolean(options.allowCloudFallback),
          projectId: options.projectId,
          history: options.history || [],
          systemPrompt: options.systemPrompt,
          workspaceSnapshot,
          stream: true,
        }),
      });

      const contentType = resp.headers.get('content-type') || '';
      if (resp.ok && contentType.includes('text/event-stream') && resp.body) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulated = '';
        let doneData: any = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || '';
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim());
              if (ev.type === 'token' && typeof ev.delta === 'string') {
                accumulated += ev.delta;
                callbacks.onToken(ev.delta, accumulated);
              } else if (ev.type === 'tool') {
                callbacks.onTool?.({ tool: ev.tool, summary: ev.summary });
              } else if (ev.type === 'done') {
                doneData = ev;
              }
            } catch {
              /* ignore partial frame */
            }
          }
        }

        if (doneData) {
          const tokensIn = Number(doneData.tokensInput || 0);
          const tokensOut = Number(doneData.tokensOutput || 0);
          const latencyMs = Number(doneData.latencyMs || Math.round(performance.now() - startTime));
          const estimatedCost =
            (tokensIn / 1000) * selectedModel.costPer1kInputTokensUSD +
            (tokensOut / 1000) * selectedModel.costPer1kOutputTokensUSD;
          const finalText = doneData.text || accumulated;
          if (!accumulated && finalText) callbacks.onToken(finalText, finalText);

          if (tokensIn > 0 || tokensOut > 0) {
            await db.ai_logs
              .add({
                id: generateId(),
                provider: (doneData.provider || provider) as AIProvider,
                modelId: doneData.modelId || selectedModel.modelId,
                taskMode: mode,
                tokensInput: tokensIn,
                tokensOutput: tokensOut,
                latencyMs,
                estimatedCostUSD: estimatedCost,
                timestamp: new Date().toISOString(),
              })
              .catch(() => {});
          }

          this.activeControllers.delete(requestId);
          this.pushTrace({
            requestId: doneData.requestId || requestId,
            category: (doneData.routeCategory || routeCategory) as TaskRouteCategory,
            provider: String(doneData.provider || provider),
            status: doneData.failoverNotice ? 'failover' : 'ok',
            latencyMs,
            note: doneData.failoverNotice || doneData.routeRationale,
            timestamp: new Date().toISOString(),
          });

          return {
            text: finalText,
            provider: (doneData.provider || provider) as AIProvider,
            modelId: doneData.modelId || selectedModel.modelId,
            requestId: doneData.requestId || requestId,
            routeCategory: doneData.routeCategory || routeCategory,
            routeRationale: doneData.routeRationale,
            providerMode: doneData.providerMode,
            providerNotice: doneData.failoverNotice || doneData.providerNotice || doneData.providerError,
            latencyMs,
            tokensInput: tokensIn,
            tokensOutput: tokensOut,
            estimatedCostUSD: estimatedCost,
            toolCalls: doneData.tool_calls || [],
            proposedActions: (doneData.proposed_actions || []) as AIProposedAction[],
            citations: doneData.citations || [],
            verifiedFacts: doneData.verified_facts,
            estimates: doneData.estimates,
            recommendations: doneData.recommendations,
            unknowns: doneData.unknowns,
            configuredProviders: doneData.configuredProviders,
          };
        }
      }
    } catch (streamErr: any) {
      this.activeControllers.delete(requestId);
      if (controller.signal.aborted || streamErr?.name === 'AbortError') {
        this.pushTrace({
          requestId,
          category: routeCategory,
          provider: String(provider),
          status: 'cancelled',
          latencyMs: Math.round(performance.now() - startTime),
          note: 'Stream aborted by user or new request.',
          timestamp: new Date().toISOString(),
        });
        throw streamErr;
      }
      /* fall through cleanly to executePrompt */
    }

    this.activeControllers.delete(requestId);
    const fallback = await this.executePrompt(userPrompt, options);
    this.pushTrace({
      requestId,
      category: routeCategory,
      provider: String(fallback.provider),
      status: fallback.providerMode === 'grounded_fallback_after_error' ? 'degraded' : 'ok',
      latencyMs: fallback.latencyMs,
      note: fallback.providerNotice,
      timestamp: new Date().toISOString(),
    });
    callbacks.onToken(fallback.text, fallback.text);
    return fallback;
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
      const model = SUPPORTED_MODELS.find((m) => m.modelId === normaliseModelId(modelId));
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

    // Resolve the alias against the models this key can call (same ranking as the server).
    let available: string[] | null = null;
    try {
      const list = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
        headers: { 'x-goog-api-key': apiKey },
      });
      if (list.ok) {
        const data = (await list.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
        available = (data.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => m.name);
      }
    } catch {
      available = null;
    }
    const resolvedModel = chooseGeminiModels(available, modelId).primary;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`,
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
