import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
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
import { QuickCaptureModal } from './components/common/QuickCaptureModal';
import { PageErrorBoundary } from './components/common/PageErrorBoundary';
import { repairTaskDueDates } from './services/sync/dueDateRepair';
import { installLifeSyncHooks, startLifeSync } from './services/sync/lifeSync';
import { PageSkeleton } from './components/common/PageSkeleton';
import { TAB_TITLES, buildTabUrl, canonicalTab, documentTitleFor, readTabFromSearch } from './lib/navigation';
import { Toaster } from './components/common/Toaster';
import { AmbientBackground } from './components/layout/AmbientBackground';

// Pages are code-split: each one downloads only when first opened (or prefetched while idle).
const pageLoaders = {
  DashboardPage: () => import('./pages/DashboardPage'),
  ProjectsPage: () => import('./pages/ProjectsPage'),
  TasksPage: () => import('./pages/TasksPage'),
  CalendarPage: () => import('./pages/CalendarPage'),
  MeetingsPage: () => import('./pages/MeetingsPage'),
  TravelPage: () => import('./pages/TravelPage'),
  NotesPage: () => import('./pages/NotesPage'),
  FilesAndPhotosPage: () => import('./pages/FilesAndPhotosPage'),
  GmailPage: () => import('./pages/GmailPage'),
  IntegrationsPage: () => import('./pages/IntegrationsPage'),
  SystemHealthSyncCenterPage: () => import('./pages/SystemHealthSyncCenterPage'),
  ContactsPage: () => import('./pages/ContactsPage'),
  AIAssistantPage: () => import('./pages/AIAssistantPage'),
  NotificationsPage: () => import('./pages/NotificationsPage'),
  AnalyticsPage: () => import('./pages/AnalyticsPage'),
  AutomationsPage: () => import('./pages/AutomationsPage'),
  SettingsPage: () => import('./pages/SettingsPage'),
  StartupCommandPage: () => import('./pages/StartupCommandPage'),
  RoboticsLabPage: () => import('./pages/RoboticsLabPage'),
  FinancePage: () => import('./pages/FinancePage'),
  HealthRoutinePage: () => import('./pages/HealthRoutinePage'),
  KnowledgeMemoryPage: () => import('./pages/KnowledgeMemoryPage'),
  MyDayPage: () => import('./pages/MyDayPage'),
  LearningCareerPage: () => import('./pages/LearningCareerPage'),
  GoalsHabitsPage: () => import('./pages/GoalsHabitsPage'),
  FocusPage: () => import('./pages/FocusPage'),
  MomentumPage: () => import('./pages/MomentumPage'),
};

