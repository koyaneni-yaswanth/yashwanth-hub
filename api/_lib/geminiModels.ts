/**
 * Server-side Gemini model resolution: lists the models this API key can call
 * (cached for an hour per warm function instance) and picks via geminiRanking.
 */
import { chooseGeminiModels } from './geminiRanking.ts';

const CACHE_MS = 60 * 60 * 1000;
let cache: { at: number; models: string[] } | null = null;

/** Model ids that support generateContent for this key, or null if the listing failed. */
export async function listGeminiModels(apiKey: string): Promise<string[] | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;
  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const models = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));
    cache = { at: Date.now(), models };
    return models;
  } catch {
    return null;
  }
}

/** Resolves a requested model (alias, explicit id or empty) to a callable one plus a fallback. */
export async function resolveGeminiModel(apiKey: string, requested: string): Promise<{ primary: string; fallback: string | null }> {
  return chooseGeminiModels(await listGeminiModels(apiKey), requested);
}
