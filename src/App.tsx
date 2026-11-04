import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initializeDatabase } from './db';
import type { NavigationTab, Area } from './types';
import { ThemeProvider } from './context/ThemeContext';
import { SyncProvider } from './context/SyncContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';

// Pages
import { DashboardPage } from './pages/DashboardPage';
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
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';

function HubMain() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [currentArea, setCurrentArea] = useState<string>('All');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDbReady, setIsDbReady] = useState(false);

  // Initialize IndexedDB schema and starter data on mount
  useEffect(() => {
    initializeDatabase().then(() => {
      setIsDbReady(true);
    });
  }, []);

  // Live queries
  const areas = useLiveQuery(() => db.areas.toArray(), []) || [];
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];

  const openTasksCount = allTasks.filter((t) => !t.done).length;

  // Calculate wind turbine spin speed dynamically: 12s down to 1.5s
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
      {/* Top Bar */}
      <Header
        currentArea={currentArea}
        onAreaChange={setCurrentArea}
        areas={areas}
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        turbineDuration={turbineDuration}
      />

      {/* Main Container */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Navigation Sidebar (Desktop & Mobile Drawer) */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          openTasksCount={openTasksCount}
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
                  Loading Yashwanth Hub database...
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
