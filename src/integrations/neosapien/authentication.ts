// NeoSapien Integration: Authentication & Security

import { NeoOAuthService } from './oauth-service';

export class NeoAuthenticationService {
  private static STORAGE_KEY_WEBHOOK_SECRET = 'yash_neosapien_webhook_secret';

  public static getWebhookSecret(): string {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(this.STORAGE_KEY_WEBHOOK_SECRET);
      if (stored) return stored.trim();
    }
    return '';
  }

  public static saveWebhookSecret(secret: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY_WEBHOOK_SECRET, secret.trim());
    }
  }

  public static getMcpServerUrl(): string {
    return 'https://api.neosapien.xyz/mcp';
  }

  public static isAuthenticated(): boolean {
    return Boolean(NeoOAuthService.getSessionToken());
  }

  // Validate incoming webhook header strictly
  public static validateBearerToken(headerValue: string | undefined): boolean {
    const configured = this.getWebhookSecret();
    if (!configured) {
      // Require configured secret for security
      return false;
    }
    return headerValue === `Bearer ${configured}`;
  }
}
