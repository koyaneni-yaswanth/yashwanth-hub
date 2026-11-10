import type { GoogleWorkspaceConfig, GoogleServiceKey, GoogleServiceStatus } from '../../types/index.ts';
import { Capacitor } from '@capacitor/core';
import { getSupabaseClient } from '../../lib/supabase.ts';
import {
  SERVICE_SCOPES,
  ALL_GOOGLE_SCOPES,
  DEFAULT_GOOGLE_SERVICES_LIST,
  getDefaultGoogleServices,
  cleanGoogleClientId,
  isValidGoogleClientId,
  generatePkcePair as generatePkcePairPure,
  buildPkceAuthUrl as buildPkceAuthUrlPure,
  sanitizeGoogleConfigForStorage,
  parseOAuthCallback as parseOAuthCallbackPure,
  type OAuthCallbackResult,
  type PkcePair,
} from './googleOAuthPure.ts';

export { SERVICE_SCOPES, ALL_GOOGLE_SCOPES, type OAuthCallbackResult, type PkcePair };

export class GoogleAuthService {
  private static STORAGE_KEY = 'yash_google_config';
  private static CLIENT_ID_KEY = 'yash_google_client_id';
  private static PKCE_VERIFIER_KEY = 'yash_google_pkce_verifier';
  private static OAUTH_STATE_KEY = 'yash_google_oauth_state';
  private static OAUTH_REDIRECT_KEY = 'yash_google_oauth_redirect_uri';
  private static gisScriptLoadingPromise: Promise<boolean> | null = null;

  public static getDefaultServices(): Record<GoogleServiceKey, GoogleServiceStatus> {
    return getDefaultGoogleServices();
  }

  // Sanitizes Client ID by stripping quotes, whitespace, and invisible characters
  public static cleanClientId(clientId: string): string {
    return cleanGoogleClientId(clientId);
  }

