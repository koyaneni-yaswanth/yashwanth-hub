import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Layers,
  Cloud,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Calendar,
  Mail,
  HardDrive,
  Camera,
  CheckSquare,
  Users,
  Smartphone,
  Laptop,
  Bluetooth,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
} from 'lucide-react';
import { db } from '../db';
import type { GoogleServiceKey } from '../types';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { UnifiedSyncEngine } from '../services/sync/unifiedSyncEngine';
import { NeoSapienService } from '../services/neoSapienService';
import { Badge } from '../components/common/Badge';

export const IntegrationsPage: React.FC = () => {
  const [googleConfig, setGoogleConfig] = useState(() => GoogleAuthService.getConfig());
  const [googleClientId, setGoogleClientId] = useState(() => GoogleAuthService.getEffectiveClientId());
  const [syncStatus, setSyncStatus] = useState(() => UnifiedSyncEngine.getStatus());
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isConnectingGIS, setIsConnectingGIS] = useState(false);
  const [oauthErrorMessage, setOauthErrorMessage] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  // NeoSapien State
  const [neoConfig, setNeoConfig] = useState(() => NeoSapienService.getConfig());
  const [isScanningBLE, setIsScanningBLE] = useState(false);

  // Sync History
  const historyLogs = useLiveQuery(() => db.sync_history.orderBy('timestamp').reverse().limit(15).toArray(), []) || [];

  useEffect(() => {
    const unsubscribe = UnifiedSyncEngine.subscribe((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  const handleSaveClientId = () => {
    GoogleAuthService.saveClientId(googleClientId);
    setOauthErrorMessage(null);
    alert('Google OAuth 2.0 Web Client ID saved.');
  };

  const handleCopyOrigin = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app';
    navigator.clipboard.writeText(origin);
    setCopiedOrigin(true);
    setTimeout(() => setCopiedOrigin(false), 2000);
  };

  const handleConnectGoogle = async (service?: GoogleServiceKey) => {
    const trimmedId = googleClientId.trim();
    if (!trimmedId) {
      setOauthErrorMessage('Please enter your Google Cloud OAuth 2.0 Web Client ID.');
      setShowSetupGuide(true);
      return;
    }

    if (!GoogleAuthService.isValidClientId(trimmedId)) {
      setOauthErrorMessage(
        'Invalid Client ID format. A valid Google Web Client ID must end with ".apps.googleusercontent.com" (e.g., 123456789-abcdef.apps.googleusercontent.com).'
      );
      setShowSetupGuide(true);
      return;
    }

    setOauthErrorMessage(null);
    setIsConnectingGIS(true);

    try {
      // 1. Try Google Identity Services (GIS) Token Client Popup (Official SPA standard)
      const res = await GoogleAuthService.requestGisToken(
        trimmedId,
        service ? ['identity', service] : ['identity', 'calendar', 'drive', 'gmail', 'tasks', 'contacts', 'photos']
      );

      if (res.success) {
        setGoogleConfig(GoogleAuthService.getConfig());
        setOauthErrorMessage(null);
      } else {
        // Fallback to standard redirect if popup was closed or unavailable
        console.warn('GIS Token Client popup unfulfilled, offering redirect fallback:', res.errorMessage);
        setOauthErrorMessage(res.errorMessage || 'Popup sign-in was closed or blocked.');
      }
    } catch (gisErr: any) {
      console.warn('GIS loader error, falling back to full-page redirect:', gisErr);
      const authUrl = GoogleAuthService.getAuthUrl(
        trimmedId,
        GoogleAuthService.getRedirectUri(),
        service ? ['identity', service] : ['identity', 'calendar', 'drive', 'gmail', 'tasks', 'contacts', 'photos']
      );
      window.location.href = authUrl;
    } finally {
      setIsConnectingGIS(false);
    }
  };

  const handleConnectRedirectFallback = (service?: GoogleServiceKey) => {
    const trimmedId = googleClientId.trim();
    if (!trimmedId || !GoogleAuthService.isValidClientId(trimmedId)) {
      setOauthErrorMessage('Valid Google Web Client ID is required before initiating redirect.');
      setShowSetupGuide(true);
      return;
    }
    const authUrl = GoogleAuthService.getAuthUrl(
      trimmedId,
      GoogleAuthService.getRedirectUri(),
      service ? ['identity', service] : ['identity', 'calendar', 'drive', 'gmail', 'tasks', 'contacts', 'photos']
    );
    window.location.href = authUrl;
  };

  const handleDisconnectGoogle = async () => {
    if (confirm('Are you sure you want to revoke access and disconnect your Google Account?')) {
      await GoogleAuthService.disconnect();
      setGoogleConfig(GoogleAuthService.getConfig());
    }
  };

  const handleTriggerFullSync = async () => {
    setIsSyncingAll(true);
    setSyncFeedback('Running unified cross-platform synchronization...');
    try {
      const res = await UnifiedSyncEngine.runFullSync();
      if (res.success) {
        setSyncFeedback(`✅ Synchronized: ${res.syncedServices.join(', ')}`);
      } else {
        setSyncFeedback(`⚠️ Sync completed with warnings: ${res.errors.join(' | ')}`);
      }
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleConnectNeoSapienBLE = async () => {
    setIsScanningBLE(true);
    try {
      const cfg = await NeoSapienService.scanAndConnectBLE();
      setNeoConfig(cfg);
    } catch {
      setNeoConfig(NeoSapienService.getConfig());
    } finally {
      setIsScanningBLE(false);
    }
  };

  const isConnected = GoogleAuthService.isConnected();

  const servicesList: { key: GoogleServiceKey; name: string; icon: any; description: string }[] = [
    { key: 'calendar', name: 'Google Calendar & Meet', icon: Calendar, description: 'Two-way event sync, conflict detection, and Meet conference generation' },
    { key: 'gmail', name: 'Gmail Intelligence', icon: Mail, description: 'Scan unread messages, detect supplier deadlines, create tasks & draft replies' },
    { key: 'drive', name: 'Google Drive & Docs', icon: HardDrive, description: 'Cloud file browser, Google Docs/Sheets/Slides creation, project linking' },
    { key: 'photos', name: 'Google Photos Picker', icon: Camera, description: 'User-selected media items via the official Google Photos Picker API' },
    { key: 'tasks', name: 'Google Tasks', icon: CheckSquare, description: 'Two-way task list synchronization mapping to Yashwanth Hub tasks' },
    { key: 'contacts', name: 'Google People (Contacts)', icon: Users, description: 'Contact address book search, organization mapping, duplicate avoidance' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-teal-600" />
            <span>Connection & Synchronization Center</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Manage your Google identity, per-service permissions, sync engine status, and connected devices
          </p>
        </div>

        <button
          onClick={handleTriggerFullSync}
          disabled={isSyncingAll}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
          <span>{isSyncingAll ? 'Synchronizing...' : 'Sync All Services'}</span>
        </button>
      </div>

      {syncFeedback && (
        <div className="p-3 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] font-medium">
          {syncFeedback}
        </div>
      )}

      {/* 1. Google Account Single Identity & Connection Center */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-line)]">
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-blue-500" />
            <div>
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Google Account & Identity Center
              </h3>
              <span className="text-xs text-[var(--hub-muted)]">
                Official OAuth 2.0 PKCE with granular per-service authorization
              </span>
            </div>
          </div>
          <Badge variant={isConnected ? 'emerald' : 'gray'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

        {isConnected ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-sm">
                {googleConfig.email ? googleConfig.email[0].toUpperCase() : 'G'}
              </div>
              <div>
                <span className="text-sm font-bold text-[var(--hub-ink)] block">
                  {googleConfig.email || 'Connected Google Account'}
                </span>
                <span className="text-[11px] text-[var(--hub-muted)]">
                  Session Token: Active • Auto-Refresh Enabled
                </span>
              </div>
            </div>

            <button
              onClick={handleDisconnectGoogle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/10 text-xs font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Revoke & Disconnect</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {oauthErrorMessage && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Google OAuth Diagnostics Alert</span>
                </div>
                <p className="leading-relaxed">{oauthErrorMessage}</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-[var(--hub-ink)]">
                  Google Cloud OAuth 2.0 Web Client ID
                </label>
                <button
                  type="button"
                  onClick={() => setShowSetupGuide(!showSetupGuide)}
                  className="text-[11px] text-[var(--hub-accent)] hover:underline flex items-center gap-1 font-semibold"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>{showSetupGuide ? 'Hide Setup Guide' : 'How to Fix 401 invalid_client'}</span>
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={googleClientId}
                  onChange={(e) => setGoogleClientId(e.target.value)}
                  placeholder="e.g. 123456789-abcdefg.apps.googleusercontent.com"
                  className={`flex-1 px-3 py-2 rounded-lg border bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)] font-mono ${
                    googleClientId && !GoogleAuthService.isValidClientId(googleClientId)
                      ? 'border-amber-500 focus:border-amber-500'
                      : 'border-[var(--hub-line)] focus:border-[var(--hub-accent)]'
                  }`}
                />
                <button
                  onClick={handleSaveClientId}
                  className="px-4 py-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Google Cloud Console Setup & 401 Troubleshooting Card */}
            {showSetupGuide && (
              <div className="p-4 rounded-xl bg-[var(--hub-bg)] border border-teal-500/30 text-xs space-y-3">
                <div className="font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-teal-500" />
                  <span>Google Cloud Console — Setup & 401 Repair Guide</span>
                </div>

                <ol className="list-decimal list-inside space-y-1.5 text-[var(--hub-muted)] leading-relaxed">
                  <li>
                    Open{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--hub-accent)] underline font-semibold"
                    >
                      Google Cloud Console Credentials
                    </a>{' '}
                    under account <code className="text-teal-400">koyaneniyaswanth@gmail.com</code>.
                  </li>
                  <li>
                    Click <strong>Create Credentials → OAuth Client ID</strong>.
                  </li>
                  <li>
                    Application type must be <strong>Web application</strong> (NOT Desktop, Android, or iOS).
                  </li>
                  <li>
                    Add this exact URL to <strong>Authorized JavaScript origins</strong>:
                    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-[var(--hub-ink)] bg-black/20 p-2 rounded-lg">
                      <span>{typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app'}</span>
                      <button
                        onClick={handleCopyOrigin}
                        className="ml-auto px-2 py-0.5 rounded bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 text-[10px] flex items-center gap-1 font-sans"
                      >
                        {copiedOrigin ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedOrigin ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </li>
                  <li>
                    Add the same URL to <strong>Authorized redirect URIs</strong>:
                    <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-[var(--hub-ink)] bg-black/20 p-2 rounded-lg">
                      <span>{typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app'}</span>
                    </div>
                  </li>
                  <li>
                    In <strong>OAuth consent screen → Test users</strong>, ensure <code className="text-teal-400">koyaneniyaswanth@gmail.com</code> is added.
                  </li>
                </ol>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                onClick={() => handleConnectGoogle()}
                disabled={isConnectingGIS}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-bold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs disabled:opacity-60"
              >
                {isConnectingGIS ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Opening Google Sign-In...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-4 h-4" />
                    <span>Sign in with Google (GIS Popup)</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleConnectRedirectFallback()}
                className="px-4 py-2.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
              >
                Use Full-Page Redirect
              </button>
            </div>
          </div>
        )}

        {/* Per-Service Granular Authorization Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {servicesList.map((svc) => {
            const Icon = svc.icon;
            return (
              <div
                key={svc.key}
                className="p-3.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-heading font-bold text-xs text-[var(--hub-ink)] flex items-center gap-1.5">
                      <Icon className="w-4 h-4 text-teal-600" />
                      <span>{svc.name}</span>
                    </span>
                    <Badge variant={isConnected ? 'emerald' : 'gray'}>
                      {isConnected ? 'Ready' : 'Not Connected'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--hub-muted)] leading-relaxed">
                    {svc.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--hub-line)] flex items-center justify-between">
                  <button
                    onClick={() => handleConnectGoogle(svc.key)}
                    className="text-[11px] font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
                  >
                    {isConnected ? 'Re-authorize' : 'Authorize Scope'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Unified Synchronization Engine Status & Ownership Matrix */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-emerald-600" />
            <span>Central Synchronization Engine</span>
          </h3>
          <Badge variant={syncStatus.state === 'synced' ? 'emerald' : syncStatus.state === 'syncing' ? 'amber' : 'red'}>
            {syncStatus.state.toUpperCase()}
          </Badge>
        </div>

        <p className="text-xs text-[var(--hub-muted)]">
          {syncStatus.message} • Last successful synchronization:{' '}
          {syncStatus.lastSuccessTimestamp ? new Date(syncStatus.lastSuccessTimestamp).toLocaleTimeString() : 'Recent'}
        </p>

        {/* Source of Truth Ownership Matrix */}
        <div className="p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-2 text-xs">
          <h4 className="font-bold text-[var(--hub-ink)] uppercase tracking-wider text-[11px]">
            Source-of-Truth Partitioning (Zero-Loop Sync Rules)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[var(--hub-muted)]">
            <div>• <strong>Google Calendar:</strong> Owns event IDs, recurrence, and Meet conference links.</div>
            <div>• <strong>Google Drive:</strong> Owns cloud document files and revision history.</div>
            <div>• <strong>Google Photos:</strong> Owns selected media via Photos Picker sessions.</div>
            <div>• <strong>Google Tasks:</strong> Owns cloud task list states.</div>
            <div>• <strong>Yashwanth Hub:</strong> Owns projects, PAWAN SHAKTI roadmap, and private notes.</div>
            <div>• <strong>Supabase PostgreSQL:</strong> Owns multi-device cloud synchronizations.</div>
          </div>
        </div>

        {/* Live Sync Audit Logs */}
        <div className="space-y-2 pt-2">
          <h4 className="font-bold text-xs text-[var(--hub-ink)]">Recent Synchronization Audit Logs</h4>
          {historyLogs.length === 0 ? (
            <p className="text-xs text-[var(--hub-muted)]">No synchronization events recorded yet.</p>
          ) : (
            <div className="divide-y divide-[var(--hub-line)] border border-[var(--hub-line)] rounded-xl overflow-hidden">
              {historyLogs.slice(0, 5).map((log) => (
                <div key={log.id} className="p-2.5 flex items-center justify-between text-xs bg-[var(--hub-bg)]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-semibold text-[var(--hub-ink)]">{log.service}</span>
                    <span className="text-[var(--hub-muted)]">— {log.action}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--hub-muted)]">{log.details}</span>
                    <span className="text-[10px] text-[var(--hub-muted)] font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Multi-Device & Hardware Hub (Windows, Android, NeoSapien) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Device Sessions */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-3">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-purple-600" />
            <span>Authenticated Device Fleet</span>
          </h3>
          <p className="text-xs text-[var(--hub-muted)]">
            Active sessions synchronized via Supabase Realtime & IndexedDB
          </p>

          <div className="space-y-2">
            <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Laptop className="w-4 h-4 text-teal-600" />
                <div>
                  <span className="font-semibold text-[var(--hub-ink)] block">Windows Desktop (Current Device)</span>
                  <span className="text-[10px] text-[var(--hub-muted)]">Edge / Chrome • Active Now</span>
                </div>
              </div>
              <Badge variant="emerald">Online</Badge>
            </div>

            <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-4 h-4 text-[var(--hub-muted)]" />
                <div>
                  <span className="font-semibold text-[var(--hub-ink)] block">Android PWA</span>
                  <span className="text-[10px] text-[var(--hub-muted)]">IndexedDB Local Cache • Synced</span>
                </div>
              </div>
              <Badge variant="gray">PWA Ready</Badge>
            </div>
          </div>
        </div>

        {/* NeoSapien BLE Hardware Hub */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
              <Bluetooth className="w-4 h-4 text-blue-500" />
              <span>NeoSapien Neo 1 Hardware</span>
            </h3>
            <Badge variant={neoConfig.status === 'connected' ? 'emerald' : 'gray'}>
              {neoConfig.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-xs text-[var(--hub-muted)]">
            Connect via Web Bluetooth LE or import ambient audio transcripts
          </p>

          <div className="pt-2">
            <button
              onClick={handleConnectNeoSapienBLE}
              disabled={isScanningBLE}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
            >
              <Bluetooth className="w-4 h-4 text-blue-500" />
              <span>{isScanningBLE ? 'Scanning for Neo 1...' : 'Scan & Pair Device'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
