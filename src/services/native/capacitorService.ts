import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getSupabaseClient } from '../../lib/supabase';
import { GoogleAuthService } from '../google/googleAuthService';
import type { Task, EventItem } from '../../types';

export interface BackButtonHandlerContext {
  isModalOpen?: boolean;
  closeModal?: () => void;
  isMobileMenuOpen?: boolean;
  closeMobileMenu?: () => void;
  isCommandPaletteOpen?: boolean;
  closeCommandPalette?: () => void;
  currentTab: string;
  navigateTab: (tab: string) => void;
}

export class CapacitorService {
  private static isInitialized = false;
  private static backButtonContext: BackButtonHandlerContext | null = null;
  private static onOAuthCallbackHandler: ((url: string) => void) | null = null;

  public static isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  public static getPlatform(): 'android' | 'ios' | 'web' {
    return Capacitor.getPlatform() as 'android' | 'ios' | 'web';
  }

  // Update back button context dynamically from UI state
  public static setBackButtonContext(ctx: BackButtonHandlerContext) {
    this.backButtonContext = ctx;
  }

  public static setOAuthCallbackHandler(handler: (url: string) => void) {
    this.onOAuthCallbackHandler = handler;
  }

  // Initialize all native Capacitor plugins safely
  public static async init(): Promise<void> {
    if (!this.isNative() || this.isInitialized) return;
    this.isInitialized = true;

    try {
      // 1. Android Notification Channel & Permissions
      await this.initNotificationChannels();

      // 2. Hide Splash Screen smoothly once UI is ready
      setTimeout(async () => {
        try {
          await SplashScreen.hide();
        } catch (e) {
          console.warn('SplashScreen hide warning:', e);
        }
      }, 500);

      // 3. Listen for Deep-Linking App URL open (OAuth callbacks)
      App.addListener('appUrlOpen', async (data) => {
        console.log('Native Deep Link received:', data.url);
        await this.handleDeepLinkUrl(data.url);
      });

      // 4. Android Hardware & Gesture Back Button Handling
      App.addListener('backButton', ({ canGoBack }) => {
        this.handleHardwareBackButton(canGoBack);
      });

      // 5. Check if the app was launched directly from an OAuth deep link
      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) {
        console.log('App launched with URL:', launchUrl.url);
        await this.handleDeepLinkUrl(launchUrl.url);
      }
    } catch (err) {
      console.warn('Capacitor native initialization error:', err);
    }
  }

  // Apply status bar styles depending on dark mode
  public static async updateStatusBar(isDark: boolean): Promise<void> {
    if (!this.isNative()) return;
    try {
      await StatusBar.setStyle({
        style: isDark ? Style.Dark : Style.Light,
      });
      await StatusBar.setBackgroundColor({
        color: isDark ? '#0e1b1e' : '#0b6e6e',
      });
    } catch (e) {
      console.warn('StatusBar update skipped:', e);
    }
  }

  // Configure Android Notification Channel
  private static async initNotificationChannels(): Promise<void> {
    if (this.getPlatform() !== 'android') return;
    try {
      await LocalNotifications.createChannel({
        id: 'yashwanth_reminders',
        name: 'Tasks & Meeting Reminders',
        description: 'Proactive alerts for meetings, commitments and overdue tasks',
        importance: 5,
        visibility: 1,
        sound: 'beep.wav',
        vibration: true,
        lights: true,
        lightColor: '#0b6e6e',
      });
    } catch (err) {
      console.warn('Failed to create notification channel:', err);
    }
  }

  // Handle hardware / gesture back button
  private static handleHardwareBackButton(canGoBack: boolean): void {
    const ctx = this.backButtonContext;
    if (!ctx) {
      if (!canGoBack) {
        App.minimizeApp();
      } else {
        window.history.back();
      }
      return;
    }

    // 1. Close command palette if open
    if (ctx.isCommandPaletteOpen && ctx.closeCommandPalette) {
      ctx.closeCommandPalette();
      return;
    }

    // 2. Close mobile menu if open
    if (ctx.isMobileMenuOpen && ctx.closeMobileMenu) {
      ctx.closeMobileMenu();
      return;
    }

    // 3. Close open modal if present
    if (ctx.isModalOpen && ctx.closeModal) {
      ctx.closeModal();
      return;
    }

    // 4. If on a sub-page, return to dashboard
    if (ctx.currentTab !== 'dashboard') {
      ctx.navigateTab('dashboard');
      return;
    }

    // 5. At root dashboard: minimize app rather than exit abruptly
    App.minimizeApp();
  }

  // Process deep link URL from OAuth redirect
  public static async handleDeepLinkUrl(url: string): Promise<boolean> {
    if (!url) return false;

    // Check custom scheme: com.yaswanth.hub:// or yashwanthhub://
    if (
      url.startsWith('com.yaswanth.hub://') ||
      url.startsWith('yashwanthhub://') ||
      url.includes('/auth/callback')
    ) {
      // 1. Parse fragments & query params
      const hashIndex = url.indexOf('#');
      const queryIndex = url.indexOf('?');
      const rawParams = hashIndex !== -1 ? url.substring(hashIndex + 1) : queryIndex !== -1 ? url.substring(queryIndex + 1) : '';

      const params = new URLSearchParams(rawParams);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const expiresIn = Number(params.get('expires_in')) || 3600;

      // 2. Handle Supabase Session if tokens are present
      if (accessToken && refreshToken) {
        const client = getSupabaseClient();
        if (client) {
          try {
            await client.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            console.log('Supabase native session persisted successfully');
          } catch (err) {
            console.error('Failed to set Supabase native session:', err);
          }
        }
      }

      // 3. Handle Google Workspace token in GoogleAuthService
      if (accessToken) {
        const expiresAt = Date.now() + expiresIn * 1000;
        const config = GoogleAuthService.getConfig();
        GoogleAuthService.saveConfig({
          ...config,
          connected: true,
          accessToken,
          expiresAt,
          calendarSyncEnabled: true,
          driveSyncEnabled: true,
          gmailSyncEnabled: true,
        });

        // Fetch profile
        try {
          const profile = await GoogleAuthService.fetchUserProfile(accessToken);
          if (profile) {
            GoogleAuthService.saveConfig({
              ...GoogleAuthService.getConfig(),
              email: profile.email,
              name: profile.name,
              picture: profile.picture,
            });
          }
        } catch {
          // Non-blocking
        }
      }

      // 4. Notify app listeners
      if (this.onOAuthCallbackHandler) {
        this.onOAuthCallbackHandler(url);
      }
      return true;
    }
    return false;
  }

  // Native Local Notifications Management
  public static async checkNotificationPermissions(): Promise<boolean> {
    if (!this.isNative()) {
      return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
    }
    try {
      const res = await LocalNotifications.checkPermissions();
      return res.display === 'granted';
    } catch {
      return false;
    }
  }

  public static async requestNotificationPermissions(): Promise<boolean> {
    if (!this.isNative()) {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const res = await Notification.requestPermission();
        return res === 'granted';
      }
      return false;
    }
    try {
      const res = await LocalNotifications.requestPermissions();
      return res.display === 'granted';
    } catch {
      return false;
    }
  }

  // Schedule immediate or scheduled native notification
  public static async scheduleNotification(
    title: string,
    body: string,
    id: number = Math.floor(Math.random() * 100000),
    scheduleAt?: Date,
    actionLink?: string
  ): Promise<void> {
    if (!this.isNative()) return;

    try {
      const permitted = await this.checkNotificationPermissions();
      if (!permitted) return;

      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id,
            channelId: 'yashwanth_reminders',
            schedule: scheduleAt ? { at: scheduleAt } : undefined,
            extra: { actionLink },
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#0b6e6e',
          },
        ],
      });
    } catch (err) {
      console.warn('Failed to schedule native local notification:', err);
    }
  }

  // Sync scheduled native notifications for upcoming tasks and events
  public static async syncUpcomingNativeReminders(tasks: Task[], events: EventItem[]): Promise<number> {
    if (!this.isNative()) return 0;
    try {
      const permitted = await this.checkNotificationPermissions();
      if (!permitted) return 0;

      let scheduledCount = 0;
      const now = Date.now();

      // 1. Task Reminders: Schedule alerts for tasks due today or upcoming
      for (const t of tasks) {
        if (!t.done && t.due_date) {
          const taskDueDate = new Date(`${t.due_date}T09:00:00`);
          if (taskDueDate.getTime() > now) {
            // Numeric unique id from string hash
            const notifId = Math.abs(t.id.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)) % 1000000;
            await this.scheduleNotification(
              `Task Due Today: ${t.text}`,
              `Priority: ${t.priority.toUpperCase()} • Area: ${t.area}`,
              notifId,
              taskDueDate,
              'tasks'
            );
            scheduledCount++;
          }
        }
      }

      // 2. Event Reminders: Schedule alert 15 minutes before event starts
      for (const e of events) {
        if (e.date && e.start_time) {
          const eventTime = new Date(`${e.date}T${e.start_time}:00`);
          const reminderTime = new Date(eventTime.getTime() - 15 * 60 * 1000); // 15 mins prior
          if (reminderTime.getTime() > now) {
            const notifId = Math.abs(e.id.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)) % 1000000;
            await this.scheduleNotification(
              `Upcoming Event in 15m: ${e.title}`,
              `Time: ${e.start_time} • ${e.place || 'Yashwanth Hub'}`,
              notifId,
              reminderTime,
              'calendar'
            );
            scheduledCount++;
          }
        }
      }

      return scheduledCount;
    } catch (err) {
      console.warn('Failed to sync native reminders:', err);
      return 0;
    }
  }
}
