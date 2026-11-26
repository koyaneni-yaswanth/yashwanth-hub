import type { AIModelConfig, AIMode } from '../../types';

/**
 * Unified Multi-AI Model Registry.
 * Gemini aliases resolve dynamically against Google's model discovery endpoint
 * (api/_lib/geminiRanking.ts). OpenRouter, OpenAI, Anthropic, Hugging Face, and
 * Ollama route through server adapters (or direct localhost for local Ollama).
 */
export const SUPPORTED_MODELS: AIModelConfig[] = [
  {
    provider: 'auto',
    modelId: 'auto-fastest',
    displayName: 'Smart Auto Router (Fastest Healthy AI)',
    contextWindow: 1048576,
    costPer1kInputTokensUSD: 0.0003,
    costPer1kOutputTokensUSD: 0.0025,
    supportedModes: ['personal', 'engineering', 'startup', 'research', 'meeting', 'writing'],
    latencyProfile: 'ultra_fast',
    isDefault: true,
  },
  {
    provider: 'gemini',
    modelId: 'gemini-auto',
    displayName: 'Google Gemini Flash (Best Available · Active)',
    contextWindow: 1048576,
    costPer1kInputTokensUSD: 0.0003,
    costPer1kOutputTokensUSD: 0.0025,
    supportedModes: ['personal', 'engineering', 'startup', 'research', 'meeting', 'writing'],
    latencyProfile: 'ultra_fast',
  },
  {
    provider: 'gemini',
    modelId: 'gemini-auto-pro',
    displayName: 'Google Gemini Pro (Deep Reasoning)',
    contextWindow: 1048576,
    costPer1kInputTokensUSD: 0.00125,
    costPer1kOutputTokensUSD: 0.01,
    supportedModes: ['engineering', 'research', 'startup', 'writing'],
    latencyProfile: 'deep_reasoning',
  },
  {
    provider: 'openrouter',
    modelId: 'openrouter/auto',
    displayName: 'OpenRouter Auto (Multi-Model · needs OPENROUTER_API_KEY)',
    contextWindow: 200000,
    costPer1kInputTokensUSD: 0.0005,
    costPer1kOutputTokensUSD: 0.002,
    supportedModes: ['personal', 'engineering', 'startup', 'research', 'meeting', 'writing'],
    latencyProfile: 'balanced',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-haiku-5-5',
    displayName: 'Anthropic Claude Haiku (needs ANTHROPIC_API_KEY)',
    contextWindow: 200000,
    costPer1kInputTokensUSD: 0.001,
    costPer1kOutputTokensUSD: 0.005,
    supportedModes: ['personal', 'meeting', 'writing', 'engineering'],
    latencyProfile: 'ultra_fast',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'OpenAI GPT-4o Mini (needs OPENAI_API_KEY)',
    contextWindow: 128000,
    costPer1kInputTokensUSD: 0.00015,
    costPer1kOutputTokensUSD: 0.0006,
    supportedModes: ['personal', 'meeting', 'writing', 'engineering'],
    latencyProfile: 'ultra_fast',
  },
  {
    provider: 'huggingface',
    modelId: 'Qwen/Qwen2.5-72B-Instruct',
    displayName: 'Hugging Face Router · Qwen 2.5 72B (needs HF_TOKEN)',
    contextWindow: 32768,
    costPer1kInputTokensUSD: 0.0002,
    costPer1kOutputTokensUSD: 0.0006,
    supportedModes: ['engineering', 'research', 'writing'],
    latencyProfile: 'balanced',
  },
  {
    provider: 'ollama',
    modelId: 'llama3.2',
    displayName: 'Ollama Local (Private / Offline localhost:11434)',
    contextWindow: 128000,
    costPer1kInputTokensUSD: 0,
    costPer1kOutputTokensUSD: 0,
    supportedModes: ['personal', 'engineering', 'writing'],
    latencyProfile: 'balanced',
  },
];

/** Old saved selections (retired or invented ids) map onto active aliases. */
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
  if (complexity === 'complex') {
    return SUPPORTED_MODELS.find((m) => m.modelId === 'gemini-auto-pro') || SUPPORTED_MODELS[0];
  }
  return SUPPORTED_MODELS.find((m) => m.modelId === 'gemini-auto') || SUPPORTED_MODELS[0];
}
