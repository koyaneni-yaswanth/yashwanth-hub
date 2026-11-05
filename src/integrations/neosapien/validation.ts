// NeoSapien Integration: Input & Payload Validation Service

export class NeoValidationService {
  public static isValidUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  public static isValidMcpEndpoint(urlStr: string): boolean {
    if (!this.isValidUrl(urlStr)) return false;
    // Official NeoSapien MCP endpoint or verified local adapter
    return urlStr.includes('api.neosapien.xyz') || urlStr.includes('localhost') || urlStr.includes('127.0.0.1');
  }

  public static sanitizeString(input: string, maxLength = 2000): string {
    if (!input || typeof input !== 'string') return '';
    return input.trim().slice(0, maxLength);
  }

  public static isValidMemoryPayload(payload: any): boolean {
    if (!payload || typeof payload !== 'object') return false;
    // Must have at least title, summary, or transcript
    return Boolean(payload.title || payload.summary || payload.transcript || payload.raw_text || payload.topic);
  }

  public static isValidApiKey(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    const trimmed = key.trim();
    return trimmed.length >= 10 && !/\s/.test(trimmed);
  }

  public static isValidToken(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    const trimmed = token.trim();
    // Standard JWT or Bearer format
    return trimmed.length >= 20 && !/\s/.test(trimmed);
  }
}
