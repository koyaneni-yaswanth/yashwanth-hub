import type { AIModelConfig, AIMode } from '../../types';

export const SUPPORTED_MODELS: AIModelConfig[] = [
  // Google Gemini Models
  {
    provider: 'gemini',
    modelId: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro (Deep Reasoning & Multimodal)',
    contextWindow: 1048576,
    costPer1kInputTokensUSD: 0.00125,
    costPer1kOutputTokensUSD: 0.005,
    supportedModes: ['engineering', 'research', 'startup', 'writing'],
    latencyProfile: 'deep_reasoning',
  },
  {
    provider: 'gemini',
    modelId: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash (Ultra-fast & Intelligent)',
    contextWindow: 1048576,
    costPer1kInputTokensUSD: 0.000075,
    costPer1kOutputTokensUSD: 0.0003,
    supportedModes: ['personal', 'engineering', 'startup', 'research', 'meeting', 'writing'],
    latencyProfile: 'ultra_fast',
    isDefault: true,
  },
  {
    provider: 'gemini',
    modelId: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash (Lightweight & Efficient)',
    contextWindow: 1048576,
    costPer1kInputTokensUSD: 0.000075,
    costPer1kOutputTokensUSD: 0.0003,
    supportedModes: ['personal', 'meeting', 'writing'],
    latencyProfile: 'ultra_fast',
  },

  // Anthropic Claude Models
  {
    provider: 'anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet (State of the Art Code & Logic)',
    contextWindow: 200000,
    costPer1kInputTokensUSD: 0.003,
    costPer1kOutputTokensUSD: 0.015,
    supportedModes: ['engineering', 'writing', 'research', 'startup'],
    latencyProfile: 'balanced',
  },
  {
    provider: 'anthropic',
    modelId: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku (High Speed & Parsing)',
    contextWindow: 200000,
    costPer1kInputTokensUSD: 0.0008,
    costPer1kOutputTokensUSD: 0.004,
    supportedModes: ['personal', 'meeting', 'writing'],
    latencyProfile: 'ultra_fast',
  },

  // OpenAI GPT Models
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    displayName: 'GPT-4o (Omni Multimodal Flagship)',
    contextWindow: 128000,
    costPer1kInputTokensUSD: 0.0025,
    costPer1kOutputTokensUSD: 0.01,
    supportedModes: ['engineering', 'startup', 'research', 'writing'],
    latencyProfile: 'balanced',
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini (Fast & Cost Efficient)',
    contextWindow: 128000,
    costPer1kInputTokensUSD: 0.00015,
    costPer1kOutputTokensUSD: 0.0006,
    supportedModes: ['personal', 'meeting', 'writing'],
    latencyProfile: 'ultra_fast',
  },
  {
    provider: 'openai',
    modelId: 'o1-mini',
    displayName: 'OpenAI o1-mini (STEM & Complex Reasoning)',
    contextWindow: 128000,
    costPer1kInputTokensUSD: 0.003,
    costPer1kOutputTokensUSD: 0.012,
    supportedModes: ['engineering', 'research'],
    latencyProfile: 'deep_reasoning',
  },
];

export function getRecommendedModel(
  mode: AIMode,
  complexity: 'simple' | 'moderate' | 'complex'
): AIModelConfig {
  if (complexity === 'complex') {
    // Recommend deep reasoning model
    if (mode === 'engineering' || mode === 'research') {
      return (
        SUPPORTED_MODELS.find((m) => m.modelId === 'claude-3-5-sonnet-20241022') ||
        SUPPORTED_MODELS.find((m) => m.modelId === 'gemini-2.5-pro') ||
        SUPPORTED_MODELS[0]
      );
    }
    return (
      SUPPORTED_MODELS.find((m) => m.modelId === 'gemini-2.5-pro') ||
      SUPPORTED_MODELS[0]
    );
  }

  // Fast models for routine queries and summaries
  return (
    SUPPORTED_MODELS.find((m) => m.modelId === 'gemini-2.5-flash') ||
    SUPPORTED_MODELS.find((m) => m.modelId === 'gpt-4o-mini') ||
    SUPPORTED_MODELS[1]
  );
}
