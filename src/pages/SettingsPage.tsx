import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Moon,
  Sun,
  Monitor,
  Database,
  Cloud,
  Download,
  Upload,
  Copy,
  Check,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Code2,
  HardDrive,
  Bluetooth,
  Radio,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Laptop,
  Tablet,
} from 'lucide-react';
import { db } from '../db';
import type { Area } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useSync } from '../context/SyncContext';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  isSupabaseConfigured,
  getSupabaseClient,
  SUPABASE_SCHEMA_SQL,
} from '../lib/supabase';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { GoogleCalendarService } from '../services/google/googleCalendarService';
import { NeoSapienService } from '../services/neoSapienService';
import { CapacitorService } from '../services/native/capacitorService';
import { IntegrationVaultService } from '../services/integrationVaultService';
import { generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface SettingsPageProps {
  areas: Area[];
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ areas }) => {
  const { theme, setTheme } = useTheme();
  const { status, statusMessage, syncNow, queueCount } = useSync();

  // Supabase Config State
  const initialSupabase = getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(initialSupabase.url);
  const [supabaseKey, setSupabaseKey] = useState(initialSupabase.anonKey);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);

  // Google Workspace State
  const [googleConfig, setGoogleConfig] = useState(() => GoogleAuthService.getConfig());
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem('yash_google_client_id') || '');
  const [googleSyncStatus, setGoogleSyncStatus] = useState<string | null>(null);
  const [isGoogleSyncing, setIsGoogleSyncing] = useState(false);
  const [isTestingGoogle, setIsTestingGoogle] = useState(false);
  const [googleTestResult, setGoogleTestResult] = useState<string | null>(null);

  // NeoSapien State
  const [neoConfig, setNeoConfig] = useState(() => NeoSapienService.getConfig());
  const [isScanningBLE, setIsScanningBLE] = useState(false);
  const [neoTranscriptInput, setNeoTranscriptInput] = useState('');
  const [neoIngestResult, setNeoIngestResult] = useState<string | null>(null);
  const [isTestingNeo, setIsTestingNeo] = useState(false);
  const [neoTestResult, setNeoTestResult] = useState<string | null>(null);

  // PWA & Multi-Device State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installStatus, setInstallStatus] = useState<string | null>(null);

  useEffect(() => {
    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        document.referrer.includes('android-app://');
      setIsStandalone(Boolean(isStandaloneMode));
    };
    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setInstallStatus('Yashwanth Hub was successfully installed!');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setInstallStatus('Installation accepted. Yashwanth Hub is now installed!');
        setDeferredPrompt(null);
      } else {
        setInstallStatus('Installation dismissed.');
      }
    } catch (err) {
      console.error('Error triggering PWA prompt:', err);
    }
  };

  // Backup & Restore State
  const [backupText, setBackupText] = useState('');
  const [restoreText, setRestoreText] = useState('');
  const [copiedBackup, setCopiedBackup] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  // Area Management Modal State
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [formAreaName, setFormAreaName] = useState('');
  const [formAreaColor, setFormAreaColor] = useState('#0b6e6e');
  const [formAreaDesc, setFormAreaDesc] = useState('');
  const [areaToDelete, setAreaToDelete] = useState<string | null>(null);

  // Table row counts
  const taskCount = useLiveQuery(() => db.tasks.count(), []) || 0;
  const projectCount = useLiveQuery(() => db.projects.count(), []) || 0;
  const eventCount = useLiveQuery(() => db.events.count(), []) || 0;
  const meetingCount = useLiveQuery(() => db.meetings.count(), []) || 0;
  const travelCount = useLiveQuery(() => db.travel.count(), []) || 0;
  const noteCount = useLiveQuery(() => db.notes.count(), []) || 0;
  const expenseCount = useLiveQuery(() => db.expenses.count(), []) || 0;
  const contactCount = useLiveQuery(() => db.contacts.count(), []) || 0;
  const documentCount = useLiveQuery(() => db.documents.count(), []) || 0;
  const notificationCount = useLiveQuery(() => db.notifications.count(), []) || 0;

  // Google Handlers
  const handleSaveClientId = () => {
    const cleaned = GoogleAuthService.cleanClientId(googleClientId);
    GoogleAuthService.saveClientId(cleaned);
    setGoogleClientId(cleaned);
    setGoogleSyncStatus('✓ Google Web Client ID saved successfully.');
    setTimeout(() => setGoogleSyncStatus(null), 3000);
  };

  const handleConnectRedirectFallback = () => {
    const cleaned = GoogleAuthService.cleanClientId(googleClientId);
    if (!cleaned || !GoogleAuthService.isValidClientId(cleaned)) {
      alert('Valid Google Web Client ID is required. Format: [id].apps.googleusercontent.com');
      return;
    }
    GoogleAuthService.saveClientId(cleaned);
    const authUrl = GoogleAuthService.getAuthUrl(cleaned, GoogleAuthService.getRedirectUri());
    window.location.href = authUrl;
  };

  const handleConnectGoogle = async () => {
    const cleaned = GoogleAuthService.cleanClientId(googleClientId);
    if (!cleaned) {
      alert('Please enter your Google OAuth 2.0 Web Client ID from Google Cloud Console.');
      return;
    }
    if (!GoogleAuthService.isValidClientId(cleaned)) {
      alert('Invalid Client ID format. Must end with ".apps.googleusercontent.com" from a Web application client.');
      return;
    }
    GoogleAuthService.saveClientId(cleaned);

    // If running in native mobile app (Android / iOS):
    if (CapacitorService.isNative()) {
      const client = getSupabaseClient();
      if (client) {
        try {
          const { data } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: 'com.yaswanth.hub://auth/callback',
              skipBrowserRedirect: true,
            },
          });
          if (data?.url) {
            window.open(data.url, '_system');
            return;
          }
        } catch (e) {
          console.warn('Supabase OAuth attempt failed, falling back to direct auth URL:', e);
        }
      }

      // Fallback direct Google OAuth opened via system browser to avoid webview 403
      const nativeAuthUrl = GoogleAuthService.getAuthUrl(cleaned, 'com.yaswanth.hub://auth/callback');
      window.open(nativeAuthUrl, '_system');
      return;
    }

    try {
      const res = await GoogleAuthService.requestGisToken(cleaned);
      if (res.success) {
        setGoogleConfig(GoogleAuthService.getConfig());
        return;
      }
    } catch {
      // Fallback to standard redirect
    }

    const authUrl = GoogleAuthService.getAuthUrl(cleaned, GoogleAuthService.getRedirectUri());
    window.location.href = authUrl;
  };

  const handleDisconnectGoogle = async () => {
    await GoogleAuthService.disconnect();
    setGoogleConfig(GoogleAuthService.getConfig());
  };

  const handleSyncGoogleCalendar = async () => {
    setIsGoogleSyncing(true);
    setGoogleSyncStatus(null);
    try {
      const res = await GoogleCalendarService.syncFromGoogle();
      setGoogleSyncStatus(`Synced! Imported ${res.imported} new events, updated ${res.updated}.`);
    } catch (err: any) {
      setGoogleSyncStatus(`Google Sync: ${err.message || 'Authentication required'}`);
    } finally {
      setIsGoogleSyncing(false);
    }
  };

  const handleTestGoogleTasks = async () => {
    setIsTestingGoogle(true);
    setGoogleTestResult(null);
    try {
      const res = await IntegrationVaultService.testGoogleTasksConnection();
      if (res.success) {
        const count = res.data?.latestTasks?.length || 0;
        setGoogleTestResult(`Connection Verified! Google Tasks API active (${count} tasks retrieved).`);
      } else {
        setGoogleTestResult(`Connection Warning: ${res.error || 'Token invalid or expired'}`);
      }
    } catch (err: any) {
      setGoogleTestResult(`Test failed: ${err.message}`);
    } finally {
      setIsTestingGoogle(false);
    }
  };

  const handleTestNeoSapien = async () => {
    setIsTestingNeo(true);
    setNeoTestResult(null);
    try {
      const res = await IntegrationVaultService.testNeoSapienConnection();
      if (res.success) {
        const tools = res.data?.tools || [];
        setNeoTestResult(`MCP Handshake Verified! ${tools.length} remote tools discovered.`);
      } else {
        setNeoTestResult(`MCP Warning: ${res.error || 'Check NeoSapien token'}`);
      }
    } catch (err: any) {
      setNeoTestResult(`Test failed: ${err.message}`);
    } finally {
      setIsTestingNeo(false);
    }
  };

  // NeoSapien BLE Connect Handler
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

  const handleDisconnectNeoSapien = () => {
    NeoSapienService.disconnectDevice();
    setNeoConfig(NeoSapienService.getConfig());
  };

  const handleIngestNeoTranscript = async () => {
    if (!neoTranscriptInput.trim()) return;
    try {
      const res = await NeoSapienService.ingestTranscript(neoTranscriptInput, 'webhook_import');
      setNeoIngestResult(`Successfully ingested: Created ${res.tasksCreated} tasks and ${res.notesCreated} notes!`);
      setNeoTranscriptInput('');
    } catch (err: any) {
      setNeoIngestResult(`Ingest failed: ${err.message}`);
    }
  };

  // Save Supabase Config
  const handleSaveSupabase = () => {
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim());
    setTestResult({
      success: true,
      message: 'Supabase configuration saved to local browser storage.',
    });
  };

  const handleTestSupabase = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim());
      const client = getSupabaseClient();
      if (!client) {
        throw new Error('Please enter a valid URL and Anon Key.');
      }
      const { error } = await client.from('tasks').select('id').limit(1);
      if (error && error.code !== 'PGRST116') {
        if (error.message.includes('relation "public.tasks" does not exist')) {
          setTestResult({
            success: true,
            message: 'Connected to Supabase! (Database tables need to be created using the SQL schema button below).',
          });
        } else {
          setTestResult({ success: false, message: error.message });
        }
      } else {
        setTestResult({
          success: true,
          message: 'Connection successful! Cloud backend is reachable.',
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err?.message || 'Connection failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopySchema = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setSchemaCopied(true);
    setTimeout(() => setSchemaCopied(false), 2000);
  };

  // Full Backup Generation
  const handleGenerateBackup = async () => {
    try {
      const [tasks, projects, events, meetings, travel, notes, expenses, contacts, areasData, notifications] =
        await Promise.all([
          db.tasks.toArray(),
          db.projects.toArray(),
          db.events.toArray(),
          db.meetings.toArray(),
          db.travel.toArray(),
          db.notes.toArray(),
          db.expenses.toArray(),
          db.contacts.toArray(),
          db.areas.toArray(),
          db.notifications.toArray(),
        ]);

      const backupObject = {
        version: '2.5.0',
        app: 'Yashwanth Hub OS',
        timestamp: new Date().toISOString(),
        data: {
          tasks,
          projects,
          events,
          meetings,
          travel,
          notes,
          expenses,
          contacts,
          areas: areasData,
          notifications,
        },
      };

      const jsonStr = JSON.stringify(backupObject, null, 2);
      setBackupText(jsonStr);

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yashwanth-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup generation failed:', err);
    }
  };

  const handleCopyBackupText = () => {
    navigator.clipboard.writeText(backupText);
    setCopiedBackup(true);
    setTimeout(() => setCopiedBackup(false), 2000);
  };

  // Restore Backup
  const handleRestore = async () => {
    if (!restoreText.trim()) {
      setRestoreStatus('Please paste your backup JSON text.');
      return;
    }

    try {
      const parsed = JSON.parse(restoreText.trim());
      const data = parsed.data || parsed;

      if (Array.isArray(data.tasks)) await db.tasks.bulkPut(data.tasks);
      if (Array.isArray(data.projects)) await db.projects.bulkPut(data.projects);
      if (Array.isArray(data.events)) await db.events.bulkPut(data.events);
      if (Array.isArray(data.meetings)) await db.meetings.bulkPut(data.meetings);
      if (Array.isArray(data.travel)) await db.travel.bulkPut(data.travel);
      if (Array.isArray(data.notes)) await db.notes.bulkPut(data.notes);
      if (Array.isArray(data.expenses)) await db.expenses.bulkPut(data.expenses);
      if (Array.isArray(data.contacts)) await db.contacts.bulkPut(data.contacts);
      if (Array.isArray(data.areas)) await db.areas.bulkPut(data.areas);

      setRestoreStatus('Backup successfully restored into IndexedDB!');
      setRestoreText('');
    } catch (err: any) {
      setRestoreStatus(`Restore error: ${err.message || 'Invalid JSON backup format'}`);
    }
  };

  // Area Management Handlers
  const openCreateArea = () => {
    setEditingArea(null);
    setFormAreaName('');
    setFormAreaColor('#0b6e6e');
    setFormAreaDesc('');
    setIsAreaModalOpen(true);
  };

  const openEditArea = (area: Area) => {
    setEditingArea(area);
    setFormAreaName(area.name);
    setFormAreaColor(area.color);
    setFormAreaDesc(area.description || '');
    setIsAreaModalOpen(true);
  };

  const handleSaveArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAreaName.trim()) return;

    const now = new Date().toISOString();

    if (editingArea) {
      await db.areas.update(editingArea.id, {
        name: formAreaName.trim(),
        color: formAreaColor,
        description: formAreaDesc.trim() || undefined,
        updated_at: now,
      });
    } else {
      const newArea: Area = {
        id: generateId(),
        name: formAreaName.trim(),
        color: formAreaColor,
        description: formAreaDesc.trim() || undefined,
        created_at: now,
        updated_at: now,
      };
      await db.areas.add(newArea);
    }

    setIsAreaModalOpen(false);
  };

  return (
    <div className="space-y-8 pb-16 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
          System Settings & Integrations
        </h2>
        <p className="text-sm text-[var(--hub-muted)] mt-0.5">
          Configure Google Workspace, NeoSapien hardware, themes, and cloud backup
        </p>
      </div>

      {/* 0. PWA & Multi-Device Installation */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-emerald-500" />
            <span>Install App & Multi-Device Access (PWA)</span>
          </h3>
          <Badge variant={isStandalone ? 'emerald' : 'blue'}>
            {isStandalone ? 'Installed (Standalone App)' : 'Installable PWA'}
          </Badge>
        </div>

        <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
          Yashwanth Hub is engineered as an offline-first Progressive Web App (PWA) with instant Dexie storage and real-time cloud sync. Installing gives you a distraction-free full-screen window, custom home screen icon, instant start-up, and zero app-store friction across your Android phone, Android tablet, and Windows laptop.
        </p>

        {isStandalone ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-none" />
            <span>Running in native standalone app mode on this device. Offline cache and background sync are active.</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <div>
              <span className="font-bold text-xs text-[var(--hub-ink)] block">
                {deferredPrompt ? 'Ready for One-Click Install' : 'Browser Mode Detected'}
              </span>
              <span className="text-[11px] text-[var(--hub-muted)]">
                {deferredPrompt
                  ? 'Click Install to add Yashwanth Hub to your system or home screen directly.'
                  : 'Follow the device-specific instructions below to install via Chrome, Edge, or Safari.'}
              </span>
            </div>
            {deferredPrompt && (
              <button
                onClick={handleInstallApp}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer shadow-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install Yashwanth Hub</span>
              </button>
            )}
          </div>
        )}

        {installStatus && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            {installStatus}
          </p>
        )}

        {/* Multi-Device Installation Guides */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Android */}
          <div className="p-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)]/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--hub-ink)]">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>Android Phone & Tablet</span>
            </div>
            <ol className="text-[11px] text-[var(--hub-muted)] space-y-1 list-decimal list-inside leading-relaxed">
              <li>Open <strong className="text-[var(--hub-ink)]">Chrome</strong> on your Android device.</li>
              <li>Tap the top-right menu icon (<strong className="text-[var(--hub-ink)]">⋮</strong>).</li>
              <li>Tap <strong className="text-[var(--hub-ink)]">Install app</strong> or <strong className="text-[var(--hub-ink)]">Add to Home screen</strong>.</li>
              <li>Launch from your app drawer or home screen anytime.</li>
            </ol>
          </div>

          {/* Windows Desktop & Laptop */}
          <div className="p-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)]/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--hub-ink)]">
              <Laptop className="w-4 h-4 text-blue-600" />
              <span>Windows Laptop & PC</span>
            </div>
            <ol className="text-[11px] text-[var(--hub-muted)] space-y-1 list-decimal list-inside leading-relaxed">
              <li>Open in <strong className="text-[var(--hub-ink)]">Chrome</strong> or <strong className="text-[var(--hub-ink)]">Edge</strong>.</li>
              <li>Click the <strong className="text-[var(--hub-ink)]">Install</strong> icon at the right of the address bar.</li>
              <li>Pin to your Windows Taskbar or Start menu for instant access.</li>
              <li>Runs in its own window without browser tabs.</li>
            </ol>
          </div>

          {/* iOS / iPadOS */}
          <div className="p-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)]/50 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--hub-ink)]">
              <Tablet className="w-4 h-4 text-purple-600" />
              <span>iPhone & iPad (Safari)</span>
            </div>
            <ol className="text-[11px] text-[var(--hub-muted)] space-y-1 list-decimal list-inside leading-relaxed">
              <li>Open the link in <strong className="text-[var(--hub-ink)]">Safari</strong>.</li>
              <li>Tap the <strong className="text-[var(--hub-ink)]">Share</strong> icon (square with arrow up).</li>
              <li>Scroll down and tap <strong className="text-[var(--hub-ink)]">Add to Home Screen</strong>.</li>
              <li>Tap <strong className="text-[var(--hub-ink)]">Add</strong> in the top-right corner.</li>
            </ol>
          </div>
        </div>

        {/* Capacitor native APK note */}
        <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-dashed border-[var(--hub-line)] flex items-center justify-between text-xs text-[var(--hub-muted)]">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-[var(--hub-ink)] flex-none" />
            <span>Need a standalone Android APK? Capacitor package ID <code className="font-mono text-[var(--hub-ink)]">com.yaswanth.hub</code> and compilation instructions are provided in <code className="font-mono text-[var(--hub-ink)]">BUILD.md</code>.</span>
          </div>
        </div>
      </div>

      {/* 1. Google Workspace Integration */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-500" />
            <span>Google Workspace Integration (Calendar, Meet, Drive, Gmail)</span>
          </h3>
          <Badge variant={googleConfig.connected ? 'emerald' : 'gray'}>
            {googleConfig.connected ? 'Connected' : 'Not Connected'}
          </Badge>
        </div>

        <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
          Connect your Google account via official OAuth 2.0 to enable two-way calendar sync, automated Google Meet conference links, Drive document referencing, and Gmail follow-up detection without auto-sending.
        </p>

        <div>
          <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">
            Google OAuth 2.0 Web Client ID
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={googleClientId}
              onChange={(e) => setGoogleClientId(e.target.value)}
              placeholder="123456789-abcdefg.apps.googleusercontent.com"
              className="flex-1 py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)] font-mono"
            />
            <button
              onClick={handleSaveClientId}
              className="px-4 py-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>

        {googleSyncStatus && (
          <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/30 text-xs text-teal-900 dark:text-teal-200">
            {googleSyncStatus}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {!googleConfig.connected ? (
            <>
              <button
                onClick={handleConnectRedirectFallback}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>Use Full-Page Redirect (Recommended)</span>
              </button>

              <button
                onClick={handleConnectGoogle}
                className="px-4 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
              >
                GIS Popup Sign-In
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleSyncGoogleCalendar}
                disabled={isGoogleSyncing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGoogleSyncing ? 'animate-spin' : ''}`} />
                <span>{isGoogleSyncing ? 'Syncing...' : 'Sync Google Calendar Now'}</span>
              </button>

              <button
                onClick={handleDisconnectGoogle}
                className="px-4 py-2 rounded-xl border border-red-500/30 text-red-600 text-xs font-semibold hover:bg-red-500/10 cursor-pointer"
              >
                Disconnect & Revoke
              </button>
            </>
          )}

          <button
            onClick={handleTestGoogleTasks}
            disabled={isTestingGoogle}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-blue-500 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingGoogle ? 'animate-spin text-blue-500' : 'text-blue-500'}`} />
            <span>{isTestingGoogle ? 'Testing...' : 'Test Tasks Connection'}</span>
          </button>
        </div>

        {googleTestResult && (
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-blue-900 dark:text-blue-200">
            {googleTestResult}
          </div>
        )}
      </div>

      {/* 2. NeoSapien Wearable Device Integration */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <Bluetooth className="w-4 h-4 text-purple-600" />
            <span>NeoSapien "Neo 1" Device Integration</span>
          </h3>
          <Badge
            variant={
              neoConfig.status === 'connected'
                ? 'emerald'
                : neoConfig.status === 'error'
                ? 'red'
                : 'gray'
            }
          >
            {neoConfig.status.toUpperCase()}
          </Badge>
        </div>

        <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
          Pair with your NeoSapien Neo 1 pendant via Web Bluetooth LE or ingest ambient meeting audio transcripts to automatically extract action items, founder reminders, and notes.
        </p>

        <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center justify-between text-xs">
          <div>
            <span className="font-bold text-[var(--hub-ink)] block">
              Device: {neoConfig.deviceName || 'No device paired'}
            </span>
            <span className="text-[var(--hub-muted)]">
              Status: {neoConfig.status === 'connected' ? `Connected (Battery: ${neoConfig.batteryLevel ?? 'N/A'}%)` : 'Not currently connected via BLE'}
            </span>
          </div>

          {neoConfig.status === 'connected' ? (
            <button
              onClick={handleDisconnectNeoSapien}
              className="text-xs text-red-600 font-bold hover:underline cursor-pointer"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnectNeoSapienBLE}
              disabled={isScanningBLE}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 text-white font-semibold cursor-pointer hover:bg-purple-700 disabled:opacity-50"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{isScanningBLE ? 'Scanning Bluetooth...' : 'Pair via Bluetooth'}</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleTestNeoSapien}
            disabled={isTestingNeo}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-purple-500 cursor-pointer disabled:opacity-50"
          >
            <Radio className={`w-3.5 h-3.5 ${isTestingNeo ? 'animate-spin text-purple-600' : 'text-purple-600'}`} />
            <span>{isTestingNeo ? 'Testing MCP...' : 'Test NeoSapien MCP Gateway'}</span>
          </button>
        </div>

        {neoTestResult && (
          <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-purple-900 dark:text-purple-200">
            {neoTestResult}
          </div>
        )}

        {/* Ingest Transcript Box */}
        <div className="space-y-2 pt-2 border-t border-[var(--hub-line)]">
          <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider">
            Ingest Ambient Audio / Neo 1 Companion Export
          </label>
          <textarea
            value={neoTranscriptInput}
            onChange={(e) => setNeoTranscriptInput(e.target.value)}
            rows={3}
            placeholder="Paste raw conversation transcript or meeting audio notes here. Jarvis will automatically detect action items and task commitments..."
            className="w-full p-2.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-purple-700 dark:text-purple-300 font-medium">
              {neoIngestResult}
            </span>
            <button
              onClick={handleIngestNeoTranscript}
              className="px-4 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 cursor-pointer"
            >
              Extract Tasks & Notes
            </button>
          </div>
        </div>
      </div>

      {/* 3. Appearance / Theme */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
          <Sun className="w-4 h-4 text-amber-500" />
          <span>Appearance & Theme</span>
        </h3>

        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { id: 'light', label: 'Light Mode', icon: Sun },
              { id: 'dark', label: 'Dark Mode', icon: Moon },
              { id: 'system', label: 'System Match', icon: Monitor },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const isSelected = theme === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTheme(item.id)}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--hub-accent)] text-white border-[var(--hub-accent)] shadow-xs'
                    : 'bg-[var(--hub-bg)] border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-[var(--hub-muted)]'
                }`}
              >
                <Icon className="w-5 h-5 mb-1.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Workspace Areas */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
            Personal Workspaces (Areas)
          </h3>
          <button
            onClick={openCreateArea}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Area</span>
          </button>
        </div>

        <div className="divide-y divide-[var(--hub-line)]">
          {areas.map((area) => (
            <div
              key={area.id}
              className="flex items-center justify-between py-3 hover:bg-[var(--hub-bg)]/40 px-2 rounded-lg transition-colors"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-4 h-4 rounded-full flex-none shadow-xs"
                  style={{ backgroundColor: area.color }}
                />
                <div>
                  <h4 className="text-sm font-bold text-[var(--hub-ink)]">{area.name}</h4>
                  {area.description && (
                    <p className="text-xs text-[var(--hub-muted)]">{area.description}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditArea(area)}
                  className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                  title="Edit area"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setAreaToDelete(area.id)}
                  className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                  title="Delete area"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Full Data Backup & Restore */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          <span>Local Data Backup & Disaster Recovery</span>
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleGenerateBackup}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Complete JSON Backup</span>
          </button>

          {backupText && (
            <button
              onClick={handleCopyBackupText}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
            >
              {copiedBackup ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedBackup ? 'Copied to Clipboard!' : 'Copy Backup Text'}</span>
            </button>
          )}
        </div>

        {backupText && (
          <textarea
            readOnly
            value={backupText}
            rows={4}
            className="w-full p-2.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] font-mono text-[11px] text-[var(--hub-muted)]"
          />
        )}

        <div className="pt-3 border-t border-[var(--hub-line)] space-y-2">
          <h4 className="text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider">
            Restore Backup JSON
          </h4>
          <textarea
            value={restoreText}
            onChange={(e) => setRestoreText(e.target.value)}
            rows={3}
            placeholder="Paste your exported backup JSON text here..."
            className="w-full p-2.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] font-mono text-[11px] text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-teal-700 dark:text-teal-300 font-medium">
              {restoreStatus}
            </span>
            <button
              onClick={handleRestore}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Validate & Restore Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* 6. Supabase Cloud Sync */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-500" />
            <span>Future Cloud Sync (Supabase Backend)</span>
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant={isSupabaseConfigured() ? 'emerald' : 'gray'}>
              {statusMessage || (isSupabaseConfigured() ? 'Cloud Configured' : 'Local Mode')}
            </Badge>
            {queueCount > 0 && (
              <Badge variant="amber">{queueCount} pending sync</Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">
              Supabase Project URL
            </label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)] font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">
              Anon Public API Key
            </label>
            <input
              type="password"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
              className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)] font-mono"
            />
          </div>
        </div>

        {testResult && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/30'
                : 'bg-red-500/10 text-red-800 dark:text-red-200 border border-red-500/30'
            }`}
          >
            {testResult.success ? (
              <CheckCircle2 className="w-4 h-4 flex-none" />
            ) : (
              <AlertTriangle className="w-4 h-4 flex-none" />
            )}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleSaveSupabase}
            className="px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
          >
            Save Credentials
          </button>

          <button
            onClick={handleTestSupabase}
            disabled={isTesting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
            <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
          </button>

          {isSupabaseConfigured() && (
            <button
              onClick={() => syncNow()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
            >
              <Cloud className="w-3.5 h-3.5 text-emerald-600" />
              <span>Sync Now ({status})</span>
            </button>
          )}

          <button
            onClick={() => setIsSchemaModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
          >
            <Code2 className="w-3.5 h-3.5 text-blue-600" />
            <span>View Production SQL Schema</span>
          </button>
        </div>
      </div>

      {/* 7. System Diagnostics */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-purple-500" />
          <span>Local IndexedDB Diagnostics (YashwanthHubDB v2)</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Projects</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{projectCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Tasks</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{taskCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Events</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{eventCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Meetings</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{meetingCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Travel</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{travelCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Notes</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{noteCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Expenses</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{expenseCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Contacts</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{contactCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Documents</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{documentCount}</span>
          </div>
          <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
            <span className="text-[var(--hub-muted)] block">Notifications</span>
            <span className="font-bold text-sm text-[var(--hub-ink)]">{notificationCount}</span>
          </div>
        </div>
      </div>

      {/* Area Modal */}
      <Modal
        isOpen={isAreaModalOpen}
        onClose={() => setIsAreaModalOpen(false)}
        title={editingArea ? 'Edit Workspace Area' : 'Create Workspace Area'}
      >
        <form onSubmit={handleSaveArea} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Area Name *
            </label>
            <input
              type="text"
              value={formAreaName}
              onChange={(e) => setFormAreaName(e.target.value)}
              placeholder="e.g. Aerodynamic Blades R&D"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Badge Color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={formAreaColor}
                onChange={(e) => setFormAreaColor(e.target.value)}
                className="w-10 h-10 p-0 rounded-lg border border-[var(--hub-line)] cursor-pointer"
              />
              <input
                type="text"
                value={formAreaColor}
                onChange={(e) => setFormAreaColor(e.target.value)}
                className="w-32 px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)] font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              value={formAreaDesc}
              onChange={(e) => setFormAreaDesc(e.target.value)}
              rows={2}
              placeholder="Purpose or scope of this workspace..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--hub-line)]">
            <button
              type="button"
              onClick={() => setIsAreaModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-accent)] text-white hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
            >
              {editingArea ? 'Save Changes' : 'Create Area'}
            </button>
          </div>
        </form>
      </Modal>

      {/* SQL Schema Modal */}
      <Modal
        isOpen={isSchemaModalOpen}
        onClose={() => setIsSchemaModalOpen(false)}
        title="Supabase Production SQL Schema"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--hub-muted)]">
            Copy and run this SQL script in your Supabase SQL Editor. It creates all tables with PostgreSQL Row Level Security (RLS) guaranteeing private per-user data isolation.
          </p>

          <pre className="p-3.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] font-mono text-[11px] text-[var(--hub-ink)] overflow-x-auto max-h-96">
            {SUPABASE_SCHEMA_SQL}
          </pre>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--hub-line)]">
            <button
              onClick={handleCopySchema}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold cursor-pointer"
            >
              {schemaCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{schemaCopied ? 'Copied to Clipboard!' : 'Copy SQL Schema'}</span>
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(areaToDelete)}
        onClose={() => setAreaToDelete(null)}
        onConfirm={async () => {
          if (areaToDelete) {
            await db.areas.delete(areaToDelete);
            setAreaToDelete(null);
          }
        }}
        title="Delete Workspace Area"
        message="Are you sure you want to delete this workspace area?"
      />
    </div>
  );
};
