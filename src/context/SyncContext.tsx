import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabase';
import { db } from '../db';
import { SyncQueueService } from '../services/sync/syncQueueService';

export type SyncStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'error';

interface SyncContextType {
  status: SyncStatus;
  isOnline: boolean;
  cloudConfigured: boolean;
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
      setStatusMessage('Device is offline');
      return;
    }

    if (!configured) {
      setStatus('local');
      setStatusMessage('Local IndexedDB (Persistent)');
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setStatus('local');
      setStatusMessage('Local Mode');
      return;
    }

    if (fCount > 0) {
      setStatus('error');
      setStatusMessage(`${fCount} change${fCount === 1 ? '' : 's'} couldn't sync yet — safe on this device, will retry`);
      return;
    }
    setStatus('synced');
    setStatusMessage(qCount > 0 ? `${qCount} change${qCount === 1 ? '' : 's'} waiting to sync` : 'All changes synced');
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
    const interval = setInterval(refreshSyncState, 15000);
    // Refresh immediately whenever the queue changes (enqueue or flush).
    const unsubscribeQueue = SyncQueueService.subscribe(() => {
      refreshSyncState();
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      unsubscribeQueue();
    };
  }, [refreshSyncState]);

  const syncNow = async () => {
    if (!isSupabaseConfigured()) {
      setStatus('local');
      setStatusMessage('Supabase not configured in Settings');
      return;
    }

    if (!navigator.onLine) {
      setStatus('offline');
      setStatusMessage('Cannot sync while offline');
      return;
    }

    setStatus('syncing');
    setStatusMessage('Syncing with Supabase...');

    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Client not initialized');

      // Check auth session
      const { data: sessionData, error: sessionErr } = await client.auth.getSession();
      if (sessionErr || !sessionData.session) {
        setStatus('error');
        setStatusMessage('Cloud configured: Sign in needed for sync');
        return;
      }

      // Upload through the same queue flush used everywhere else: rejected writes stay queued.
      const { failed } = await SyncQueueService.flushQueue();
      const [remaining, failedNow] = await Promise.all([db.sync_queue.count(), SyncQueueService.getFailedCount()]);
      setQueueCount(remaining);
      setFailedCount(failedNow);
      setLastSyncTime(new Date());
      if (failed > 0) {
        setStatus('error');
        setStatusMessage(`${failed} change${failed === 1 ? '' : 's'} couldn't sync — kept on this device and will retry`);
      } else {
        setStatus('synced');
        setStatusMessage('Cloud Synced');
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
