import type { NeoSapienConfig, NeoSapienStatus, NeoSapienTranscript } from '../types';
import { db } from '../db';
import { generateId, getTodayISO } from '../lib/utils';

export class NeoSapienService {
  private static STORAGE_KEY = 'yash_neosapien_config';

  public static getConfig(): NeoSapienConfig {
    if (typeof window === 'undefined') {
      return {
        status: 'not_configured',
        bleSupported: false,
        autoVoiceTask: true,
        autoSummary: true,
      };
    }
    const raw = localStorage.getItem(this.STORAGE_KEY);
    const bleSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

    if (!raw) {
      return {
        status: 'not_configured',
        bleSupported,
        autoVoiceTask: true,
        autoSummary: true,
      };
    }
    try {
      const parsed = JSON.parse(raw);
      return { ...parsed, bleSupported };
    } catch {
      return {
        status: 'not_configured',
        bleSupported,
        autoVoiceTask: true,
        autoSummary: true,
      };
    }
  }

  public static saveConfig(cfg: NeoSapienConfig) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cfg));
    }
  }

  // Attempt Web Bluetooth LE scan & connection
  public static async scanAndConnectBLE(): Promise<NeoSapienConfig> {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      const current = this.getConfig();
      current.status = 'error';
      this.saveConfig(current);
      throw new Error('Web Bluetooth is not supported in this browser or environment.');
    }

    try {
      // Request device with NeoSapien or standard audio/wearable service filters
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 'device_information'],
      });

      if (!device) {
        throw new Error('No Bluetooth device selected.');
      }

      const server = await device.gatt?.connect();
      let batteryLevel: number | undefined;

      try {
        const batteryService = await server?.getPrimaryService('battery_service');
        const characteristic = await batteryService?.getCharacteristic('battery_level');
        const value = await characteristic?.readValue();
        batteryLevel = value?.getUint8(0);
      } catch {
        // Battery service optional
      }

      const newConfig: NeoSapienConfig = {
        status: 'connected',
        deviceName: device.name || 'NeoSapien Neo 1',
        deviceId: device.id,
        batteryLevel,
        lastSyncTime: new Date().toISOString(),
        bleSupported: true,
        autoVoiceTask: true,
        autoSummary: true,
      };

      this.saveConfig(newConfig);
      return newConfig;
    } catch (err: any) {
      const current = this.getConfig();
      if (err.name === 'NotFoundError') {
        current.status = 'disconnected';
      } else {
        current.status = 'error';
      }
      this.saveConfig(current);
      throw err;
    }
  }

  public static disconnectDevice() {
    const config = this.getConfig();
    config.status = 'disconnected';
    this.saveConfig(config);
  }

  // Parse and ingest transcripts into Tasks and Notes
  public static async ingestTranscript(
    transcriptText: string,
    source: NeoSapienTranscript['source'] = 'browser_mic'
  ): Promise<{ tasksCreated: number; notesCreated: number }> {
    const now = new Date().toISOString();
    const today = getTodayISO();

    // Natural language heuristics to extract commitments/tasks
    const lines = transcriptText.split(/[\n.]+/).map((l) => l.trim()).filter(Boolean);
    const extractedTasks: string[] = [];
    const generalNotes: string[] = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.startsWith('todo') ||
        lower.startsWith('need to') ||
        lower.startsWith('task') ||
        lower.includes('action item') ||
        lower.includes('make sure to') ||
        lower.includes('follow up on')
      ) {
        extractedTasks.push(line.replace(/^(todo|need to|task|action item)[:\s]*/i, '').trim());
      } else {
        generalNotes.push(line);
      }
    }

    let tasksCreated = 0;
    for (const tText of extractedTasks) {
      if (tText.length > 5) {
        await db.tasks.add({
          id: generateId(),
          text: tText,
          description: `Captured via NeoSapien (${source})`,
          area: 'Personal',
          priority: 'medium',
          due_date: today,
          starred: false,
          done: false,
          created_at: now,
          updated_at: now,
        });
        tasksCreated++;
      }
    }

    let notesCreated = 0;
    if (generalNotes.length > 0) {
      await db.notes.add({
        id: generateId(),
        title: `NeoSapien Ambient Capture (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        body: generalNotes.join('\n\n'),
        area: 'Personal',
        pinned: false,
        tags: ['NeoSapien', 'Voice'],
        created_at: now,
        updated_at: now,
      });
      notesCreated++;
    }

    return { tasksCreated, notesCreated };
  }
}