const DashboardPage = lazy(() => pageLoaders.DashboardPage().then((m) => ({ default: m.DashboardPage })));
const ProjectsPage = lazy(() => pageLoaders.ProjectsPage().then((m) => ({ default: m.ProjectsPage })));
const TasksPage = lazy(() => pageLoaders.TasksPage().then((m) => ({ default: m.TasksPage })));
const CalendarPage = lazy(() => pageLoaders.CalendarPage().then((m) => ({ default: m.CalendarPage })));
const MeetingsPage = lazy(() => pageLoaders.MeetingsPage().then((m) => ({ default: m.MeetingsPage })));
const TravelPage = lazy(() => pageLoaders.TravelPage().then((m) => ({ default: m.TravelPage })));
const NotesPage = lazy(() => pageLoaders.NotesPage().then((m) => ({ default: m.NotesPage })));
const FilesAndPhotosPage = lazy(() => pageLoaders.FilesAndPhotosPage().then((m) => ({ default: m.FilesAndPhotosPage })));
const GmailPage = lazy(() => pageLoaders.GmailPage().then((m) => ({ default: m.GmailPage })));
const IntegrationsPage = lazy(() => pageLoaders.IntegrationsPage().then((m) => ({ default: m.IntegrationsPage })));
const SystemHealthSyncCenterPage = lazy(() => pageLoaders.SystemHealthSyncCenterPage().then((m) => ({ default: m.SystemHealthSyncCenterPage })));
const ContactsPage = lazy(() => pageLoaders.ContactsPage().then((m) => ({ default: m.ContactsPage })));
const AIAssistantPage = lazy(() => pageLoaders.AIAssistantPage().then((m) => ({ default: m.AIAssistantPage })));
const NotificationsPage = lazy(() => pageLoaders.NotificationsPage().then((m) => ({ default: m.NotificationsPage })));
const AnalyticsPage = lazy(() => pageLoaders.AnalyticsPage().then((m) => ({ default: m.AnalyticsPage })));
const AutomationsPage = lazy(() => pageLoaders.AutomationsPage().then((m) => ({ default: m.AutomationsPage })));
const SettingsPage = lazy(() => pageLoaders.SettingsPage().then((m) => ({ default: m.SettingsPage })));
const StartupCommandPage = lazy(() => pageLoaders.StartupCommandPage().then((m) => ({ default: m.StartupCommandPage })));
const RoboticsLabPage = lazy(() => pageLoaders.RoboticsLabPage().then((m) => ({ default: m.RoboticsLabPage })));
const FinancePage = lazy(() => pageLoaders.FinancePage().then((m) => ({ default: m.FinancePage })));
const HealthRoutinePage = lazy(() => pageLoaders.HealthRoutinePage().then((m) => ({ default: m.HealthRoutinePage })));
const KnowledgeMemoryPage = lazy(() => pageLoaders.KnowledgeMemoryPage().then((m) => ({ default: m.KnowledgeMemoryPage })));
const MyDayPage = lazy(() => pageLoaders.MyDayPage().then((m) => ({ default: m.MyDayPage })));
const LearningCareerPage = lazy(() => pageLoaders.LearningCareerPage().then((m) => ({ default: m.LearningCareerPage })));
const GoalsHabitsPage = lazy(() => pageLoaders.GoalsHabitsPage().then((m) => ({ default: m.GoalsHabitsPage })));
const FocusPage = lazy(() => pageLoaders.FocusPage().then((m) => ({ default: m.FocusPage })));
const MomentumPage = lazy(() => pageLoaders.MomentumPage().then((m) => ({ default: m.MomentumPage })));

