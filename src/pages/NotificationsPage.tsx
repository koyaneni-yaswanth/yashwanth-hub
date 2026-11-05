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
} from 'lucide-react';
import { db } from '../db';
import type { NotificationType, NavigationTab } from '../types';
import { formatShortDate } from '../lib/utils';
import { ReminderEngine } from '../services/reminderEngine';
import { Badge } from '../components/common/Badge';

import { CapacitorService } from '../services/native/capacitorService';

interface NotificationsPageProps {
  onNavigate: (tab: NavigationTab) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ onNavigate }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [permissionGranted, setPermissionGranted] = useState(false);

  React.useEffect(() => {
    CapacitorService.checkNotificationPermissions().then((granted) => {
      setPermissionGranted(granted);
    });
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
    for (const id of unreadIds) {
      await db.notifications.update(id, { read: true });
    }
  };

  const handleDeleteNotif = async (id: string) => {
    await db.notifications.delete(id);
  };

  const handleClearAll = async () => {
    if (confirm('Clear all notifications?')) {
      await db.notifications.clear();
    }
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
        return <Video className="w-4 h-4 text-blue-500" />;
      case 'deadline':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'ai':
        return <Sparkles className="w-4 h-4 text-teal-600" />;
      default:
        return <Bell className="w-4 h-4 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-amber-500" />
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
              onClick={handleClearAll}
              className="p-2 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
              title="Clear all notifications"
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
            className="px-3.5 py-1.5 rounded-lg bg-amber-600 text-white font-semibold self-start sm:self-auto cursor-pointer hover:bg-amber-700 transition-colors"
          >
            Enable Browser Push
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-[var(--hub-surface)] border border-[var(--hub-line)] p-2 rounded-xl shadow-xs">
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
            onClick={() => setFilterType(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              filterType === tab.id
                ? 'bg-[var(--hub-accent)] text-white'
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
            <CheckCircle2 className="w-8 h-8 mx-auto text-teal-600 mb-2 opacity-60" />
            <p className="font-semibold text-sm text-[var(--hub-ink)]">All clear!</p>
            <p className="mt-1">No unread notifications or alerts requiring your attention.</p>
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
                        <span>Open action</span>
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
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDeleteNotif(notif.id)}
                  className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                  title="Delete notification"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quiet Hours Settings Info */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 flex items-center justify-between text-xs text-[var(--hub-muted)] shadow-xs">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-purple-500" />
          <span>
            <strong>Quiet Hours:</strong> 22:00 to 07:00 (Sound & push notifications are automatically muted during these hours).
          </span>
        </div>
      </div>
    </div>
  );
};
