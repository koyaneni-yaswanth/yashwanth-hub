/**
 * Shared Google OAuth helpers for /api/auth/google/callback and /api/auth/google/token.
 * All diagnostics redact secrets (client_secret, code, code_verifier, access_token, refresh_token).
 */

export function cleanEnvValue(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/\r|\n/g, '').trim().replace(/^['"]|['"]$/g, '').trim();
}

export function normalizeRedirectUri(uri: string | undefined | null): string {
  if (!uri) return '';
  const cleaned = uri.trim();
  if (cleaned === '/') return cleaned;
  return cleaned.replace(/\/+$/, '');
}

export function resolveGoogleOAuthConfig(clientIdOverride?: string) {
  const googleClientIdEnv = cleanEnvValue(process.env.GOOGLE_CLIENT_ID);
  const viteGoogleClientIdEnv = cleanEnvValue(process.env.VITE_GOOGLE_CLIENT_ID);
  const overrideClientId = cleanEnvValue(clientIdOverride);
  const clientSecret = cleanEnvValue(process.env.GOOGLE_CLIENT_SECRET);
  const clientId = overrideClientId || googleClientIdEnv || viteGoogleClientIdEnv;

  const missingEnvVars: string[] = [];
  if (!clientId) missingEnvVars.push('GOOGLE_CLIENT_ID');
  if (!clientSecret) missingEnvVars.push('GOOGLE_CLIENT_SECRET');

  return {
    clientId,
    clientSecret,
    missingEnvVars,
    presence: {
      hasGoogleClientId: Boolean(googleClientIdEnv),
      hasViteGoogleClientId: Boolean(viteGoogleClientIdEnv),
      hasClientIdOverride: Boolean(overrideClientId),
      hasClientSecret: Boolean(clientSecret),
      clientIdSuffix: clientId ? clientId.slice(-28) : null,
    },
  };
}

export function deriveCallbackRedirectUri(req: any): string {
  const explicit = normalizeRedirectUri(cleanEnvValue(process.env.GOOGLE_REDIRECT_URI));
  if (explicit) return explicit;

  const rawHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'yashwanth-hub.vercel.app')
    .split(',')[0]
    .trim();
  const isLocal = rawHost.includes('localhost') || rawHost.includes('127.0.0.1');
  const rawProto = req?.headers?.['x-forwarded-proto'];
  const proto = rawProto
    ? String(rawProto).split(',')[0].trim()
    : isLocal
    ? 'http'
    : 'https';

  return normalizeRedirectUri(`${proto}://${rawHost}/api/auth/google/callback`);
}

export function extractCookie(req: any, name: string): string | null {
  const header = req?.headers?.cookie;
  if (!header || typeof header !== 'string') return null;
  const parts = header.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return part.slice(eq + 1).trim();
      }
    }
  }
  return null;
}

export function extractSupabaseAccessTokenFromCookies(req: any): string | null {
  const direct = extractCookie(req, 'sb-access-token');
  if (direct) return direct;

  const header = req?.headers?.cookie;
  if (!header || typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (!/^sb-[a-z0-9-]+-auth-token$/i.test(k)) continue;
    try {
      const parsed = JSON.parse(decodeURIComponent(part.slice(eq + 1).trim()));
      if (parsed?.access_token && typeof parsed.access_token === 'string') {
        return parsed.access_token;
      }
    } catch {
      /* ignore malformed cookie */
    }
  }
  return null;
}

export function summarizeGoogleTokenResponse(status: number, body: Record<string, any> | null | undefined) {
  const payload = body && typeof body === 'object' ? body : {};
  return {
    status,
    ok: status >= 200 && status < 300,
    error: typeof payload.error === 'string' ? payload.error : null,
    error_description: typeof payload.error_description === 'string' ? payload.error_description : null,
    error_uri: typeof payload.error_uri === 'string' ? payload.error_uri : null,
    token_type: typeof payload.token_type === 'string' ? payload.token_type : null,
    expires_in: typeof payload.expires_in === 'number' ? payload.expires_in : null,
    scope: typeof payload.scope === 'string' ? payload.scope : null,
    has_access_token: Boolean(payload.access_token),
    has_refresh_token: Boolean(payload.refresh_token),
    has_id_token: Boolean(payload.id_token),
  };
}

export function sanitizeSupabaseError(err: any) {
  if (!err) return null;
  return {
    code: err.code ?? null,
    message: typeof err.message === 'string' ? err.message.slice(0, 300) : String(err).slice(0, 300),
    details: err.details ?? null,
    hint: err.hint ?? null,
    status: err.status ?? null,
  };
}

export function buildGoogleTokenErrorDiagnostic(
  errorCode: string | null,
  errorDescription: string | null,
  redirectUriUsed: string
): { code: string; message: string; hint: string } {
  const code = errorCode || 'token_exchange_failed';
  const desc = errorDescription?.trim() || '';
  const message = desc ? `${code}: ${desc}` : code;

  if (code === 'invalid_grant') {
    const missingVerifier = /code verifier|code_verifier/i.test(desc);
    return {
      code,
      message,
      hint: missingVerifier
        ? 'The PKCE code_verifier was missing or mismatched at token exchange. Retry from the Integrations page in the same browser window without clearing storage mid-flow.'
        : `Authorization code was rejected (${desc || 'expired, already used, or redirect_uri mismatch'}). Ensure redirect_uri "${redirectUriUsed}" is listed in Google Cloud Console Authorized redirect URIs.`,
    };
  }

  if (code === 'invalid_client') {
    return {
      code,
      message,
      hint: 'Verify that GOOGLE_CLIENT_ID (and VITE_GOOGLE_CLIENT_ID) matches GOOGLE_CLIENT_SECRET in Vercel Environment Variables and in Supabase Dashboard -> Authentication -> Providers -> Google.',
    };
  }

  if (code === 'redirect_uri_mismatch') {
    return {
      code,
      message,
      hint: `Add "${redirectUriUsed}" verbatim (no trailing slash mismatch) under Authorized redirect URIs in Google Cloud Console.`,
    };
  }

  if (code === 'unauthorized_client' || code === 'invalid_request') {
    return {
      code,
      message,
      hint: `Ensure the Google Cloud OAuth Client type is "Web application" and redirect_uri "${redirectUriUsed}" matches authorize & token exchange identically.`,
    };
  }

  return {
    code,
    message,
    hint: `Check Google Cloud Console Web Client credentials and Vercel GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (redirect_uri used: "${redirectUriUsed}").`,
  };
}
