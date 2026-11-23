/**
 * Gemini model ranking: pure, no Node or browser APIs, so the server and the
 * browser (Settings override key) share it.
 *
 * Why: hardcoded model ids age out (1.5 models are retired) and invented ids
 * ("gemini-3.8-flash") never existed. Instead we ask the API which models the
 * key can call and pick the newest stable one of the wanted tier.
 */

export type GeminiTier = 'flash' | 'pro';

/** Aliases the app sends instead of a fixed id. */
export const GEMINI_AUTO = 'gemini-auto';
export const GEMINI_AUTO_PRO = 'gemini-auto-pro';

/** Variants that aren't general chat/tool-calling models. */
const EXCLUDE = /(tts|image|imagen|live|embedding|aqa|audio|vision|learnlm|gemma|robotics|computer-use|native|veo|search)/i;

interface Parsed {
  id: string;
  version: number;
  tier: GeminiTier;
  lite: boolean;
  unstable: boolean;
}

function parse(rawName: string): Parsed | null {
  const id = rawName.replace(/^models\//, '');
  if (!id.startsWith('gemini-') || EXCLUDE.test(id)) return null;
  const m = /^gemini-(\d+(?:\.\d+)?)-(flash|pro)(-lite)?/.exec(id);
  if (!m) return null;
  return {
    id,
    version: parseFloat(m[1]),
    tier: m[2] as GeminiTier,
    lite: Boolean(m[3]),
    unstable: /(exp|preview|latest|-\d{2}-\d{2}|-\d{4})/i.test(id.slice(m[0].length)) || /exp|preview/i.test(id),
  };
}

/**
 * Orders usable model ids for a tier, best first: stable before preview,
 * newer version first, full before lite, shorter (canonical) id first.
 * Pro falls back to Flash models after all Pro options.
 */
export function rankGeminiModels(names: string[], tier: GeminiTier = 'flash'): string[] {
  const parsed = names.map(parse).filter((p): p is Parsed => p !== null);
  const score = (p: Parsed) => [p.unstable ? 1 : 0, -p.version, p.lite ? 1 : 0, p.id.length] as const;
  const cmp = (a: Parsed, b: Parsed) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] < sb[i] ? -1 : 1;
    return a.id.localeCompare(b.id);
  };
  const primary = parsed.filter((p) => p.tier === tier).sort(cmp);
  const others = parsed.filter((p) => p.tier !== tier).sort(cmp);
  return [...primary, ...(tier === 'pro' ? others : others.filter((p) => p.lite))].map((p) => p.id).filter((id, i, a) => a.indexOf(id) === i);
}

/**
 * The model to call plus one fallback.
 * - An explicit id that the key can use is honoured (e.g. GEMINI_MODEL).
 * - The auto aliases, unknown ids and retired ids resolve to the best available.
 * - With no list at all (offline / listing failed), the request is passed through.
 */
export function chooseGeminiModels(available: string[] | null, requested: string): { primary: string; fallback: string | null } {
  const wanted = requested.trim();
  const tier: GeminiTier = wanted === GEMINI_AUTO_PRO || /-pro\b/.test(wanted) ? 'pro' : 'flash';
  if (!available || available.length === 0) {
    const passthrough = !wanted || wanted === GEMINI_AUTO || wanted === GEMINI_AUTO_PRO ? 'gemini-2.5-flash' : wanted;
    return { primary: passthrough, fallback: null };
  }
  const ids = available.map((n) => n.replace(/^models\//, ''));
  const ranked = rankGeminiModels(ids, tier);
  const primary = wanted && wanted !== GEMINI_AUTO && wanted !== GEMINI_AUTO_PRO && ids.includes(wanted) ? wanted : ranked[0] ?? (wanted || 'gemini-2.5-flash');
  const fallback = ranked.find((id) => id !== primary) ?? null;
  return { primary, fallback };
}
