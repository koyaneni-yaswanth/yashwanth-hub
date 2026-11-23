import type { AIModelConfig, AIMode } from '../../types';

/**
 * Model menu. Gemini entries are aliases: the server asks Google which models
 * the key can call and picks the newest stable Flash / Pro (see
 * api/_lib/geminiRanking.ts), so no dated, retirable id lives here.
 * Costs are rough per-1k-token estimates for the usage meter only.
 */
export const SUPPORTED_MODELS: AIModelConfig[] = [
  {
    provider: 'gemini',
    modelId: 'gemini-auto',
    displayName: 'Gemini Flash (best available)',
    contextWindow: 1048576,
    costPer1kInputTokensUSD: 0.0003,
    costPer1kOutputTokensUSD: 0.0025,
    supportedModes: ['personal', 'engineering', 'startup', 'research', 'meeting', 'writing'],
    latencyProfile: 'ultra_fast',
    isDefault: true,
  },
  {
    provider: 'gemini',
    modelId: 'gemini-auto-pro',
    displayName: 'Gemini Pro (best available, deeper reasoning)',
    contextWindow: 1048576,
    costPer1kInputTokensUSD: 0.00125,
    costPer1kOutputTokensUSD: 0.01,
    supportedModes: ['engineering', 'research', 'startup', 'writing'],
    latencyProfile: 'deep_reasoning',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-5-5',
    displayName: 'Claude Haiku (needs ANTHROPIC_API_KEY)',
    contextWindow: 200000,
    costPer1kInputTokensUSD: 0.001,
    costPer1kOutputTokensUSD: 0.005,
    supportedModes: ['personal', 'meeting', 'writing', 'engineering'],
    latencyProfile: 'ultra_fast',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini (needs OPENAI_API_KEY)',
    contextWindow: 128000,
    costPer1kInputTokensUSD: 0.00015,
    costPer1kOutputTokensUSD: 0.0006,
    supportedModes: ['personal', 'meeting', 'writing'],
    latencyProfile: 'ultra_fast',
  },
];

/** Old saved selections (retired or invented ids) map onto the aliases. */
export function normaliseModelId(modelId: string | undefined | null): string {
  const id = (modelId || '').trim();
  if (SUPPORTED_MODELS.some((m) => m.modelId === id)) return id;
  if (id.startsWith('gemini-')) return /-pro\b/.test(id) ? 'gemini-auto-pro' : 'gemini-auto';
  return id || 'gemini-auto';
}

export function getRecommendedModel(
  _mode: AIMode,
  complexity: 'simple' | 'moderate' | 'complex'
): AIModelConfig {
  const id = complexity === 'complex' ? 'gemini-auto-pro' : 'gemini-auto';
  return SUPPORTED_MODELS.find((m) => m.modelId === id) || SUPPORTED_MODELS[0];
}
