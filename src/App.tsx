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
import { SettingsPage } from './pages/SettingsPage';

function HubMain() {
  const { isDark } = useTheme();
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [currentArea, setCurrentArea] = useState<string>('All');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);
  const [oauthError, setOauthError] = useState<{ message: string; hint?: string } | null>(null);

  // Initialize IndexedDB, Fleet Identity, Realtime and Reminder Engine
  useEffect(() => {
    // Initialize native Capacitor integrations
    CapacitorService.init().catch(() => {});
    CapacitorService.setOAuthCallbackHandler(() => {
      setCurrentTab('integrations');
    });

    initializeDatabase().then(() => {
      setIsDbReady(true);
      // Register current device in fleet and start heartbeat
      DeviceFleetService.registerCurrentDevice().catch(() => {});
      // Initialize universal Realtime subscriptions
      RealtimeSyncManager.init();
      // Run initial intelligence reminder check
      ReminderEngine.runIntelligenceScan().catch(() => {});
    });

    // Check for Google OAuth Token or Error in URL hash or search parameters
    const hash = window.location.hash;
    const search = window.location.search;
    if (hash.includes('access_token=') || hash.includes('error=') || search.includes('error=')) {
      const rawStr = hash.includes('access_token=') || hash.includes('error=') ? hash : search;
      const res = GoogleAuthService.parseOAuthCallback(rawStr);

      if (res.success && res.token) {
        const expiresAt = Date.now() + (res.expiresIn || 3600) * 1000;
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
    } else if (search.includes('neo_code=')) {
      setCurrentTab('integrations');
    }

    // Global Command Palette Shortcut (Ctrl+K or Cmd+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
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
      isModalOpen: Boolean(oauthError),
      closeModal: () => setOauthError(null),
      currentTab,
      navigateTab: (tab) => setCurrentTab(tab as NavigationTab),
    });
  }, [isCommandPaletteOpen, isMobileMenuOpen, oauthError, currentTab]);

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
      case 'projects':
        return (
          <ProjectsPage
            currentArea={currentArea}
            areas={areas}
            onNavigateToTasks={() => setCurrentTab('tasks')}
          />
        );
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
      case 'expenses':
        return <ExpensesPage currentArea={currentArea} areas={areas} />;
      case 'contacts':
        return <ContactsPage currentArea={currentArea} areas={areas} />;
      case 'wind-plan':
        return <WindPlanPage />;
      case 'ai-assistant':
        return (
          <AIAssistantPage
            currentArea={currentArea}
            areas={areas}
            onNavigate={(tab) => setCurrentTab(tab)}
          />
        );
      case 'neo-memory':
        return (
          <NeoMemoryCenterPage
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
              <div className="font-bold text-[var(--hub-ink)]">Current Registered Origins:</div>
              <p className="text-[var(--hub-muted)]">
                Authorized JavaScript Origin:{' '}
                <code className="text-teal-400 font-mono px-1 py-0.5 rounded bg-black/20">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app'}
                </code>
              </p>
              <p className="text-[var(--hub-muted)]">
                Authorized Redirect URI:{' '}
                <code className="text-teal-400 font-mono px-1 py-0.5 rounded bg-black/20">
                  {typeof window !== 'undefined' ? window.location.origin : 'https://yashwanth-hub.vercel.app'}
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
