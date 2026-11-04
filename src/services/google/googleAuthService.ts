import type { GoogleWorkspaceConfig } from '../../types';
import { db } from '../../db';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

export class GoogleAuthService {
  private static STORAGE_KEY = 'yash_google_config';

  public static getConfig(): GoogleWorkspaceConfig {
    if (typeof window === 'undefined') {
      return {
        connected: false,
        calendarSyncEnabled: false,
        driveSyncEnabled: false,
        gmailSyncEnabled: false,
      };
    }
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) {
      return {
        connected: false,
        calendarSyncEnabled: false,
        driveSyncEnabled: false,
        gmailSyncEnabled: false,
      };
    }
    try {
      return JSON.parse(raw);
    } catch {
      return {
        connected: false,
        calendarSyncEnabled: false,
        driveSyncEnabled: false,
        gmailSyncEnabled: false,
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

  // Generates Google OAuth 2.0 Authorization URL with PKCE / Implicit consent
  public static getAuthUrl(clientId: string, redirectUri: string): string {
    const rootUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: GOOGLE_SCOPES,
      include_granted_scopes: 'true',
      prompt: 'consent',
    });
    return `${rootUrl}?${params.toString()}`;
  }

  // Disconnect & revoke credentials
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
      calendarSyncEnabled: false,
      driveSyncEnabled: false,
      gmailSyncEnabled: false,
    });
  }
}
