import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Cloud,
  CheckCircle2,
  RefreshCw,
  Laptop,
  Smartphone,
  Tablet,
  Monitor,
  WifiOff,
  AlertTriangle,
  LogOut,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { Modal } from './Modal';
import { db } from '../../db';
import { useSync } from '../../context/SyncContext';
import { SupabaseAuthService, type AuthState } from '../../services/auth/supabaseAuthService';
import { IntegrationVaultService } from '../../services/integrationVaultService';
import { SyncQueueService } from '../../services/sync/syncQueueService';
import { toast } from '../../lib/toast';

interface SyncAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenIntegrations: () => void;
}

export const SyncAccountModal: React.FC<SyncAccountModalProps> = ({
  isOpen,
  onClose,
  onOpenIntegrations,
}) => {
  const { status, signedIn, userEmail, cloudConfigured, queueCount, failedCount, lastSyncTime, statusMessage, syncNow } =
    useSync();
  const [authState, setAuthState] = React.useState<AuthState>(() => SupabaseAuthService.getState());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [busy, setBusy] = useState(false);
  const [authFeedback, setAuthFeedback] = useState<string | null>(null);

  const devices = useLiveQuery(() => db.device_sessions.toArray(), []) || [];
  const queueItems = useLiveQuery(() => db.sync_queue.toArray(), []) || [];

  React.useEffect(() => SupabaseAuthService.subscribe(setAuthState), []);

  const isAuthed = Boolean(signedIn || authState.user);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setAuthFeedback(null);
    const res = await SupabaseAuthService.signInWithGoogleOAuth();
    if (res.error) setAuthFeedback(res.error);
    else if (res.url) window.location.href = res.url;
    setBusy(false);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setAuthFeedback(null);
    if (mode === 'signup') {
      const res = await SupabaseAuthService.signUpWithEmail(email, password);
      setAuthFeedback(res.error || res.message || 'Check your email to verify.');
    } else {
      const res = await SupabaseAuthService.signInWithEmail(email, password);
      if (res.error) {
        setAuthFeedback(res.error);
      } else {
        await IntegrationVaultService.initSessionRestoration(true).catch(() => {});
        await syncNow();
        toast('Signed in — cross-device cloud sync active', 'success');
        onClose();
      }
    }
    setBusy(false);
  };

  const handleSignOut = async () => {
    setBusy(true);
    await SupabaseAuthService.signOut();
    IntegrationVaultService.reset();
    setAuthFeedback('Signed out. Local IndexedDB changes remain safe on this device.');
    setBusy(false);
  };

  const deviceIcon = (type: string) => {
    if (type === 'mobile') return <Smartphone className="w-4 h-4 text-[var(--hub-accent)]" />;
    if (type === 'tablet') return <Tablet className="w-4 h-4 text-[var(--hub-accent)]" />;
    if (type === 'desktop') return <Monitor className="w-4 h-4 text-[var(--hub-accent)]" />;
    return <Laptop className="w-4 h-4 text-[var(--hub-accent)]" />;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cross-Device Sync & Account" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Live Sync Status Summary */}
        <div className="p-3.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {status === 'offline' ? (
              <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
            ) : status === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Cloud className="w-4 h-4 text-emerald-500 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="text-xs font-bold text-[var(--hub-ink)] truncate">
                {isAuthed ? userEmail || authState.user?.email || 'Cloud Account Connected' : 'Local-First Mode'}
              </div>
              <div className="text-[11px] text-[var(--hub-muted)] truncate">
                {statusMessage}
                {lastSyncTime ? ` · Last synced ${lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void syncNow()}
            disabled={status === 'syncing' || !isAuthed}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] disabled:opacity-45 cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${status === 'syncing' ? 'animate-spin' : ''}`} />
            <span>{queueCount > 0 ? `Sync (${queueCount})` : 'Sync Now'}</span>
          </button>
        </div>

        {/* Auth Controls when Signed Out */}
        {cloudConfigured && !isAuthed && (
          <div className="p-4 rounded-xl border border-[var(--hub-accent)]/35 bg-[var(--hub-surface-subtle)] space-y-3">
            <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
              Sign in with the same account on your phone, tablet, and laptop to synchronize Goals, Tasks, Notes, AI Chats, V3F Readiness, and Neo 1 Memories in real time.
            </p>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-bold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
            >
              Continue with Google (Instant Cross-Device Sync)
            </button>

            <form onSubmit={handleEmailAuth} className="space-y-2 pt-1 border-t border-[var(--hub-line)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password (min 6 chars)"
                  className="px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
                  className="text-[11px] font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
                >
                  {mode === 'signin' ? 'New device or account? Create account' : 'Already registered? Sign in'}
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                >
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        )}

        {authFeedback && (
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
            {authFeedback}
          </div>
        )}

        {/* Active Devices Fleet */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[var(--hub-muted)]">
            <span>Synced Device Fleet ({devices.filter((d) => d.status !== 'revoked').length})</span>
            {failedCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await db.sync_queue.filter((q) => (q.attempts || 0) > 0).modify({ attempts: 0, last_error: undefined });
                  await SyncQueueService.flushQueue();
                }}
                className="text-amber-400 hover:underline font-semibold normal-case cursor-pointer"
              >
                Retry {failedCount} failed write(s)
              </button>
            )}
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {devices
              .filter((d) => d.status !== 'revoked')
              .map((dev) => (
                <div
                  key={dev.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {deviceIcon(dev.deviceType)}
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--hub-ink)] truncate">
                        {dev.deviceName} {dev.isCurrent ? '(This Device)' : ''}
                      </div>
                      <div className="text-[10px] text-[var(--hub-muted)]">
                        {dev.browser} · {dev.status === 'online' ? 'Online' : 'Idle'}
                      </div>
                    </div>
                  </div>
                  <CheckCircle2
                    className={`w-3.5 h-3.5 shrink-0 ${
                      dev.status === 'online' ? 'text-emerald-500' : 'text-[var(--hub-muted)]'
                    }`}
                  />
                </div>
              ))}
          </div>
        </div>

        {/* Queued Pending Count */}
        {queueItems.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs">
            <span className="text-[var(--hub-muted)]">{queueItems.length} local write(s) queued for cloud</span>
            {queueItems.some((q) => (q.attempts || 0) > 0) && (
              <button
                type="button"
                onClick={async () => {
                  const stale = queueItems.filter((q) => (q.attempts || 0) >= 3).map((q) => q.id);
                  if (stale.length) await db.sync_queue.bulkDelete(stale);
                  toast('Cleared stalled retry entries', 'info');
                }}
                className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:underline cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Drop stalled</span>
              </button>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--hub-line)]">
          {isAuthed ? (
            <button
              type="button"
              onClick={handleSignOut}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/30 text-xs font-semibold text-red-400 hover:bg-red-500/10 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <span className="text-[11px] text-[var(--hub-muted)]">Encrypted RLS per user</span>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenIntegrations();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
          >
            <span>Google &amp; NeoSapien Settings</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Modal>
  );
};
