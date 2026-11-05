import { getSupabaseClient } from '../lib/supabase';
import type { NavigationTab } from '../types';

export interface AgentPresenceState {
  x: number;
  y: number;
  status: string;
  agentName: string;
  subsystem?: string;
  phase: 'idle' | 'moving' | 'working' | 'success' | 'error';
  isVisible: boolean;
  targetSelector?: string;
}

type PresenceListener = (state: AgentPresenceState) => void;

class AgentPresenceManager {
  private state: AgentPresenceState = {
    x: 100,
    y: 100,
    status: 'Idle',
    agentName: 'Jarvis Agent',
    phase: 'idle',
    isVisible: false,
  };

  private listeners: Set<PresenceListener> = new Set();
  private hideTimeout: any = null;
  private isSubscribedToRealtime = false;

  constructor() {
    this.initRealtimeSubscription();
  }

  public getState(): AgentPresenceState {
    return { ...this.state };
  }

  public subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.error('[AgentPresence] Listener error:', err);
      }
    });
  }

  /**
   * Set raw coordinates directly
   */
  public setCoordinates(x: number, y: number, status: string, options?: Partial<AgentPresenceState>) {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);

    this.state = {
      ...this.state,
      x: Math.max(10, Math.min(window.innerWidth - 60, x)),
      y: Math.max(10, Math.min(window.innerHeight - 40, y)),
      status,
      isVisible: true,
      phase: options?.phase || 'moving',
      agentName: options?.agentName || this.state.agentName,
      subsystem: options?.subsystem || this.state.subsystem,
      targetSelector: options?.targetSelector,
    };
    this.notify();
  }

  /**
   * Animate the collaborative arrow to an element on the screen
   */
  public moveToElement(
    selector: string,
    statusText: string,
    options?: {
      agentName?: string;
      subsystem?: string;
      phase?: 'moving' | 'working' | 'success' | 'error';
      autoHideMs?: number;
    }
  ): boolean {
    if (typeof window === 'undefined') return false;

    const el = document.querySelector(selector);
    if (!el) {
      // Fallback: center screen if element not present on current page
      this.setCoordinates(window.innerWidth / 2, 120, statusText, {
        targetSelector: selector,
        phase: options?.phase || 'working',
        agentName: options?.agentName,
        subsystem: options?.subsystem,
      });
      return false;
    }

    const rect = el.getBoundingClientRect();
    // Position cursor at top-center of target element
    const targetX = rect.left + rect.width / 2 - 12;
    const targetY = rect.top + 8;

    this.setCoordinates(targetX, targetY, statusText, {
      targetSelector: selector,
      phase: options?.phase || 'working',
      agentName: options?.agentName,
      subsystem: options?.subsystem,
    });

    if (options?.autoHideMs) {
      this.scheduleAutoHide(options.autoHideMs);
    }

    return true;
  }

  /**
   * Execute an automated task with full cursor travel, work pulse, and success badge
   */
  public async performAction(
    selector: string,
    actionText: string,
    options?: {
      agentName?: string;
      subsystem?: string;
      workDurationMs?: number;
      task?: () => Promise<void>;
    }
  ) {
    const workDuration = options?.workDurationMs ?? 1800;

    // 1. Move to element
    this.moveToElement(selector, actionText, {
      phase: 'moving',
      agentName: options?.agentName || 'Jarvis AI',
      subsystem: options?.subsystem || 'Auto',
    });

    await new Promise((r) => setTimeout(r, 450));

    // 2. Pulse working state & run task
    this.state.phase = 'working';
    this.notify();

    if (options?.task) {
      try {
        await options.task();
      } catch (err: any) {
        this.state.phase = 'error';
        this.state.status = `Error: ${err.message || 'Action failed'}`;
        this.notify();
        this.scheduleAutoHide(3000);
        return;
      }
    } else {
      await new Promise((r) => setTimeout(r, workDuration));
    }

    // 3. Complete with success state
    this.state.phase = 'success';
    this.state.status = `${actionText} completed`;
    this.notify();

    // 4. Fade out
    this.scheduleAutoHide(1600);
  }

  /**
   * Dismiss the cursor overlay
   */
  public dismiss() {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.state.isVisible = false;
    this.state.phase = 'idle';
    this.state.targetSelector = undefined;
    this.notify();
  }

  private scheduleAutoHide(delayMs: number) {
    if (this.hideTimeout) clearTimeout(this.hideTimeout);
    this.hideTimeout = setTimeout(() => {
      this.dismiss();
    }, delayMs);
  }

  /**
   * Listens to Supabase Realtime channel `agent-presence` for multi-client / serverless broadcasts
   */
  public initRealtimeSubscription() {
    if (this.isSubscribedToRealtime) return;

    try {
      const client = getSupabaseClient();
      if (!client) return;

      const channel = client.channel('agent-presence');
      channel
        .on('broadcast', { event: 'agent_action' }, ({ payload }) => {
          if (!payload) return;
          const { targetElement, action, agentName, subsystem, durationMs } = payload;
          if (targetElement) {
            this.performAction(targetElement, action || 'Executing automation...', {
              agentName: agentName || 'Jarvis Serverless',
              subsystem: subsystem || 'Cloud',
              workDurationMs: durationMs || 2000,
            });
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.isSubscribedToRealtime = true;
          }
        });
    } catch (err) {
      console.warn('[AgentPresence] Supabase Realtime channel setup warning:', err);
    }
  }

  /**
   * Broadcast an action event to other connected clients via Supabase Realtime
   */
  public broadcastAction(targetElement: string, actionText: string, metadata?: Record<string, any>) {
    try {
      const client = getSupabaseClient();
      if (client) {
        client.channel('agent-presence').send({
          type: 'broadcast',
          event: 'agent_action',
          payload: {
            targetElement,
            action: actionText,
            agentName: 'Jarvis Lead',
            timestamp: new Date().toISOString(),
            ...metadata,
          },
        });
      }
    } catch {
      // Ignored if offline
    }
  }

  /**
   * Interactive Demo Tour showing the cursor gliding across cards
   */
  public async runDemoTour(onNavigate?: (tab: NavigationTab) => void) {
    if (onNavigate) {
      onNavigate('dashboard');
      await new Promise((r) => setTimeout(r, 300));
    }

    const steps = [
      {
        selector: '[data-agent-target="stats-grid"]',
        text: 'Analyzing Executive Metrics & Hardware Telemetry',
        subsystem: 'Telemetry',
        duration: 1600,
      },
      {
        selector: '[data-agent-target="tasks-card"]',
        text: 'Scanning Overdue Tasks & Milestone Deliverables',
        subsystem: 'Tasks',
        duration: 1800,
      },
      {
        selector: '[data-agent-target="automations-card"]',
        text: 'Checking Serverless Automation Cron Triggers',
        subsystem: 'Cron',
        duration: 1600,
      },
      {
        selector: '[data-agent-target="quick-actions"]',
        text: 'Synchronizing NeoSapien Neo 1 Ambient Memories',
        subsystem: 'Neo 1',
        duration: 1700,
      },
    ];

    for (const step of steps) {
      await this.performAction(step.selector, step.text, {
        agentName: 'Jarvis OS',
        subsystem: step.subsystem,
        workDurationMs: step.duration,
      });
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

export const AgentPresenceService = new AgentPresenceManager();
