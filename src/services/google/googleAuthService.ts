import type { GoogleWorkspaceConfig, GoogleServiceKey, GoogleServiceStatus } from '../../types';
import { generateId } from '../../lib/utils';

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

export interface OAuthCallbackResult {
  success: boolean;
  token?: string;
  expiresIn?: number;
  error?: string;
  errorMessage?: string;
  resolutionHint?: string;
}

export class GoogleAuthService {
  private static STORAGE_KEY = 'yash_google_config';
  private static CLIENT_ID_KEY = 'yash_google_client_id';
  private static gisScriptLoadingPromise: Promise<boolean> | null = null;

  public static getDefaultServices(): Record<GoogleServiceKey, GoogleServiceStatus> {
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

  // Retrieve effective Client ID from localStorage or environment
  public static getEffectiveClientId(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.CLIENT_ID_KEY);
      if (stored && stored.trim()) return stored.trim();
    }
    const envId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com';
    return typeof envId === 'string' ? envId.trim() : '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com';
  }

  public static saveClientId(clientId: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.CLIENT_ID_KEY, clientId.trim());
    }
  }

  // Validates Google OAuth Client ID syntax
  public static isValidClientId(clientId: string): boolean {
    const trimmed = clientId.trim();
    if (!trimmed || trimmed.includes('your-google-oauth-client-id')) return false;
    return /^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(trimmed);
  }

  // Get standardized redirect URI (matches exactly what must be registered in Google Cloud Console)
  public static getRedirectUri(): string {
    if (typeof window === 'undefined') return 'http://localhost:5173';
    return window.location.origin;
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
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cfg));
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
      console.warn('Google Access token expired');
      return null;
    }
    return cfg.accessToken;
  }

  // 1. Google Identity Services (GIS) Token Client Integration (Preferred modern SPA standard)
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
        console.warn('Failed to load Google Identity Services SDK script');
        resolve(false);
      };
      document.head.appendChild(script);
    });

    return this.gisScriptLoadingPromise;
  }

  // Request Access Token via GIS popup (avoids full-page reload and redirect_uri mismatch)
  public static async requestGisToken(
    clientId: string,
    specificServices: (GoogleServiceKey | 'identity')[] = ['identity', 'calendar', 'drive', 'gmail', 'tasks', 'contacts', 'photos']
  ): Promise<{ success: boolean; token?: string; error?: string; errorMessage?: string }> {
    const loaded = await this.loadGisScript();
    if (!loaded || !(window as any).google?.accounts?.oauth2) {
      throw new Error('Google Identity Services SDK could not be loaded');
    }

    const scopes = specificServices.map((s) => SERVICE_SCOPES[s]).join(' ');

    return new Promise((resolve) => {
      try {
        const tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
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

  // 2. Full-Page Redirect OAuth 2.0 Authorization URL with State Parameter (Fallback)
  public static getAuthUrl(
    clientId: string,
    redirectUri: string = this.getRedirectUri(),
    specificServices: (GoogleServiceKey | 'identity')[] = ['identity', 'calendar', 'drive', 'gmail', 'tasks', 'contacts', 'photos']
  ): string {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const scopes = specificServices.map((s) => SERVICE_SCOPES[s]).join(' ');
    const state = generateId();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('yash_google_oauth_state', state);
    }

    const params = new URLSearchParams({
      client_id: clientId.trim(),
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: scopes,
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });
    return `${rootUrl}?${params.toString()}`;
  }

  // 3. Robust OAuth Callback Parser (decodes success tokens and specific Google OAuth errors)
  public static parseOAuthCallback(urlHashOrQuery: string): OAuthCallbackResult {
    const cleanStr = urlHashOrQuery.replace(/^[#?]/, '');
    const params = new URLSearchParams(cleanStr);

    // Check for errors first
    const error = params.get('error');
    if (error) {
      let errorMessage = 'Google OAuth authorization failed.';
      let resolutionHint = 'Verify your Google Cloud Console configuration.';

      if (error === 'invalid_client') {
        errorMessage = '401 invalid_client: The OAuth client was not found.';
        resolutionHint = 'Ensure your Google Cloud OAuth Client ID is registered as "Web application" and belongs to an active Google Cloud Project with the OAuth consent screen configured.';
      } else if (error === 'redirect_uri_mismatch') {
        errorMessage = '400 redirect_uri_mismatch: The redirect URI does not match.';
        resolutionHint = `Add "${this.getRedirectUri()}" to the "Authorized redirect URIs" in your Google Cloud OAuth 2.0 Client ID settings.`;
      } else if (error === 'access_denied') {
        errorMessage = 'Access denied: Google account permission was declined.';
        resolutionHint = 'Please approve the requested permissions to connect Google Workspace services to Yashwanth Hub.';
      } else if (error === 'unauthorized_client') {
        errorMessage = 'Unauthorized client type for this OAuth request.';
        resolutionHint = 'In Google Cloud Console, ensure the Client ID application type is set to "Web application" (not Desktop or Mobile).';
      }

      return {
        success: false,
        error,
        errorMessage,
        resolutionHint,
      };
    }

    // Check for success access token
    const token = params.get('access_token');
    const expiresIn = Number(params.get('expires_in')) || 3600;

    if (token) {
      return {
        success: true,
        token,
        expiresIn,
      };
    }

    return {
      success: false,
      error: 'no_token',
      errorMessage: 'No access token or error parameters found in callback URL.',
    };
  }

  // Fetch basic user profile from Google UserInfo endpoint
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
    } catch (e) {
      console.warn('Failed to fetch Google profile:', e);
      return null;
    }
  }

  // Update specific service status
  public static updateServiceStatus(service: GoogleServiceKey, update: Partial<GoogleServiceStatus>) {
    const cfg = this.getConfig();
    if (!cfg.services) cfg.services = this.getDefaultServices();
    cfg.services[service] = {
      ...cfg.services[service],
      ...update,
    };
    this.saveConfig(cfg);
  }

  // Disconnect a specific service
  public static disconnectService(service: GoogleServiceKey) {
    this.updateServiceStatus(service, {
      enabled: false,
      authorized: false,
      error: undefined,
    });
  }

  // Disconnect & revoke credentials completely
  public static async disconnect(): Promise<void> {
    const token = this.getAccessToken();
    if (token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
      } catch (err) {
        console.warn('Failed to revoke Google token on server:', err);
      }
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
