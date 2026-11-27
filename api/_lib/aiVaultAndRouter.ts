/**
 * JARVIS 5.0 Server-Side Encrypted Provider Credential Vault, Probe Diagnostics,
 * Correlation Tracking & Circuit Breaker Registry.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  AI_PROVIDER_REGISTRY,
  probeAllProviders,
  type CloudOrLocalProviderId,
  type ProviderConfigMap,
  type ProviderHealthReport,
} from './aiProviderAdapters.ts';
import { ProviderCircuitBreaker } from '../../src/lib/modelRouter5.ts';

export const serverCircuitBreaker = new ProviderCircuitBreaker(3, 30000);

const PROVIDER_ENV_KEY: Record<CloudOrLocalProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  huggingface: 'HF_TOKEN',
  ollama: 'OLLAMA_BASE_URL',
};

export interface UserProviderConfigRow {
  provider: CloudOrLocalProviderId;
  enabled: boolean;
  selected_model: string | null;
  key_hint: string | null;
  base_url: string | null;
  hasUserKey: boolean;
  hasServerEnvKey: boolean;
  last_health_status: string | null;
  last_latency_ms: number | null;
  last_checked_at: string | null;
  last_error: string | null;
}

export function generateCorrelationId(): string {
  return `req_${randomUUID().slice(0, 12)}`;
}

function getVaultMasterSecret(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = (env.AI_VAULT_ENCRYPTION_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!raw || raw.length < 16) return null;
  return createHash('sha256').update(`yashwanth-hub:jarvis5:vault:${raw}`).digest();
}

export function canEncryptUserSecrets(env: Record<string, string | undefined> = process.env): boolean {
  return getVaultMasterSecret(env) !== null;
}

export function maskSecretHint(secret: string): string {
  const s = String(secret || '').trim();
  if (!s) return '';
  if (s.length <= 8) return '***';
  return `${s.slice(0, 3)}...${s.slice(-4)}`;
}

export function encryptProviderSecret(
  plainText: string,
  env: Record<string, string | undefined> = process.env
): string {
  const key = getVaultMasterSecret(env);
  if (!key) {
    throw new Error('Server encryption secret (AI_VAULT_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY) is not configured.');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText).trim(), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptProviderSecret(
  encoded: string,
  env: Record<string, string | undefined> = process.env
): string | null {
  const key = getVaultMasterSecret(env);
  if (!key || !encoded) return null;
  try {
    const [ver, ivB64, tagB64, dataB64] = encoded.split(':');
    if (ver !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const out = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}

export async function loadEffectiveProviderContext(
  db: any,
  userId: string | null | undefined,
  baseEnv: Record<string, string | undefined> = process.env
): Promise<{
  effectiveEnv: Record<string, string | undefined>;
  enabledProviders: Partial<Record<CloudOrLocalProviderId, boolean>>;
  selectedModels: Partial<Record<CloudOrLocalProviderId, string>>;
  configs: UserProviderConfigRow[];
}> {
  const effectiveEnv: Record<string, string | undefined> = { ...baseEnv };
  const enabledProviders: Partial<Record<CloudOrLocalProviderId, boolean>> = {};
  const selectedModels: Partial<Record<CloudOrLocalProviderId, string>> = {};
  const rowsByProvider = new Map<string, any>();

  if (db && userId) {
    try {
      const { data } = await db
        .from('provider_credentials')
        .select('*')
        .eq('user_id', userId);
      for (const row of data || []) {
        rowsByProvider.set(String(row.provider), row);
      }
    } catch {
      /* table may not exist in older mocks */
    }
  }

  const configs: UserProviderConfigRow[] = [];
  for (const id of Object.keys(AI_PROVIDER_REGISTRY) as CloudOrLocalProviderId[]) {
    const envVar = PROVIDER_ENV_KEY[id];
    const row = rowsByProvider.get(id);
    const enabled = row ? row.enabled !== false : true;
    enabledProviders[id] = enabled;

    if (row?.selected_model) {
      selectedModels[id] = String(row.selected_model);
    }

    const decrypted = row?.encrypted_api_key ? decryptProviderSecret(String(row.encrypted_api_key), baseEnv) : null;
    const baseUrl = row?.base_url ? String(row.base_url).trim() : null;
    const hasServerEnvKey = Boolean((baseEnv[envVar] || '').trim());

    if (!enabled) {
      delete effectiveEnv[envVar];
      if (id === 'huggingface') delete effectiveEnv.HUGGINGFACE_API_KEY;
    } else if (id === 'ollama' && baseUrl) {
      effectiveEnv.OLLAMA_BASE_URL = baseUrl;
    } else if (decrypted) {
      effectiveEnv[envVar] = decrypted;
    }

    configs.push({
      provider: id,
      enabled,
      selected_model: row?.selected_model || null,
      key_hint: row?.key_hint || (hasServerEnvKey ? 'server-env' : null),
      base_url: baseUrl || (id === 'ollama' ? (baseEnv.OLLAMA_BASE_URL || 'http://127.0.0.1:11434') : null),
      hasUserKey: Boolean(row?.encrypted_api_key),
      hasServerEnvKey,
      last_health_status: row?.last_health_status || null,
      last_latency_ms: typeof row?.last_latency_ms === 'number' ? row.last_latency_ms : null,
      last_checked_at: row?.last_checked_at || null,
      last_error: row?.last_error || null,
    });
  }

  return { effectiveEnv, enabledProviders, selectedModels, configs };
}

export async function testSingleProviderAndPersist(options: {
  db: any;
  userId?: string | null;
  provider: CloudOrLocalProviderId;
  effectiveEnv: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<ProviderHealthReport> {
  const reports = await probeAllProviders(options.effectiveEnv, options.fetchImpl || fetch, 4500);
  const report = reports.find((r) => r.id === options.provider)!;

  if (report.status === 'connected') {
    serverCircuitBreaker.recordSuccess(options.provider);
  } else if (report.configured) {
    serverCircuitBreaker.recordFailure(options.provider, report.note, false);
  }

  if (options.db && options.userId) {
    try {
      await options.db.from('provider_credentials').upsert(
        {
          user_id: options.userId,
          provider: options.provider,
          last_health_status: report.status,
          last_latency_ms: report.latencyMs,
          last_checked_at: new Date().toISOString(),
          last_error: report.status === 'connected' ? null : report.note,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );
    } catch {
      /* non-fatal */
    }
  }
  return report;
}

export function extractConfigMap(configs: UserProviderConfigRow[]): ProviderConfigMap {
  return {
    gemini: Boolean(configs.find((c) => c.provider === 'gemini' && c.enabled && (c.hasUserKey || c.hasServerEnvKey))),
    openai: Boolean(configs.find((c) => c.provider === 'openai' && c.enabled && (c.hasUserKey || c.hasServerEnvKey))),
    anthropic: Boolean(configs.find((c) => c.provider === 'anthropic' && c.enabled && (c.hasUserKey || c.hasServerEnvKey))),
    openrouter: Boolean(configs.find((c) => c.provider === 'openrouter' && c.enabled && (c.hasUserKey || c.hasServerEnvKey))),
    huggingface: Boolean(configs.find((c) => c.provider === 'huggingface' && c.enabled && (c.hasUserKey || c.hasServerEnvKey))),
    ollama: Boolean(configs.find((c) => c.provider === 'ollama' && c.enabled && (c.hasServerEnvKey || c.base_url))),
  };
}
