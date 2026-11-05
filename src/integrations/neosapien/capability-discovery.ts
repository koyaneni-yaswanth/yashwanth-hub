// NeoSapien Integration: Capability Discovery & Schema Reflection Service

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

export class NeoCapabilityDiscovery {
  private static cachedTools: McpToolDefinition[] | null = null;

  public static async discoverTools(token?: string): Promise<McpToolDefinition[]> {
    const activeToken = token || localStorage.getItem('yash_neosapien_jwt');
    if (!activeToken) {
      throw new Error('NeoSapien integration is not authenticated. Please sign in first.');
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${activeToken}`,
    };

    let res = await fetch('/api/neosapien/capabilities', { headers });
    if (!res.ok) {
      // Fallback to /api/neosapien/mcp?action=tools
      res = await fetch('/api/neosapien/mcp?action=tools', { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to discover NeoSapien MCP tools');
      }
    }

    const data = await res.json();
    const tools: McpToolDefinition[] = data.tools || [];
    this.cachedTools = tools;
    return tools;
  }

  public static getCachedTools(): McpToolDefinition[] {
    return this.cachedTools || [];
  }

  public static hasTool(toolName: string): boolean {
    if (!this.cachedTools) return false;
    return this.cachedTools.some((t) => t.name === toolName);
  }
}
