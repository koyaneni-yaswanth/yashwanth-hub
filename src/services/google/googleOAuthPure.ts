import type { GoogleWorkspaceConfig, GoogleServiceKey, GoogleServiceStatus } from '../../types/index.ts';

export const SERVICE_SCOPES: Record<GoogleServiceKey | 'identity', string> = {
  identity: 'openid email profile',
  calendar: 'https://www.googleapis.com/auth/calendar.events',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose',
  drive: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly',
  photos: 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
  tasks: 'https://www.googleapis.com/auth/tasks',
  contacts: 'https://www.googleapis.com/auth/contacts.readonly',
  docs: 'https://www.googleapis.com/auth/drive.file',
};

export const ALL_GOOGLE_SCOPES = Object.values(SERVICE_SCOPES).join(' ');

export const DEFAULT_GOOGLE_SERVICES_LIST: (GoogleServiceKey | 'identity')[] = [
  'identity',
  'calendar',
  'drive',
  'gmail',
  'tasks',
  'contacts',
  'photos',
];

export interface OAuthCallbackResult {
  success: boolean;
  flow?: 'code' | 'implicit';
  code?: string;
  state?: string;
  token?: string;
  expiresIn?: number;
  error?: string;
  errorCode?: string;
  errorDescription?: string;
  errorMessage?: string;
  resolutionHint?: string;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : (globalThis as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } }).Buffer?.from(bytes).toString('base64') || '';
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getDefaultGoogleServices(): Record<GoogleServiceKey, GoogleServiceStatus> {
  return {
    calendar: { enabled: false, authorized: false },
    gmail: { enabled: false, authorized: false },
    drive: { enabled: false, authorized: false },
    photos: { enabled: false, authorized: false },
    tasks: { enabled: false, authorized: false },
    contacts: { enabled: false, authorized: false },
    docs: { enabled: false, authorized: false },
  };
}

export function cleanGoogleClientId(clientId: string): string {
  if (!clientId) return '';
  return clientId.trim().replace(/^["']|["']$/g, '').trim();
}

export function isValidGoogleClientId(clientId: string): boolean {
  const cleaned = cleanGoogleClientId(clientId);
  if (!cleaned || cleaned.includes('your-google-oauth-client-id')) return false;
  return /^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(cleaned);
}

/**
 * RFC 7636 PKCE pair + cryptographic CSRF state generator (Web Crypto / Node compatible).
 */
export async function generatePkcePair(): Promise<PkcePair> {
  const randomVerifierBytes = new Uint8Array(32);
  const randomStateBytes = new Uint8Array(16);

  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(randomVerifierBytes);
    globalThis.crypto.getRandomValues(randomStateBytes);
  } else {
    throw new Error('Cryptographic random generator unavailable.');
  }

  const codeVerifier = base64UrlEncode(randomVerifierBytes);
  const state = `g_${base64UrlEncode(randomStateBytes)}`;

  const encoder = new TextEncoder();
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(codeVerifier));
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));

  return { codeVerifier, codeChallenge, state };
}

/**
 * Pure OAuth 2.0 Authorization Code + PKCE (S256) URL builder.
 */