  // Retrieve effective Client ID from localStorage or environment
  public static getEffectiveClientId(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.CLIENT_ID_KEY);
      if (stored && stored.trim()) return this.cleanClientId(stored);
    }
    const envId =
      (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
      '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com';
    return typeof envId === 'string'
      ? this.cleanClientId(envId)
      : '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com';
  }

  public static saveClientId(clientId: string): void {
    if (typeof window !== 'undefined') {
      const cleaned = this.cleanClientId(clientId);
      localStorage.setItem(this.CLIENT_ID_KEY, cleaned);
    }
  }

  // Validates Google OAuth Client ID syntax
  public static isValidClientId(clientId: string): boolean {
    return isValidGoogleClientId(clientId);
  }

  /**
   * Canonical redirect URI used for BOTH frontend PKCE redirect and server token exchange.
   * Matches exact Authorized redirect URIs in Google Cloud Console (no trailing slash).
   */
  public static getRedirectUri(): string {
    if (typeof window === 'undefined') return 'http://localhost:5173';
    try {
      if (Capacitor.isNativePlatform()) {
        return 'com.yaswanth.hub://auth/callback';
      }
    } catch {
      // Safe fallback outside Capacitor DOM runtime
    }
    return window.location.origin.replace(/\/+$/, '');
  }

  public static getConfig(): GoogleWorkspaceConfig {
    if (typeof window === 'undefined') {
      return {
        connected: false,
        services: this.getDefaultServices(),
      };
    }
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) {
      return {
        connected: false,
        services: this.getDefaultServices(),
      };
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.services) {
        parsed.services = this.getDefaultServices();
      }
      return parsed;
    } catch {
      return {
        connected: false,
        services: this.getDefaultServices(),
      };
    }
  }

  public static saveConfig(cfg: GoogleWorkspaceConfig) {
    if (typeof window !== 'undefined') {
      // Security: Never persist refresh tokens in client localStorage
      const safeCfg = sanitizeGoogleConfigForStorage(cfg);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(safeCfg));
    }
  }

  public static isConnected(): boolean {
    const cfg = this.getConfig();
    return Boolean(cfg.connected && cfg.accessToken && (!cfg.expiresAt || Date.now() < cfg.expiresAt));
  }

  public static getAccessToken(): string | null {
    const cfg = this.getConfig();
    if (!cfg.accessToken) return null;
    if (cfg.expiresAt && Date.now() > cfg.expiresAt) {
      return null;
    }
    return cfg.accessToken;
  }

  /**
   * RFC 7636 PKCE pair + cryptographic CSRF state generator (Web Crypto / Node compatible)
   */
  public static async generatePkcePair(): Promise<PkcePair> {
    return generatePkcePairPure();
  }

  /**
   * Primary V2 OAuth 2.0 Flow: Authorization Code + PKCE (S256) + Offline Refresh Token.
   * Exchanges authorization code server-side at /api/auth/google/token so refresh_token
   * is stored strictly in Supabase integration_tokens (zero client refresh token exposure).
   */
  public static async buildPkceAuthUrl(
    clientId: string,
    redirectUri: string = this.getRedirectUri(),
    specificServices: (GoogleServiceKey | 'identity')[] = DEFAULT_GOOGLE_SERVICES_LIST
  ): Promise<{ url: string; state: string; redirectUri: string }> {
    const built = await buildPkceAuthUrlPure(clientId, redirectUri, specificServices);

    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(this.PKCE_VERIFIER_KEY, built.codeVerifier);
      sessionStorage.setItem(this.OAUTH_STATE_KEY, built.state);
      sessionStorage.setItem(this.OAUTH_REDIRECT_KEY, built.redirectUri);
    }

    return {
      url: built.url,
      state: built.state,
      redirectUri: built.redirectUri,
    };
  }

  // Backward-compatible synchronous URL helper (falls back to implicit only if caller cannot await PKCE)
  public static getAuthUrl(
    clientId: string,
    redirectUri: string = this.getRedirectUri(),
    specificServices: (GoogleServiceKey | 'identity')[] = [
      'identity',
      'calendar',
      'drive',
      'gmail',
      'tasks',
      'contacts',
      'photos',
    ]
  ): string {
    const scopes = Array.from(new Set(specificServices.map((s) => SERVICE_SCOPES[s]))).join(' ');
    const state = `g_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const normalizedRedirect = redirectUri.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(this.OAUTH_STATE_KEY, state);
      sessionStorage.setItem(this.OAUTH_REDIRECT_KEY, normalizedRedirect);
    }

    const params = new URLSearchParams({
      client_id: this.cleanClientId(clientId),
      redirect_uri: normalizedRedirect,
      response_type: 'token',
      scope: scopes,
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Secondary SPA GIS Token Popup (useful when user cannot use full-page redirect).
   * Note: GIS token client issues 1h access tokens without refresh tokens.
   */
  public static async loadGisScript(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if ((window as any).google?.accounts?.oauth2) return true;
    if (this.gisScriptLoadingPromise) return this.gisScriptLoadingPromise;

    this.gisScriptLoadingPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = () => {
        this.gisScriptLoadingPromise = null;
        resolve(false);
      };
      document.head.appendChild(script);
    });

    return this.gisScriptLoadingPromise;
  }

  public static async requestGisToken(
    clientId: string,
    specificServices: (GoogleServiceKey | 'identity')[] = [
      'identity',
      'calendar',
      'drive',
      'gmail',
      'tasks',
      'contacts',
      'photos',
    ]
  ): Promise<{ success: boolean; token?: string; error?: string; errorMessage?: string }> {
    const loaded = await this.loadGisScript();
    if (!loaded || !(window as any).google?.accounts?.oauth2) {
      throw new Error('Google Identity Services SDK could not be loaded');
    }

    const scopes = Array.from(new Set(specificServices.map((s) => SERVICE_SCOPES[s]))).join(' ');

    return new Promise((resolve) => {
      try {
        const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: this.cleanClientId(clientId),
          scope: scopes,
          callback: async (response: any) => {
            if (response.error) {
              resolve({
                success: false,
                error: response.error,
                errorMessage: response.error_description || response.error,
              });
              return;
            }

            if (response.access_token) {
              const expiresIn = Number(response.expires_in) || 3600;
              const expiresAt = Date.now() + expiresIn * 1000;
              const config = this.getConfig();

              this.saveConfig({
                ...config,
                connected: true,
                accessToken: response.access_token,
                expiresAt,
                calendarSyncEnabled: true,
                driveSyncEnabled: true,
                gmailSyncEnabled: true,
              });

              const profile = await this.fetchUserProfile(response.access_token);
              if (profile) {
                this.saveConfig({
                  ...this.getConfig(),
                  email: profile.email,
                  name: profile.name,
                  picture: profile.picture,
                });
              }

              await this.syncTokenToServer(response.access_token, expiresAt, profile?.email).catch(() => {});

              resolve({
                success: true,
                token: response.access_token,
              });
            }
          },
          error_callback: (err: any) => {
            resolve({
              success: false,
              error: err.type || 'popup_failed',
              errorMessage: err.message || 'Google OAuth popup was closed or blocked.',
            });
          },
        });

        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err: any) {
        resolve({
          success: false,
          error: 'init_failed',
          errorMessage: err.message || 'Failed to initialize Google token client.',
        });
      }
    });
  }

  /**
   * Robust OAuth Callback Parser handling BOTH Authorization Code (`?code=...&state=...`),
   * Implicit Token (`#access_token=...`), and Google OAuth error diagnostics.
   */
  public static parseOAuthCallback(urlHashOrQuery: string, expectedState?: string | null): OAuthCallbackResult {
    return parseOAuthCallbackPure(urlHashOrQuery, expectedState, this.getRedirectUri());
  }

  /**
   * Exchanges PKCE authorization code via server endpoint /api/auth/google/token
   */
  public static async exchangeAuthorizationCode(
    code: string,
    returnedState?: string
  ): Promise<{ success: boolean; email?: string; hasRefreshToken?: boolean; error?: string; hint?: string }> {
    const savedState = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(this.OAUTH_STATE_KEY) : null;
    const savedVerifier = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(this.PKCE_VERIFIER_KEY) : null;
    const savedRedirect =
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(this.OAUTH_REDIRECT_KEY) : null) ||
      this.getRedirectUri();

    if (savedState && returnedState && savedState !== returnedState) {
      return {
        success: false,
        error: 'OAuth state mismatch (CSRF protection triggered).',
        hint: 'Clear stale tabs and retry connecting Google from Integrations.',
      };
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const client = getSupabaseClient();
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
      }

      const resp = await fetch('/api/auth/google/token', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          code,
          code_verifier: savedVerifier || undefined,
          redirect_uri: savedRedirect,
          client_id: this.getEffectiveClientId(),
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(this.PKCE_VERIFIER_KEY);
        sessionStorage.removeItem(this.OAUTH_STATE_KEY);
        sessionStorage.removeItem(this.OAUTH_REDIRECT_KEY);
      }

      if (!resp.ok || !data.success) {
        return {
          success: false,
          error: data.message || data.error || `Server token exchange returned HTTP ${resp.status}`,
          hint: data.hint || 'Verify GOOGLE_CLIENT_SECRET and redirect URIs in Vercel and Google Cloud Console.',
        };
      }

      const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 3600000;
      const current = this.getConfig();
      this.saveConfig({
        ...current,
        connected: true,
        accessToken: data.access_token || current.accessToken,
        expiresAt,
        email: data.account_email || current.email,
        calendarSyncEnabled: true,
        driveSyncEnabled: true,
        gmailSyncEnabled: true,
      });

      return {
        success: true,
        email: data.account_email,
        hasRefreshToken: Boolean(data.has_refresh_token),
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network error calling /api/auth/google/token',
      };
    }
  }

  public static async fetchUserProfile(accessToken: string): Promise<{ email: string; name: string; picture: string } | null> {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        email: data.email || '',
        name: data.name || '',
        picture: data.picture || '',
      };
    } catch {
      return null;
    }
  }

  public static updateServiceStatus(service: GoogleServiceKey, update: Partial<GoogleServiceStatus>) {
    const cfg = this.getConfig();
    if (!cfg.services) cfg.services = this.getDefaultServices();
    cfg.services[service] = {
      ...cfg.services[service],
      ...update,
    };
    this.saveConfig(cfg);
  }

  public static disconnectService(service: GoogleServiceKey) {
    this.updateServiceStatus(service, {
      enabled: false,
      authorized: false,
      error: undefined,
    });
  }

  /**
   * Syncs GIS access token to server /api/auth/google/token when user is authenticated.
   */
  public static async syncTokenToServer(token: string, expiresAt: number, email?: string): Promise<void> {
    try {
      const client = getSupabaseClient();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        } else {
          // Do not write unauthenticated anonymous tokens to Supabase RLS-protected vault
          return;
        }
      } else {
        return;
      }

      await fetch('/api/auth/google/token', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'vault_access_token',
          access_token: token,
          expires_at: new Date(expiresAt).toISOString(),
          account_email: email || null,
        }),
      });
    } catch (err) {
      console.warn('[GoogleAuthService] syncTokenToServer notice:', err);
    }
  }

  /**
   * Restores session across browser refresh by checking authenticated Supabase session &
   * auto-refreshing expired tokens server-side via /api/auth/google/token?action=status.
   */
  public static async restoreSessionFromServer(): Promise<boolean> {
    try {
      const client = getSupabaseClient();
      if (!client) return this.isConnected();

      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) {
        return this.isConnected();
      }

      const resp = await fetch('/api/auth/google/token?action=status', {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!resp.ok) return this.isConnected();
      const data = await resp.json();

      if (data.connected) {
        const current = this.getConfig();
        this.saveConfig({
          ...current,
          connected: true,
          accessToken: data.access_token || current.accessToken,
          expiresAt: data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + 3600000,
          email: data.account_email || current.email,
          calendarSyncEnabled: true,
          driveSyncEnabled: true,
          gmailSyncEnabled: true,
        });
        return true;
      }
      return false;
    } catch {
      return this.isConnected();
    }
  }

  // Disconnect & revoke credentials completely across client + Google + server vault
  public static async disconnect(): Promise<void> {
    const token = this.getAccessToken();
    if (token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch {
        // Ignore network errors during local revocation
      }
    }

    try {
      const client = getSupabaseClient();
      if (client) {
        const { data: { session } } = await client.auth.getSession();
        if (session?.access_token) {
          await fetch('/api/auth/google/token', {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        }
      }
    } catch {
      // Ignore if offline
    }

    this.saveConfig({
      connected: false,
      email: undefined,
      name: undefined,
      picture: undefined,
      accessToken: undefined,
      expiresAt: undefined,
      services: this.getDefaultServices(),
    });
  }
}
