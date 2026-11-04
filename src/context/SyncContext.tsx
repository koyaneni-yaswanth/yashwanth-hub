import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabase';
import { db } from '../db';

export type SyncStatus = 'local' | 'synced' | 'syncing' | 'offline' | 'error';

interface SyncContextType {
  status: SyncStatus;
  isOnline: boolean;
  cloudConfigured: boolean;
  lastSyncTime: Date | null;
  queueCount: number;
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
  const [statusMessage, setStatusMessage] = useState<string>('Local Mode (IndexedDB)');

  const refreshSyncState = useCallback(async () => {
    const configured = isSupabaseConfigured();
    setCloudConfigured(configured);

    try {
      const qCount = await db.sync_queue.count();
      setQueueCount(qCount);
    } catch {
      setQueueCount(0);
    }

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

    setStatus('synced');
    setStatusMessage('Connected to Cloud');
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

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
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

      // Sync pending queue items
      const queue = await db.sync_queue.toArray();
      for (const item of queue) {
        try {
          if (item.action === 'INSERT' || item.action === 'UPDATE') {
            await (client.from(item.table_name) as any).upsert(item.payload);
          } else if (item.action === 'DELETE') {
            await (client.from(item.table_name) as any).delete().eq('id', item.record_id);
          }
          await db.sync_queue.delete(item.id);
        } catch (itemErr) {
          console.error('Queue item sync error:', itemErr);
        }
      }

      const remaining = await db.sync_queue.count();
      setQueueCount(remaining);
      setLastSyncTime(new Date());
      setStatus('synced');
      setStatusMessage('Cloud Synced');
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
