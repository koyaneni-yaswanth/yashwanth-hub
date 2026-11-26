export type NotificationChannelId = 'telegram' | 'discord' | 'webhook';

export interface ChannelStatusItem {
  id: NotificationChannelId;
  label: string;
  configured: boolean;
  status: 'connected' | 'not_configured';
  detail: string;
  envHints: string[];
}

export interface ChannelStatusReport {
  channels: ChannelStatusItem[];
  webhookSigningConfigured: boolean;
}

export interface OutboundNotificationPayload {
  channel: NotificationChannelId | 'all';
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'urgent';
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationDispatchResult {
  channel: NotificationChannelId;
  ok: boolean;
  status: 'sent' | 'not_configured' | 'failed' | 'blocked';
  httpStatus?: number;
  error?: string;
  signatureHeader?: string;
  timestamp?: string;
}
