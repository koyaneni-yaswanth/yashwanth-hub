import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabase } from './db';
import type { NavigationTab } from './types';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SyncProvider } from './context/SyncContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { CommandPalette } from './components/common/CommandPalette';
import { Modal } from './components/common/Modal';
import { AlertTriangle } from 'lucide-react';
import { ReminderEngine } from './services/reminderEngine';
import { GoogleAuthService } from './services/google/googleAuthService';
import { DeviceFleetService } from './services/deviceFleetService';
import { RealtimeSyncManager } from './services/sync/realtimeSyncManager';
import { CapacitorService } from './services/native/capacitorService';
import { IntegrationVaultService } from './services/integrationVaultService';
import { SupabaseAuthService } from './services/auth/supabaseAuthService';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { CalendarPage } from './pages/CalendarPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { TravelPage } from './pages/TravelPage';
import { NotesPage } from './pages/NotesPage';
import { FilesAndPhotosPage } from './pages/FilesAndPhotosPage';
import { GmailPage } from './pages/GmailPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { NeoMemoryCenterPage } from './pages/NeoMemoryCenterPage';
import { SystemHealthSyncCenterPage } from './pages/SystemHealthSyncCenterPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ContactsPage } from './pages/ContactsPage';
import { WindPlanPage } from './pages/WindPlanPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StartupCommandPage } from './pages/StartupCommandPage';
import { RoboticsLabPage } from './pages/RoboticsLabPage';
import { FinancePage } from './pages/FinancePage';
import { HealthRoutinePage } from './pages/HealthRoutinePage';
import { KnowledgeMemoryPage } from './pages/KnowledgeMemoryPage';
import { MyDayPage } from './pages/MyDayPage';
import { LearningCareerPage } from './pages/LearningCareerPage';
import { QuickCaptureModal } from './components/common/QuickCaptureModal';

