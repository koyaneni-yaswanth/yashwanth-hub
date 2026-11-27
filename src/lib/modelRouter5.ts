/**
 * JARVIS 5.0 Intelligent 5-Category Model Routing Engine & Circuit Breaker Helpers
 * Pure TypeScript (Node & Browser safe).
 *
 * Categories:
 * - FAST: short questions, summaries, classification, lightweight checks
 * - REASONING: complex engineering, planning, deep research analysis
 * - CODING: architecture, debugging, refactoring, code generation
 * - MULTIMODAL: image/audio analysis requiring vision/audio capable models
 * - LOCAL: private, offline, zero-cost local Ollama inference
 */

import type { CloudOrLocalProviderId, ProviderCapabilities, ProviderConfigMap } from '../../api/_lib/aiProviderAdapters.ts';
import { AI_PROVIDER_REGISTRY } from '../../api/_lib/aiProviderAdapters.ts';

export type TaskRouteCategory = 'FAST' | 'REASONING' | 'CODING' | 'MULTIMODAL' | 'LOCAL';

export interface RouteClassificationInput {
  prompt: string;
  explicitCategory?: TaskRouteCategory;
  requiresTools?: boolean;
  hasImageInput?: boolean;
  hasAudioInput?: boolean;
  privateOfflineOnly?: boolean;
}

export interface CircuitStateRecord {
  provider: CloudOrLocalProviderId;
  state: 'closed' | 'open' | 'half_open';
  failures: number;
  lastFailureAt: number | null;
  openedUntil: number | null;
  lastError?: string;
}

export class ProviderCircuitBreaker {
  private states = new Map<CloudOrLocalProviderId, CircuitStateRecord>();
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 30000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  public getState(provider: CloudOrLocalProviderId, nowMs = Date.now()): CircuitStateRecord {
    const cur = this.states.get(provider) || {
      provider,
      state: 'closed' as const,
      failures: 0,
      lastFailureAt: null,
      openedUntil: null,
    };
    if (cur.state === 'open' && cur.openedUntil && nowMs >= cur.openedUntil) {
      const next: CircuitStateRecord = { ...cur, state: 'half_open' };
      this.states.set(provider, next);
      return next;
    }
    return cur;
  }

  public canAttempt(provider: CloudOrLocalProviderId, nowMs = Date.now()): boolean {
    const st = this.getState(provider, nowMs);
    return st.state !== 'open';
  }

  public recordSuccess(provider: CloudOrLocalProviderId): void {
    this.states.set(provider, {
      provider,
      state: 'closed',
      failures: 0,
      lastFailureAt: null,
      openedUntil: null,
    });
  }

  public recordFailure(provider: CloudOrLocalProviderId, errorMsg: string, permanent = false, nowMs = Date.now()): void {
    const prev = this.getState(provider, nowMs);
    const failures = prev.failures + 1;
    const shouldOpen = permanent || failures >= this.threshold;
    this.states.set(provider, {
      provider,
      state: shouldOpen ? 'open' : 'closed',
      failures,
      lastFailureAt: nowMs,
      openedUntil: shouldOpen ? nowMs + (permanent ? this.cooldownMs * 2 : this.cooldownMs) : null,
      lastError: errorMsg,
    });
  }

  public snapshot(nowMs = Date.now()): CircuitStateRecord[] {
    return (Object.keys(AI_PROVIDER_REGISTRY) as CloudOrLocalProviderId[]).map((p) => this.getState(p, nowMs));
  }
}

export function classifyTaskCategory(input: RouteClassificationInput): TaskRouteCategory {
  if (input.explicitCategory) return input.explicitCategory;
  if (input.privateOfflineOnly) return 'LOCAL';
  if (input.hasImageInput || input.hasAudioInput) return 'MULTIMODAL';

  const q = String(input.prompt || '').toLowerCase();
  if (
    /\b(?:private|offline|local\s+only|ollama|without\s+cloud|confidential)\b/i.test(q)
  ) {
    return 'LOCAL';
  }
  if (
    /\b(?:code|bug|refactor|typescript|python|fastapi|sql|migration|function|stack\s*trace|compile|lint|api\s+endpoint|debug)\b/i.test(q)
  ) {
    return 'CODING';
  }
  if (
    /\b(?:architect|design|plan|trade[- ]?off|analyze|research|wind\s+turbine|trl|aerodynamic|kinematic|compare|strategy|root\s+cause)\b/i.test(q) ||
    q.length > 260
  ) {
    return 'REASONING';
  }
  return 'FAST';
}

export function providerSupportsRequirements(
  provider: CloudOrLocalProviderId,
  req: { category: TaskRouteCategory; hasImageInput?: boolean; requiresTools?: boolean }
): { ok: boolean; reason?: string } {
  const caps: ProviderCapabilities | undefined = AI_PROVIDER_REGISTRY[provider]?.capabilities;
  if (!caps) return { ok: false, reason: 'Unknown provider' };
  if (req.hasImageInput && !caps.vision) {
    return { ok: false, reason: `${AI_PROVIDER_REGISTRY[provider].name} lacks vision capability.` };
  }
  if (req.requiresTools && !caps.tools) {
    return { ok: false, reason: `${AI_PROVIDER_REGISTRY[provider].name} lacks tool-calling support.` };
  }
  return { ok: true };
}

export interface Jarvis5RoutePlan {
  category: TaskRouteCategory;
  routingMode: 'automatic' | 'manual';
  primaryProvider: CloudOrLocalProviderId | 'local_heuristic';
  fallbackChain: CloudOrLocalProviderId[];
  rejectedForCapability: Array<{ provider: CloudOrLocalProviderId; reason: string }>;
  rejectedForCircuit: CloudOrLocalProviderId[];
  privacyLockedLocal: boolean;
  allowCloudFallback: boolean;
  rationale: string;
}

