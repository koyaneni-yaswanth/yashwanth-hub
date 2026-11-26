/**
 * Unified Multi-Provider AI Capabilities, Health Probes & Fast Auto-Router
 *
 * Pure HTTP/TypeScript helpers shared between Vercel serverless (`api/ai/chat.ts`),
 * client AI Gateway (`src/services/ai/aiGateway.ts`), and automated unit tests.
 * Never fabricates live availability: `healthCheckProviders` reports actual HTTP/config state.
 */

export type CloudOrLocalProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'huggingface'
  | 'ollama';

export interface ProviderCapabilities {
  chat: boolean;
  tools: boolean;
  vision: boolean;
  embeddings: boolean;
  modelDiscovery: boolean;
  localPrivate: boolean;
}

export interface ProviderRegistryEntry {
  id: CloudOrLocalProviderId;
  name: string;
  endpoint: string;
  envVar: string;
  capabilities: ProviderCapabilities;
  defaultModel: string;
  strengthSummary: string;
}

export const AI_PROVIDER_REGISTRY: Record<CloudOrLocalProviderId, ProviderRegistryEntry> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    envVar: 'GEMINI_API_KEY',
    capabilities: {
      chat: true,
      tools: true,
      vision: true,
      embeddings: true,
      modelDiscovery: true,
      localPrivate: false,
    },
    defaultModel: 'gemini-auto',
    strengthSummary: 'Fastest Flash latency, 1M context, native tool calling & live model ranking.',
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    envVar: 'OPENROUTER_API_KEY',
    capabilities: {
      chat: true,
      tools: true,
      vision: true,
      embeddings: false,
      modelDiscovery: true,
      localPrivate: false,
    },
    defaultModel: 'openrouter/auto',
    strengthSummary: 'Single unified router across GPT, Claude, DeepSeek, Llama & Qwen with auto fallback.',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    envVar: 'OPENAI_API_KEY',
    capabilities: {
      chat: true,
      tools: true,
      vision: true,
      embeddings: true,
      modelDiscovery: true,
      localPrivate: false,
    },
    defaultModel: 'gpt-4o-mini',
    strengthSummary: 'Reliable structured JSON tool calling and low-latency gpt-4o-mini responses.',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic Claude',
    endpoint: 'https://api.anthropic.com/v1/messages',
    envVar: 'ANTHROPIC_API_KEY',
    capabilities: {
      chat: true,
      tools: true,
      vision: true,
      embeddings: false,
      modelDiscovery: false,
      localPrivate: false,
    },
    defaultModel: 'claude-haiku-4-5',
    strengthSummary: 'High precision engineering analysis, coding, and technical synthesis.',
  },
  huggingface: {
    id: 'huggingface',
    name: 'Hugging Face Router',
    endpoint: 'https://router.huggingface.co/v1/chat/completions',
    envVar: 'HF_TOKEN',
    capabilities: {
      chat: true,
      tools: true,
      vision: false,
      embeddings: true,
      modelDiscovery: true,
      localPrivate: false,
    },
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    strengthSummary: 'Open-weights ecosystem (Qwen, Llama, Mistral) via unified HF Inference Router.',
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (Local)',
    endpoint: 'http://127.0.0.1:11434',
    envVar: 'OLLAMA_BASE_URL',
    capabilities: {
      chat: true,
      tools: true,
      vision: false,
      embeddings: true,
      modelDiscovery: true,
      localPrivate: true,
    },
    defaultModel: 'llama3.2',
    strengthSummary: 'Zero-cost private local inference on workstation/laptop GPUs.',
  },
};

export interface ProviderConfigMap {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
  openrouter: boolean;
  huggingface: boolean;
  ollama: boolean;
}

export interface ProviderHealthReport {
  id: CloudOrLocalProviderId;
  name: string;
  configured: boolean;
  status: 'connected' | 'not_configured' | 'degraded' | 'unreachable';
  reachable: boolean;
  latencyMs: number | null;
  discoveredModelsCount?: number;
  sampleModels?: string[];
  capabilities: ProviderCapabilities;
  note: string;
}