function HubMain() {
  const { isDark } = useTheme();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [currentArea, setCurrentArea] = useState<string>('All');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [oauthError, setOauthError] = useState<{ message: string; hint?: string } | null>(null);

  // Initialize IndexedDB, Supabase Auth Session, Fleet Identity, Realtime and Reminder Engine
  useEffect(() => {
    let lastAuthUserId: string | null = null;
    let authInitialized = false;

    CapacitorService.init().catch(() => {});
    CapacitorService.setOAuthCallbackHandler(() => {
      setCurrentTab('integrations');
    });

    const unsubscribeAuth = SupabaseAuthService.subscribe((authState) => {
      if (authState.loading) return;
      const nextUserId = authState.user?.id ?? null;
      if (authInitialized && nextUserId !== lastAuthUserId) {
        if (nextUserId) {
          IntegrationVaultService.initSessionRestoration(true).catch(() => {});
        } else {
          IntegrationVaultService.reset();
        }
      }
      lastAuthUserId = nextUserId;
    });

    const boot = async () => {
      await initializeDatabase();
      setIsDbReady(true);

      const authState = await SupabaseAuthService.init().catch(() => SupabaseAuthService.getState());
      lastAuthUserId = authState.user?.id ?? null;
      authInitialized = true;

      DeviceFleetService.registerCurrentDevice().catch(() => {});
      RealtimeSyncManager.init();
      ReminderEngine.runIntelligenceScan().catch(() => {});
      IntegrationVaultService.initSessionRestoration().catch(() => {});
    };
    boot();

    // Parse URL callbacks & navigation deep links
    const hash = window.location.hash;
    const search = window.location.search;
    const searchParams = new URLSearchParams(search);
    const hashParams = new URLSearchParams(hash.replace(/^#/, ''));

    const requestedTab = searchParams.get('tab') as NavigationTab | null;
    if (requestedTab) {
      setCurrentTab(requestedTab);
    }

    const googleServerErr = searchParams.get('google_error');
    const googleServerDesc = searchParams.get('google_error_desc');
    const hasGooglePkceContext =
      (typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('yash_google_pkce_verifier'))) ||
      (searchParams.get('state') || '').startsWith('g_');
    const isGoogleImplicitHash =
      hashParams.has('access_token') && !hashParams.has('refresh_token') && !hashParams.has('provider_token');

    if (googleServerErr) {
      const parsedErr = GoogleAuthService.parseOAuthCallback(`error=${encodeURIComponent(googleServerErr)}`);
      setOauthError({
        message: googleServerDesc || parsedErr.errorMessage || `Google OAuth error: ${googleServerErr}`,
        hint: parsedErr.resolutionHint,
      });
      setCurrentTab('integrations');
      window.history.replaceState(null, '', window.location.pathname);
    } else if (searchParams.get('google_connected') === 'true') {
      IntegrationVaultService.initSessionRestoration(true).then(() => {
        setCurrentTab('integrations');
      });
      window.history.replaceState(null, '', window.location.pathname);
    } else if (searchParams.has('code') && !searchParams.has('neo_code') && hasGooglePkceContext) {
      const parsed = GoogleAuthService.parseOAuthCallback(
        search,
        typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('yash_google_oauth_state') : null
      );
      if (parsed.success && parsed.flow === 'code' && parsed.code) {
        GoogleAuthService.exchangeAuthorizationCode(parsed.code, parsed.state).then((ex) => {
          if (!ex.success) {
            setOauthError({
              message: ex.error || 'Failed to exchange Google authorization code.',
              hint: ex.hint,
            });
          } else {
            IntegrationVaultService.initSessionRestoration(true).catch(() => {});
          }
          setCurrentTab('integrations');
        });
      } else {
        setOauthError({
          message: parsed.errorMessage || 'Google OAuth code callback invalid.',
          hint: parsed.resolutionHint,
        });
        setCurrentTab('integrations');
      }
      window.history.replaceState(null, '', window.location.pathname);
    } else if (isGoogleImplicitHash || hashParams.has('error') || (searchParams.has('error') && hasGooglePkceContext)) {
      const rawStr = isGoogleImplicitHash || hashParams.has('error') ? hash : search;
      const res = GoogleAuthService.parseOAuthCallback(rawStr);

      if (res.success && res.token) {
        const expiresIn = res.expiresIn || 3600;
        const expiresAt = Date.now() + expiresIn * 1000;
        const config = GoogleAuthService.getConfig();
        GoogleAuthService.saveConfig({
          ...config,
          connected: true,
          accessToken: res.token,
          expiresAt,
          calendarSyncEnabled: true,
          driveSyncEnabled: true,
          gmailSyncEnabled: true,
        });
        GoogleAuthService.fetchUserProfile(res.token).then((profile) => {
          if (profile) {
            GoogleAuthService.saveConfig({
              ...GoogleAuthService.getConfig(),
              email: profile.email,
              name: profile.name,
              picture: profile.picture,
            });
          }
          GoogleAuthService.syncTokenToServer(res.token!, expiresAt, profile?.email).catch(() => {});
        });
        setCurrentTab('integrations');
      } else if (!res.success && res.error) {
        setOauthError({
          message: res.errorMessage || 'Google OAuth Error',
          hint: res.resolutionHint,
        });
        setCurrentTab('integrations');
      }
      window.history.replaceState(null, '', window.location.pathname);
    } else if (searchParams.has('neo_code')) {
      setCurrentTab('integrations');
    } else if (requestedTab) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    // Global Keyboard Shortcuts (Ctrl+K for Command Palette, Ctrl+Q for Quick Capture)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        setIsQuickCaptureOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Sync status bar color and style with theme
  useEffect(() => {
    CapacitorService.updateStatusBar(isDark).catch(() => {});
  }, [isDark]);

  // Update hardware & gesture back button context for modal and navigation hierarchy
  useEffect(() => {
    CapacitorService.setBackButtonContext({
      isCommandPaletteOpen,
      closeCommandPalette: () => setIsCommandPaletteOpen(false),
      isMobileMenuOpen,
      closeMobileMenu: () => setIsMobileMenuOpen(false),
      isModalOpen: Boolean(oauthError) || isQuickCaptureOpen,
      closeModal: () => {
        setOauthError(null);
        setIsQuickCaptureOpen(false);
      },
      currentTab,
      navigateTab: (tab) => setCurrentTab(tab as NavigationTab),
    });
  }, [isCommandPaletteOpen, isMobileMenuOpen, oauthError, isQuickCaptureOpen, currentTab]);

  // Live queries
  const areas = useLiveQuery(() => db.areas.toArray(), []) || [];
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const unreadNotifs = useLiveQuery(
    () => db.notifications.filter((n) => !n.read).toArray(),
    []
  ) || [];

  const openTasksCount = allTasks.filter((t) => !t.done).length;
  const activeProjectsCount = allProjects.filter((p) => p.status === 'active').length;

  // Calculate wind turbine speed: 12s down to 1.5s
  const planTasks = allTasks.filter((t) => t.plan !== undefined);
  const planDone = planTasks.filter((t) => t.done).length;
  const planPct = planTasks.length > 0 ? planDone / planTasks.length : 0;
  const turbineDuration = 12 - 10.5 * planPct;

  const renderActiveTab = () => {
    switch (currentTab) {
      case 'dashboard':
        return (
          <DashboardPage
            currentArea={currentArea}
            areas={areas}
            onNavigate={(tab) => setCurrentTab(tab)}
          />
        );
      case 'my-day':
        return (
          <MyDayPage
            onNavigate={(tab) => setCurrentTab(tab)}
            areas={areas}
          />
        );
      case 'projects':
        return (
          <ProjectsPage
            currentArea={currentArea}
            areas={areas}
            onNavigateToTasks={() => setCurrentTab('tasks')}
            onNavigateToAI={() => setCurrentTab('ai-assistant')}
          />
        );
      case 'learning-career':
        return <LearningCareerPage />;
      case 'tasks':
        return <TasksPage currentArea={currentArea} areas={areas} />;
      case 'calendar':
        return <CalendarPage currentArea={currentArea} areas={areas} />;
      case 'meetings':
        return <MeetingsPage currentArea={currentArea} areas={areas} />;
      case 'travel':
        return <TravelPage currentArea={currentArea} areas={areas} />;
      case 'notes':
        return <NotesPage currentArea={currentArea} areas={areas} />;
      case 'documents':
      case 'files':
        return <FilesAndPhotosPage currentArea={currentArea} areas={areas} />;
      case 'gmail':
        return <GmailPage onNavigateToTasks={() => setCurrentTab('tasks')} />;
      case 'finance':
      case 'expenses':
        return <FinancePage currentArea={currentArea} areas={areas} />;
      case 'contacts':
        return <ContactsPage currentArea={currentArea} areas={areas} />;
      case 'startup-command':
      case 'wind-plan':
        return <StartupCommandPage />;
      case 'robotics-lab':
        return <RoboticsLabPage />;
      case 'health-routine':
        return <HealthRoutinePage />;
      case 'ai-assistant':
        return (
          <AIAssistantPage
            currentArea={currentArea}
            areas={areas}
            onNavigate={(tab) => setCurrentTab(tab)}
          />
        );
      case 'knowledge-memory':
      case 'neo-memory':
        return (
          <KnowledgeMemoryPage
            currentArea={currentArea}
            areas={areas}
            onNavigateToTasks={() => setCurrentTab('tasks')}
            onNavigateToCalendar={() => setCurrentTab('calendar')}
            onNavigateToAI={() => setCurrentTab('ai-assistant')}
          />
        );
      case 'integrations':
        return <IntegrationsPage />;
      case 'system-health':
        return (
          <SystemHealthSyncCenterPage
            onNavigateToIntegrations={() => setCurrentTab('integrations')}
            onNavigateToNeoMemory={() => setCurrentTab('neo-memory')}
          />
        );
      case 'notifications':
        return <NotificationsPage onNavigate={(tab) => setCurrentTab(tab)} />;
      case 'analytics':
        return (
          <AnalyticsPage
            currentArea={currentArea}
            areas={areas}
            onNavigate={(tab) => setCurrentTab(tab)}
          />
        );
      case 'automations':
        return <AutomationsPage />;
      case 'settings':
        return <SettingsPage areas={areas} />;
      default:
        return (
          <DashboardPage
            currentArea={currentArea}
            areas={areas}
            onNavigate={(tab) => setCurrentTab(tab)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[var(--hub-bg)] text-[var(--hub-ink)] flex flex-col font-sans transition-colors duration-200">
      {/* Top Header */}
      <Header
        currentArea={currentArea}
        onAreaChange={setCurrentArea}
        areas={areas}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
        onNavigate={(tab) => setCurrentTab(tab)}
        turbineDuration={turbineDuration}
      />

      {/* Main Container */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          openTasksCount={openTasksCount}
          activeProjectsCount={activeProjectsCount}
          unreadNotifsCount={unreadNotifs.length}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />

        {/* Dynamic Page Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-x-hidden pb-24 lg:pb-8 safe-area-content-pb">
          {!isDbReady ? (
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="text-center space-y-3">
                <div className="w-8 h-8 border-3 border-[var(--hub-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold text-[var(--hub-muted)]">
                  Booting Jarvis Personal AI Operating System...
                </p>
              </div>
            </div>
          ) : (
            renderActiveTab()
          )}
        </main>
      </div>

      {/* Mobile Bottom Quick-Access Bar */}
      <MobileNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenMore={() => setIsMobileMenuOpen(true)}
      />

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(tab) => setCurrentTab(tab)}
        onSelectArea={(area) => setCurrentArea(area)}
        areas={areas}
      />

      {/* Universal Quick Capture Modal (Ctrl+Q) */}
      <QuickCaptureModal
        isOpen={isQuickCaptureOpen}
        onClose={() => setIsQuickCaptureOpen(false)}
        areas={areas}
      />

      {/* OAuth Diagnostic Error Modal */}
      {oauthError && (
        <Modal
          isOpen={!!oauthError}
          onClose={() => setOauthError(null)}
          title="Google OAuth Diagnostics"
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">{oauthError.message}</h4>
                {oauthError.hint && (
                  <p className="text-xs text-[var(--hub-muted)] mt-1.5 leading-relaxed">
                    {oauthError.hint}
                  </p>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs space-y-2">
              <div className="font-bold text-[var(--hub-ink)]">Expected Google Cloud Console URIs:</div>
              <p className="text-[var(--hub-muted)]">
                Authorized JavaScript Origin:{' '}
                <code className="text-teal-400 font-mono px-1 py-0.5 rounded bg-black/20">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app'}
                </code>
              </p>
              <p className="text-[var(--hub-muted)]">
                PKCE SPA Redirect URI:{' '}
                <code className="text-teal-400 font-mono px-1 py-0.5 rounded bg-black/20">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app'}
                </code>
              </p>
              <p className="text-[var(--hub-muted)]">
                Server Callback URI:{' '}
                <code className="text-teal-400 font-mono px-1 py-0.5 rounded bg-black/20">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/auth/google/callback` : 'https://yashwanth-hub.vercel.app/api/auth/google/callback'}
                </code>
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setOauthError(null);
                  setCurrentTab('integrations');
                }}
                className="px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
              >
                Open Integrations Settings
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SyncProvider>
        <HubMain />
      </SyncProvider>
    </ThemeProvider>
  );
}
