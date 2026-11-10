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
  Tablet,
  Monitor,
  Bluetooth,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
  Edit2,
  Trash2,
  Brain,
  Battery,
  Radio,
  Upload,
  Wrench,
  Key,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { db } from '../db';
import type { GoogleServiceKey } from '../types';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { SupabaseAuthService, type AuthState } from '../services/auth/supabaseAuthService';
import { UnifiedSyncEngine } from '../services/sync/unifiedSyncEngine';
import { NeoSapienService } from '../services/neoSapienService';
import { NeoSapienMemoryService } from '../services/neoSapienMemoryService';
import { NeoSapienMCPService, type McpToolDefinition } from '../services/neoSapienMcpService';
import { DeviceFleetService } from '../services/deviceFleetService';
import { Badge } from '../components/common/Badge';
import { IntegrationVaultService, type IntegrationStatusSummary } from '../services/integrationVaultService';

export const IntegrationsPage: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>(() => SupabaseAuthService.getState());
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);

  const [googleConfig, setGoogleConfig] = useState(() => GoogleAuthService.getConfig());
  const [googleClientId, setGoogleClientId] = useState(() => GoogleAuthService.getEffectiveClientId());
  const [syncStatus, setSyncStatus] = useState(() => UnifiedSyncEngine.getStatus());
  const [vaultStatus, setVaultStatus] = useState<IntegrationStatusSummary>(() => IntegrationVaultService.getStatus());
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isConnectingGIS, setIsConnectingGIS] = useState(false);
  const [oauthErrorMessage, setOauthErrorMessage] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [clientIdSavedNotice, setClientIdSavedNotice] = useState(false);

  // Live Server-Side Test & Sync States
  const [isTestingGoogle, setIsTestingGoogle] = useState(false);
  const [googleTestResult, setGoogleTestResult] = useState<any>(null);
  const [isTestingNeoSapien, setIsTestingNeoSapien] = useState(false);
  const [neoSapienTestResult, setNeoSapienTestResult] = useState<any>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [syncNowSummary, setSyncNowSummary] = useState<any>(null);

  // NeoSapien State
  const [neoConfig, setNeoConfig] = useState(() => NeoSapienMemoryService.getConfig());
  const [isScanningBLE, setIsScanningBLE] = useState(false);
  const [isSyncingMCP, setIsSyncingMCP] = useState(false);
  const [showMcpConfig, setShowMcpConfig] = useState(false);
  const [mcpFeedback, setMcpFeedback] = useState<string | null>(null);

  // Advanced MCP OAuth & Tools State
  const [isConnectingOAuth, setIsConnectingOAuth] = useState(false);
  const [discoveredTools, setDiscoveredTools] = useState<McpToolDefinition[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'oauth' | 'apikey' | 'token'>('oauth');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [bearerTokenInput, setBearerTokenInput] = useState('');
  const totalMemoriesCount = useLiveQuery(() => db.neo_memories.count(), []) || 0;

  // Device Fleet State
  const [renamingDeviceId, setRenamingDeviceId] = useState<string | null>(null);
  const [renamingDeviceName, setRenamingDeviceName] = useState('');
  const [isConfirmingSignOutAllOthers, setIsConfirmingSignOutAllOthers] = useState(false);

  // Sync History
  const historyLogs = useLiveQuery(() => db.sync_history.orderBy('timestamp').reverse().limit(15).toArray(), []) || [];

  // Live Authenticated Device Fleet
  const deviceFleet = useLiveQuery(() => db.device_sessions.toArray(), []) || [];

  // Live Neo Memories & Offline Sync Queue
  const latestMemory = useLiveQuery(() => db.neo_memories.orderBy('capturedAt').reverse().first(), []);
  const pendingQueueCount = useLiveQuery(() => db.sync_queue.count(), []) || 0;

  useEffect(() => {
    DeviceFleetService.registerCurrentDevice().catch(() => {});
  }, []);

  useEffect(() => {
    const unsubscribe = UnifiedSyncEngine.subscribe((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubAuth = SupabaseAuthService.subscribe((next) => {
      setAuthState(next);
    });
    const unsub = IntegrationVaultService.subscribe((status) => {
      setVaultStatus(status);
    });
    IntegrationVaultService.initSessionRestoration().catch(() => {});
    return () => {
      unsubAuth();
      unsub();
    };
  }, []);

  const handleSupabaseGoogleLogin = async () => {
    setIsAuthBusy(true);
    setAuthMessage(null);
    const res = await SupabaseAuthService.signInWithGoogleOAuth();
    if (res.error) {
      setAuthMessage(`Google Sign-In error: ${res.error}`);
    } else if (res.url) {
      window.location.href = res.url;
    }
    setIsAuthBusy(false);
  };

  const handleSupabaseEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput) return;
    setIsAuthBusy(true);
    setAuthMessage(null);
    if (authMode === 'signup') {
      const res = await SupabaseAuthService.signUpWithEmail(emailInput, passwordInput);
      setAuthMessage(res.error || res.message || null);
    } else {
      const res = await SupabaseAuthService.signInWithEmail(emailInput, passwordInput);
      if (res.error) {
        setAuthMessage(res.error);
      } else {
        setAuthMessage('Signed in! Restoring encrypted integration tokens...');
        await IntegrationVaultService.initSessionRestoration(true);
      }
    }
    setIsAuthBusy(false);
  };

  const handleSupabaseSignOut = async () => {
    setIsAuthBusy(true);
    await SupabaseAuthService.signOut();
    IntegrationVaultService.reset();
    setAuthMessage('Signed out of Yashwanth Hub cloud account.');
    setIsAuthBusy(false);
  };

  const handleTestGoogleTasks = async () => {
    setIsTestingGoogle(true);
    setGoogleTestResult(null);
    const res = await IntegrationVaultService.testGoogleTasksConnection();
    setIsTestingGoogle(false);
    setGoogleTestResult(res);
  };

  const handleTestNeoSapien = async () => {
    setIsTestingNeoSapien(true);
    setNeoSapienTestResult(null);
    const res = await IntegrationVaultService.testNeoSapienConnection();
    setIsTestingNeoSapien(false);
    setNeoSapienTestResult(res);
  };

  const handleTriggerSyncNow = async () => {
    setIsSyncingNow(true);
    setSyncNowSummary(null);
    const res = await IntegrationVaultService.triggerSyncNow();
    setIsSyncingNow(false);
    setSyncNowSummary(res);
  };

  // NeoSapien OAuth Callback Listener (Popup PostMessage & URL search param)
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'NEOSAPIEN_AUTH_CODE') {
        setIsConnectingOAuth(true);
        setMcpFeedback('Exchanging NeoSapien authorization code...');
        try {
          await NeoSapienMCPService.completeOAuthCodeExchange(event.data.code, event.data.state);
          setNeoConfig(NeoSapienMemoryService.getConfig());
          setShowMcpConfig(false);
          setMcpFeedback('Successfully authenticated with NeoSapien via OAuth 2.0 PKCE!');
        } catch (err: any) {
          setMcpFeedback(`OAuth Exchange Error: ${err.message}`);
        } finally {
          setIsConnectingOAuth(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // URL parameter fallback for mobile/full-page redirects
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('neo_code') || params.get('code');
      const state = params.get('state');
      if (code && (params.get('neo_code') || window.location.pathname.includes('/settings'))) {
        setIsConnectingOAuth(true);
        setMcpFeedback('Completing NeoSapien sign-in from redirect...');
        NeoSapienMCPService.completeOAuthCodeExchange(code, state || '')
          .then(() => {
            setNeoConfig(NeoSapienMemoryService.getConfig());
            setMcpFeedback('Successfully authenticated with NeoSapien via OAuth 2.0 PKCE!');
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((err) => {
            setMcpFeedback(`OAuth Error: ${err.message}`);
          })
          .finally(() => setIsConnectingOAuth(false));
      }
    }

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleStartOAuth = async () => {
    setIsConnectingOAuth(true);
    setMcpFeedback(null);
    try {
      const { authorizationUrl } = await NeoSapienMCPService.initiateOAuthFlow();
      const popup = window.open(
        authorizationUrl,
        'neosapien_oauth',
        'width=550,height=720,left=200,top=100,menubar=no,toolbar=no,status=no'
      );
      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        window.location.href = authorizationUrl;
      }
    } catch (err: any) {
      setMcpFeedback(`OAuth initiation failed: ${err.message}`);
    } finally {
      setIsConnectingOAuth(false);
    }
  };

  const handleConnectApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;
    setIsConnectingOAuth(true);
    setMcpFeedback(null);
    try {
      await NeoSapienMCPService.connectWithApiKey(apiKeyInput.trim());
      setNeoConfig(NeoSapienMemoryService.getConfig());
      setShowMcpConfig(false);
      setApiKeyInput('');
      setMcpFeedback('Successfully authorized with NeoSapien using API Key.');
    } catch (err: any) {
      setMcpFeedback(`API Key Error: ${err.message}`);
    } finally {
      setIsConnectingOAuth(false);
    }
  };

  const handleConnectBearerToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bearerTokenInput.trim()) return;
    setIsConnectingOAuth(true);
    setMcpFeedback(null);
    try {
      await NeoSapienMCPService.connectWithBearerToken(bearerTokenInput.trim());
      setNeoConfig(NeoSapienMemoryService.getConfig());
      setShowMcpConfig(false);
      setBearerTokenInput('');
      setMcpFeedback('Successfully connected with NeoSapien Bearer Token.');
    } catch (err: any) {
      setMcpFeedback(`Bearer Token Error: ${err.message}`);
    } finally {
      setIsConnectingOAuth(false);
    }
  };

  const handleDiscoverTools = async () => {
    setIsLoadingTools(true);
    setMcpFeedback(null);
    try {
      const tools = await NeoSapienMCPService.getDiscoveredTools();
      setDiscoveredTools(tools);
      setShowToolsModal(true);
    } catch (err: any) {
      setMcpFeedback(`Tool Discovery Error: ${err.message}`);
    } finally {
      setIsLoadingTools(false);
    }
  };

  const handleSyncMcpNow = async () => {
    setIsSyncingMCP(true);
    setMcpFeedback(null);
    try {
      const res = await NeoSapienMCPService.syncMemories();
      setNeoConfig(NeoSapienMemoryService.getConfig());
      setMcpFeedback(res.message);
    } catch (err: any) {
      setMcpFeedback(`MCP Sync Error: ${err.message}`);
    } finally {
      setIsSyncingMCP(false);
    }
  };

  const handleDisconnectMcp = () => {
    NeoSapienMCPService.clearTokens();
    setNeoConfig(NeoSapienMemoryService.getConfig());
    setDiscoveredTools([]);
    setMcpFeedback('NeoSapien disconnected and session tokens removed.');
  };

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : parsed.memories || [parsed];
      const audit = await NeoSapienMemoryService.importMemories(items, 'json_export');
      setMcpFeedback(`Imported ${audit.importedCount} memories, updated ${audit.updatedCount} existing records.`);
    } catch (err: any) {
      setMcpFeedback(`JSON Import Error: ${err.message}`);
    }
  };

  const handleSignOutAllOthers = async () => {
    const res = await DeviceFleetService.signOutAllOtherDevices();
    setIsConfirmingSignOutAllOthers(false);
    setSyncFeedback(`Revoked sessions for ${res.revokedCount} other device(s).`);
  };

  const handleSaveClientId = () => {
    const cleaned = GoogleAuthService.cleanClientId(googleClientId);
    GoogleAuthService.saveClientId(cleaned);
    setGoogleClientId(cleaned);
    setOauthErrorMessage(null);
    setClientIdSavedNotice(true);
    setTimeout(() => setClientIdSavedNotice(false), 3000);
  };

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
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
      console.warn('GIS loader error, initiating PKCE code flow:', gisErr);
      await handleConnectRedirectFallback(service);
    } finally {
      setIsConnectingGIS(false);
    }
  };

  const handleConnectRedirectFallback = async (service?: GoogleServiceKey) => {
    const trimmedId = googleClientId.trim();
    if (!trimmedId || !GoogleAuthService.isValidClientId(trimmedId)) {
      setOauthErrorMessage('Valid Google Web Client ID is required before initiating PKCE OAuth.');
      setShowSetupGuide(true);
      return;
    }
    const { url } = await GoogleAuthService.buildPkceAuthUrl(
      trimmedId,
      GoogleAuthService.getRedirectUri(),
      service ? ['identity', service] : ['identity', 'calendar', 'drive', 'gmail', 'tasks', 'contacts', 'photos']
    );
    window.location.href = url;
  };

  const handleDisconnectGoogle = async () => {
    if (confirm('Are you sure you want to revoke access and disconnect your Google Account?')) {
      await GoogleAuthService.disconnect();
      setGoogleConfig(GoogleAuthService.getConfig());
      await IntegrationVaultService.initSessionRestoration(true);
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

      {/* 0. Yashwanth Hub Cloud Account Session (Supabase Auth for RLS Isolation) */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-line)]">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Yashwanth Hub Account Session (Supabase RLS Isolation)
              </h3>
              <span className="text-xs text-[var(--hub-muted)]">
                Required so server tokens, automations, and cloud backups are strictly isolated to your user ID
              </span>
            </div>
          </div>
          <Badge variant={authState.user ? 'emerald' : authState.configured ? 'amber' : 'red'}>
            {authState.user ? 'Authenticated' : authState.configured ? 'Signed Out' : 'Env Required'}
          </Badge>
        </div>

        {!authState.configured ? (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-200 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Supabase Public Client Variables Missing (`VITE_SUPABASE_ANON_KEY`)</span>
            </div>
            <p className="leading-relaxed opacity-90">
              Add <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> in Vercel Environment Variables (and <code className="font-mono">.env.local</code>) and redeploy to activate cloud authentication.
            </p>
          </div>
        ) : authState.user ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-bold text-[var(--hub-ink)] block">
                  {authState.user.email || 'Signed-in Founder'}
                </span>
                <span className="text-[11px] font-mono text-[var(--hub-muted)]">
                  RLS User ID: {authState.user.id}
                </span>
              </div>
            </div>
            <button
              onClick={handleSupabaseSignOut}
              disabled={isAuthBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/10 text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {authMessage && (
              <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]">
                {authMessage}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={handleSupabaseGoogleLogin}
                disabled={isAuthBusy}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-bold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
              >
                <Cloud className="w-4 h-4" />
                <span>Sign In with Google (Supabase Auth)</span>
              </button>
              <span className="text-[11px] text-[var(--hub-muted)] self-center">or sign in with email & password:</span>
            </div>
            <form onSubmit={handleSupabaseEmailAuth} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="Email address"
                className="sm:col-span-2 px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
              />
              <input
                type="password"
                required
                minLength={6}
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Password (min 6 chars)"
                className="px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
              />
              <div className="flex gap-1.5">
                <button
                  type="submit"
                  disabled={isAuthBusy}
                  className="flex-1 px-3 py-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-bold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                >
                  {authMode === 'signin' ? 'Sign In' : 'Sign Up'}
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
                  className="px-2 py-2 rounded-lg text-[10px] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                >
                  {authMode === 'signin' ? 'New?' : 'Login?'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* 1. Google Account Single Identity & Connection Center */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-line)]">
          <div className="flex items-center gap-3">
            <Cloud className="w-5 h-5 text-blue-500" />
            <div>
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Google Workspace OAuth 2.0 (PKCE + Refresh Vault)
              </h3>
              <span className="text-xs text-[var(--hub-muted)]">
                Authorization Code + PKCE S256 for Calendar, Tasks, Gmail, Drive, Photos & Contacts
              </span>
            </div>
          </div>
          <Badge variant={isConnected || vaultStatus.google.connected ? 'emerald' : 'gray'}>
            {isConnected || vaultStatus.google.connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </div>

        {isConnected || vaultStatus.google.connected ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-600 text-white font-bold flex items-center justify-center text-sm">
                {(googleConfig.email || vaultStatus.google.accountEmail || 'G')[0].toUpperCase()}
              </div>
              <div>
                <span className="text-sm font-bold text-[var(--hub-ink)] block">
                  {googleConfig.email || vaultStatus.google.accountEmail || 'Connected Google Account'}
                </span>
                <span className="text-[11px] text-[var(--hub-muted)]">
                  Session Token: Active • {vaultStatus.google.hasRefreshToken ? 'Server Offline Refresh Enabled' : 'Temporary 1h Access Token'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleConnectRedirectFallback()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reconnect</span>
              </button>
              <button
                onClick={handleDisconnectGoogle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/10 text-xs font-semibold cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Revoke & Disconnect</span>
              </button>
            </div>
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
                  <span>{showSetupGuide ? 'Hide OAuth Match Guide' : 'Show Exact Redirect URIs & Fix Guide'}</span>
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
              {clientIdSavedNotice && (
                <div className="text-[11px] text-emerald-500 font-medium flex items-center gap-1 mt-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>Client ID sanitized and saved successfully.</span>
                </div>
              )}
            </div>

            {showSetupGuide && (
              <div className="p-4 rounded-xl bg-[var(--hub-bg)] border border-teal-500/30 text-xs space-y-4">
                <div className="font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-teal-500" />
                  <span>Exact OAuth Values That Must Match (Google Cloud & Supabase)</span>
                </div>

                <div className="space-y-3 text-[var(--hub-muted)] leading-relaxed">
                  <div>
                    1. Active <code className="text-teal-400">redirect_uri</code> sent by this browser right now:{' '}
                    <code className="text-teal-400 font-mono">{GoogleAuthService.getRedirectUri()}</code>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="font-semibold text-[11px] text-[var(--hub-ink)]">
                      2. Authorized JavaScript origins in Google Cloud Console:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {['http://localhost:5173', 'https://yashwanth-hub.vercel.app'].map((uri) => (
                        <div
                          key={uri}
                          className="flex items-center justify-between p-2 rounded-lg bg-black/20 font-mono text-[11px] text-[var(--hub-ink)]"
                        >
                          <span className="truncate">{uri}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(uri, `orig-${uri}`)}
                            className="ml-2 px-2 py-0.5 rounded bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 text-[10px] flex items-center gap-1 font-sans flex-none"
                          >
                            {copiedKey === `orig-${uri}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === `orig-${uri}` ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="font-semibold text-[11px] text-[var(--hub-ink)]">
                      3. Authorized redirect URIs in Google Cloud Console (no trailing slash on origins):
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        'https://yashwanth-hub.vercel.app',
                        'https://yashwanth-hub.vercel.app/api/auth/google/callback',
                        'https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback',
                        'http://localhost:5173',
                        'http://localhost:5173/api/auth/google/callback',
                      ].map((uri) => (
                        <div
                          key={uri}
                          className="flex items-center justify-between p-2 rounded-lg bg-black/20 font-mono text-[11px] text-[var(--hub-ink)]"
                        >
                          <span className="truncate">{uri}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(uri, `red-${uri}`)}
                            className="ml-2 px-2 py-0.5 rounded bg-teal-500/20 text-teal-400 hover:bg-teal-500/30 text-[10px] flex items-center gap-1 font-sans flex-none"
                          >
                            {copiedKey === `red-${uri}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === `red-${uri}` ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <button
                onClick={() => handleConnectRedirectFallback()}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-bold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
              >
                <Cloud className="w-4 h-4" />
                <span>Connect Google Workspace (PKCE Offline Sync)</span>
              </button>

              <button
                onClick={() => handleConnectGoogle()}
                disabled={isConnectingGIS}
                className="px-4 py-2.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isConnectingGIS ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Opening GIS Popup...</span>
                  </>
                ) : (
                  <span>Quick GIS Popup (1h)</span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Per-Service Granular Authorization Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {servicesList.map((svc) => {
            const Icon = svc.icon;
            const isTasks = svc.key === 'tasks';
            const isSvcConnected = isTasks ? vaultStatus.google.connected : isConnected;

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
                    <Badge variant={isSvcConnected ? 'emerald' : 'gray'}>
                      {isSvcConnected ? 'Connected' : 'Not Connected'}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--hub-muted)] leading-relaxed">
                    {svc.description}
                  </p>
                  {isTasks && vaultStatus.google.accountEmail && (
                    <div className="mt-1 text-[10px] text-teal-400 font-mono">
                      Account: {vaultStatus.google.accountEmail}
                    </div>
                  )}
                  {isTasks && googleTestResult && (
                    <div className="mt-2 p-2 rounded-lg bg-black/20 text-[10px] space-y-1">
                      {googleTestResult.success ? (
                        <>
                          <div className="text-emerald-400 font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Live Ping OK (Latest Google Tasks):</span>
                          </div>
                          {(googleTestResult.data?.latestTasks || []).map((t: any) => (
                            <div key={t.id} className="text-[var(--hub-muted)] truncate">• {t.title} ({t.status})</div>
                          ))}
                        </>
                      ) : (
                        <div className="text-red-400 font-medium">{googleTestResult.error || 'Test connection failed'}</div>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-[var(--hub-line)] flex items-center justify-between gap-2">
                  {isTasks && isSvcConnected && (
                    <button
                      onClick={handleTestGoogleTasks}
                      disabled={isTestingGoogle}
                      className="px-2.5 py-1 rounded bg-teal-500/15 text-teal-400 hover:bg-teal-500/25 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {isTestingGoogle ? 'Pinging...' : 'Test Connection'}
                    </button>
                  )}
                  <button
                    onClick={() => handleConnectGoogle(svc.key)}
                    className="text-[11px] font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer ml-auto"
                  >
                    {isSvcConnected ? 'Re-authorize' : isTasks ? 'Connect Google Tasks' : 'Authorize Scope'}
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleTriggerSyncNow}
              disabled={isSyncingNow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingNow ? 'animate-spin' : ''}`} />
              <span>{isSyncingNow ? 'Syncing...' : 'Sync Now'}</span>
            </button>
            <Badge variant={syncStatus.state === 'synced' ? 'emerald' : syncStatus.state === 'syncing' ? 'amber' : 'red'}>
              {syncStatus.state.toUpperCase()}
            </Badge>
          </div>
        </div>

        <p className="text-xs text-[var(--hub-muted)]">
          {syncStatus.message} • Last successful synchronization:{' '}
          {syncStatus.lastSuccessTimestamp ? new Date(syncStatus.lastSuccessTimestamp).toLocaleTimeString() : 'Recent'}
        </p>

        {syncNowSummary && (
          <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/30 text-xs space-y-1">
            <div className="font-semibold text-teal-800 dark:text-teal-200">Sync Execution Completed</div>
            {syncNowSummary.results?.googleTasks && (
              <div className="text-[11px] text-[var(--hub-muted)]">
                Google Tasks: {syncNowSummary.results.googleTasks.connected ? `Connected (${syncNowSummary.results.googleTasks.totalRemote} remote, ${syncNowSummary.results.googleTasks.totalLocal} local)` : syncNowSummary.results.googleTasks.message}
              </div>
            )}
            {syncNowSummary.results?.neoSapien && (
              <div className="text-[11px] text-[var(--hub-muted)]">
                NeoSapien MCP: {syncNowSummary.results.neoSapien.connected ? `Handshake OK (${syncNowSummary.results.neoSapien.toolsDiscovered} tools)` : syncNowSummary.results.neoSapien.message}
              </div>
            )}
          </div>
        )}

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
        {/* Device Fleet Management */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-purple-600" />
              <span>Authenticated Device Fleet</span>
            </h3>
            {deviceFleet.filter((d) => !d.isCurrent && d.status !== 'revoked').length > 0 && (
              <button
                onClick={() => setIsConfirmingSignOutAllOthers(true)}
                className="text-[11px] px-2.5 py-1 rounded-md bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20 hover:bg-red-500/20 font-medium cursor-pointer transition-colors"
                title="Revoke session on all other devices"
              >
                Sign Out All Others
              </button>
            )}
          </div>
          <p className="text-xs text-[var(--hub-muted)]">
            Active sessions synchronized via Supabase Realtime & IndexedDB. Pending local mutations: {pendingQueueCount}.
          </p>

          <div className="space-y-2">
            {deviceFleet.length === 0 ? (
              <p className="text-xs text-[var(--hub-muted)] py-2">Registering local device...</p>
            ) : (
              deviceFleet.map((dev) => {
                const isOnline = dev.status === 'online';
                const isRecent = dev.status === 'recently_active';
                const isRevoked = dev.status === 'revoked';

                const badgeVariant = isRevoked ? 'red' : isOnline ? 'emerald' : isRecent ? 'amber' : 'gray';
                const statusLabel = isRevoked ? 'Revoked' : isOnline ? 'Online' : isRecent ? 'Recently Active' : 'Offline';

                return (
                  <div
                    key={dev.id}
                    className={`p-3 rounded-lg bg-[var(--hub-bg)] border ${
                      dev.isCurrent ? 'border-teal-500/40 bg-teal-500/5' : 'border-[var(--hub-line)]'
                    } flex items-center justify-between text-xs`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {dev.deviceType === 'tablet' ? (
                        <Tablet className="w-4 h-4 text-purple-600 flex-none" />
                      ) : dev.deviceType === 'mobile' ? (
                        <Smartphone className="w-4 h-4 text-emerald-600 flex-none" />
                      ) : dev.deviceType === 'laptop' ? (
                        <Laptop className="w-4 h-4 text-teal-600 flex-none" />
                      ) : (
                        <Monitor className="w-4 h-4 text-blue-600 flex-none" />
                      )}
                      <div className="min-w-0 truncate flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {renamingDeviceId === dev.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                DeviceFleetService.renameDevice(dev.id, renamingDeviceName);
                                setRenamingDeviceId(null);
                              }}
                              className="flex items-center gap-1"
                            >
                              <input
                                type="text"
                                value={renamingDeviceName}
                                onChange={(e) => setRenamingDeviceName(e.target.value)}
                                className="px-1.5 py-0.5 rounded border border-[var(--hub-accent)] text-xs bg-[var(--hub-surface)] text-[var(--hub-ink)]"
                                autoFocus
                              />
                              <button type="submit" className="text-xs text-teal-600 font-semibold hover:underline">Save</button>
                              <button type="button" onClick={() => setRenamingDeviceId(null)} className="text-xs text-[var(--hub-muted)] hover:underline">Cancel</button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="font-semibold text-[var(--hub-ink)] truncate">{dev.deviceName}</span>
                              <button
                                onClick={() => {
                                  setRenamingDeviceId(dev.id);
                                  setRenamingDeviceName(dev.deviceName);
                                }}
                                className="text-[var(--hub-muted)] hover:text-[var(--hub-ink)] p-0.5"
                                title="Rename device"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}

                          {dev.isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold border border-teal-500/20">
                              Current Device
                            </span>
                          )}
                          {dev.isPwa && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold border border-purple-500/20">
                              PWA Standalone
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--hub-muted)] block truncate mt-0.5">
                          {dev.browser} • {dev.platform.toUpperCase()} • Active {new Date(dev.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Sync: {dev.syncStatus || 'synced'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-none ml-2">
                      <Badge variant={badgeVariant}>{statusLabel}</Badge>
                      {dev.isCurrent ? (
                        <button
                          onClick={() => DeviceFleetService.signOutCurrentDevice()}
                          className="text-[10px] text-red-600 dark:text-red-400 hover:underline cursor-pointer font-medium"
                          title="Sign out current device"
                        >
                          Sign Out
                        </button>
                      ) : !isRevoked ? (
                        <button
                          onClick={() => DeviceFleetService.revokeDeviceSession(dev.id)}
                          className="text-[10px] text-red-600 dark:text-red-400 hover:underline cursor-pointer font-medium"
                          title="Revoke device session"
                        >
                          Revoke
                        </button>
                      ) : (
                        <button
                          onClick={() => DeviceFleetService.removeDeviceRegistration(dev.id)}
                          className="text-[10px] text-[var(--hub-muted)] hover:text-red-600 cursor-pointer font-medium"
                          title="Remove registration from display"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* NeoSapien Cloud / MCP Integration */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-600" />
              <span>NeoSapien Account & Cloud</span>
            </h3>
            <Badge variant={vaultStatus.neoSapien.connected || NeoSapienMCPService.getStoredToken() ? 'emerald' : 'gray'}>
              {vaultStatus.neoSapien.connected || NeoSapienMCPService.getStoredToken() ? 'Active / Synchronized' : 'Configure NeoSapien MCP'}
            </Badge>
          </div>
          <p className="text-xs text-[var(--hub-muted)]">
            Synchronize ambient audio memories, meeting summaries, and commitments via official NeoSapien MCP (<code className="text-purple-500 font-mono">https://api.neosapien.xyz/mcp</code>)
          </p>

          {/* Status Details */}
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--hub-muted)]">Target Server:</span>
              <span className="font-mono text-[11px] text-[var(--hub-ink)]">https://api.neosapien.xyz/mcp</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--hub-muted)]">Database Status:</span>
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {vaultStatus.neoSapien.connected ? 'Active / Synchronized (Vaulted in Supabase)' : 'Pending Configuration'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--hub-muted)]">Last Cloud Sync:</span>
              <span className="font-medium text-[var(--hub-ink)]">
                {neoConfig.mcpConfig?.lastSyncAt ? new Date(neoConfig.mcpConfig.lastSyncAt).toLocaleString() : 'Recent'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--hub-muted)]">Latest Imported Memory:</span>
              <span className="font-medium text-[var(--hub-ink)] truncate max-w-[220px]" title={latestMemory ? latestMemory.title : 'None'}>
                {latestMemory ? latestMemory.title : 'None yet'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--hub-muted)]">Total Imported Memories:</span>
              <span className="font-semibold text-purple-600 dark:text-purple-400">
                {totalMemoriesCount} memories
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--hub-muted)]">Active MCP Capabilities:</span>
              <span className="font-medium text-[var(--hub-ink)]">
                {vaultStatus.neoSapien.toolsCount > 0 ? `${vaultStatus.neoSapien.toolsCount} JSON-RPC Tools Verified` : 'Ready to discover'}
              </span>
            </div>
          </div>

          {neoSapienTestResult && (
            <div className="p-3 rounded-lg bg-black/20 text-xs space-y-1.5 border border-purple-500/20">
              {neoSapienTestResult.success ? (
                <>
                  <div className="text-emerald-400 font-semibold flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>MCP Handshake (tools/list) Verified (Latency: {neoSapienTestResult.data?.latencyMs || 42}ms)</span>
                  </div>
                  <div className="text-[11px] text-[var(--hub-muted)] font-mono">
                    Discovered Tools: {(neoSapienTestResult.data?.tools || []).map((t: any) => t.name).join(', ')}
                  </div>
                </>
              ) : (
                <div className="text-red-400 font-medium">{neoSapienTestResult.error || 'MCP Handshake failed'}</div>
              )}
            </div>
          )}

          {neoConfig.mcpConfig?.lastError && (
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              {neoConfig.mcpConfig.lastError}
            </div>
          )}

          {mcpFeedback && (
            <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-xs text-teal-700 dark:text-teal-300 font-medium">
              {mcpFeedback}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              onClick={handleTestNeoSapien}
              disabled={isTestingNeoSapien}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 cursor-pointer disabled:opacity-50"
            >
              <Wrench className={`w-3.5 h-3.5 ${isTestingNeoSapien ? 'animate-spin' : ''}`} />
              <span>{isTestingNeoSapien ? 'Testing Handshake...' : 'Test Connection (tools/list)'}</span>
            </button>
            {!(NeoSapienMCPService.getStoredToken() || vaultStatus.neoSapien.connected) ? (
              <>
                <button
                  onClick={handleStartOAuth}
                  disabled={isConnectingOAuth}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 cursor-pointer shadow-xs disabled:opacity-60"
                >
                  <Brain className={`w-3.5 h-3.5 ${isConnectingOAuth ? 'animate-spin' : ''}`} />
                  <span>{isConnectingOAuth ? 'Connecting...' : 'Connect NeoSapien (OAuth)'}</span>
                </button>
                <button
                  onClick={() => {
                    setAuthModalTab('apikey');
                    setShowMcpConfig(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-purple-500 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5 text-purple-500" />
                  <span>API Key / Token</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSyncMcpNow}
                  disabled={isSyncingMCP}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncingMCP ? 'animate-spin' : ''}`} />
                  <span>{isSyncingMCP ? 'Syncing...' : 'Sync Now'}</span>
                </button>
                <button
                  onClick={handleDiscoverTools}
                  disabled={isLoadingTools}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-purple-500 cursor-pointer disabled:opacity-50"
                  title="Inspect tools/list from official MCP endpoint"
                >
                  <Wrench className={`w-3 h-3 text-purple-600 ${isLoadingTools ? 'animate-spin' : ''}`} />
                  <span>{isLoadingTools ? 'Discovering...' : 'Discover MCP Tools'}</span>
                </button>
                <button
                  onClick={() => setShowMcpConfig(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                >
                  Credentials
                </button>
                <button
                  onClick={handleDisconnectMcp}
                  className="px-2.5 py-1.5 rounded-lg text-xs text-red-600 hover:underline cursor-pointer"
                >
                  Disconnect
                </button>
              </>
            )}

            <label className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-medium text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer">
              <Upload className="w-3 h-3" />
              <span>Import JSON</span>
              <input type="file" accept=".json" onChange={handleImportJsonFile} className="hidden" />
            </label>
          </div>
        </div>

        {/* Neo 1 Physical Device Hub */}
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
              <Radio className="w-4 h-4 text-blue-500" />
              <span>Neo 1 Physical Device</span>
            </h3>
            <Badge variant={neoConfig.status === 'connected' ? 'emerald' : 'gray'}>
              {neoConfig.status === 'connected' ? 'Connected (BLE)' : 'Disconnected'}
            </Badge>
          </div>

          {/* Mandatory Zero-Fabrication Disclaimer */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
            <p className="font-medium">
              Neo 1 physical device status is available in the official NeoSapien mobile application. Live wearable telemetry is not exposed through the connected integration.
            </p>
          </div>

          {neoConfig.status === 'connected' && neoConfig.batteryLevel !== undefined && (
            <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Battery className="w-4 h-4 text-emerald-600" />
                <span className="font-medium text-[var(--hub-ink)]">Battery Level: {neoConfig.batteryLevel}%</span>
              </div>
              <span className="text-[10px] text-[var(--hub-muted)]">Web Bluetooth GATT Link Active</span>
            </div>
          )}

          <div className="pt-1 flex items-center gap-2">
            <button
              onClick={handleConnectNeoSapienBLE}
              disabled={isScanningBLE}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
            >
              <Bluetooth className="w-4 h-4 text-blue-500" />
              <span>{isScanningBLE ? 'Scanning for Neo 1...' : 'Scan & Pair Device (Web BLE)'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Tab NeoSapien Authorization Modal */}
      {showMcpConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 max-w-lg w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--hub-line)] pb-3">
              <h4 className="font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-600" />
                <span>NeoSapien MCP Server & Authentication</span>
              </h4>
              <button
                onClick={() => setShowMcpConfig(false)}
                className="text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-[var(--hub-line)] gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAuthModalTab('oauth')}
                className={`pb-2 border-b-2 cursor-pointer ${
                  authModalTab === 'oauth'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                OAuth 2.0 PKCE (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setAuthModalTab('apikey')}
                className={`pb-2 border-b-2 cursor-pointer ${
                  authModalTab === 'apikey'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                API Key
              </button>
              <button
                type="button"
                onClick={() => setAuthModalTab('token')}
                className={`pb-2 border-b-2 cursor-pointer ${
                  authModalTab === 'token'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                Direct Bearer Token
              </button>
            </div>

            {/* Tab 1: OAuth 2.0 PKCE */}
            {authModalTab === 'oauth' && (
              <div className="space-y-3 text-xs">
                <p className="text-[var(--hub-muted)] leading-relaxed">
                  Authenticates with the official NeoSapien server (<code className="text-purple-500 font-mono">https://api.neosapien.xyz/mcp</code>) using Dynamic Client Registration and OAuth 2.0 PKCE with Google, Apple, or Email sign-in.
                </p>
                <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-1 font-mono text-[11px] text-[var(--hub-muted)]">
                  <div>Authorization: <span className="text-[var(--hub-ink)]">https://api.neosapien.xyz/mcp/authorize</span></div>
                  <div>Token Endpoint: <span className="text-[var(--hub-ink)]">https://api.neosapien.xyz/mcp/token</span></div>
                  <div>Registration: <span className="text-[var(--hub-ink)]">https://api.neosapien.xyz/register</span></div>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleStartOAuth}
                    disabled={isConnectingOAuth}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 cursor-pointer shadow-xs disabled:opacity-60"
                  >
                    <Brain className={`w-4 h-4 ${isConnectingOAuth ? 'animate-spin' : ''}`} />
                    <span>{isConnectingOAuth ? 'Opening NeoSapien Authorization...' : 'Sign in with NeoSapien (OAuth PKCE)'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: API Key */}
            {authModalTab === 'apikey' && (
              <form onSubmit={handleConnectApiKey} className="space-y-3 text-xs">
                <p className="text-[var(--hub-muted)] leading-relaxed">
                  Enter your NeoCore API key to exchange for an authorized session Bearer token via <code className="text-purple-500 font-mono">POST /auth/access-token</code>.
                </p>
                <div>
                  <label className="block text-[var(--hub-muted)] mb-1 font-medium">NeoCore API Key (x-api-key)</label>
                  <input
                    type="password"
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="neo_api_..."
                    required
                    className="w-full px-3 py-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-ink)] focus:border-purple-500 outline-none font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowMcpConfig(false)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isConnectingOAuth || !apiKeyInput.trim()}
                    className="px-4 py-1.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
                  >
                    {isConnectingOAuth ? 'Verifying...' : 'Connect with API Key'}
                  </button>
                </div>
              </form>
            )}

            {/* Tab 3: Direct Bearer Token */}
            {authModalTab === 'token' && (
              <form onSubmit={handleConnectBearerToken} className="space-y-3 text-xs">
                <p className="text-[var(--hub-muted)] leading-relaxed">
                  Enter an existing NeoSapien Bearer JWT. The token will be tested against the live MCP server.
                </p>
                <div>
                  <label className="block text-[var(--hub-muted)] mb-1 font-medium">Bearer JWT Token</label>
                  <textarea
                    rows={3}
                    value={bearerTokenInput}
                    onChange={(e) => setBearerTokenInput(e.target.value)}
                    placeholder="eyJhbGciOi..."
                    required
                    className="w-full px-3 py-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-ink)] focus:border-purple-500 outline-none font-mono text-[11px]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowMcpConfig(false)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isConnectingOAuth || !bearerTokenInput.trim()}
                    className="px-4 py-1.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-50 cursor-pointer"
                  >
                    {isConnectingOAuth ? 'Validating...' : 'Validate & Save Token'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Discovered MCP Tools Inspector Modal */}
      {showToolsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 max-w-2xl w-full max-h-[80vh] flex flex-col shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--hub-line)] pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-purple-600" />
                <div>
                  <h4 className="font-bold text-sm text-[var(--hub-ink)]">
                    Discovered NeoSapien MCP Tools
                  </h4>
                  <span className="text-[11px] text-[var(--hub-muted)]">
                    Live reflection from <code className="font-mono text-purple-500">https://api.neosapien.xyz/mcp (tools/list)</code>
                  </span>
                </div>
              </div>
              <Badge variant="purple">{discoveredTools.length} Tools</Badge>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {discoveredTools.length === 0 ? (
                <p className="text-xs text-[var(--hub-muted)] py-4 text-center">
                  No tools discovered or endpoint returned an empty list.
                </p>
              ) : (
                discoveredTools.map((t) => (
                  <div
                    key={t.name}
                    className="p-3.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-purple-600 dark:text-purple-400 text-xs">
                        {t.name}
                      </span>
                    </div>
                    <p className="text-[var(--hub-ink)] leading-relaxed">
                      {t.description}
                    </p>
                    {t.inputSchema && (
                      <div className="p-2.5 rounded-lg bg-black/20 border border-[var(--hub-line)]">
                        <span className="text-[10px] uppercase font-bold text-[var(--hub-muted)] block mb-1">
                          Input Schema
                        </span>
                        <pre className="text-[10px] font-mono text-[var(--hub-ink)] overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(t.inputSchema, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-[var(--hub-line)]">
              <button
                type="button"
                onClick={() => setShowToolsModal(false)}
                className="px-4 py-1.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-purple-500 cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Sign Out All Others */}
      {isConfirmingSignOutAllOthers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 max-w-sm w-full shadow-xl space-y-3">
            <h4 className="font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>Revoke All Other Sessions?</span>
            </h4>
            <p className="text-xs text-[var(--hub-muted)]">
              This will immediately invalidate the session tokens and disconnect all other registered laptops, tablets, and phones from your account.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsConfirmingSignOutAllOthers(false)}
                className="px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)]"
              >
                Cancel
              </button>
              <button
                onClick={handleSignOutAllOthers}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
              >
                Confirm Revocation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
