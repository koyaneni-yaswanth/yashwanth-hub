/**
 * Outbound Notification & Automation Channels (Telegram, Discord, n8n/Zapier/Make Webhooks).
 *
 * Security guarantees:
 * - Strictly zero fabricated deliveries: missing credentials report `not_configured`.
 * - Webhook / custom URL targets require `https://` and reject localhost, loopback,
 *   private RFC1918/CGNAT/link-local IPs, and cloud metadata endpoints (SSRF guard).
 * - Outbound webhooks are signed with HMAC-SHA256 (`X-Hub-Signature-256: t=...,v1=...`)
 *   when `WEBHOOK_SIGNING_SECRET` is configured, with a 5-minute replay-window verifier.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  ChannelStatusItem,
  ChannelStatusReport,
  NotificationChannelId,
  NotificationDispatchResult,
  OutboundNotificationPayload,
} from './channelTypes.ts';

export type {
  ChannelStatusItem,
  ChannelStatusReport,
  NotificationChannelId,
  NotificationDispatchResult,
  OutboundNotificationPayload,
};

const DEFAULT_TIMEOUT_MS = 6000;

function isPrivateOrDisallowedHost(hostname: string): string | null {
  const host = hostname.trim().toLowerCase();
  if (!host) return 'Hostname is empty.';

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return 'Loopback and internal hostnames are blocked.';
  }

  // IPv6 literals inside URL hostname are wrapped in brackets `[...]`
  if (host.startsWith('[') && host.endsWith(']')) {
    const inner = host.slice(1, -1);
    if (
      inner === '::1' ||
      inner === '::' ||
      inner.startsWith('fe80:') ||
      inner.startsWith('fc') ||
      inner.startsWith('fd')
    ) {
      return 'Private or loopback IPv6 destinations are blocked.';
    }
    return null;
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => Number(n));
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) {
      return 'Invalid IPv4 address.';
    }
    const [a, b] = octets;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    ) {
      return 'Private, link-local, or loopback IPv4 ranges are blocked.';
    }
  }

  return null;
}

export function validatePublicHttpsUrl(
  rawUrl: string,
): { valid: true; url: string } | { valid: false; reason: string } {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return { valid: false, reason: 'URL is empty.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: 'URL is malformed.' };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only HTTPS URLs are permitted for outbound webhooks.' };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'Embedded credentials in webhook URLs are not permitted.' };
  }

  const hostError = isPrivateOrDisallowedHost(parsed.hostname);
  if (hostError) {
    return { valid: false, reason: hostError };
  }

  return { valid: true, url: parsed.toString() };
}

export function signWebhookPayload(
  secret: string,
  timestampSec: number | string,
  rawBody: string,
): string {
  const ts = String(timestampSec).trim();
  const digest = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  return `t=${ts},v1=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string,
  rawBody: string,
  options?: { nowSec?: number; toleranceSec?: number },
): { valid: boolean; reason?: string } {
  const trimmedSecret = String(secret || '').trim();
  if (!trimmedSecret) {
    return { valid: false, reason: 'Signing secret is empty.' };
  }

  const header = String(signatureHeader || '').trim();
  if (!header) {
    return { valid: false, reason: 'Missing signature header.' };
  }

  const parts = new Map<string, string>();
  for (const segment of header.split(',')) {
    const eqIndex = segment.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = segment.slice(0, eqIndex).trim();
    const val = segment.slice(eqIndex + 1).trim();
    if (key && val) parts.set(key, val);
  }

  const tsRaw = parts.get('t');
  const sigHex = parts.get('v1');
  if (!tsRaw || !sigHex) {
    return { valid: false, reason: 'Signature header must include t and v1 fields.' };
  }

  const tsNum = Number(tsRaw);
  if (!Number.isFinite(tsNum) || tsNum <= 0) {
    return { valid: false, reason: 'Invalid webhook timestamp.' };
  }

  const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);
  const toleranceSec = options?.toleranceSec ?? 300;
  if (Math.abs(nowSec - tsNum) > toleranceSec) {
    return { valid: false, reason: 'Webhook timestamp outside replay tolerance window.' };
  }

  const expectedHex = createHmac('sha256', trimmedSecret)
    .update(`${tsRaw}.${rawBody}`)
    .digest('hex');

  const actualBuf = Buffer.from(sigHex, 'utf8');
  const expectedBuf = Buffer.from(expectedHex, 'utf8');
  if (actualBuf.length !== expectedBuf.length) {
    return { valid: false, reason: 'Signature mismatch.' };
  }

  if (!timingSafeEqual(actualBuf, expectedBuf)) {
    return { valid: false, reason: 'Signature mismatch.' };
  }

  return { valid: true };
}

export function getNotificationChannelsStatus(
  env: Record<string, string | undefined> = process.env,
): ChannelStatusReport {
  const telegramReady = Boolean(env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_CHAT_ID?.trim());
  const discordCheck = env.DISCORD_WEBHOOK_URL?.trim()
    ? validatePublicHttpsUrl(env.DISCORD_WEBHOOK_URL)
    : { valid: false as const, reason: 'Not set' };
  const webhookCheck = env.N8N_WEBHOOK_URL?.trim()
    ? validatePublicHttpsUrl(env.N8N_WEBHOOK_URL)
    : { valid: false as const, reason: 'Not set' };

  return {
    channels: [
      {
        id: 'telegram',
        label: 'Telegram Bot',
        configured: telegramReady,
        status: telegramReady ? 'connected' : 'not_configured',
        detail: telegramReady
          ? 'Server bot token & chat ID are configured.'
          : 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel env to enable.',
        envHints: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'],
      },
      {
        id: 'discord',
        label: 'Discord Webhook',
        configured: discordCheck.valid,
        status: discordCheck.valid ? 'connected' : 'not_configured',
        detail: discordCheck.valid
          ? 'HTTPS Discord webhook endpoint configured.'
          : env.DISCORD_WEBHOOK_URL?.trim()
            ? `Blocked invalid URL: ${discordCheck.reason}`
            : 'Set DISCORD_WEBHOOK_URL in Vercel env to enable.',
        envHints: ['DISCORD_WEBHOOK_URL'],
      },
      {
        id: 'webhook',
        label: 'n8n / Make / Custom Webhook',
        configured: webhookCheck.valid,
        status: webhookCheck.valid ? 'connected' : 'not_configured',
        detail: webhookCheck.valid
          ? 'Default HTTPS automation webhook configured (or pass custom HTTPS URL per call).'
          : env.N8N_WEBHOOK_URL?.trim()
            ? `Blocked invalid URL: ${webhookCheck.reason}`
            : 'Set N8N_WEBHOOK_URL or supply an HTTPS webhook URL in Notifications.',
        envHints: ['N8N_WEBHOOK_URL', 'WEBHOOK_SIGNING_SECRET'],
      },
    ],
    webhookSigningConfigured: Boolean(env.WEBHOOK_SIGNING_SECRET?.trim()),
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchNotificationToChannels(
  payload: OutboundNotificationPayload,
  options?: {
    env?: Record<string, string | undefined>;
    fetchImpl?: typeof fetch;
    nowSec?: number;
    timeoutMs?: number;
  },
): Promise<NotificationDispatchResult[]> {
  const env = options?.env ?? process.env;
  const fetchImpl = options?.fetchImpl ?? fetch;
  const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const title = String(payload.title || 'Yashwanth Hub Notification').trim().slice(0, 180);
  const message = String(payload.message || '').trim().slice(0, 3500);
  const severity = payload.severity || 'info';
  const severityPrefix =
    severity === 'urgent' ? '[URGENT] ' : severity === 'warning' ? '[ATTENTION] ' : '';

  const targetChannels: NotificationChannelId[] =
    payload.channel === 'all' ? ['telegram', 'discord', 'webhook'] : [payload.channel];

  const results: NotificationDispatchResult[] = [];

  for (const ch of targetChannels) {
    if (ch === 'telegram') {
      const token = env.TELEGRAM_BOT_TOKEN?.trim();
      const chatId = env.TELEGRAM_CHAT_ID?.trim();
      if (!token || !chatId) {
        results.push({
          channel: 'telegram',
          ok: false,
          status: 'not_configured',
          error: 'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not configured on the server.',
        });
        continue;
      }
      try {
        const res = await fetchWithTimeout(
          `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `${severityPrefix}${title}\n\n${message}`,
              disable_web_page_preview: true,
            }),
          },
          fetchImpl,
          timeoutMs,
        );
        results.push({
          channel: 'telegram',
          ok: res.ok,
          status: res.ok ? 'sent' : 'failed',
          httpStatus: res.status,
          error: res.ok ? undefined : `Telegram Bot API returned HTTP ${res.status}.`,
        });
      } catch (err) {
        results.push({
          channel: 'telegram',
          ok: false,
          status: 'failed',
          error: err instanceof Error ? err.name : 'Telegram delivery timed out or failed.',
        });
      }
      continue;
    }

    if (ch === 'discord') {
      const rawDiscord = env.DISCORD_WEBHOOK_URL?.trim() || '';
      if (!rawDiscord) {
        results.push({
          channel: 'discord',
          ok: false,
          status: 'not_configured',
          error: 'DISCORD_WEBHOOK_URL is not configured on the server.',
        });
        continue;
      }
      const urlCheck = validatePublicHttpsUrl(rawDiscord);
      if (!urlCheck.valid) {
        results.push({
          channel: 'discord',
          ok: false,
          status: 'blocked',
          error: urlCheck.reason,
        });
        continue;
      }
      const embedColor =
        severity === 'urgent' ? 0xef4444 : severity === 'warning' ? 0xf59e0b : 0x06b6d4;
      try {
        const res = await fetchWithTimeout(
          urlCheck.url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: `${severityPrefix}**${title}**`,
              embeds: [
                {
                  title,
                  description: message,
                  color: embedColor,
                },
              ],
            }),
          },
          fetchImpl,
          timeoutMs,
        );
        results.push({
          channel: 'discord',
          ok: res.ok,
          status: res.ok ? 'sent' : 'failed',
          httpStatus: res.status,
          error: res.ok ? undefined : `Discord webhook returned HTTP ${res.status}.`,
        });
      } catch (err) {
        results.push({
          channel: 'discord',
          ok: false,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Discord delivery failed.',
        });
      }
      continue;
    }

    // Generic n8n / Zapier / Make / custom HTTPS webhook
    const rawWebhook = payload.webhookUrl?.trim() || env.N8N_WEBHOOK_URL?.trim() || '';
    if (!rawWebhook) {
      results.push({
        channel: 'webhook',
        ok: false,
        status: 'not_configured',
        error: 'N8N_WEBHOOK_URL is not set and no webhookUrl was provided.',
      });
      continue;
    }
    const webhookCheck = validatePublicHttpsUrl(rawWebhook);
    if (!webhookCheck.valid) {
      results.push({
        channel: 'webhook',
        ok: false,
        status: 'blocked',
        error: webhookCheck.reason,
      });
      continue;
    }

    const isoTimestamp = new Date(nowSec * 1000).toISOString();
    const rawBody = JSON.stringify({
      event: 'yashwanth_hub.notification',
      title,
      message,
      severity,
      timestamp: isoTimestamp,
      metadata: payload.metadata ?? {},
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Hub-Timestamp': String(nowSec),
    };

    let signatureHeader: string | undefined;
    const signingSecret = env.WEBHOOK_SIGNING_SECRET?.trim();
    if (signingSecret) {
      signatureHeader = signWebhookPayload(signingSecret, nowSec, rawBody);
      headers['X-Hub-Signature-256'] = signatureHeader;
    }

    try {
      const res = await fetchWithTimeout(
        webhookCheck.url,
        {
          method: 'POST',
          headers,
          body: rawBody,
        },
        fetchImpl,
        timeoutMs,
      );
      results.push({
        channel: 'webhook',
        ok: res.ok,
        status: res.ok ? 'sent' : 'failed',
        httpStatus: res.status,
        signatureHeader,
        timestamp: isoTimestamp,
        error: res.ok ? undefined : `Webhook returned HTTP ${res.status}.`,
      });
    } catch (err) {
      results.push({
        channel: 'webhook',
        ok: false,
        status: 'failed',
        signatureHeader,
        timestamp: isoTimestamp,
        error: err instanceof Error ? err.message : 'Webhook delivery failed.',
      });
    }
  }

  return results;
}