export async function buildPkceAuthUrl(
  clientId: string,
  redirectUri: string,
  specificServices: (GoogleServiceKey | 'identity')[] = DEFAULT_GOOGLE_SERVICES_LIST
): Promise<{ url: string; state: string; redirectUri: string; codeVerifier: string }> {
  const pkce = await generatePkcePair();
  const normalizedRedirect = redirectUri.replace(/\/+$/, '');
  const scopes = Array.from(new Set(specificServices.map((s) => SERVICE_SCOPES[s]))).join(' ');

  const params = new URLSearchParams({
    client_id: cleanGoogleClientId(clientId),
    redirect_uri: normalizedRedirect,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state: pkce.state,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state: pkce.state,
    redirectUri: normalizedRedirect,
    codeVerifier: pkce.codeVerifier,
  };
}

/**
 * Strips refresh tokens before persisting GoogleWorkspaceConfig into client localStorage.
 */
export function sanitizeGoogleConfigForStorage(cfg: GoogleWorkspaceConfig): GoogleWorkspaceConfig {
  const safeCfg: GoogleWorkspaceConfig = { ...cfg };
  delete safeCfg.refreshToken;
  return safeCfg;
}

/**
 * Pure OAuth Callback Parser handling Authorization Code (?code=...&state=...),
 * Implicit Token (#access_token=...), and Google OAuth error diagnostics.
 */
export function parseOAuthCallback(
  urlHashOrQuery: string,
  expectedState?: string | null,
  redirectBaseUri: string = 'http://localhost:5173'
): OAuthCallbackResult {
  const cleanStr = urlHashOrQuery.replace(/^[#?]/, '');
  const params = new URLSearchParams(cleanStr);

  const error = params.get('error') || params.get('google_error');
  const errorCode = params.get('error_code') || params.get('google_error_code') || undefined;
  const errorDescription = params.get('error_description') || params.get('google_error_desc') || undefined;

  if (error) {
    let errorMessage = errorDescription ? `${error}: ${errorDescription}` : `Google OAuth error: ${error}`;
    let resolutionHint = 'Verify your Google Cloud Console OAuth 2.0 Web Client configuration.';

    if (error === 'invalid_client') {
      errorMessage = `401 invalid_client${errorDescription ? `: ${errorDescription}` : ': The OAuth client was not found or secret mismatch.'}`;
      resolutionHint =
        'Ensure your Google Cloud OAuth Client ID is registered as "Web application", matches VITE_GOOGLE_CLIENT_ID and Vercel GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET (and Supabase Google provider Secret) matches Google Cloud Console.';
    } else if (error === 'invalid_grant') {
      errorMessage = `400 invalid_grant${errorDescription ? `: ${errorDescription}` : ': Authorization code was rejected, expired, or already used.'}`;
      resolutionHint =
        `Ensure PKCE code_verifier survived the redirect and redirect_uri ("${redirectBaseUri}") matches Authorized redirect URIs in Google Cloud Console identically.`;
    } else if (error === 'redirect_uri_mismatch') {
      errorMessage = `400 redirect_uri_mismatch${errorDescription ? `: ${errorDescription}` : ': The redirect URI does not match.'}`;
      resolutionHint = `Add "${redirectBaseUri}" and "${redirectBaseUri}/api/auth/google/callback" to Authorized redirect URIs in Google Cloud Console.`;
    } else if (error === 'access_denied') {
      errorMessage = `Access denied: ${errorDescription || 'Google account permission was declined.'}`;
      resolutionHint = 'Approve the requested Workspace permissions on the Google consent screen.';
    } else if (error === 'unauthorized_client') {
      errorMessage = `Unauthorized client${errorDescription ? `: ${errorDescription}` : ' type for this OAuth request.'}`;
      resolutionHint = 'Ensure the Google OAuth client application type is "Web application".';
    } else if (error === 'server_misconfigured') {
      errorMessage = errorDescription || 'Server Google OAuth credentials are missing or invalid in Vercel Environment Variables.';
      resolutionHint = 'Set GOOGLE_CLIENT_ID, VITE_GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET in Vercel Environment Variables and redeploy.';
    } else if (error === 'server_error') {
      const details = [errorCode, errorDescription].filter(Boolean).join(' — ');
      errorMessage = `server_error${details ? `: ${details}` : ': OAuth code exchange failed on auth server.'}`;
      if (errorDescription && /external code|invalid_client|client secret/i.test(errorDescription)) {
        resolutionHint =
          'Supabase Auth failed to exchange the Google authorization code at Google (often invalid/stale Client Secret or wrong Client ID in Supabase Dashboard -> Authentication -> Providers -> Google). Verify both Supabase Google Provider credentials and Google Cloud Console callback URI (https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback).';
      } else {
        resolutionHint =
          'Check Supabase Auth logs (/callback) and Vercel Function logs for exact Google token-endpoint error details.';
      }
    }

    return {
      success: false,
      error,
      errorCode,
      errorDescription,
      errorMessage,
      resolutionHint,
    };
  }

  const code = params.get('code');
  const returnedState = params.get('state');

  if (code) {
    if (expectedState && returnedState && expectedState !== returnedState) {
      return {
        success: false,
        error: 'state_mismatch',
        errorMessage: 'CSRF state verification failed on Google OAuth callback.',
        resolutionHint: 'Retry signing in from the Integrations page in the same browser tab.',
      };
    }
    return {
      success: true,
      flow: 'code',
      code,
      state: returnedState || undefined,
    };
  }

  const token = params.get('access_token');
  const expiresIn = Number(params.get('expires_in')) || 3600;
  if (token) {
    return {
      success: true,
      flow: 'implicit',
      token,
      expiresIn,
    };
  }

  return {
    success: false,
    error: 'no_token',
    errorMessage: 'No authorization code, access token, or error parameters found in callback URL.',
  };
}
