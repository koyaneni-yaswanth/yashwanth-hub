import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabase } from './db';
import type { NavigationTab } from './types';
import { ThemeProvider } from './context/ThemeContext';
import { SyncProvider } from './context/SyncContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { CommandPalette } from './components/common/CommandPalette';
import { ReminderEngine } from './services/reminderEngine';
import { GoogleAuthService } from './services/google/googleAuthService';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { CalendarPage } from './pages/CalendarPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { TravelPage } from './pages/TravelPage';
import { NotesPage } from './pages/NotesPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { ContactsPage } from './pages/ContactsPage';
import { WindPlanPage } from './pages/WindPlanPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

function HubMain() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [currentArea, setCurrentArea] = useState<string>('All');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);

  // Initialize IndexedDB and Reminder Engine
  useEffect(() => {
    initializeDatabase().then(() => {
      setIsDbReady(true);
      // Run initial intelligence reminder check
      ReminderEngine.runIntelligenceScan().catch(() => {});
    });

    // Check for Google OAuth Token in URL hash (#access_token=...)
    if (window.location.hash.includes('access_token=')) {
      const params = new URLSearchParams(window.location.hash.replace('#', '?'));
      const token = params.get('access_token');
      const expiresIn = params.get('expires_in');
      if (token) {
        const expiresAt = Date.now() + (Number(expiresIn) || 3600) * 1000;
        const config = GoogleAuthService.getConfig();
        GoogleAuthService.saveConfig({
          ...config,
          connected: true,
          accessToken: token,
          expiresAt,
          calendarSyncEnabled: true,
          driveSyncEnabled: true,
          gmailSyncEnabled: true,
        });
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    // Periodic reminder check every 60 seconds
    const interval = setInterval(() => {
      ReminderEngine.runIntelligenceScan().catch(() => {});
    }, 60000);

    // Global Command Palette Shortcut (Ctrl+K or Cmd+K)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

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
        return <DocumentsPage currentArea={currentArea} areas={areas} />;
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
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
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