const CATEGORY_PRIORITY: Record<TaskRouteCategory, CloudOrLocalProviderId[]> = {
  FAST: ['gemini', 'ollama', 'openai', 'openrouter', 'huggingface', 'anthropic'],
  REASONING: ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama', 'huggingface'],
  CODING: ['anthropic', 'openai', 'gemini', 'ollama', 'openrouter', 'huggingface'],
  MULTIMODAL: ['gemini', 'openai', 'anthropic', 'openrouter', 'huggingface', 'ollama'],
  LOCAL: ['ollama'],
};

export function buildJarvis5RoutePlan(input: {
  prompt: string;
  requestedProvider?: CloudOrLocalProviderId | 'auto' | 'local_heuristic';
  explicitCategory?: TaskRouteCategory;
  hasImageInput?: boolean;
  hasAudioInput?: boolean;
  requiresTools?: boolean;
  privateOfflineOnly?: boolean;
  allowCloudFallbackWhenLocalDown?: boolean;
  localAgentOllamaReady?: boolean;
  localGpuVramFreeMb?: number;
  configured: ProviderConfigMap;
  enabledProviders?: Partial<Record<CloudOrLocalProviderId, boolean>>;
  latenciesMs?: Partial<Record<CloudOrLocalProviderId, number | null>>;
  breaker?: ProviderCircuitBreaker;
}): Jarvis5RoutePlan {
  const category = classifyTaskCategory({
    prompt: input.prompt,
    explicitCategory: input.explicitCategory,
    hasImageInput: input.hasImageInput,
    hasAudioInput: input.hasAudioInput,
    privateOfflineOnly: input.privateOfflineOnly,
  });

  const allowCloudFallback = Boolean(input.allowCloudFallbackWhenLocalDown) && !input.privateOfflineOnly;
  const orderBase = CATEGORY_PRIORITY[category];
  const candidateOrder: CloudOrLocalProviderId[] =
    category === 'LOCAL' && allowCloudFallback
      ? ['ollama', 'gemini', 'openai', 'anthropic', 'openrouter']
      : orderBase;

  const isEnabled = (p: CloudOrLocalProviderId) => input.enabledProviders?.[p] !== false;
  const isAvailable = (p: CloudOrLocalProviderId) =>
    p === 'ollama'
      ? Boolean(input.configured.ollama || input.localAgentOllamaReady) && isEnabled('ollama')
      : Boolean(input.configured[p]) && isEnabled(p);

  const rejectedForCapability: Array<{ provider: CloudOrLocalProviderId; reason: string }> = [];
  const rejectedForCircuit: CloudOrLocalProviderId[] = [];
  const eligible: CloudOrLocalProviderId[] = [];

  for (const p of candidateOrder) {
    if (!isAvailable(p)) continue;
    const cap = providerSupportsRequirements(p, {
      category,
      hasImageInput: input.hasImageInput,
      requiresTools: input.requiresTools,
    });
    if (!cap.ok) {
      rejectedForCapability.push({ provider: p, reason: cap.reason || 'Incompatible capabilities' });
      continue;
    }
    if (input.breaker && !input.breaker.canAttempt(p)) {
      rejectedForCircuit.push(p);
      continue;
    }
    eligible.push(p);
  }

  // Respect manual selection cleanly while checking capability & availability
  const manualReq =
    input.requestedProvider &&
    input.requestedProvider !== 'auto' &&
    input.requestedProvider !== 'local_heuristic'
      ? (input.requestedProvider as CloudOrLocalProviderId)
      : null;

  let ordered = eligible;
  let routingMode: 'automatic' | 'manual' = 'automatic';
  if (manualReq) {
    routingMode = 'manual';
    if (eligible.includes(manualReq)) {
      ordered = [manualReq, ...eligible.filter((p) => p !== manualReq)];
    }
  } else if (input.latenciesMs) {
    // Keep category rank dominant, break ties by latency
    ordered = [...eligible].sort((a, b) => {
      const rankDiff = candidateOrder.indexOf(a) - candidateOrder.indexOf(b);
      if (Math.abs(rankDiff) > 1) return rankDiff;
      return (input.latenciesMs?.[a] ?? 9999) - (input.latenciesMs?.[b] ?? 9999);
    });
  }

  // Never downgrade complex REASONING/CODING silently to a tiny missing-capability endpoint without noting
  const primaryProvider = ordered[0] || 'local_heuristic';
  const vramNote =
    primaryProvider === 'ollama' && typeof input.localGpuVramFreeMb === 'number'
      ? ` (GPU free VRAM ${input.localGpuVramFreeMb} MiB)`
      : '';

  return {
    category,
    routingMode,
    primaryProvider,
    fallbackChain: ordered,
    rejectedForCapability,
    rejectedForCircuit,
    privacyLockedLocal: Boolean(input.privateOfflineOnly),
    allowCloudFallback,
    rationale:
      ordered.length > 0
        ? `[${category} · ${routingMode}] Selected ${primaryProvider}${vramNote}${
            ordered.length > 1 ? ` with fallbacks: ${ordered.slice(1).join(' -> ')}` : ''
          }.`
        : input.privateOfflineOnly
        ? '[LOCAL · Privacy Mode] Local Ollama offline and cloud fallback disabled by privacy setting.'
        : 'No compatible configured AI provider currently healthy; falling back to local grounded synthesis.',
  };
}

export function isTransientHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export function computeJitteredBackoffMs(attempt: number, baseMs = 250): number {
  const exp = baseMs * Math.pow(2, Math.max(0, attempt));
  const jitter = Math.round(Math.random() * 120);
  return Math.min(4000, exp + jitter);
}
