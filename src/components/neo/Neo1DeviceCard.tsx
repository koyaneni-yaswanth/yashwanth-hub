import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bluetooth,
  Battery,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Power,
  Clock,
  Radio,
} from 'lucide-react';
import { db } from '../../db';
import { getSupabaseClient } from '../../lib/supabase';
import { NeoDeviceStatusManager } from '../../integrations/neosapien/device-status';
import { NeoSapienMemoryService } from '../../services/neoSapienMemoryService';
import type { ConnectedDevice } from '../../types';

export const Neo1DeviceCard: React.FC = () => {
  const [isPairing, setIsPairing] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Live queries from Dexie
  const devices = useLiveQuery(() => db.connected_devices.toArray(), []) || [];
  const neoDevice = devices.find((d) => d.device_type === 'neo1') || null;
  const memoryCount = useLiveQuery(() => db.neo_memories.count(), []) || 0;
  const latestMemory = useLiveQuery(() => db.neo_memories.orderBy('capturedAt').last(), []) || null;

  // NeoSapien Account Integration Config
  const cfg = NeoSapienMemoryService.getConfig();
  const mcpConfig = cfg.mcpConfig || { enabled: false, status: 'disconnected' as const };
  const isAccountConnected = Boolean(mcpConfig.enabled && mcpConfig.status === 'connected');

  // Supabase Realtime Subscription for cross-device telemetry (e.g. from Android)
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel('neo1_telemetry_feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connected_devices' },
        (payload: any) => {
          if (payload.new && payload.new.device_type === 'neo1') {
            db.connected_devices.put(payload.new as ConnectedDevice);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handlePairBluetooth = async () => {
    setIsPairing(true);
    setPairingError(null);
    try {
      const result = await NeoDeviceStatusManager.pairWebBluetooth();
      if (!result.success) {
        setPairingError(result.error || 'Failed to connect.');
      }
    } catch (err: any) {
      setPairingError(err.message || 'Bluetooth connection failed.');
    } finally {
      setIsPairing(false);
    }
  };

  const handleDisconnect = async () => {
    await NeoDeviceStatusManager.disconnect();
  };

  const handleSyncMemories = async () => {
    setIsSyncing(true);
    try {
      await NeoSapienMemoryService.reconcileActionItems();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  // Determine physical telemetry status
  const isPhysicalConnected = neoDevice && neoDevice.connection_state === 'connected';
  const isTelemetryStale = neoDevice ? NeoDeviceStatusManager.isTelemetryStale(neoDevice) : true;
  const batteryPct = neoDevice?.battery_percentage;

  return (
    <div className="p-5 rounded-2xl bg-[var(--hub-surface)] border border-[var(--hub-line)] shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500 to-sky-500 flex items-center justify-center text-white shadow-sm">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
              Neo 1 Wearable Audio
              {isPhysicalConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </h3>
            <p className="text-xs text-[var(--hub-muted)]">
              {neoDevice ? neoDevice.name : 'Wearable hardware not paired directly'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {isPhysicalConnected ? (
            <button
              onClick={handleDisconnect}
              className="p-2 rounded-lg border border-[var(--hub-line)] text-red-500 hover:bg-red-500/10 text-xs font-semibold flex items-center gap-1 transition-colors"
              title="Disconnect physical Bluetooth"
            >
              <Power className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          ) : (
            <button
              onClick={handlePairBluetooth}
              disabled={isPairing}
              className="px-3 py-1.5 rounded-lg bg-teal-500 text-teal-950 font-heading font-bold text-xs flex items-center gap-1.5 hover:bg-teal-400 transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Bluetooth className="w-3.5 h-3.5" />
              <span>{isPairing ? 'Scanning...' : 'Pair Bluetooth'}</span>
            </button>
          )}

          <button
            onClick={handleSyncMemories}
            disabled={isSyncing}
            className="p-2 rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] text-xs transition-colors cursor-pointer"
            title="Sync memories from NeoSapien"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {pairingError && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-none" />
          <span>{pairingError}</span>
        </div>
      )}

      {/* 4 Distinct Status Pillars */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Pillar 1: Physical Device */}
        <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
          <div className="text-[10px] uppercase font-bold text-[var(--hub-muted)] tracking-wider flex items-center gap-1">
            <Bluetooth className="w-3 h-3 text-teal-500" /> Physical Device
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isPhysicalConnected && !isTelemetryStale
                  ? 'bg-emerald-500'
                  : isPhysicalConnected && isTelemetryStale
                  ? 'bg-amber-500'
                  : 'bg-zinc-500'
              }`}
            />
            <span className="text-xs font-bold text-[var(--hub-ink)]">
              {isPhysicalConnected
                ? isTelemetryStale
                  ? 'Connected (Stale)'
                  : 'Live BLE'
                : 'Disconnected'}
            </span>
          </div>
          <div className="text-[10px] text-[var(--hub-muted)] mt-0.5">
            {neoDevice?.telemetry_source ? neoDevice.telemetry_source.replace('_', ' ') : 'Offline'}
          </div>
        </div>

        {/* Pillar 2: NeoSapien Account */}
        <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
          <div className="text-[10px] uppercase font-bold text-[var(--hub-muted)] tracking-wider flex items-center gap-1">
            <Cloud className="w-3 h-3 text-sky-500" /> Account Auth
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${isAccountConnected ? 'bg-emerald-500' : 'bg-zinc-500'}`}
            />
            <span className="text-xs font-bold text-[var(--hub-ink)]">
              {isAccountConnected ? 'Connected' : 'Webhook / Key'}
            </span>
          </div>
          <div className="text-[10px] text-[var(--hub-muted)] mt-0.5">
            MCP / REST Ready
          </div>
        </div>

        {/* Pillar 3: Memory Synchronization */}
        <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
          <div className="text-[10px] uppercase font-bold text-[var(--hub-muted)] tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-teal-500" /> Memories Synced
          </div>
          <div className="mt-1 text-xs font-bold text-[var(--hub-ink)]">
            {memoryCount} Memories
          </div>
          <div className="text-[10px] text-[var(--hub-muted)] mt-0.5 truncate">
            {latestMemory ? `Latest: ${latestMemory.capturedAt.slice(0, 10)}` : 'No memories yet'}
          </div>
        </div>

        {/* Pillar 4: Battery & Hardware */}
        <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)]">
          <div className="text-[10px] uppercase font-bold text-[var(--hub-muted)] tracking-wider flex items-center gap-1">
            <Battery className="w-3 h-3 text-amber-500" /> Device Telemetry
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[var(--hub-ink)]">
            {batteryPct !== undefined ? `${batteryPct}%` : 'N/A'}
            <span className="text-[10px] font-normal text-[var(--hub-muted)]">
              ({neoDevice?.listening_state || 'idle'})
            </span>
          </div>
          <div className="text-[10px] text-[var(--hub-muted)] mt-0.5 font-mono">
            {neoDevice?.firmware_version || 'FW Unknown'}
          </div>
        </div>
      </div>

      {/* Telemetry Notice */}
      <div className="flex items-center justify-between text-[11px] text-[var(--hub-muted)] pt-2 border-t border-[var(--hub-line)]/50">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          <span>
            Last Status Update:{' '}
            <strong className="text-[var(--hub-ink)]">
              {neoDevice?.last_status_update
                ? new Date(neoDevice.last_status_update).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Never'}
            </strong>
          </span>
        </div>
        <span className="font-mono text-[10px] text-teal-600 dark:text-teal-400">
          Supabase Realtime Active
        </span>
      </div>
    </div>
  );
};
