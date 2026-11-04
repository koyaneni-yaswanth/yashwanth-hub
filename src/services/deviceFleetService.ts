import { db } from '../db';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import type { DeviceSession } from '../types';
import { generateId } from '../lib/utils';

export class DeviceFleetService {
  private static INSTALL_ID_KEY = 'yash_device_install_id';
  private static DEVICE_NAME_KEY = 'yash_device_custom_name';
  private static heartbeatTimer: any = null;

  /**
   * Retrieves or creates a persistent installation UUID unique to this browser/device instance.
   */
  public static getInstallationId(): string {
    if (typeof window === 'undefined') return 'server_session';
    let id = localStorage.getItem(this.INSTALL_ID_KEY);
    if (!id || !id.trim()) {
      id = `dev_${generateId()}`;
      localStorage.setItem(this.INSTALL_ID_KEY, id);
    }
    return id;
  }

  /**
   * Detects real device hardware, OS, browser, and PWA capabilities.
   */
  public static detectDeviceMetadata(): {
    platform: 'windows' | 'android' | 'ios' | 'mac' | 'linux' | 'browser';
    browser: string;
    deviceType: 'desktop' | 'laptop' | 'mobile' | 'tablet';
    defaultName: string;
    isPwa: boolean;
  } {
    if (typeof window === 'undefined') {
      return {
        platform: 'browser',
        browser: 'Server',
        deviceType: 'desktop',
        defaultName: 'Unknown Device',
        isPwa: false,
      };
    }

    const ua = navigator.userAgent;
    let platform: 'windows' | 'android' | 'ios' | 'mac' | 'linux' | 'browser' = 'browser';
    let deviceType: 'desktop' | 'laptop' | 'mobile' | 'tablet' = 'desktop';

    // Platform detection
    if (/Windows/i.test(ua)) platform = 'windows';
    else if (/Android/i.test(ua)) platform = 'android';
    else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'ios';
    else if (/Macintosh|Mac OS X/i.test(ua)) platform = 'mac';
    else if (/Linux/i.test(ua)) platform = 'linux';

    // Device Type detection
    const isMobileUa = /Mobile|Android|iP(hone|od)/i.test(ua);
    const isTabletUa = /Tablet|iPad/i.test(ua) || (platform === 'android' && !/Mobile/i.test(ua));

    if (isTabletUa) {
      deviceType = 'tablet';
    } else if (isMobileUa) {
      deviceType = 'mobile';
    } else {
      // Differentiate desktop vs laptop using screen / battery / touch
      const hasBattery = typeof navigator !== 'undefined' && 'getBattery' in navigator;
      const hasTouch = navigator.maxTouchPoints > 0;
      deviceType = hasTouch || hasBattery ? 'laptop' : 'desktop';
    }

    // Browser detection
    let browser = 'Browser';
    if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
    else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = 'Apple Safari';
    else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';

    // PWA detection
    const isPwa =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as any).standalone) ||
      document.referrer.includes('android-app://');

    // Default friendly name
    const customName = localStorage.getItem(this.DEVICE_NAME_KEY);
    let defaultName = customName || '';
    if (!defaultName) {
      if (platform === 'windows') {
        defaultName = deviceType === 'laptop' ? 'Windows Laptop' : 'Windows Desktop';
      } else if (platform === 'android') {
        defaultName = deviceType === 'tablet' ? 'Android Tablet' : 'Android Mobile';
      } else if (platform === 'mac') {
        defaultName = deviceType === 'laptop' ? 'MacBook' : 'Mac Desktop';
      } else if (platform === 'ios') {
        defaultName = deviceType === 'tablet' ? 'iPad' : 'iPhone';
      } else {
        defaultName = `${platform.toUpperCase()} ${deviceType.toUpperCase()}`;
      }
    }

    return { platform, browser, deviceType, defaultName, isPwa };
  }

  /**
   * Registers or updates the current device in local IndexedDB and cloud Supabase.
   */
  public static async registerCurrentDevice(): Promise<DeviceSession> {
    const installId = this.getInstallationId();
    const meta = this.detectDeviceMetadata();
    const now = new Date().toISOString();

    const session: DeviceSession = {
      id: installId,
      deviceName: meta.defaultName,
      platform: meta.platform,
      browser: meta.browser,
      deviceType: meta.deviceType,
      isCurrent: true,
      isPwa: meta.isPwa,
      status: 'online',
      syncStatus: navigator.onLine ? 'synced' : 'offline',
      lastActive: now,
      registeredAt: now,
      appVersion: '2.2.0',
    };

    // 1. Persist to Dexie
    const existing = await db.device_sessions.get(installId);
    if (existing) {
      session.registeredAt = existing.registeredAt || now;
      session.deviceName = existing.deviceName || meta.defaultName;
      await db.device_sessions.update(installId, {
        ...session,
        isCurrent: true,
        status: 'online',
        lastActive: now,
      });
    } else {
      await db.device_sessions.put(session);
    }

    // Mark all other local sessions as non-current
    const all = await db.device_sessions.toArray();
    for (const d of all) {
      if (d.id !== installId && d.isCurrent) {
        await db.device_sessions.update(d.id, { isCurrent: false });
      }
    }

    // 2. Sync to Supabase connected_devices if cloud is configured
    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          await client.from('connected_devices').upsert({
            hardware_id: installId,
            name: session.deviceName,
            device_type: session.deviceType,
            connection_state: 'connected',
            last_status_update: now,
          });
        }
      } catch (err) {
        console.warn('Could not sync device registration to Supabase:', err);
      }
    }

    // 3. Start Heartbeat
    this.startHeartbeatLoop();

    return session;
  }

  /**
   * Starts periodic heartbeat loop to refresh online telemetry.
   */
  public static startHeartbeatLoop(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);

    // Run heartbeat every 45 seconds
    this.heartbeatTimer = setInterval(async () => {
      await this.sendHeartbeat();
    }, 45000);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Sends heartbeat pulse and recalculates freshness statuses for the entire fleet.
   */
  public static async sendHeartbeat(): Promise<void> {
    const installId = this.getInstallationId();
    const now = new Date();
    const nowISO = now.toISOString();

    // 1. Update current device timestamp
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    await db.device_sessions.update(installId, {
      lastActive: nowISO,
      status: isOnline ? 'online' : 'offline',
      syncStatus: isOnline ? 'synced' : 'offline',
    });

    // 2. Re-evaluate freshness for all devices in fleet
    const allDevices = await db.device_sessions.toArray();
    for (const dev of allDevices) {
      if (dev.id === installId) continue;
      if (dev.status === 'revoked') continue;

      const lastActiveTime = new Date(dev.lastActive).getTime();
      const diffMinutes = (now.getTime() - lastActiveTime) / (1000 * 60);

      let newStatus: 'online' | 'recently_active' | 'offline' = 'offline';
      if (diffMinutes < 3) {
        newStatus = 'online';
      } else if (diffMinutes < 15) {
        newStatus = 'recently_active';
      } else {
        newStatus = 'offline';
      }

      if (dev.status !== newStatus) {
        await db.device_sessions.update(dev.id, { status: newStatus });
      }
    }
  }

  /**
   * Revokes a device session.
   */
  public static async revokeDeviceSession(deviceId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const currentId = this.getInstallationId();

    await db.device_sessions.update(deviceId, {
      status: 'revoked',
      revokedAt: now,
    });

    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          await client.from('connected_devices').update({
            connection_state: 'disconnected',
            last_status_update: now,
          }).eq('hardware_id', deviceId);
        }
      } catch (e) {
        console.warn('Could not revoke on Supabase:', e);
      }
    }

    // If revoking current device, clean up credentials
    if (deviceId === currentId) {
      localStorage.removeItem(this.INSTALL_ID_KEY);
      window.location.reload();
    }

    return true;
  }

  /**
   * Renames a device.
   */
  public static async renameDevice(deviceId: string, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (!trimmed) return;

    await db.device_sessions.update(deviceId, { deviceName: trimmed });

    if (deviceId === this.getInstallationId()) {
      localStorage.setItem(this.DEVICE_NAME_KEY, trimmed);
    }

    if (isSupabaseConfigured()) {
      try {
        const client = getSupabaseClient();
        if (client) {
          await client.from('connected_devices').update({
            name: trimmed,
          }).eq('hardware_id', deviceId);
        }
      } catch (e) {
        console.warn('Could not update device name in Supabase:', e);
      }
    }
  }
}
