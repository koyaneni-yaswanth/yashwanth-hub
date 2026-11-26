import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Video,
  Sparkles,
  Trash2,
  Check,
  Moon,
  ExternalLink,
  ShieldAlert,
  SlidersHorizontal,
  Radio,
  Send,
  RefreshCw,
} from 'lucide-react';
import { db } from '../db';
import type { NotificationType, NavigationTab } from '../types';
import { formatShortDate } from '../lib/utils';
import { getSupabaseClient } from '../lib/supabase';
import { ReminderEngine } from '../services/reminderEngine';
import { guardActionExecution } from '../services/selfHealingService';
import type { ChannelStatusItem, NotificationChannelId, NotificationDispatchResult } from '../../api/_lib/channelTypes';
import { Badge } from '../components/common/Badge';

import { CapacitorService } from '../services/native/capacitorService';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { TAB_TITLES, isNavigationTab } from '../lib/navigation';
import type { NotificationPrefs } from '../services/notificationRules';

const ALERT_TYPES: { id: NotificationType; label: string }[] = [
  { id: 'meeting', label: 'Meetings' },
  { id: 'deadline', label: 'Deadlines' },
  { id: 'ai', label: 'AI suggestions' },
  { id: 'system', label: 'System' },
];

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

interface NotificationsPageProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onNavigate }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => ReminderEngine.getPrefs());
  const [prefsSaved, setPrefsSaved] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [channels, setChannels] = useState<ChannelStatusItem[]>([]);
  const [webhookSigningConfigured, setWebhookSigningConfigured] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<NotificationChannelId | 'all'>('webhook');
  const [customWebhookUrl, setCustomWebhookUrl] = useState(() =>
    typeof localStorage !== 'undefined' ? localStorage.getItem('yash_custom_n8n_webhook') || '' : ''
  );
  const [testTitle, setTestTitle] = useState('Yashwanth Hub Alert Check');
  const [testMessage, setTestMessage] = useState('Milestone 3 outbound notification test from Notifications.');
  const [dispatchingTest, setDispatchingTest] = useState(false);
  const [dispatchResults, setDispatchResults] = useState<NotificationDispatchResult[] | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  const loadChannelStatus = async () => {
    setLoadingChannels(true);
    try {
      const resp = await fetch('/api/automations/dispatch?action=channel_status');
      if (resp.ok && (resp.headers.get('content-type') || '').includes('application/json')) {
        const body = await resp.json();
        setChannels(Array.isArray(body?.channels) ? body.channels : []);
        setWebhookSigningConfigured(Boolean(body?.webhookSigningConfigured));
      }
    } catch {
      // Static preview fallback cleanly leaves channel cards unloaded
    } finally {
      setLoadingChannels(false);
    }
  };

  const handleDispatchChannelTest = async () => {
    setDispatchingTest(true);
    setDispatchError(null);
    setDispatchResults(null);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('yash_custom_n8n_webhook', customWebhookUrl.trim());
      }
      await guardActionExecution({
        actionType: `notify_${selectedChannel}`,
        summary: `User-confirmed Level 2 dispatch to ${selectedChannel}: ${testTitle}`,
        approvedByHuman: true,
        channel: selectedChannel,
      });

      const supa = getSupabaseClient();
      const token = supa ? (await supa.auth.getSession()).data?.session?.access_token : undefined;
      if (!token) {
        setDispatchError('Sign in to Supabase Cloud Sync first so the server can authenticate your outbound dispatch.');
        return;
      }

      const resp = await fetch('/api/automations/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'notify',
          channel: selectedChannel,
          title: testTitle,
          message: testMessage,
          webhookUrl: customWebhookUrl.trim() || undefined,
          severity: 'info',
        }),
      });
      const body = await resp.json();
      if (Array.isArray(body?.results)) {
        setDispatchResults(body.results);
      } else {
        setDispatchError(body?.error || body?.message || 'Dispatch failed.');
      }
    } catch (err: any) {
      setDispatchError(err?.message || 'Failed to reach /api/automations/dispatch.');
    } finally {
      setDispatchingTest(false);
    }
  };

  const updatePrefs = (next: NotificationPrefs) => {
    setPrefs(next);
    ReminderEngine.savePrefs(next);
    setPrefsSaved(true);
    window.setTimeout(() => setPrefsSaved(false), 2000);
  };

  React.useEffect(() => {
    CapacitorService.checkNotificationPermissions().then((granted) => {
      setPermissionGranted(granted);
    });
    void loadChannelStatus();
  }, []);

  // Live Query
  const allNotifications = useLiveQuery(() => db.notifications.toArray(), []) || [];

  const filteredNotifs = allNotifications
    .filter((n) => {
      if (filterType === 'unread') return !n.read;
      if (filterType !== 'all') return n.type === filterType;
      return true;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const unreadCount = allNotifications.filter((n) => !n.read).length;

  const handleMarkAsRead = async (id: string) => {
    await db.notifications.update(id, { read: true });
  };

  const handleMarkAllRead = async () => {
    const unreadIds = allNotifications.filter((n) => !n.read).map((n) => n.id);
    await db.transaction('rw', db.notifications, async () => {
      for (const id of unreadIds) await db.notifications.update(id, { read: true });
    });
  };

  const handleDeleteNotif = async (id: string) => {
    await db.notifications.delete(id);
  };

  const handleClearAll = async () => {
    await db.notifications.clear();
  };

  const handleRequestPermission = async () => {
    const ok = await ReminderEngine.requestBrowserPermission();
    setPermissionGranted(ok);
    if (ok) {
      ReminderEngine.deliverNotification(
        'Jarvis Alerts Enabled',
        'Desktop and browser notifications are now active.',
        'system',
        'low'
      );
    }
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'meeting':
        return <Video className="w-4 h-4 text-blue-700 dark:text-blue-300" />;
      case 'deadline':
        return <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-300" />;
      case 'ai':
        return <Sparkles className="w-4 h-4 text-teal-700 dark:text-teal-300" />;
      default:
        return <Bell className="w-4 h-4 text-amber-800 dark:text-amber-300" />;
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-800 dark:text-amber-300" />
            <span>Intelligent Reminders & Notifications</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Proactive alerts for upcoming meetings, overdue deliverables, and system events
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}

          {allNotifications.length > 0 && (
            <button
              onClick={() => setConfirmClearAll(true)}
              className="p-2 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
              title="Clear all notifications"
              aria-label="Clear all notifications"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Browser Notification Permission Banner */}
      {!permissionGranted && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <ShieldAlert className="w-4 h-4 flex-none" />
            <span>
              <strong>Desktop Alerts Inactive:</strong> Enable browser notifications so Yashwanth Hub can alert you before meetings and critical deadlines.
            </span>
          </div>
          <button
            onClick={handleRequestPermission}
            className="px-3.5 py-1.5 rounded-lg bg-amber-700 text-white font-semibold self-start sm:self-auto cursor-pointer hover:bg-amber-800 transition-colors"
          >
            Enable Browser Push
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div role="group" aria-label="Filter notifications" className="flex flex-wrap items-center gap-2 bg-[var(--hub-surface)] border border-[var(--hub-line)] p-2 rounded-xl shadow-xs">
        {[
          { id: 'all', label: `All (${allNotifications.length})` },
          { id: 'unread', label: `Unread (${unreadCount})` },
          { id: 'meeting', label: 'Meetings' },
          { id: 'deadline', label: 'Deadlines' },
          { id: 'ai', label: 'AI Directives' },
          { id: 'system', label: 'System' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={filterType === tab.id}
            onClick={() => setFilterType(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filterType === tab.id
                ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notification Cards List */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl divide-y divide-[var(--hub-line)] overflow-hidden shadow-xs">
        {filteredNotifs.length === 0 ? (
          <div className="p-12 text-center text-xs text-[var(--hub-muted)]">
            <CheckCircle2 className="w-8 h-8 mx-auto text-teal-700 dark:text-teal-300 mb-2 opacity-60" />
            <p className="font-semibold text-sm text-[var(--hub-ink)]">
              {allNotifications.length === 0 ? 'Nothing here yet' : 'All clear'}
            </p>
            <p className="mt-1 max-w-sm mx-auto">
              {allNotifications.length === 0
                ? 'Reminders for meetings, deadlines and AI suggestions will appear here.'
                : filterType === 'unread'
                  ? 'You have read everything. Nice.'
                  : 'No notifications of this type right now.'}
            </p>
            {filterType !== 'all' && allNotifications.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className="mt-3 text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
              >
                Show all notifications
              </button>
            )}
          </div>
        ) : (
          filteredNotifs.map((notif) => (
            <div
              key={notif.id}
              className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                notif.read ? 'hover:bg-[var(--hub-bg)]/40' : 'bg-teal-500/5 hover:bg-teal-500/10'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex-none mt-0.5">
                  {getTypeIcon(notif.type)}
                </div>

                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-[var(--hub-ink)]">
                      {notif.title}
                    </h4>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-teal-500 flex-none" />
                    )}
                    {notif.priority === 'urgent' && <Badge variant="red">Urgent</Badge>}
                    {notif.priority === 'high' && <Badge variant="amber">High</Badge>}
                  </div>

                  <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                    {notif.message}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-[var(--hub-muted)] pt-1">
                    <span>{formatShortDate(notif.created_at.slice(0, 10))}</span>
                    {notif.action_link && (
                      <button
                        onClick={() => {
                          if (notif.action_link?.startsWith('http')) {
                            window.open(notif.action_link, '_blank');
                          } else {
                            onNavigate(notif.action_link as NavigationTab);
                          }
                          handleMarkAsRead(notif.id);
                        }}
                        className="text-teal-700 dark:text-teal-300 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>
                          {notif.action_link && isNavigationTab(notif.action_link)
                            ? `Open ${TAB_TITLES[notif.action_link]}`
                            : 'Open link'}
                        </span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-none">
                {!notif.read && (
                  <button
                    onClick={() => handleMarkAsRead(notif.id)}
                    className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-teal-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                    title="Mark as read"
                    aria-label={`Mark as read: ${notif.title}`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteNotif(notif.id)}
                  className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                  title="Dismiss notification"
                  aria-label={`Dismiss: ${notif.title}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Notification preferences */}
      <section
        aria-labelledby="notif-prefs-heading"
        className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 sm:p-5 shadow-xs space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <h3 id="notif-prefs-heading" className="text-sm font-bold text-[var(--hub-ink)] flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[var(--hub-accent)]" />
            Preferences
          </h3>
          <span role="status" aria-live="polite" className="text-xs font-medium text-[var(--hub-accent)]">
            {prefsSaved ? 'Saved' : ''}
          </span>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-[var(--hub-muted)] flex items-center gap-1.5 mb-2">
            <Moon className="w-3.5 h-3.5" />
            Quiet hours
          </legend>
          <label className="flex items-center gap-2 text-sm text-[var(--hub-ink)] cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.quietHoursEnabled}
              onChange={(e) => updatePrefs({ ...prefs, quietHoursEnabled: e.target.checked })}
              className="w-4 h-4 accent-[var(--hub-accent)]"
            />
            Mute pop-up alerts during quiet hours
          </label>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--hub-ink)]">
            <label htmlFor="quiet-start" className="text-[var(--hub-muted)]">
              From
            </label>
            <select
              id="quiet-start"
              value={prefs.quietStart}
              disabled={!prefs.quietHoursEnabled}
              onChange={(e) => updatePrefs({ ...prefs, quietStart: Number(e.target.value) })}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-sm disabled:opacity-50"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
            <label htmlFor="quiet-end" className="text-[var(--hub-muted)]">
              to
            </label>
            <select
              id="quiet-end"
              value={prefs.quietEnd}
              disabled={!prefs.quietHoursEnabled}
              onChange={(e) => updatePrefs({ ...prefs, quietEnd: Number(e.target.value) })}
              className="px-2.5 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-sm disabled:opacity-50"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold text-[var(--hub-muted)] mb-2">
            Pop-up alerts for (everything still appears in this inbox)
          </legend>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {ALERT_TYPES.map((t) => {
              const enabled = !prefs.mutedAlertTypes.includes(t.id);
              return (
                <label key={t.id} className="flex items-center gap-2 text-sm text-[var(--hub-ink)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      updatePrefs({
                        ...prefs,
                        mutedAlertTypes: e.target.checked
                          ? prefs.mutedAlertTypes.filter((x) => x !== t.id)
                          : [...prefs.mutedAlertTypes, t.id],
                      })
                    }
                    className="w-4 h-4 accent-[var(--hub-accent)]"
                  />
                  {t.label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="text-[11px] text-[var(--hub-muted)]">
          Repeated reminders are merged: an identical unread notification is not added again within 12 hours.
        </p>
      </section>

      {/* Outbound Channels (Telegram, Discord, n8n/Zapier/Make Webhook) */}
      <section aria-labelledby="outbound-channels-heading" className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="outbound-channels-heading" className="text-sm font-semibold text-[var(--hub-ink)] flex items-center gap-2">
              <Radio className="w-4 h-4 text-[var(--hub-accent)]" />
              Outbound Automation &amp; Alert Channels
            </h2>
            <p className="text-xs text-[var(--hub-muted)] mt-0.5">
              Optional Level-2 channels (Telegram, Discord, HTTPS n8n/Make/Zapier webhooks). Dispatches require confirmation and never report connected without verified env config.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={webhookSigningConfigured ? 'emerald' : 'gray'}>
              {webhookSigningConfigured ? 'HMAC-SHA256 Signing On' : 'HMAC Secret Optional'}
            </Badge>
            <button
              type="button"
              onClick={loadChannelStatus}
              disabled={loadingChannels}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingChannels ? 'animate-spin' : ''}`} />
              <span>Check Env</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {channels.length === 0 ? (
            <div className="md:col-span-3 text-xs text-[var(--hub-muted)]">
              Click Check Env when hosted on Vercel to inspect configured server alert secrets.
            </div>
          ) : (
            channels.map((ch) => (
              <div key={ch.id} className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--hub-ink)]">{ch.label}</span>
                  <Badge variant={ch.configured ? 'emerald' : 'amber'}>
                    {ch.configured ? 'Configured' : 'Not Configured'}
                  </Badge>
                </div>
                <p className="text-[11px] text-[var(--hub-muted)]">{ch.detail}</p>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] p-4 space-y-3">
          <div className="text-xs font-semibold text-[var(--hub-ink)]">
            Send Confirmed Level-2 Test Alert
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <select
              aria-label="Target notification channel"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value as NotificationChannelId | 'all')}
              className="px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs text-[var(--hub-ink)]"
            >
              <option value="webhook">n8n / HTTPS Webhook</option>
              <option value="telegram">Telegram Bot</option>
              <option value="discord">Discord Webhook</option>
              <option value="all">All Configured Channels</option>
            </select>
            <input
              type="text"
              value={testTitle}
              onChange={(e) => setTestTitle(e.target.value)}
              placeholder="Alert title"
              className="px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs text-[var(--hub-ink)]"
            />
            <input
              type="url"
              value={customWebhookUrl}
              onChange={(e) => setCustomWebhookUrl(e.target.value)}
              placeholder="Optional public https:// webhook URL"
              className="px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs text-[var(--hub-ink)]"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Alert body message"
              className="flex-1 px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs text-[var(--hub-ink)]"
            />
            <button
              type="button"
              onClick={handleDispatchChannelTest}
              disabled={dispatchingTest || !testTitle.trim() || !testMessage.trim()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{dispatchingTest ? 'Dispatching...' : 'Confirm & Send Test'}</span>
            </button>
          </div>

          {dispatchError && (
            <div className="text-xs text-amber-500">{dispatchError}</div>
          )}

          {dispatchResults && (
            <div className="space-y-1.5 pt-1">
              {dispatchResults.map((res) => (
                <div key={res.channel} className="flex items-center justify-between gap-2 text-xs px-3 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)]">
                  <span className="font-mono uppercase text-[var(--hub-ink)]">{res.channel}</span>
                  <span className="text-[var(--hub-muted)] truncate flex-1">{res.error || `HTTP ${res.httpStatus ?? 200}`}</span>
                  <Badge variant={res.ok ? 'emerald' : res.status === 'blocked' ? 'red' : 'amber'}>
                    {res.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        isOpen={confirmClearAll}
        onClose={() => setConfirmClearAll(false)}
        onConfirm={() => {
          handleClearAll();
          setConfirmClearAll(false);
        }}
        title="Clear all notifications?"
        message="Every notification in this inbox will be permanently removed."
        confirmLabel="Clear all"
      />
    </div>
  );
};
