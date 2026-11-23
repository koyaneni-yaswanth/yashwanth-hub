/**
 * Shared HTTP helpers for API routes: an origin allowlist for CORS and an
 * error summary that is safe to log.
 */

/** Production, this project's Vercel previews, local dev and the Capacitor Android app. */
const STATIC_ORIGINS = new Set([
  'https://yashwanth-hub.vercel.app',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);
const PATTERNS = [
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/yashwanth-[a-z0-9-]+-koyaneniyaswanth-9270s-projects\.vercel\.app$/,
];

export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  if (STATIC_ORIGINS.has(origin)) return true;
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (extra.includes(origin)) return true;
  return PATTERNS.some((re) => re.test(origin));
}

/**
 * Sets CORS headers only for allowed origins (no wildcard). Requests without an
 * Origin (same-origin, server-to-server webhooks, Vercel cron) are unaffected.
 */
export function applyCors(req: any, res: any, methods: string, headers = 'Content-Type, Authorization'): void {
  const origin = req.headers?.origin as string | undefined;
  res.setHeader('Vary', 'Origin');
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
  }
}

/** A loggable summary of an error: code and message only, never request config, headers or bodies. */
export function safeError(err: any): string {
  const code = err?.response?.data?.error || err?.code || err?.status || err?.name || 'error';
  const message = String(err?.message || '').slice(0, 300);
  return `${typeof code === 'string' ? code : JSON.stringify(code)} - ${message}`;
}
