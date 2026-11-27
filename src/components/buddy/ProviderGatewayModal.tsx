/**
 * JARVIS 5.0 Unified AI Provider Configurator, Local Agent Pairing, Ollama VRAM Orchestrator
 * & System Reliability Drawer.
 * Keeps main `/buddy` viewport calm while surfacing complete diagnostics on demand.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  KeyRound,
  Pause,
  Play,
  RefreshCw,
  Server,
  Shield,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { AIGateway, type ProviderConfigState, type ReliabilitySnapshot } from '../../services/ai/aiGateway';
import { LocalAgentClient, type LocalAgentStatusSnapshot } from '../../services/ai/localAgentClient';
import { AI_PROVIDER_REGISTRY, type CloudOrLocalProviderId, type ProviderHealthReport } from '../../../api/_lib/aiProviderAdapters';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'reliability' | 'providers' | 'local';
  onStatusRefresh?: () => void;
}

export const ProviderGatewayModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialTab = 'providers',
  onStatusRefresh,
}) => {
  const [tab, setTab] = useState<'providers' | 'local' | 'reliability'>(initialTab);
  const [providersHealth, setProvidersHealth] = useState<ProviderHealthReport[]>([]);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigState[]>([]);
  const [vaultReady, setVaultReady] = useState<boolean | null>(null);
  const [editingKey, setEditingKey] = useState<Record<string, string>>({});
  const [editingModel, setEditingModel] = useState<Record<string, string>>({});
  const [editingBaseUrl, setEditingBaseUrl] = useState<string>('http://127.0.0.1:11434');
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [providerMsg, setProviderMsg] = useState<string | null>(null);

  const [localUrl, setLocalUrl] = useState(() => LocalAgentClient.getConfig().baseUrl);
  const [localToken, setLocalToken] = useState(() => LocalAgentClient.getConfig().token);
  const [localStatus, setLocalStatus] = useState<LocalAgentStatusSnapshot | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localBusy, setLocalBusy] = useState(false);

  const [reliability, setReliability] = useState<ReliabilitySnapshot>(() => AIGateway.getReliabilitySnapshot());

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadAll = useCallback(async () => {
    setReliability(AIGateway.getReliabilitySnapshot());
    const [health, cfgRes] = await Promise.all([
      AIGateway.healthCheck({ includeLocalOllama: true }).catch(() => null),
      AIGateway.getProviderConfigs().catch(() => null),
    ]);
    if (health?.providers) setProvidersHealth(health.providers);
    if (cfgRes) {
      setProviderConfigs(cfgRes.configs);
      setVaultReady(cfgRes.vaultEncryptionReady);
      const modelMap: Record<string, string> = {};
      for (const c of cfgRes.configs) {
        if (c.selected_model) modelMap[c.provider] = c.selected_model;
        if (c.provider === 'ollama' && c.base_url) setEditingBaseUrl(c.base_url);
      }
      setEditingModel((prev) => ({ ...modelMap, ...prev }));
    }

    const { token } = LocalAgentClient.getConfig();
    if (!token) {
      setLocalStatus(null);
      setLocalError('Not paired yet. Enter your jlocal_ token and click Connect & Verify Local Runtime.');
      return;
    }

    try {
      const st = await LocalAgentClient.getStatus();
      setLocalStatus(st);
      setLocalError(null);
    } catch (err: any) {
      setLocalStatus(null);
      setLocalError(err?.message || 'Local runtime unreachable on loopback');
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadAll();
  }, [isOpen, loadAll]);

  if (!isOpen) return null;

  const handleSaveProvider = async (id: CloudOrLocalProviderId, overrides?: { enabled?: boolean; clearKey?: boolean }) => {
    setBusyProvider(id);
    setProviderMsg(null);
    try {
      const apiKey = editingKey[id]?.trim();
      const res = await AIGateway.saveProviderConfig({
        provider: id,
        enabled: overrides?.enabled,
        apiKey: apiKey || undefined,
        clearKey: overrides?.clearKey,
        selectedModel: editingModel[id]?.trim() || undefined,
        baseUrl: id === 'ollama' ? editingBaseUrl.trim() : undefined,
      });
      setEditingKey((prev) => ({ ...prev, [id]: '' }));
      setProviderMsg(res.message || `Updated ${id}.`);
      await loadAll();
      onStatusRefresh?.();
    } catch (err: any) {
      setProviderMsg(err?.message || `Failed updating ${id}.`);
    } finally {
      setBusyProvider(null);
    }
  };

  const handleTestProvider = async (id: CloudOrLocalProviderId) => {
    setBusyProvider(id);
    setProviderMsg(null);
    try {
      const report = await AIGateway.testProviderConnection(id);
      setProviderMsg(`${AI_PROVIDER_REGISTRY[id].name}: ${report.status} (${report.latencyMs ?? '?'}ms) — ${report.note}`);
      await loadAll();
      onStatusRefresh?.();
    } catch (err: any) {
      setProviderMsg(err?.message || `Test failed for ${id}`);
    } finally {
      setBusyProvider(null);
    }
  };

  const handlePairLocalAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = LocalAgentClient.saveConfig(localUrl, localToken);
    if (!res.valid) {
      setLocalError(res.reason || 'Invalid URL');
      return;
    }
    setLocalBusy(true);
    await loadAll();
    onStatusRefresh?.();
    setLocalBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-white/15 bg-[#0d121a] flex flex-col overflow-hidden text-xs text-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-slate-100">
              JARVIS 5.0 — Unified AI Gateway, Local Agent & Reliability
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close AI Gateway Modal"
            onClick={onClose}
            className="p-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 bg-black/20 overflow-x-auto">
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'providers', label: 'AI Providers & Credentials' },
                { id: 'local', label: 'Local Runtime & Ollama GPU' },
                { id: 'reliability', label: 'Reliability, Circuits & Logs' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3 py-1.5 rounded-lg border whitespace-nowrap ${
                  tab === item.id
                    ? 'bg-amber-500/20 border-amber-400/40 text-amber-200'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={loadAll}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === 'providers' && (
            <div className="space-y-3">
              {vaultReady === false && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-amber-200">
                  Server-side encrypted per-user credential storage requires <code className="px-1 bg-black/30 rounded">AI_VAULT_ENCRYPTION_KEY</code> (or <code className="px-1 bg-black/30 rounded">SUPABASE_SERVICE_ROLE_KEY</code>) on Vercel. Vercel environment keys remain active automatically.
                </div>
              )}
              {providerMsg && (
                <div className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sky-200">{providerMsg}</div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(Object.keys(AI_PROVIDER_REGISTRY) as CloudOrLocalProviderId[]).map((id) => {
                  const meta = AI_PROVIDER_REGISTRY[id];
                  const h = providersHealth.find((r) => r.id === id);
                  const cfg = providerConfigs.find((c) => c.provider === id);
                  const enabled = cfg ? cfg.enabled : true;

                  return (
                    <div key={id} className="rounded-xl border border-white/10 bg-[#121923] p-3.5 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold text-slate-100 flex items-center gap-2">
                            <span>{meta.name}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                !enabled
                                  ? 'bg-slate-500/15 border-slate-500/30 text-slate-400'
                                  : h?.status === 'connected'
                                  ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                                  : h?.status === 'degraded' || h?.status === 'unreachable'
                                  ? 'bg-rose-500/15 border-rose-400/30 text-rose-300'
                                  : 'bg-white/5 border-white/10 text-slate-400'
                              }`}
                            >
                              {!enabled ? 'disabled' : h?.status || 'unknown'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{meta.strengthSummary}</div>
                        </div>

                        <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer shrink-0">
                          <span>Enabled</span>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) => handleSaveProvider(id, { enabled: e.target.checked })}
                          />
                        </label>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                        <span>Key: <strong className="text-slate-200">{cfg?.key_hint || (h?.configured ? 'server-env' : 'Not set')}</strong></span>
                        <span>·</span>
                        <span>Latency: <strong className="text-slate-200">{h?.latencyMs != null ? `${h.latencyMs}ms` : '—'}</strong></span>
                        {h?.discoveredModelsCount && (
                          <>
                            <span>·</span>
                            <span>{h.discoveredModelsCount} models</span>
                          </>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <input
                          type="text"
                          value={editingModel[id] ?? cfg?.selected_model ?? ''}
                          onChange={(e) => setEditingModel((prev) => ({ ...prev, [id]: e.target.value }))}
                          placeholder={`Default model (${meta.defaultModel})`}
                          className="w-full rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5 text-[11px]"
                        />

                        {id === 'ollama' ? (
                          <input
                            type="url"
                            value={editingBaseUrl}
                            onChange={(e) => setEditingBaseUrl(e.target.value)}
                            placeholder="http://127.0.0.1:11434"
                            className="w-full rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5 text-[11px]"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <KeyRound className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                            <input
                              type="password"
                              value={editingKey[id] || ''}
                              onChange={(e) => setEditingKey((prev) => ({ ...prev, [id]: e.target.value }))}
                              placeholder={cfg?.hasUserKey ? 'Replace encrypted API key...' : `Enter ${meta.envVar} (stored encrypted on server)`}
                              className="flex-1 rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5 text-[11px]"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyProvider === id}
                            onClick={() => handleSaveProvider(id)}
                            className="px-2.5 py-1 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 disabled:opacity-40"
                          >
                            Save Config
                          </button>
                          <button
                            type="button"
                            disabled={busyProvider === id}
                            onClick={() => handleTestProvider(id)}
                            className="px-2.5 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10"
                          >
                            Test
                          </button>
                        </div>
                        {cfg?.hasUserKey && (
                          <button
                            type="button"
                            onClick={() => handleSaveProvider(id, { clearKey: true })}
                            title="Revoke user key"
                            className="p-1.5 rounded-lg border border-white/10 text-rose-300 hover:bg-rose-500/15"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'local' && (
            <div className="space-y-4">
              <form onSubmit={handlePairLocalAgent} className="rounded-xl border border-white/10 bg-[#121923] p-3.5 space-y-2.5">
                <div className="font-semibold text-slate-100 flex items-center gap-2">
                  <Server className="h-4 w-4 text-emerald-400" />
                  <span>Pair Browser with Local JARVIS Python Runtime</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Run <code className="px-1 bg-black/30 rounded">.\local-agent\scripts\start_windows.ps1</code> or WSL2 systemd service; copy the generated <code className="px-1 bg-black/30 rounded">jlocal_...</code> token below. Always binds strictly to loopback <code className="px-1 bg-black/30 rounded">127.0.0.1</code>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="url"
                    value={localUrl}
                    onChange={(e) => setLocalUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8787"
                    className="rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5"
                  />
                  <input
                    type="password"
                    value={localToken}
                    onChange={(e) => setLocalToken(e.target.value)}
                    placeholder="jlocal_... pairing bearer token"
                    className="rounded-lg border border-white/10 bg-[#0b0f17] px-2.5 py-1.5"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={localBusy}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black font-semibold hover:bg-emerald-400"
                  >
                    Connect & Verify Local Runtime
                  </button>
                  {localStatus && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (localStatus.paused) await LocalAgentClient.resume();
                        else await LocalAgentClient.pause();
                        await loadAll();
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10"
                    >
                      {localStatus.paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                      <span>{localStatus.paused ? 'Resume Queue' : 'Pause Queue'}</span>
                    </button>
                  )}
                </div>
                {localError && <div className="text-[11px] text-amber-300">{localError}</div>}
              </form>

              {localStatus && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-1.5">
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-cyan-400" /> Host Hardware & GPU
                      </div>
                      <div>CPU Load: {localStatus.hardware.cpu_percent}% ({localStatus.hardware.cpu_cores} cores)</div>
                      <div>RAM: {localStatus.hardware.ram_available_gb} GB free / {localStatus.hardware.ram_total_gb} GB</div>
                      {localStatus.hardware.gpu ? (
                        <div>
                          GPU: {localStatus.hardware.gpu.name} · {localStatus.hardware.gpu.vram_free_mib} MiB free /{' '}
                          {localStatus.hardware.gpu.vram_total_mib} MiB
                        </div>
                      ) : (
                        <div className="text-slate-400">No NVIDIA GPU detected (CPU fallback)</div>
                      )}
                      <div>Execution mode: <strong>{localStatus.hardware.execution_mode}</strong></div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-1.5">
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5 text-amber-300" /> Ollama Local Models ({localStatus.ollama.status})
                      </div>
                      {localStatus.ollama.error && <div className="text-amber-300">{localStatus.ollama.error}</div>}
                      {localStatus.ollama.models.map((m) => {
                        const isLoaded = localStatus.ollama.loaded_models.some((l) => l.name === m.name);
                        return (
                          <div key={m.name} className="flex items-center justify-between gap-2 py-1 border-b border-white/5">
                            <span>{m.name} ({m.quantization || `${m.size_mb}MB`})</span>
                            <button
                              type="button"
                              onClick={async () => {
                                if (isLoaded) await LocalAgentClient.unloadModel(m.name);
                                else await LocalAgentClient.loadModel(m.name);
                                await loadAll();
                              }}
                              className="px-2 py-0.5 rounded border border-white/15 bg-white/5 hover:bg-white/10 text-[10px]"
                            >
                              {isLoaded ? 'Unload VRAM' : 'Load'}
                            </button>
                          </div>
                        );
                      })}
                      <div className="pt-1 space-y-1">
                        <div className="text-[10px] text-slate-400">Quantized recommendations for this machine:</div>
                        {localStatus.hardware.recommended_models.slice(0, 3).map((rec) => (
                          <div key={rec.model} className="text-[10px] text-slate-300 flex justify-between">
                            <code>{rec.install_cmd}</code>
                            <span className="text-slate-400">{rec.fallback}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'reliability' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {reliability.circuits.map((c) => (
                  <div key={c.provider} className="rounded-xl border border-white/10 bg-[#121923] p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100">{c.provider}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${
                          c.state === 'closed'
                            ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                            : c.state === 'half_open'
                            ? 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                            : 'bg-rose-500/15 border-rose-400/30 text-rose-300'
                        }`}
                      >
                        Circuit: {c.state}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Failures: {c.failures} {c.lastError ? `· ${c.lastError.slice(0, 80)}` : ''}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-white/10 bg-[#121923] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-sky-400" /> Recent Request Correlation & Failover Traces
                  </div>
                  <Shield className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                {reliability.recentTraces.length === 0 ? (
                  <div className="text-slate-400">No gateway requests recorded in this session yet.</div>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {reliability.recentTraces.map((tr) => (
                      <div key={tr.requestId} className="rounded-lg bg-black/25 px-3 py-2 flex flex-wrap justify-between gap-2 text-[11px]">
                        <div>
                          <code className="text-cyan-300">{tr.requestId}</code> · {tr.category} · <strong>{tr.provider}</strong> ({tr.status})
                          {tr.note && <div className="text-slate-400">{tr.note}</div>}
                        </div>
                        <span className="text-slate-400">{tr.latencyMs}ms</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
