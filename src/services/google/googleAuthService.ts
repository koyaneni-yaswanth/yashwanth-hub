import type { GoogleWorkspaceConfig, GoogleServiceKey, GoogleServiceStatus } from '../../types';

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

export class GoogleAuthService {
  private static STORAGE_KEY = 'yash_google_config';

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
    return Boolean(cfg.connected && cfg.accessToken);
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

  // Generates OAuth 2.0 Authorization URL for Incremental Authorization
  public static getAuthUrl(
    clientId: string,
    redirectUri: string,
    specificServices: (GoogleServiceKey | 'identity')[] = ['identity', 'calendar', 'drive', 'gmail', 'tasks', 'contacts', 'photos']
  ): string {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const scopes = specificServices.map((s) => SERVICE_SCOPES[s]).join(' ');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: scopes,
      include_granted_scopes: 'true',
      prompt: 'consent',
    });
    return `${rootUrl}?${params.toString()}`;
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
      services: this.getDefaultServices(),
    });
  }
}
