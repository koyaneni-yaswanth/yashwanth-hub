// Client-Side Integration Vault & Live Status Service
// Bridges client UI with Supabase Auth session + /api/auth/* + /api/integrations/* routes.

import { getSupabaseClient } from '../lib/supabase';
import { GoogleAuthService } from './google/googleAuthService';
import { NeoSapienMemoryService } from './neoSapienMemoryService';
import { NeoSapienMCPService } from './neoSapienMcpService';

export interface IntegrationStatusSummary {
  google: {
    connected: boolean;
    accountEmail?: string;
    hasRefreshToken: boolean;
    expiresAt?: string;
    lastPingStatus?: 'success' | 'error' | 'testing';
    lastPingDetails?: any;
  };
  neoSapien: {
    connected: boolean;
    hasToken: boolean;
    endpoint: string;
    toolsCount: number;
    lastPingStatus?: 'success' | 'error' | 'testing';
    lastPingDetails?: any;
  };
}

class IntegrationVaultManager {
  private status: IntegrationStatusSummary = {
    google: {
      connected: false,
      hasRefreshToken: false,
    },
    neoSapien: {
      connected: false,
      hasToken: false,
      endpoint: 'https://api.neosapien.xyz/mcp',
      toolsCount: 0,
    },
  };

  private listeners: Set<(status: IntegrationStatusSummary) => void> = new Set();
  private isInitialized = false;

  public subscribe(listener: (status: IntegrationStatusSummary) => void) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l({ ...this.status }));
  }

  public getStatus(): IntegrationStatusSummary {
    return { ...this.status };
  }

  public reset() {
    this.isInitialized = false;
    this.status = {
      google: { connected: false, hasRefreshToken: false },
      neoSapien: {
        connected: false,
        hasToken: false,
        endpoint: 'https://api.neosapien.xyz/mcp',
        toolsCount: 0,
      },
    };
    this.notify();
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {};
    const client = getSupabaseClient();
    if (client) {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }
    return headers;
  }

  /**
   * Restores session across browser refresh from Supabase + /api/auth/google/token?action=status.
   * Safe when called repeatedly (`force = true` bypasses memoization after sign-in/sign-out).
   */
  public async initSessionRestoration(force = false): Promise<IntegrationStatusSummary> {
    if (this.isInitialized && !force) return this.status;

    try {
      const client = getSupabaseClient();
      const headers = await this.getAuthHeaders();

      // 1. Restore Google Workspace session (with server auto-refresh if expired)
      if (client && headers['Authorization']) {
        const resp = await fetch('/api/auth/google/token?action=status', { headers });
        if (resp.ok) {
          const gData = await resp.json();
          if (gData.connected) {
            const current = GoogleAuthService.getConfig();
            GoogleAuthService.saveConfig({
              ...current,
              connected: true,
              accessToken: gData.access_token || current.accessToken,
              expiresAt: gData.expires_at ? new Date(gData.expires_at).getTime() : Date.now() + 3600000,
              email: gData.account_email || current.email,
              calendarSyncEnabled: true,
              driveSyncEnabled: true,
              gmailSyncEnabled: true,
            });
            this.status.google = {
              connected: true,
              accountEmail: gData.account_email,
              hasRefreshToken: Boolean(gData.has_refresh_token),
              expiresAt: gData.expires_at,
            };
          } else {
            this.status.google = {
              connected: GoogleAuthService.isConnected(),
              accountEmail: GoogleAuthService.getConfig().email,
              hasRefreshToken: Boolean(gData.has_refresh_token),
            };
          }
        }

        // 2. Restore NeoSapien token status from authenticated user's integration_tokens
        const {
          data: { user },
        } = await client.auth.getUser();
        if (user) {
          const { data: neoTok } = await client
            .from('integration_tokens')
            .select('access_token, encrypted_access_token')
            .eq('user_id', user.id)
            .eq('provider', 'neosapien')
            .maybeSingle();

          const token = neoTok?.access_token || neoTok?.encrypted_access_token;
          if (token) {
            this.status.neoSapien = {
              connected: true,
              hasToken: true,
              endpoint: 'https://api.neosapien.xyz/mcp',
              toolsCount: this.status.neoSapien.toolsCount || 0,
            };
            NeoSapienMCPService.saveTokens(token);
          }
        }
      } else {
        const gCfg = GoogleAuthService.getConfig();
        this.status.google = {
          connected: GoogleAuthService.isConnected(),
          accountEmail: gCfg.email,
          hasRefreshToken: false,
        };
        const neoCfg = NeoSapienMemoryService.getConfig();
        const storedNeo = NeoSapienMCPService.getStoredToken();
        this.status.neoSapien = {
          connected: Boolean(storedNeo && neoCfg.status === 'connected'),
          hasToken: Boolean(storedNeo),
          endpoint: 'https://api.neosapien.xyz/mcp',
          toolsCount: this.status.neoSapien.toolsCount || 0,
        };
      }

      this.isInitialized = true;
      this.notify();
    } catch (err) {
      console.warn('[IntegrationVault] Session restoration notice:', err);
    }

    return this.status;
  }

  public async testGoogleTasksConnection(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      this.status.google.lastPingStatus = 'testing';
      this.notify();

      const headers = await this.getAuthHeaders();
      const res = await fetch('/api/integrations/google-tasks?action=ping', { headers });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        this.status.google.connected = true;
        this.status.google.accountEmail = data.accountEmail;
        this.status.google.hasRefreshToken = Boolean(data.hasRefreshToken);
        this.status.google.lastPingStatus = 'success';
        this.status.google.lastPingDetails = data.latestTasks;
        this.notify();
        return { success: true, data };
      } else {
        this.status.google.lastPingStatus = 'error';
        this.status.google.lastPingDetails = data.message || 'Ping failed';
        this.notify();
        return { success: false, error: data.message || 'Ping failed' };
      }
    } catch (err: any) {
      this.status.google.lastPingStatus = 'error';
      this.status.google.lastPingDetails = err.message;
      this.notify();
      return { success: false, error: err.message };
    }
  }

  public async testNeoSapienConnection(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      this.status.neoSapien.lastPingStatus = 'testing';
      this.notify();

      const headers = await this.getAuthHeaders();
      const localNeoToken = NeoSapienMCPService.getStoredToken();
      if (localNeoToken && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${localNeoToken}`;
      }

      const res = await fetch('/api/integrations/neosapien?action=handshake', { headers });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success && Array.isArray(data.tools)) {
        this.status.neoSapien.connected = true;
        this.status.neoSapien.toolsCount = data.tools.length;
        this.status.neoSapien.lastPingStatus = 'success';
        this.status.neoSapien.lastPingDetails = data.tools;
        this.notify();
        return { success: true, data };
      } else {
        this.status.neoSapien.lastPingStatus = 'error';
        this.status.neoSapien.lastPingDetails = data.message || 'Handshake failed';
        this.notify();
        return { success: false, error: data.message || 'Handshake failed' };
      }
    } catch (err: any) {
      this.status.neoSapien.lastPingStatus = 'error';
      this.status.neoSapien.lastPingDetails = err.message;
      this.notify();
      return { success: false, error: err.message };
    }
  }

  public async triggerSyncNow(): Promise<{ success: boolean; results?: any; error?: string }> {
    try {
      const headers = await this.getAuthHeaders();
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/integrations/sync', {
        method: 'POST',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      return { success: res.ok && data.success, results: data.results, error: data.message };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export const IntegrationVaultService = new IntegrationVaultManager();
