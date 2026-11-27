/**
 * Secure Client Bridge to the Local JARVIS 5.0 Python Runtime (127.0.0.1:8787)
 * Connects via loopback HTTP + authenticated WebSocket (`/events`).
 * Never claims local agent is online unless `/health` actually responds.
 */

export interface LocalHardwareTelemetry {
  cpu_percent: number;
  cpu_cores: number;
  ram_total_gb: number;
  ram_available_gb: number;
  ram_percent: number;
  gpu: {
    name: string;
    vram_total_mib: number;
    vram_free_mib: number;
    vram_used_mib: number;
    utilization_pct: number;
  } | null;
  recommended_models: Array<{
    model: string;
    use_case: string;
    min_vram_mib: number;
    quantization: string;
    fits_gpu: boolean;
    fits_current_free_vram: boolean;
    fallback: string;
    install_cmd: string;
  }>;
  execution_mode: 'gpu_offload' | 'cpu_fallback';
}

export interface LocalAgentStatusSnapshot {
  service: string;
  paused: boolean;
  uptime_sec: number;
  allowed_dirs: string[];
  private_offline_only: boolean;
  hardware: LocalHardwareTelemetry;
  ollama: {
    reachable: boolean;
    status: string;
    latency_ms: number | null;
    models: Array<{ name: string; size_mb: number; parameter_size?: string; quantization?: string }>;
    loaded_models: Array<{ name: string; size_vram_mb: number; expires_at?: string }>;
    error: string | null;
  };
  queue: {
    queued: number;
    running: number;
    completed: number;
    dead_letter: number;
  };
  pending_approvals: number;
}

const URL_KEY = 'yash_jarvis_local_url';
const TOKEN_KEY = 'yash_jarvis_local_token';

export class LocalAgentClient {
  public static getConfig(): { baseUrl: string; token: string } {
    if (typeof window === 'undefined') {
      return { baseUrl: 'http://127.0.0.1:8787', token: '' };
    }
    const baseUrl = (localStorage.getItem(URL_KEY) || 'http://127.0.0.1:8787').trim().replace(/\/$/, '');
    const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
    return { baseUrl, token };
  }

  public static saveConfig(baseUrl: string, token: string): { valid: boolean; reason?: string } {
    let clean = String(baseUrl || '').trim().replace(/\/$/, '');
    try {
      const u = new URL(clean);
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
        return { valid: false, reason: 'Local Agent URL must use loopback (127.0.0.1 or localhost) for security.' };
      }
      clean = `${u.protocol}//${u.host}`;
    } catch {
      return { valid: false, reason: 'Invalid Local Agent URL.' };
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(URL_KEY, clean);
      localStorage.setItem(TOKEN_KEY, String(token || '').trim());
    }
    return { valid: true };
  }

  private static async request<T>(path: string, init: RequestInit = {}, timeoutMs = 4500): Promise<T> {
    const { baseUrl, token } = this.getConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const signal = init.signal || AbortSignal.timeout(timeoutMs);
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers, signal });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail || body?.error || `Local Agent HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  }

  public static async probeHealth(force = false): Promise<{
    online: boolean;
    paused?: boolean;
    ollamaReachable?: boolean;
    ollamaStatus?: string;
    privateOfflineOnly?: boolean;
    uptimeSec?: number;
    error?: string;
  }> {
    const { token } = this.getConfig();
    if (!force && !token) {
      return { online: false, error: 'Local runtime not paired yet. Open Providers -> Local Runtime to pair.' };
    }
    try {
      const data = await this.request<any>('/health', { method: 'GET' }, 1800);
      return {
        online: true,
        paused: Boolean(data.paused),
        ollamaReachable: Boolean(data.ollama_reachable),
        ollamaStatus: data.ollama_status,
        privateOfflineOnly: Boolean(data.private_offline_only),
        uptimeSec: data.uptime_sec,
      };
    } catch (err: any) {
      return { online: false, error: err?.message || 'Local runtime not running on 127.0.0.1:8787' };
    }
  }

  public static async getStatus(): Promise<LocalAgentStatusSnapshot> {
    return this.request<LocalAgentStatusSnapshot>('/status', { method: 'GET' });
  }

  public static async listModels() {
    return this.request<{ ollama: LocalAgentStatusSnapshot['ollama']; hardware: LocalHardwareTelemetry }>('/models', {
      method: 'GET',
    });
  }

  public static async loadModel(model: string) {
    return this.request<{ ok: boolean; model: string; execution_mode?: string; load_ms?: number }>('/models/load', {
      method: 'POST',
      body: JSON.stringify({ model, keep_alive: '10m', unload_others: true }),
    }, 45000);
  }

  public static async unloadModel(model: string) {
    return this.request<{ ok: boolean; model: string }>('/models/unload', {
      method: 'POST',
      body: JSON.stringify({ model }),
    }, 15000);
  }

  public static async listTasks() {
    return this.request<{ tasks: any[] }>('/tasks', { method: 'GET' });
  }

  public static async retryDeadLetters() {
    return this.request<{ requeued: number }>('/tasks/retry-dead-letter', { method: 'POST', body: '{}' });
  }

  public static async listApprovals() {
    return this.request<{ approvals: any[] }>('/approvals', { method: 'GET' });
  }

  public static async decideApproval(approvalId: string, decision: 'approve' | 'reject') {
    return this.request<any>(`/approvals/${encodeURIComponent(approvalId)}`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
  }

  public static async pause() {
    return this.request<{ paused: boolean }>('/control/pause', { method: 'POST', body: '{}' });
  }

  public static async resume() {
    return this.request<{ paused: boolean }>('/control/resume', { method: 'POST', body: '{}' });
  }

  public static async streamChat(
    messages: Array<{ role: string; content: string }>,
    model: string | undefined,
    onToken: (delta: string, accumulated: string) => void,
    signal?: AbortSignal
  ): Promise<{ text: string; model: string; provider: 'ollama' }> {
    const { baseUrl, token } = this.getConfig();
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ model, messages, stream: true }),
      signal: signal || AbortSignal.timeout(90000),
    });

    if (!res.ok || !res.body) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody?.detail || `Local Agent /chat HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let finalModel = model || 'ollama-local';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        try {
          const ev = JSON.parse(line.slice(5).trim());
          if (ev.type === 'token' && typeof ev.delta === 'string') {
            accumulated += ev.delta;
            onToken(ev.delta, accumulated);
          } else if (ev.type === 'done') {
            if (ev.modelId) finalModel = ev.modelId;
            if (!accumulated && ev.text) accumulated = ev.text;
          } else if (ev.type === 'error') {
            throw new Error(ev.error || 'Local Ollama streaming error');
          }
        } catch (parseErr: any) {
          if (parseErr?.message && !String(parseErr.message).includes('JSON')) throw parseErr;
        }
      }
    }

    return { text: accumulated, model: finalModel, provider: 'ollama' };
  }

  public static subscribeEvents(onEvent: (ev: any) => void): () => void {
    const { baseUrl, token } = this.getConfig();
    if (!token || typeof WebSocket === 'undefined') return () => {};
    const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/events?token=${encodeURIComponent(token)}`;
    let closed = false;
    let ws: WebSocket | null = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (msg) => {
        try {
          onEvent(JSON.parse(String(msg.data)));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        ws = null;
      };
    } catch {
      /* non-fatal */
    }
    return () => {
      closed = true;
      if (ws && ws.readyState <= WebSocket.OPEN) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
      void closed;
    };
  }
}
