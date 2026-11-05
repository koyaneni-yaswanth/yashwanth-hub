// NeoSapien Integration: MCP Client Gateway Interface

import { NeoOAuthService } from './oauth-service';
import { NeoCapabilityDiscovery, type McpToolDefinition } from './capability-discovery';
import { NeoSyncService } from './sync-service';
import { db } from '../../db';

export interface McpSyncResult {
  imported: number;
  updated: number;
  skipped: number;
  total: number;
  message: string;
}

export class NeoMcpClient {
  public static readonly OFFICIAL_ENDPOINT = 'https://api.neosapien.xyz/mcp';

  // Check MCP connection status
  public static async checkStatus(): Promise<{ connected: boolean; status: string; message?: string }> {
    const token = NeoOAuthService.getSessionToken();
    if (!token) {
      return { connected: false, status: 'unauthenticated' };
    }

    try {
      let res = await fetch('/api/neosapien/status', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // Fallback to /api/neosapien/mcp?action=status
        res = await fetch('/api/neosapien/mcp?action=status', {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      if (res.ok) {
        const data = await res.json();
        return { connected: true, status: data.status || 'connected' };
      }
      return { connected: false, status: 'token_expired' };
    } catch (err: any) {
      return { connected: false, status: 'error', message: err.message };
    }
  }

  // Discover capabilities
  public static async discoverCapabilities(): Promise<McpToolDefinition[]> {
    return NeoCapabilityDiscovery.discoverTools();
  }

  // Synchronize memories
  public static async syncMemories(limit = 100): Promise<McpSyncResult> {
    const token = NeoOAuthService.getSessionToken();
    if (!token) {
      throw new Error('NeoSapien integration is not connected. Authenticate first.');
    }

    let res = await fetch('/api/neosapien/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ limit }),
    });

    if (!res.ok) {
      // Fallback to /api/neosapien/mcp?action=sync
      res = await fetch('/api/neosapien/mcp?action=sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ limit }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'NeoSapien memory synchronization failed.');
      }
    }

    const data = await res.json();
    const rawMemories = data.memories || [];

    // Ingest into local store and Supabase queue
    const audit = await NeoSyncService.ingestMemories(rawMemories, 'mcp');
    const totalCount = await db.neo_memories.count();

    return {
      imported: audit.imported,
      updated: audit.updated,
      skipped: audit.skipped,
      total: totalCount,
      message: `Synchronized ${audit.imported} new memories (${audit.updated} updated, ${audit.skipped} unchanged).`,
    };
  }

  // Execute remote MCP tool
  public static async callTool(name: string, toolArgs: Record<string, any> = {}): Promise<any> {
    const token = NeoOAuthService.getSessionToken();
    if (!token) {
      throw new Error('Not authenticated with NeoSapien');
    }

    const res = await fetch('/api/neosapien/mcp?action=call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, arguments: toolArgs }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to execute MCP tool "${name}"`);
    }

    return res.json();
  }

  // Disconnect
  public static async disconnect(): Promise<void> {
    const token = NeoOAuthService.getSessionToken();
    if (token) {
      fetch('/api/neosapien/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    NeoOAuthService.clearSession();
  }
}