export function detectConfiguredProviders(env: Record<string, string | undefined> = {}): ProviderConfigMap {
  const ollamaUrl = (env.OLLAMA_BASE_URL || '').trim();
  const gemini = Boolean((env.GEMINI_API_KEY || '').trim());
  const openai = Boolean((env.OPENAI_API_KEY || '').trim());
  const anthropic = Boolean((env.ANTHROPIC_API_KEY || '').trim());
  const openrouter = Boolean((env.OPENROUTER_API_KEY || '').trim());
  const huggingface = Boolean((env.HF_TOKEN || env.HUGGINGFACE_API_KEY || '').trim());
  const ollama = Boolean(ollamaUrl);
  return { gemini, openai, anthropic, openrouter, huggingface, ollama };
}

/**
 * Picks the fastest responsive failover chain given a requested provider (`'auto'` or explicit)
 * and the actually configured providers. Never routes to unconfigured providers.
 */
export function buildProviderExecutionChain(
  requestedProvider: string,
  configured: ProviderConfigMap,
  measuredLatenciesMs?: Partial<Record<CloudOrLocalProviderId, number | null>>
): CloudOrLocalProviderId[] {
  const priorityOrder: CloudOrLocalProviderId[] = [
    'gemini',
    'openrouter',
    'openai',
    'anthropic',
    'huggingface',
    'ollama',
  ];

  const available = priorityOrder.filter((id) => configured[id]);
  if (available.length === 0) return [];

  if (measuredLatenciesMs) {
    available.sort((a, b) => {
      const la = measuredLatenciesMs[a] ?? 999999;
      const lb = measuredLatenciesMs[b] ?? 999999;
      return la - lb;
    });
  }

  if (
    requestedProvider &&
    requestedProvider !== 'auto' &&
    requestedProvider !== 'local_heuristic' &&
    configured[requestedProvider as CloudOrLocalProviderId]
  ) {
    const chosen = requestedProvider as CloudOrLocalProviderId;
    return [chosen, ...available.filter((id) => id !== chosen)];
  }

  return available;
}

/**
 * Probes configured and public provider endpoints concurrently with a strict timeout
 * to measure true reachability, TLS/API response latency, and available models.
 */
