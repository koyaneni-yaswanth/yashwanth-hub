// Client-side NeoSapien MCP Integration Service
// Bridges Yashwanth Hub with official /api/neosapien/* serverless endpoints

import { db } from '../db';
import { NeoSapienMemoryService } from './neoSapienMemoryService';
import type { NeoMemory } from '../types';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: any;
}

export interface NeoMcpSessionState {
  connected: boolean;
  authType: 'oauth_pkce' | 'api_key' | 'bearer' | 'none';
  hasToken: boolean;
  accountEmail?: string;
  lastSyncTimestamp?: string;
  importedMemoriesCount: number;
  lastError?: string;
}

export class NeoSapienMCPService {
  private static TOKEN_STORAGE_KEY = 'yash_neosapien_jwt';
  private static REFRESH_STORAGE_KEY = 'yash_neosapien_refresh';
  private static PKCE_VERIFIER_KEY = 'yash_neosapien_pkce_verifier';
  private static PKCE_STATE_KEY = 'yash_neosapien_pkce_state';

  // 1. Token Management
  public static getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.TOKEN_STORAGE_KEY) || null;
  }

  public static getStoredRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_STORAGE_KEY) || null;
  }

  public static saveTokens(accessToken: string, refreshToken?: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.TOKEN_STORAGE_KEY, accessToken);
    if (refreshToken) {
      localStorage.setItem(this.REFRESH_STORAGE_KEY, refreshToken);
    }

    // Update config
    const cfg = NeoSapienMemoryService.getConfig();
    cfg.status = 'connected';
    if (!cfg.mcpConfig) {
      cfg.mcpConfig = {
        enabled: true,
        serverUrl: 'https://api.neosapien.xyz/mcp',
        authType: 'bearer',
        readOnly: true,
        status: 'connected',
      };
    } else {
      cfg.mcpConfig.enabled = true;
      cfg.mcpConfig.serverUrl = 'https://api.neosapien.xyz/mcp';
      cfg.mcpConfig.status = 'connected';
      delete cfg.mcpConfig.lastError;
    }
    NeoSapienMemoryService.saveConfig(cfg);
  }

  public static clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.TOKEN_STORAGE_KEY);
    localStorage.removeItem(this.REFRESH_STORAGE_KEY);
    localStorage.removeItem(this.PKCE_VERIFIER_KEY);
    localStorage.removeItem(this.PKCE_STATE_KEY);

    const cfg = NeoSapienMemoryService.getConfig();
    cfg.status = 'not_configured';
    if (cfg.mcpConfig) {
      cfg.mcpConfig.enabled = false;
      cfg.mcpConfig.status = 'disconnected';
    }
    NeoSapienMemoryService.saveConfig(cfg);
  }

  // 2. OAuth 2.0 PKCE Authorization Initiation
  public static async initiateOAuthFlow(): Promise<{ authorizationUrl: string; state: string }> {
    const redirectUri = `${window.location.origin}/api/neosapien/callback`;
    const res = await fetch(`/api/neosapien/auth?action=start&redirect_uri=${encodeURIComponent(redirectUri)}`);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to initialize OAuth PKCE authorization');
    }

    const data = await res.json();
    localStorage.setItem(this.PKCE_VERIFIER_KEY, data.codeVerifier);
    localStorage.setItem(this.PKCE_STATE_KEY, data.state);

    return {
      authorizationUrl: data.authorizationUrl,
      state: data.state,
    };
  }

  // 3. OAuth 2.0 PKCE Code Exchange
  public static async completeOAuthCodeExchange(code: string, state: string): Promise<boolean> {
    const savedVerifier = localStorage.getItem(this.PKCE_VERIFIER_KEY);
    const redirectUri = `${window.location.origin}/api/neosapien/callback`;

    if (!code) {
      throw new Error('Authorization code missing.');
    }

    const res = await fetch('/api/neosapien/auth?action=exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: savedVerifier || '',
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Token exchange failed with NeoSapien');
    }

    const tokenData = await res.json();
    this.saveTokens(tokenData.accessToken, tokenData.refreshToken);
    localStorage.removeItem(this.PKCE_VERIFIER_KEY);
    localStorage.removeItem(this.PKCE_STATE_KEY);

    // Run initial sync after successful login
    this.syncMemories().catch((err) => console.warn('Post-login sync notice:', err));

    return true;
  }

  // 4. Connect via API Key
  public static async connectWithApiKey(apiKey: string): Promise<boolean> {
    const res = await fetch('/api/neosapien/auth?action=apikey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'API Key authorization failed');
    }

    const data = await res.json();
    this.saveTokens(data.accessToken);

    // Run initial sync
    this.syncMemories().catch((err) => console.warn('Post-login sync notice:', err));
    return true;
  }

  // 5. Connect via Direct Bearer Token
  public static async connectWithBearerToken(token: string): Promise<boolean> {
    const trimmed = token.trim();
    if (!trimmed) throw new Error('Token cannot be empty');

    // Test token validity against MCP status
    const res = await fetch('/api/neosapien/mcp?action=tools', {
      headers: { Authorization: `Bearer ${trimmed}` },
    });

    if (!res.ok) {
      throw new Error('Provided token was rejected by NeoSapien MCP endpoint.');
    }

    this.saveTokens(trimmed);
    this.syncMemories().catch((err) => console.warn('Post-login sync notice:', err));
    return true;
  }

  // 6. Discover Available MCP Tools
  public static async getDiscoveredTools(): Promise<McpToolDefinition[]> {
    const token = this.getStoredToken();
    if (!token) throw new Error('Not authenticated with NeoSapien');

    const res = await fetch('/api/neosapien/mcp?action=tools', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Failed to discover MCP tools');
    }

    const data = await res.json();
    return data.tools || [];
  }

  // 7. Full & Incremental Memory Synchronization
  public static async syncMemories(): Promise<{
    imported: number;
    updated: number;
    total: number;
    message: string;
  }> {
    const token = this.getStoredToken();
    if (!token) {
      throw new Error('NeoSapien integration is not connected. Authenticate first.');
    }

    const res = await fetch('/api/neosapien/mcp?action=sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ limit: 100 }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Attempt token refresh
        const refreshToken = this.getStoredRefreshToken();
        if (refreshToken) {
          const refreshRes = await fetch('/api/neosapien/auth?action=refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
          });

          if (refreshRes.ok) {
            const refreshed = await refreshRes.json();
            this.saveTokens(refreshed.accessToken, refreshed.refreshToken);
            // Retry sync once
            return this.syncMemories();
          }
        }
        this.clearTokens();
        throw new Error('NeoSapien session expired. Please re-authenticate.');
      }

      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Synchronization request failed');
    }

    const data = await res.json();
    const memories: Partial<NeoMemory>[] = data.memories || [];

    // Idempotent import into Dexie and Supabase sync queue
    const audit = await NeoSapienMemoryService.importMemories(memories, 'mcp');

    // Update last sync time
    const cfg = NeoSapienMemoryService.getConfig();
    if (cfg.mcpConfig) {
      cfg.mcpConfig.lastSyncAt = new Date().toISOString();
      delete cfg.mcpConfig.lastError;
      NeoSapienMemoryService.saveConfig(cfg);
    }

    const totalCount = await db.neo_memories.count();

    return {
      imported: audit.memoriesImported,
      updated: audit.memoriesUpdated,
      total: totalCount,
      message: `Successfully synchronized ${audit.memoriesImported} new memories from NeoSapien.`,
    };
  }

  // 8. Session State & Summary
  public static async getSessionState(): Promise<NeoMcpSessionState> {
    const token = this.getStoredToken();
    const cfg = NeoSapienMemoryService.getConfig();
    const count = await db.neo_memories.count();

    return {
      connected: Boolean(token && cfg.status === 'connected'),
      authType: token ? 'oauth_pkce' : 'none',
      hasToken: Boolean(token),
      lastSyncTimestamp: cfg.mcpConfig?.lastSyncAt,
      importedMemoriesCount: count,
      lastError: cfg.mcpConfig?.lastError,
    };
  }
}