function HubMain() {
  const { isDark } = useTheme();
  // The active tab lives in the URL (?tab=...), so refresh, Back/Forward and shared links all work.
  const [currentTab, setCurrentTabRaw] = useState<NavigationTab>(
    () => (typeof window !== 'undefined' && readTabFromSearch(window.location.search)) || 'dashboard'
  );
  // Duplicate routes (e.g. 'wind-plan') always resolve to their canonical tab.
  const setCurrentTab = useCallback((tab: NavigationTab) => setCurrentTabRaw(canonicalTab(tab)), []);
  const [currentArea, setCurrentArea] = useState<string>('All');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  // URL writes wait until OAuth / deep-link callback params have been read, so they're never clobbered.
  const [isRoutingReady, setIsRoutingReady] = useState(false);
  const [oauthError, setOauthError] = useState<{ message: string; hint?: string } | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const hasNavigatedRef = useRef(false);
  const hasSyncedUrlRef = useRef(false);

  // Mirror the active tab into the URL and browser history.
  useEffect(() => {
    if (!isRoutingReady) return;
    const { pathname, search } = window.location;
    const params = new URLSearchParams(search);
    params.delete('tab');
    // Another flow (e.g. a NeoSapien OAuth callback) still owns the query string — leave it alone.
    if ([...params.keys()].length > 0) return;
    // Compare the raw value so an unknown ?tab=... (which fell back to Home) is cleaned up too.
    const urlTab = new URLSearchParams(search).get('tab');
    const expectedTab = currentTab === 'dashboard' ? null : currentTab;
    if (urlTab !== expectedTab) {
      const url = buildTabUrl(currentTab, pathname);
      // The first sync (e.g. landing on Integrations after an OAuth redirect) replaces rather than adds an entry.
      if (hasSyncedUrlRef.current) window.history.pushState({ tab: currentTab }, '', url);
      else window.history.replaceState({ tab: currentTab }, '', url);
    }
    hasSyncedUrlRef.current = true;
  }, [currentTab, isRoutingReady]);

  // Browser Back / Forward.
  useEffect(() => {
    const onPopState = () => setCurrentTabRaw(readTabFromSearch(window.location.search) || 'dashboard');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Per-page document title, scroll reset and focus hand-off for keyboard / screen-reader users.
  useEffect(() => {
    document.title = documentTitleFor(currentTab);
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      return;
    }
    window.scrollTo({ top: 0 });
    mainRef.current?.focus({ preventScroll: true });
  }, [currentTab]);

  // Warm the most-used pages in the background once the app is idle, so first visits are instant.
  useEffect(() => {
    if (!isRoutingReady) return;
    const warm = () => {
      [pageLoaders.TasksPage, pageLoaders.CalendarPage, pageLoaders.ProjectsPage, pageLoaders.AIAssistantPage, pageLoaders.DashboardPage]
        .forEach((load) => load().catch(() => {}));
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(warm, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(id);
  }, [isRoutingReady]);

  // Initialize IndexedDB, Supabase Auth Session, Fleet Identity, Realtime and Reminder Engine
  useEffect(() => {
    let lastAuthUserId: string | null = null;
    let authInitialized = false;

    CapacitorService.init().catch(() => {});
    CapacitorService.setOAuthCallbackHandler(() => {
      setCurrentTabRaw('integrations');
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

    const initApp = async () => {
      // Queue goals/habits/plans/focus writes for the cloud from the very first write.
      installLifeSyncHooks();
      await initializeDatabase();
      setIsDbReady(true);

      const authState = await SupabaseAuthService.init().catch(() => SupabaseAuthService.getState());
      lastAuthUserId = authState.user?.id ?? null;
      authInitialized = true;

      DeviceFleetService.registerCurrentDevice().catch(() => {});
      RealtimeSyncManager.init();
      ReminderEngine.runIntelligenceScan().catch(() => {});
      repairTaskDueDates().catch(() => {});
      startLifeSync();
      IntegrationVaultService.initSessionRestoration().catch(() => {});

      // Parse URL callbacks & navigation deep links AFTER session hydration
      const hash = window.location.hash;
      const search = window.location.search;
      const searchParams = new URLSearchParams(search);
      const hashParams = new URLSearchParams(hash.replace(/^#/, ''));

      const requestedTab = readTabFromSearch(search);
      if (requestedTab) {
        setCurrentTabRaw(requestedTab);
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
        setCurrentTabRaw('integrations');
        window.history.replaceState(null, '', window.location.pathname);
      } else if (searchParams.get('google_connected') === 'true') {
        await IntegrationVaultService.initSessionRestoration(true);
        setCurrentTabRaw('integrations');
        window.history.replaceState(null, '', window.location.pathname);
      } else if (searchParams.has('code') && !searchParams.has('neo_code') && hasGooglePkceContext) {
        const parsed = GoogleAuthService.parseOAuthCallback(
          search,
          typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('yash_google_oauth_state') : null
        );
        if (parsed.success && parsed.flow === 'code' && parsed.code) {
          const ex = await GoogleAuthService.exchangeAuthorizationCode(parsed.code, parsed.state);
          if (!ex.success) {
            setOauthError({
              message: ex.error || 'Failed to exchange Google authorization code.',
              hint: ex.hint,
            });
          } else {
            IntegrationVaultService.initSessionRestoration(true).catch(() => {});
          }
          setCurrentTabRaw('integrations');
        } else {
          setOauthError({
            message: parsed.errorMessage || 'Google OAuth code callback invalid.',
            hint: parsed.resolutionHint,
          });
          setCurrentTabRaw('integrations');
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
          const profile = await GoogleAuthService.fetchUserProfile(res.token);
          if (profile) {
            GoogleAuthService.saveConfig({
              ...GoogleAuthService.getConfig(),
              email: profile.email,
              name: profile.name,
              picture: profile.picture,
            });
          }
          await GoogleAuthService.syncTokenToServer(res.token, expiresAt, profile?.email).catch(() => {});
          setCurrentTabRaw('integrations');
        } else if (!res.success && res.error) {
          setOauthError({
            message: res.errorMessage || 'Google OAuth Error',
            hint: res.resolutionHint,
          });
          setCurrentTabRaw('integrations');
        }
        window.history.replaceState(null, '', window.location.pathname);
      } else if (searchParams.has('neo_code')) {
        setCurrentTabRaw('integrations');
      }
    };
    initApp()
      .catch((err) => console.error('[App] initialization failed:', err))
      .finally(() => {
        setIsDbReady(true);
        setIsRoutingReady(true);
      });

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
      navigateTab: (tab) => setCurrentTabRaw(canonicalTab(tab as NavigationTab)),
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
            onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
            onSelectArea={setCurrentArea}
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
      case 'goals':
        return <GoalsHabitsPage currentArea={currentArea} areas={areas} />;
      case 'focus':
        return <FocusPage />;
      case 'momentum':
        return <MomentumPage onNavigate={(tab) => setCurrentTab(tab)} />;
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
        return <FilesAndPhotosPage currentArea={currentArea} areas={areas} />;
      case 'gmail':
        return <GmailPage onNavigateToTasks={() => setCurrentTab('tasks')} />;
      case 'finance':
        return <FinancePage currentArea={currentArea} areas={areas} />;
      case 'contacts':
        return <ContactsPage currentArea={currentArea} areas={areas} />;
      case 'startup-command':
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
            onNavigateToNeoMemory={() => setCurrentTab('knowledge-memory')}
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
            onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
            onSelectArea={setCurrentArea}
          />
        );
    }
  };

  const isHome = currentTab === 'dashboard';

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        isHome ? 'jarvis-hud text-[#E6F1FF]' : 'text-[var(--hub-ink)]'
      }`}
    >
      {!isHome && <AmbientBackground />}
      <a href="#main-content" className="hub-skip-link">
        Skip to content
      </a>
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
        hudMode={isHome}
      />

      {/* Main Container */}
      <div className={`flex-1 flex w-full ${isHome ? 'relative' : 'max-w-7xl mx-auto'}`}>
        {/* Navigation Sidebar (64px glass icon rail on Home; full sidebar on other tabs) */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          openTasksCount={openTasksCount}
          activeProjectsCount={activeProjectsCount}
          unreadNotifsCount={unreadNotifs.length}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          compactRail={isHome}
        />

        {/* Dynamic Page Content */}
        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          aria-label={TAB_TITLES[currentTab]}
          className={`flex-1 min-w-0 overflow-x-hidden focus:outline-none ${
            isHome
              ? 'relative flex flex-col p-2.5 sm:p-4 pb-20 lg:pb-3'
              : 'p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8 safe-area-content-pb'
          }`}
        >
          {!isDbReady ? (
            <PageSkeleton label="Booting Jarvis Personal AI Operating System" />
          ) : (
            <PageErrorBoundary
              resetKey={currentTab}
              pageName={TAB_TITLES[currentTab]}
              onGoHome={() => setCurrentTab('dashboard')}
            >
              <Suspense fallback={<PageSkeleton label={`Loading ${TAB_TITLES[currentTab]}`} />}>
                <div key={currentTab} className="hub-page-enter">
                  {renderActiveTab()}
                </div>
              </Suspense>
            </PageErrorBoundary>
          )}
        </main>
      </div>

      {/* Mobile Bottom Quick-Access Bar */}
      <MobileNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenMore={() => setIsMobileMenuOpen(true)}
        onOpenQuickCapture={() => setIsQuickCaptureOpen(true)}
      />

      {/* App-wide non-blocking messages (replaces alert()) */}
      <Toaster />

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
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300">
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
                <code className="text-teal-700 dark:text-teal-300 font-mono px-1 py-0.5 rounded bg-black/20">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app'}
                </code>
              </p>
              <p className="text-[var(--hub-muted)]">
                PKCE SPA Redirect URI:{' '}
                <code className="text-teal-700 dark:text-teal-300 font-mono px-1 py-0.5 rounded bg-black/20">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app'}
                </code>
              </p>
              <p className="text-[var(--hub-muted)]">
                Server Callback URI:{' '}
                <code className="text-teal-700 dark:text-teal-300 font-mono px-1 py-0.5 rounded bg-black/20">
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
                className="px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
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