export async function probeAllProviders(
  env: Record<string, string | undefined> = {},
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3500
): Promise<ProviderHealthReport[]> {
  const configured = detectConfiguredProviders(env);
  const hfKey = (env.HF_TOKEN || env.HUGGINGFACE_API_KEY || '').trim();
  const ollamaUrl = (env.OLLAMA_BASE_URL || '').trim().replace(/\/$/, '');

  const checks: Promise<ProviderHealthReport>[] = [
    (async () => {
      const entry = AI_PROVIDER_REGISTRY.gemini;
      const key = (env.GEMINI_API_KEY || '').trim();
      const t0 = Date.now();
      try {
        const res = await fetchImpl(`${entry.endpoint}/models?pageSize=25`, {
          headers: key ? { 'x-goog-api-key': key } : {},
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latencyMs = Date.now() - t0;
        const body = await res.json().catch(() => ({}));
        const models: string[] = Array.isArray(body.models)
          ? body.models.map((m: any) => String(m.name || '').replace(/^models\//, '')).filter(Boolean)
          : [];
        return {
          id: 'gemini',
          name: entry.name,
          configured: configured.gemini,
          status: configured.gemini ? (res.ok ? 'connected' : 'degraded') : 'not_configured',
          reachable: res.status > 0,
          latencyMs,
          discoveredModelsCount: models.length || undefined,
          sampleModels: models.slice(0, 5),
          capabilities: entry.capabilities,
          note: configured.gemini
            ? res.ok
              ? `Live key verified (${models.length} models ready)`
              : `API responded HTTP ${res.status}`
            : 'Endpoint reachable; add GEMINI_API_KEY in Vercel to enable',
        };
      } catch (err: any) {
        return {
          id: 'gemini',
          name: entry.name,
          configured: configured.gemini,
          status: 'unreachable',
          reachable: false,
          latencyMs: null,
          capabilities: entry.capabilities,
          note: err?.message || 'Timeout or network error',
        };
      }
    })(),

    (async () => {
      const entry = AI_PROVIDER_REGISTRY.openrouter;
      const t0 = Date.now();
      try {
        const key = (env.OPENROUTER_API_KEY || '').trim();
        const res = await fetchImpl('https://openrouter.ai/api/v1/models', {
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latencyMs = Date.now() - t0;
        const body = await res.json().catch(() => ({}));
        const models: string[] = Array.isArray(body.data)
          ? body.data.slice(0, 400).map((m: any) => String(m.id || '')).filter(Boolean)
          : [];
        return {
          id: 'openrouter',
          name: entry.name,
          configured: configured.openrouter,
          status: configured.openrouter ? (res.ok ? 'connected' : 'degraded') : 'not_configured',
          reachable: res.ok,
          latencyMs,
          discoveredModelsCount: Array.isArray(body.data) ? body.data.length : undefined,
          sampleModels: models.slice(0, 5),
          capabilities: entry.capabilities,
          note: configured.openrouter
            ? `Active key · ${Array.isArray(body.data) ? body.data.length : 0} routed models`
            : `Public catalog live (${Array.isArray(body.data) ? body.data.length : 0} models); add OPENROUTER_API_KEY to activate`,
        };
      } catch (err: any) {
        return {
          id: 'openrouter',
          name: entry.name,
          configured: configured.openrouter,
          status: 'unreachable',
          reachable: false,
          latencyMs: null,
          capabilities: entry.capabilities,
          note: err?.message || 'Timeout or network error',
        };
      }
    })(),

    (async () => {
      const entry = AI_PROVIDER_REGISTRY.openai;
      const key = (env.OPENAI_API_KEY || '').trim();
      const t0 = Date.now();
      try {
        const res = await fetchImpl('https://api.openai.com/v1/models', {
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latencyMs = Date.now() - t0;
        const body = res.ok ? await res.json().catch(() => ({})) : {};
        const models: string[] = Array.isArray(body.data)
          ? body.data.map((m: any) => String(m.id || '')).filter((id: string) => /gpt-|o[134]/.test(id))
          : [];
        return {
          id: 'openai',
          name: entry.name,
          configured: configured.openai,
          status: configured.openai ? (res.ok ? 'connected' : 'degraded') : 'not_configured',
          reachable: res.status > 0,
          latencyMs,
          discoveredModelsCount: models.length || undefined,
          sampleModels: models.slice(0, 5),
          capabilities: entry.capabilities,
          note: configured.openai
            ? res.ok
              ? `Live key verified (${models.length} models)`
              : `API returned HTTP ${res.status}`
            : 'Endpoint reachable; add OPENAI_API_KEY to enable',
        };
      } catch (err: any) {
        return {
          id: 'openai',
          name: entry.name,
          configured: configured.openai,
          status: 'unreachable',
          reachable: false,
          latencyMs: null,
          capabilities: entry.capabilities,
          note: err?.message || 'Timeout or network error',
        };
      }
    })(),

    (async () => {
      const entry = AI_PROVIDER_REGISTRY.anthropic;
      const key = (env.ANTHROPIC_API_KEY || '').trim();
      const t0 = Date.now();
      try {
        const res = await fetchImpl('https://api.anthropic.com/v1/models', {
          headers: {
            'anthropic-version': '2023-06-01',
            ...(key ? { 'x-api-key': key } : {}),
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latencyMs = Date.now() - t0;
        const body = res.ok ? await res.json().catch(() => ({})) : {};
        const models: string[] = Array.isArray(body.data)
          ? body.data.map((m: any) => String(m.id || '')).filter(Boolean)
          : [];
        return {
          id: 'anthropic',
          name: entry.name,
          configured: configured.anthropic,
          status: configured.anthropic ? (res.ok ? 'connected' : 'degraded') : 'not_configured',
          reachable: res.status > 0,
          latencyMs,
          discoveredModelsCount: models.length || undefined,
          sampleModels: models.slice(0, 5),
          capabilities: entry.capabilities,
          note: configured.anthropic
            ? res.ok
              ? `Live key verified (${models.length} Claude models)`
              : `API returned HTTP ${res.status}`
            : 'Endpoint reachable; add ANTHROPIC_API_KEY to enable',
        };
      } catch (err: any) {
        return {
          id: 'anthropic',
          name: entry.name,
          configured: configured.anthropic,
          status: 'unreachable',
          reachable: false,
          latencyMs: null,
          capabilities: entry.capabilities,
          note: err?.message || 'Timeout or network error',
        };
      }
    })(),

    (async () => {
      const entry = AI_PROVIDER_REGISTRY.huggingface;
      const t0 = Date.now();
      try {
        const res = await fetchImpl('https://router.huggingface.co/v1/models', {
          headers: hfKey ? { Authorization: `Bearer ${hfKey}` } : {},
          signal: AbortSignal.timeout(timeoutMs),
        });
        const latencyMs = Date.now() - t0;
        const body = await res.json().catch(() => ({}));
        const models: string[] = Array.isArray(body.data)
          ? body.data.map((m: any) => String(m.id || '')).filter(Boolean)
          : [];
        return {
          id: 'huggingface',
          name: entry.name,
          configured: configured.huggingface,
          status: configured.huggingface ? (res.ok ? 'connected' : 'degraded') : 'not_configured',
          reachable: res.ok,
          latencyMs,
          discoveredModelsCount: models.length || undefined,
          sampleModels: models.slice(0, 5),
          capabilities: entry.capabilities,
          note: configured.huggingface
            ? `Active key · ${models.length} router models available`
            : `Public HF Router live (${models.length} models); add HF_TOKEN to activate`,
        };
      } catch (err: any) {
        return {
          id: 'huggingface',
          name: entry.name,
          configured: configured.huggingface,
          status: 'unreachable',
          reachable: false,
          latencyMs: null,
          capabilities: entry.capabilities,
          note: err?.message || 'Timeout or network error',
        };
      }
    })(),

    (async () => {
      const entry = AI_PROVIDER_REGISTRY.ollama;
      if (!ollamaUrl) {
        return {
          id: 'ollama',
          name: entry.name,
          configured: false,
          status: 'not_configured',
          reachable: false,
          latencyMs: null,
          capabilities: entry.capabilities,
          note: 'Server OLLAMA_BASE_URL not set; local Ollama can still be tested directly from your browser when running locally.',
        };
      }
      const t0 = Date.now();
      try {
        const res = await fetchImpl(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
        const latencyMs = Date.now() - t0;
        const body = res.ok ? await res.json().catch(() => ({})) : {};
        const models: string[] = Array.isArray(body.models)
          ? body.models.map((m: any) => String(m.name || '')).filter(Boolean)
          : [];
        return {
          id: 'ollama',
          name: entry.name,
          configured: true,
          status: res.ok ? 'connected' : 'degraded',
          reachable: res.ok,
          latencyMs,
          discoveredModelsCount: models.length,
          sampleModels: models.slice(0, 5),
          capabilities: entry.capabilities,
          note: res.ok ? `${models.length} Ollama model(s) loaded` : `Ollama HTTP ${res.status}`,
        };
      } catch (err: any) {
        return {
          id: 'ollama',
          name: entry.name,
          configured: true,
          status: 'unreachable',
          reachable: false,
          latencyMs: null,
          capabilities: entry.capabilities,
          note: err?.message || 'Ollama endpoint unreachable',
        };
      }
    })(),
  ];

  return Promise.all(checks);
}

export function selectRecommendedProvider(reports: ProviderHealthReport[]): {
  provider: CloudOrLocalProviderId | 'local_heuristic';
  reason: string;
} {
  const connected = reports
    .filter((r) => r.configured && r.status === 'connected')
    .sort((a, b) => (a.latencyMs ?? 999999) - (b.latencyMs ?? 999999));

  if (connected.length > 0) {
    const best = connected[0];
    return {
      provider: best.id,
      reason: `${best.name} is active with ${best.latencyMs ?? '?'}ms API latency, full tool calling, and native workspace integration.`,
    };
  }

  return {
    provider: 'local_heuristic',
    reason: 'No cloud AI key configured yet; running on deterministic grounded Chief of Staff engine.',
  };
}
