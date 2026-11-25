// Vercel Serverless Function: Google OAuth Direct Callback Handler
// Endpoint: /api/auth/google/callback
// Logs redacted Google token-endpoint responses & any Supabase persistence errors,
// verifies redirect_uri and optional PKCE code_verifier continuity, and forwards
// the real OAuth error reason back to the UI instead of a generic server_error.

import {
  buildGoogleTokenErrorDiagnostic,
  deriveCallbackRedirectUri,
  extractCookie,
  extractSupabaseAccessTokenFromCookies,
  normalizeRedirectUri,
  resolveGoogleOAuthConfig,
  sanitizeSupabaseError,
  summarizeGoogleTokenResponse,
} from '../../_lib/googleOAuth.ts';
import {
  isServerSupabaseConfigured,
  resolveAuthenticatedUser,
} from '../../_lib/db.ts';
import { safeError } from '../../_lib/http.ts';

function appendSetCookie(res: any, cookieStr: string) {
  if (typeof res.setHeader !== 'function' || typeof res.getHeader !== 'function') return;
  const existing = res.getHeader('Set-Cookie');
  const next = Array.isArray(existing) ? [...existing, cookieStr] : existing ? [String(existing), cookieStr] : [cookieStr];
  res.setHeader('Set-Cookie', next);
}

export default async function handler(req: any, res: any) {
  const code = req.query?.code;
  const error = req.query?.error;
  const errorCode = req.query?.error_code;
  const errorDescription = req.query?.error_description;

  const savedVerifier = extractCookie(req, 'yash_google_pkce_v');
  const savedRedirect = extractCookie(req, 'yash_google_oauth_r');
  if (savedVerifier) {
    appendSetCookie(res, 'yash_google_pkce_v=; Path=/; Max-Age=0; SameSite=Lax');
  }
  if (savedRedirect) {
    appendSetCookie(res, 'yash_google_oauth_r=; Path=/; Max-Age=0; SameSite=Lax');
  }

  if (error) {
    const diag = {
      error: String(error),
      error_code: errorCode ? String(errorCode) : null,
      error_description: errorDescription ? String(errorDescription) : null,
    };
    console.error('[Google Callback] Provider returned error:', diag);
    const params = new URLSearchParams({
      tab: 'integrations',
      google_error: diag.error,
    });
    if (diag.error_code) params.set('google_error_code', diag.error_code);
    if (diag.error_description) params.set('google_error_desc', diag.error_description);
    return res.redirect(`/?${params.toString()}`);
  }

  if (!code) {
    return res.redirect('/?tab=integrations&google_error=missing_auth_code');
  }

  const oauthCfg = resolveGoogleOAuthConfig();
  if (oauthCfg.missingEnvVars.length > 0) {
    console.error('[Google Callback] Missing environment variables:', {
      missingEnvVars: oauthCfg.missingEnvVars,
      ...oauthCfg.presence,
    });
    const params = new URLSearchParams({
      tab: 'integrations',
      google_error: 'server_misconfigured',
      google_error_desc: `Missing Vercel environment variable(s): ${oauthCfg.missingEnvVars.join(', ')}.`,
    });
    return res.redirect(`/?${params.toString()}`);
  }

  const redirectUri = normalizeRedirectUri(savedRedirect) || deriveCallbackRedirectUri(req);

  try {
    const tokenParams = new URLSearchParams({
      code: String(code),
      client_id: oauthCfg.clientId,
      client_secret: oauthCfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (savedVerifier) {
      tokenParams.set('code_verifier', savedVerifier);
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    const rawText = await tokenRes.text();
    let tokenJson: Record<string, any> = {};
    try {
      tokenJson = rawText ? JSON.parse(rawText) : {};
    } catch {
      tokenJson = { error: 'invalid_token_response', error_description: rawText.slice(0, 200) };
    }

    // Log strictly non-secret metadata + exact Google status/error fields
    console.info('[Google Callback] Google token-endpoint response:', {
      redirectUri,
      hadCodeVerifier: Boolean(savedVerifier),
      ...summarizeGoogleTokenResponse(tokenRes.status, tokenJson),
    });

    if (!tokenRes.ok || tokenJson.error) {
      const diag = buildGoogleTokenErrorDiagnostic(
        typeof tokenJson.error === 'string' ? tokenJson.error : null,
        typeof tokenJson.error_description === 'string' ? tokenJson.error_description : null,
        redirectUri
      );
      const params = new URLSearchParams({
        tab: 'integrations',
        google_error: diag.code,
        google_error_desc: diag.message,
      });
      return res.redirect(`/?${params.toString()}`);
    }

    if (!tokenJson.access_token) {
      return res.redirect(
        '/?tab=integrations&google_error=no_access_token&google_error_desc=' +
          encodeURIComponent('Google token endpoint returned HTTP 200 without access_token.')
      );
    }

    // If a Supabase session JWT is available in cookies/header, attempt vault upsert & log any Supabase error.
    let supabasePersistError: string | null = null;
    if (isServerSupabaseConfigured()) {
      const bearerFromHeader = req?.headers?.authorization?.replace(/^Bearer\s+/i, '').trim() || '';
      const jwt = bearerFromHeader || extractSupabaseAccessTokenFromCookies(req) || '';
      if (jwt) {
        const auth = await resolveAuthenticatedUser({ headers: { authorization: `Bearer ${jwt}` } });
        if (!auth.authenticated || !auth.userId || !auth.client) {
          console.error('[Google Callback] Supabase auth resolution error:', { error: auth.error || 'unauthenticated' });
        } else {
          const expiresInSec = Number(tokenJson.expires_in) || 3600;
          const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();
          const { error: upsertErr } = await auth.client
            .from('integration_tokens')
            .upsert(
              {
                user_id: auth.userId,
                provider: 'google',
                access_token: tokenJson.access_token,
                refresh_token: tokenJson.refresh_token || null,
                expires_at: expiresAt,
                token_type: tokenJson.token_type || 'Bearer',
                scopes: typeof tokenJson.scope === 'string' ? tokenJson.scope.split(' ') : [],
                encrypted_access_token: tokenJson.access_token,
                encrypted_refresh_token: tokenJson.refresh_token || null,
                token_expires_at: expiresAt,
                token_expiry: expiresAt,
                updated_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,provider' }
            );
          if (upsertErr) {
            const safeDbErr = sanitizeSupabaseError(upsertErr);
            console.error('[Google Callback] Supabase integration_tokens upsert error:', safeDbErr);
            supabasePersistError = safeDbErr?.message || 'Supabase persistence failed';
          }
        }
      }
    }

    // Security: Redirect back to SPA with short-lived access token only; never pass refresh_token in URL
    const hashParams = new URLSearchParams({
      access_token: String(tokenJson.access_token),
      expires_in: String(Number(tokenJson.expires_in) || 3600),
      token_type: String(tokenJson.token_type || 'Bearer'),
    });
    if (supabasePersistError) {
      hashParams.set('supabase_warning', supabasePersistError);
    }

    return res.redirect(`/?tab=integrations#${hashParams.toString()}`);
  } catch (err: any) {
    console.error('[Google Callback] Unexpected token exchange exception:', safeError(err));
    const rawMsg = err?.response?.data?.error_description || err?.response?.data?.error || err?.message || 'Exchange error';
    const rawCode = err?.response?.data?.error || 'token_exchange_failed';
    return res.redirect(
      `/?tab=integrations&google_error=${encodeURIComponent(String(rawCode))}&google_error_desc=${encodeURIComponent(String(rawMsg))}`
    );
  }
}
