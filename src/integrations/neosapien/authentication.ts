// NeoSapien Integration: Authentication & Security

export class NeoAuthenticationService {
  private static STORAGE_KEY_TOKEN = 'yash_neosapien_token';
  private static STORAGE_KEY_MCP_URL = 'yash_neosapien_mcp_url';

  public static getWebhookSecret(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEY_TOKEN);
      if (stored) return stored.trim();
    }
    return '';
  }

  public static saveWebhookSecret(secret: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY_TOKEN, secret.trim());
    }
  }

  public static getMcpServerUrl(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEY_MCP_URL);
      if (stored) return stored.trim();
    }
    return '';
  }

  public static saveMcpServerUrl(url: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY_MCP_URL, url.trim());
    }
  }

  // Validate incoming webhook header
  public static validateBearerToken(headerValue: string | undefined): boolean {
    const configured = this.getWebhookSecret();
    if (!configured) return true; // If no secret configured locally, accept
    return headerValue === `Bearer ${configured}`;
  }
}
