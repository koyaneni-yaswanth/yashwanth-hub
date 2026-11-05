// NeoSapien Integration: OAuth 2.0 PKCE & Session Management Service

export interface OAuthStartResult {
  authorizationUrl: string;
  clientId: string;
  codeVerifier: string;
  codeChallenge: string;
  state: string;
  redirectUri: string;
}

export class NeoOAuthService {
  private static PKCE_VERIFIER_KEY = 'yash_neosapien_pkce_verifier';
  private static PKCE_STATE_KEY = 'yash_neosapien_pkce_state';

  // Initiate OAuth 2.0 PKCE Authorization
  public static async initiateAuth(): Promise<OAuthStartResult> {
    const redirectUri = `${window.location.origin}/api/neosapien/callback`;
    const res = await fetch(`/api/neosapien/connect?action=start&redirect_uri=${encodeURIComponent(redirectUri)}`);

    if (!res.ok) {
      // Fallback to legacy auth route if connect route not yet loaded
      const fallbackRes = await fetch(`/api/neosapien/auth?action=start&redirect_uri=${encodeURIComponent(redirectUri)}`);
      if (!fallbackRes.ok) {
        const err = await fallbackRes.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to initiate NeoSapien OAuth');
      }
      const data = await fallbackRes.json();
      this.storePkceState(data.codeVerifier, data.state);
      return data;
    }

    const data = await res.json();
    this.storePkceState(data.codeVerifier, data.state);
    return data;
  }

  // Complete Code Exchange
  public static async exchangeCode(code: string, state: string): Promise<boolean> {
    const savedVerifier = localStorage.getItem(this.PKCE_VERIFIER_KEY) || '';
    const redirectUri = `${window.location.origin}/api/neosapien/callback`;

    if (!code) {
      throw new Error('Authorization code missing.');
    }

    const res = await fetch('/api/neosapien/connect?action=exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: savedVerifier,
        redirect_uri: redirectUri,
      }),
    });

    let tokenData: any;
    if (!res.ok) {
      // Try legacy auth endpoint
      const fallbackRes = await fetch('/api/neosapien/auth?action=exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          code_verifier: savedVerifier,
          redirect_uri: redirectUri,
        }),
      });

      if (!fallbackRes.ok) {
        const err = await fallbackRes.json().catch(() => ({}));
        throw new Error(err.message || 'Token exchange failed with NeoSapien');
      }
      tokenData = await fallbackRes.json();
    } else {
      tokenData = await res.json();
    }

    if (tokenData.accessToken) {
      this.saveSessionToken(tokenData.accessToken);
    }
    this.clearPkceState();
    return true;
  }

  // Connect via API Key
  public static async connectWithApiKey(apiKey: string): Promise<boolean> {
    const res = await fetch('/api/neosapien/connect?action=apikey', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });

    let data: any;
    if (!res.ok) {
      const fallbackRes = await fetch('/api/neosapien/auth?action=apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!fallbackRes.ok) {
        const err = await fallbackRes.json().catch(() => ({}));
        throw new Error(err.message || 'API Key exchange failed');
      }
      data = await fallbackRes.json();
    } else {
      data = await res.json();
    }

    if (data.accessToken) {
      this.saveSessionToken(data.accessToken);
    }
    return true;
  }

  // Store session tokens
  public static saveSessionToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('yash_neosapien_jwt', token.trim());
  }

  public static getSessionToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('yash_neosapien_jwt') || null;
  }

  public static clearSession(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('yash_neosapien_jwt');
    this.clearPkceState();
  }

  private static storePkceState(verifier: string, state: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.PKCE_VERIFIER_KEY, verifier);
    localStorage.setItem(this.PKCE_STATE_KEY, state);
  }

  private static clearPkceState(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.PKCE_VERIFIER_KEY);
    localStorage.removeItem(this.PKCE_STATE_KEY);
  }
}
