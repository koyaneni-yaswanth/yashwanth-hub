import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabase';
import { db } from '../db';
import { SupabaseAuthService } from '../services/auth/supabaseAuthService';
import { SyncQueueService } from '../services/sync/syncQueueService';
import { onCloudSyncCompleted, runFullCloudSync } from '../services/sync/cloudSyncCoordinator';

export type SyncStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'error';

interface SyncContextType {
  status: SyncStatus;
  isOnline: boolean;
  cloudConfigured: boolean;
  signedIn: boolean;
  userEmail: string | null;
  lastSyncTime: Date | null;
  queueCount: number;
  /** Queued changes whose last upload attempt failed (still safe on this device). */
  failedCount: number;
  syncNow: () => Promise<void>;
  statusMessage: string;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [status, setStatus] = useState<SyncStatus>('local');
  const [cloudConfigured, setCloudConfigured] = useState<boolean>(false);
  const [signedIn, setSignedIn] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [failedCount, setFailedCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('Local Mode (IndexedDB)');

  const refreshSyncState = useCallback(async () => {
    const configured = isSupabaseConfigured();
    setCloudConfigured(configured);

    let qCount = 0;
    let fCount = 0;
    try {
      [qCount, fCount] = await Promise.all([db.sync_queue.count(), SyncQueueService.getFailedCount()]);
    } catch {
      // Queue unreadable — treat as empty rather than blocking the UI.
    }
    setQueueCount(qCount);
    setFailedCount(fCount);

    if (!navigator.onLine) {
      setStatus('offline');
      setStatusMessage(
        qCount > 0 ? `Offline · ${qCount} change${qCount === 1 ? '' : 's'} queued locally` : 'Device is offline'
      );
      return;
    }

    if (!configured) {
      setSignedIn(false);
      setUserEmail(null);
      setStatus('local');
      setStatusMessage('Local IndexedDB (Persistent)');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setSignedIn(false);
      setUserEmail(null);
      setStatus('local');
      setStatusMessage('Local Mode');
      return;
    }

    let user = SupabaseAuthService.getState().user;
    if (!user) {
      try {
        const { data } = await client.auth.getSession();
        user = data?.session?.user ?? null;
      } catch {
        user = null;
      }
    }

    const isAuthed = Boolean(user);
    setSignedIn(isAuthed);
    setUserEmail(user?.email ?? null);

    if (!isAuthed) {
      setStatus('local');
      setStatusMessage(
        qCount > 0
          ? `Sign in to sync across devices (${qCount} waiting locally)`
          : 'Sign in to sync across mobile & desktop'
      );
      return;
    }

    if (fCount > 0) {
      setStatus('error');
      setStatusMessage(`${fCount} change${fCount === 1 ? '' : 's'} couldn't sync yet — safe on this device, retrying automatically`);
      return;
    }
    setStatus('synced');
    setStatusMessage(qCount > 0 ? `Syncing ${qCount} pending change${qCount === 1 ? '' : 's'}...` : 'All devices synced');
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshSyncState();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setStatus('offline');
      setStatusMessage('Offline (Local queue active)');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    refreshSyncState();
    const interval = setInterval(refreshSyncState, 10000);
    const unsubscribeQueue = SyncQueueService.subscribe(() => {
      refreshSyncState();
    });
    const unsubscribeAuth = SupabaseAuthService.subscribe(() => {
      refreshSyncState();
    });
    const unsubscribeCloud = onCloudSyncCompleted((summary) => {
      if (summary.status === 'synced' || summary.status === 'partial_error') {
        setLastSyncTime(new Date(summary.timestamp));
      }
      refreshSyncState();
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      unsubscribeQueue();
      unsubscribeAuth();
      unsubscribeCloud();
    };
  }, [refreshSyncState]);

  const syncNow = async () => {
    if (!isSupabaseConfigured()) {
      setStatus('local');
      setStatusMessage('Supabase not configured');
      return;
    }

    if (!navigator.onLine) {
      setStatus('offline');
      setStatusMessage('Cannot sync while offline');
      return;
    }

    setStatus('syncing');
    setStatusMessage('Syncing across devices...');

    try {
      const summary = await runFullCloudSync();
      const [remaining, failedNow] = await Promise.all([db.sync_queue.count(), SyncQueueService.getFailedCount()]);
      setQueueCount(remaining);
      setFailedCount(failedNow);

      if (summary.status === 'signed_out') {
        setSignedIn(false);
        setStatus('local');
        setStatusMessage('Sign in needed to sync across devices');
        return;
      }

      setLastSyncTime(new Date(summary.timestamp));
      if (summary.status === 'partial_error') {
        setStatus('error');
        setStatusMessage(
          `${summary.failed || summary.errors.length} change${(summary.failed || summary.errors.length) === 1 ? '' : 's'} couldn't sync yet — kept safely on this device`
        );
      } else {
        setStatus('synced');
        const total = summary.uploaded + summary.pulled;
        setStatusMessage(
          total > 0
            ? `Synced (${summary.uploaded} sent, ${summary.pulled} received)`
            : 'All devices up to date'
        );
      }
    } catch (err: any) {
      console.error('Sync failed:', err);
      setStatus('error');
      setStatusMessage(err?.message || 'Sync failed');
    }
  };

  return (
    <SyncContext.Provider
      value={{
        status,
        isOnline,
        cloudConfigured,
        signedIn,
        userEmail,
        lastSyncTime,
        queueCount,
        failedCount,
        syncNow,
        statusMessage,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

export const useSync = () => {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
};
