// Client-Side Integration Vault & Live Status Service
// Bridges client UI with Supabase public.integration_tokens and serverless sync routes.

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

  /**
   * Initializes integration status on app mount.
   * Hard Requirement: Query integration_tokens in Supabase to restore sessions and prevent wipeouts.
   */
  public async initSessionRestoration(): Promise<IntegrationStatusSummary> {
    if (this.isInitialized) return this.status;

    try {
      const client = getSupabaseClient();
      if (!client) {
        // Fallback to local config
        this.status.google.connected = GoogleAuthService.isConnected();
        this.status.neoSapien.connected = NeoSapienMemoryService.getConfig().status === 'connected';
        this.notify();
        return this.status;
      }

      const { data: { user } } = await client.auth.getUser();
      const userId = user?.id || '00000000-0000-0000-0000-000000000001';

      // Query integration_tokens for user
      const { data: tokens, error } = await client
        .from('integration_tokens')
        .select('*')
        .eq('user_id', userId);

      if (!error && Array.isArray(tokens)) {
        for (const t of tokens) {
          if (t.provider === 'google') {
            const hasRefresh = Boolean(t.refresh_token || t.encrypted_refresh_token);
            const hasAccess = Boolean(t.access_token || t.encrypted_access_token);
            const isConnected = hasRefresh || hasAccess;

            this.status.google = {
              connected: isConnected,
              accountEmail: t.account_email,
              hasRefreshToken: hasRefresh,
              expiresAt: t.expires_at || t.token_expires_at,
            };

            if (isConnected) {
              const currentCfg = GoogleAuthService.getConfig();
              GoogleAuthService.saveConfig({
                ...currentCfg,
                connected: true,
                accessToken: t.access_token || t.encrypted_access_token || currentCfg.accessToken,
                expiresAt: t.expires_at ? new Date(t.expires_at).getTime() : Date.now() + 3600000,
                email: t.account_email || currentCfg.email,
                calendarSyncEnabled: true,
                driveSyncEnabled: true,
                gmailSyncEnabled: true,
              });
            }
          }

          if (t.provider === 'neosapien') {
            const token = t.access_token || t.encrypted_access_token;
            if (token) {
              this.status.neoSapien = {
                connected: true,
                hasToken: true,
                endpoint: 'https://api.neosapien.xyz/mcp',
                toolsCount: this.status.neoSapien.toolsCount || 6,
              };

              NeoSapienMCPService.saveTokens(token, t.refresh_token || t.encrypted_refresh_token);
            }
          }
        }
      }

      this.isInitialized = true;
      this.notify();
    } catch (err) {
      console.warn('[IntegrationVault] Session restoration notice:', err);
    }

    return this.status;
  }

  /**
   * Tests live server-side Google Tasks connection and returns latest 3 tasks
   */
  public async testGoogleTasksConnection(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      this.status.google.lastPingStatus = 'testing';
      this.notify();

      const res = await fetch('/api/integrations/google-tasks?action=ping');
      const data = await res.json();

      if (res.ok && data.success) {
        this.status.google.connected = true;
        this.status.google.accountEmail = data.accountEmail;
        this.status.google.hasRefreshToken = data.hasRefreshToken;
        this.status.google.lastPingStatus = 'success';
        this.status.google.lastPingDetails = data.latestTasks;
        this.notify();
        return { success: true, data };
      } else {
        this.status.google.lastPingStatus = 'error';
        this.status.google.lastPingDetails = data.message || 'Ping failed';
        this.notify();
        return { success: false, error: data.message };
      }
    } catch (err: any) {
      this.status.google.lastPingStatus = 'error';
      this.status.google.lastPingDetails = err.message;
      this.notify();
      return { success: false, error: err.message };
    }
  }

  /**
   * Tests live server-side NeoSapien MCP connection and retrieves tools/list
   */
  public async testNeoSapienConnection(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      this.status.neoSapien.lastPingStatus = 'testing';
      this.notify();

      const res = await fetch('/api/integrations/neosapien?action=handshake');
      const data = await res.json();

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
        return { success: false, error: data.message };
      }
    } catch (err: any) {
      this.status.neoSapien.lastPingStatus = 'error';
      this.status.neoSapien.lastPingDetails = err.message;
      this.notify();
      return { success: false, error: err.message };
    }
  }

  /**
   * Triggers an immediate pull/push sync across Google Tasks and NeoSapien via /api/integrations/sync
   */
  public async triggerSyncNow(): Promise<{ success: boolean; results?: any; error?: string }> {
    try {
      const res = await fetch('/api/integrations/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      return { success: res.ok, results: data.results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

export const IntegrationVaultService = new IntegrationVaultManager();
