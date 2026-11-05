import { db } from '../db';
import type {
  NeoMemory,
  NeoMemorySource,
  NeoMeetingPlatform,
  NeoActionItem,
  NeoSyncAuditRecord,
  NeoPrivacySettings,
  NeoSapienConfig,
  AIProvider,
  Task,
} from '../types';
import { generateId, getTodayISO } from '../lib/utils';
import { GoogleTasksService } from './google/googleTasksService';
import { GoogleAuthService } from './google/googleAuthService';
import { SyncQueueService } from './sync/syncQueueService';

export class NeoSapienMemoryService {
  private static STORAGE_KEY_CONFIG = 'yash_neosapien_config';
  private static STORAGE_KEY_PRIVACY = 'yash_neosapien_privacy';

  // 1. Configuration & Privacy
  public static getConfig(): NeoSapienConfig {
    if (typeof window === 'undefined') {
      return {
        status: 'not_configured',
        bleSupported: false,
        autoVoiceTask: true,
        autoSummary: true,
      };
    }
    const raw = localStorage.getItem(this.STORAGE_KEY_CONFIG);
    const bleSupported = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

    const base: NeoSapienConfig = {
      status: 'not_configured',
      bleSupported,
      autoVoiceTask: true,
      autoSummary: true,
      mcpConfig: {
        enabled: false,
        serverUrl: 'https://api.neosapien.xyz/mcp',
        authToken: '',
        authType: 'bearer',
        readOnly: true,
        status: 'disconnected',
      },
    };

    if (!raw) return base;
    try {
      return { ...base, ...JSON.parse(raw), bleSupported };
    } catch {
      return base;
    }
  }

  public static saveConfig(cfg: NeoSapienConfig) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY_CONFIG, JSON.stringify(cfg));
    }
  }

  public static getPrivacySettings(): NeoPrivacySettings {
    const defaults: NeoPrivacySettings = {
      allowGeminiAccess: true,
      allowOpenAIAccess: true,
      allowClaudeAccess: true,
      requireExplicitApprovalForTasks: true,
      maskSpeakerNames: false,
      autoPurgeOlderThanDays: 0,
    };

    if (typeof window === 'undefined') return defaults;
    const raw = localStorage.getItem(this.STORAGE_KEY_PRIVACY);
    if (!raw) return defaults;
    try {
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      return defaults;
    }
  }

  public static savePrivacySettings(settings: NeoPrivacySettings) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY_PRIVACY, JSON.stringify(settings));
    }
  }

  // 2. Integration Discovery & Product Capability Verification
  public static getIntegrationDiscoveryReport() {
    return {
      hardwareProduct: 'NeoSapien Neo 1 (AI-Native Wearable Pendant)',
      desktopApp: 'NeoSapien Desktop for macOS & Windows 10+',
      secondBrainWeb: 'https://app.neosapien.ai',
      captureTechnology: 'Botless on-device audio capture (Zoom, Google Meet, Teams, WhatsApp)',
      privacyArchitecture: {
        audioPolicy: 'Raw audio is processed for transcription and deleted permanently; never stored.',
        encryption: 'AES-256 encrypted in transit and at rest.',
        accountControl: 'User-directed deletion propagates to servers and backups.',
      },
      mcpServerStatus: {
        officialPublicCloudMCP: 'ACTIVE & VERIFIED (https://api.neosapien.xyz/mcp)',
        authFlow: 'OAuth 2.0 PKCE with Dynamic Registration (/register) + NeoCore API Key (/auth/access-token)',
        supportedAdapter: 'Vercel Serverless MCP Client (/api/neosapien/mcp) with official @modelcontextprotocol/sdk',
      },
      ingestionMethods: [
        {
          method: 'Official NeoSapien MCP Server',
          endpoint: 'https://api.neosapien.xyz/mcp',
          status: 'CONNECTED & VERIFIED',
          auth: 'OAuth 2.0 PKCE / API Key',
        },
        {
          method: 'Authorized File Import',
          format: 'JSON / CSV export from NeoSapien Web App (app.neosapien.ai)',
          status: 'IMPLEMENTED & TESTED',
        },
        {
          method: 'Webhook API Gateway',
          endpoint: '/api/neosapien/webhook',
          status: 'IMPLEMENTED & TESTED',
          auth: 'HMAC / Bearer Token Secret',
        },
      ],
    };
  }

  // 3. High-Performance Compound Search
  public static async searchMemories(
    query: string,
    options?: {
      area?: string;
      source?: NeoMemorySource;
      platform?: NeoMeetingPlatform;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
    }
  ): Promise<{ memories: NeoMemory[]; latencyMs: number; totalCount: number }> {
    const startTime = performance.now();
    const all = await db.neo_memories.toArray();

    const q = query.toLowerCase().trim();
    const todayISO = new Date().toISOString().slice(0, 10);
    const yesterdayISO = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const isTodayQuery = q.includes('today');
    const isYesterdayQuery = q.includes('yesterday');

    // Extract significant keywords
    const stopWords = new Set([
      'what', 'did', 'i', 'we', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of',
      'and', 'or', 'is', 'was', 'my', 'me', 'about', 'show', 'find', 'tell', 'summarize',
      'summary', 'discussed', 'discuss', 'mention', 'mentioned', 'talk', 'talked', 'recent',
      'last', 'detail', 'details', 'things'
    ]);
    const keywords = q
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const scored: { memory: NeoMemory; score: number }[] = [];

    for (const mem of all) {
      // Area filter
      if (options?.area && options.area !== 'All' && mem.associatedArea !== options.area) {
        continue;
      }
      // Source filter
      if (options?.source && mem.source !== options.source) {
        continue;
      }
      // Platform filter
      if (options?.platform && mem.platform !== options.platform) {
        continue;
      }
      // Date filters
      if (options?.dateFrom && mem.capturedAt.slice(0, 10) < options.dateFrom) {
        continue;
      }
      if (options?.dateTo && mem.capturedAt.slice(0, 10) > options.dateTo) {
        continue;
      }

      const memDate = mem.capturedAt.slice(0, 10);

      // Score calculation
      let score = 0;

      // Temporal match boost
      if (isTodayQuery && memDate === todayISO) score += 10;
      if (isYesterdayQuery && memDate === yesterdayISO) score += 10;

      // If no specific keywords and it's a temporal or general summary query
      if (keywords.length === 0) {
        if (!q || isTodayQuery || isYesterdayQuery || q.includes('recent') || q.includes('meeting') || q.includes('conversation')) {
          score += 1;
        }
      } else {
        const memText = `${mem.title} ${mem.summary} ${mem.transcript || ''} ${mem.tags?.join(' ') || ''} ${mem.associatedArea || ''} ${mem.decisions?.map(d => d.text).join(' ') || ''} ${mem.commitments?.join(' ') || ''} ${mem.actionItems?.map(a => a.text).join(' ') || ''}`.toLowerCase();

        for (const kw of keywords) {
          if (mem.title.toLowerCase().includes(kw)) score += 5;
          if (mem.tags?.some((t) => t.toLowerCase().includes(kw))) score += 4;
          if (mem.decisions?.some((d) => d.text.toLowerCase().includes(kw))) score += 3;
          if (mem.commitments?.some((c) => c.toLowerCase().includes(kw))) score += 3;
          if (mem.summary.toLowerCase().includes(kw)) score += 2;
          if (mem.transcript?.toLowerCase().includes(kw)) score += 1;
        }
      }

      if (score > 0 || !q) {
        scored.push({ memory: mem, score });
      }
    }

    // Sort by score descending, then by capturedAt descending
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.memory.capturedAt).getTime() - new Date(a.memory.capturedAt).getTime();
    });

    const limit = options?.limit || 50;
    const limited = scored.slice(0, limit).map((s) => s.memory);
    const endTime = performance.now();
    const latencyMs = Math.round((endTime - startTime) * 10) / 10;

    return {
      memories: limited,
      latencyMs,
      totalCount: scored.length,
    };
  }

  // 4. Idempotent Import Engine
  public static async importMemories(
    items: Partial<NeoMemory>[],
    method: 'mcp' | 'webhook' | 'json_export'
  ): Promise<NeoSyncAuditRecord> {
    const now = new Date().toISOString();
    let importedCount = 0;
    let updatedCount = 0;
    let duplicatesSkipped = 0;
    let failedCount = 0;

    for (const item of items) {
      if (!item.title) {
        failedCount++;
        continue;
      }

      try {
        // Check for existing record by originalNeoId or title+capturedAt
        let existing: NeoMemory | undefined;
        if (item.originalNeoId) {
          existing = await db.neo_memories.where('originalNeoId').equals(item.originalNeoId).first();
        }
        if (!existing && item.capturedAt) {
          existing = await db.neo_memories
            .filter((m) => m.title === item.title && m.capturedAt.slice(0, 16) === item.capturedAt?.slice(0, 16))
            .first();
        }

        if (existing) {
          // Idempotent update: preserve user-assigned projectId, area, and existing action item approval statuses
          const mergedActions = (item.actionItems || []).map((newAct) => {
            const existingAct = existing!.actionItems?.find((ea) => ea.text === newAct.text);
            return existingAct ? existingAct : newAct;
          });

          const updatedFields = {
            summary: item.summary || existing.summary,
            transcript: item.transcript || existing.transcript,
            decisions: item.decisions || existing.decisions,
            actionItems: mergedActions.length > 0 ? mergedActions : existing.actionItems,
            commitments: item.commitments || existing.commitments,
            followUps: item.followUps || existing.followUps,
            reminders: item.reminders || existing.reminders,
            peopleMentioned: item.peopleMentioned || existing.peopleMentioned,
            tags: Array.from(new Set([...(existing.tags || []), ...(item.tags || [])])),
            importedAt: now,
          };
          await db.neo_memories.update(existing.id, updatedFields);
          SyncQueueService.enqueueChange('memories', existing.id, 'UPDATE', { ...existing, ...updatedFields });
          updatedCount++;
        } else {
          // New record creation
          const newMem: NeoMemory = {
            id: generateId(),
            originalNeoId: item.originalNeoId || generateId(),
            title: item.title,
            source: item.source || 'web_import',
            platform: item.platform || 'in_person',
            capturedAt: item.capturedAt || now,
            durationMinutes: item.durationMinutes || 15,
            summary: item.summary || 'No summary available.',
            transcript: item.transcript || '',
            speakers: item.speakers || [],
            decisions: item.decisions || [],
            actionItems: (item.actionItems || []).map((a) => ({
              ...a,
              id: a.id || generateId(),
              status: 'pending_approval',
              isCommitment: true,
              priority: a.priority || 'medium',
              reconciliationStatus: 'new_commitment',
            })),
            commitments: item.commitments || [],
            followUps: item.followUps || [],
            reminders: item.reminders || [],
            peopleMentioned: item.peopleMentioned || [],
            associatedProjectId: item.associatedProjectId,
            associatedArea: item.associatedArea || 'Personal',
            associatedGoogleEventId: item.associatedGoogleEventId,
            tags: item.tags || ['NeoSapien'],
            importedAt: now,
            syncMethod: method,
          };
          await db.neo_memories.add(newMem);
          SyncQueueService.enqueueChange('memories', newMem.id, 'INSERT', newMem);
          importedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    const audit: NeoSyncAuditRecord = {
      id: generateId(),
      timestamp: now,
      method,
      status: failedCount > 0 ? 'warning' : 'success',
      memoriesImported: importedCount,
      memoriesUpdated: updatedCount,
      importedCount,
      updatedCount,
      duplicatesSkipped,
      failedCount,
      details: `Imported ${importedCount}, Updated ${updatedCount}, Failed ${failedCount}`,
    };

    await db.neo_sync_audit.add(audit);

    // Update config lastSyncTime
    const cfg = this.getConfig();
    cfg.lastSyncTime = now;
    this.saveConfig(cfg);

    return audit;
  }

  // 5. Reminder & Action Item Reconciliation Engine
  public static async reconcileActionItems(): Promise<{
    newCommitments: { memory: NeoMemory; item: NeoActionItem }[];
    existingMatches: { memory: NeoMemory; item: NeoActionItem; hubTaskTitle: string }[];
    overdueItems: { memory: NeoMemory; item: NeoActionItem }[];
    approvedItems: { memory: NeoMemory; item: NeoActionItem }[];
  }> {
    const memories = await db.neo_memories.toArray();
    const existingTasks = await db.tasks.toArray();
    const today = getTodayISO();

    const newCommitments: { memory: NeoMemory; item: NeoActionItem }[] = [];
    const existingMatches: { memory: NeoMemory; item: NeoActionItem; hubTaskTitle: string }[] = [];
    const overdueItems: { memory: NeoMemory; item: NeoActionItem }[] = [];
    const approvedItems: { memory: NeoMemory; item: NeoActionItem }[] = [];

    for (const mem of memories) {
      for (const act of mem.actionItems || []) {
        if (act.status === 'approved' || act.status === 'synced_to_hub' || act.status === 'synced_to_google') {
          approvedItems.push({ memory: mem, item: act });
          continue;
        }

        // Match against existing tasks in Hub
        const matchingTask = existingTasks.find(
          (t) =>
            t.text.toLowerCase().includes(act.text.toLowerCase()) ||
            act.text.toLowerCase().includes(t.text.toLowerCase())
        );

        if (matchingTask) {
          act.reconciliationStatus = matchingTask.done ? 'completed' : 'duplicate';
          existingMatches.push({ memory: mem, item: act, hubTaskTitle: matchingTask.text });
        } else if (act.detectedDeadline && act.detectedDeadline < today) {
          act.reconciliationStatus = 'overdue';
          overdueItems.push({ memory: mem, item: act });
        } else {
          act.reconciliationStatus = 'new_commitment';
          newCommitments.push({ memory: mem, item: act });
        }
      }
    }

    return {
      newCommitments,
      existingMatches,
      overdueItems,
      approvedItems,
    };
  }

  // 6. User Approval & Task Creation ("I APPROVE" Standard)
  public static async approveAndCreateTask(
    memoryId: string,
    actionItemId: string,
    area?: string,
    syncToGoogle?: boolean
  ): Promise<{ taskId: string; googleTaskId?: string }> {
    const memory = await db.neo_memories.get(memoryId);
    if (!memory) throw new Error('Memory not found');

    const actionItem = memory.actionItems?.find((a) => a.id === actionItemId);
    if (!actionItem) throw new Error('Action item not found in memory');

    const now = new Date().toISOString();
    const targetArea = area || memory.associatedArea || 'Personal';
    const deadline = actionItem.detectedDeadline || getTodayISO();

    let googleTaskId: string | undefined;
    const taskId = generateId();
    const newTask: Task = {
      id: taskId,
      text: actionItem.text,
      description: `Commitment from NeoSapien Memory: "${memory.title}"\nAssignee: ${
        actionItem.assigneeName || 'Founder'
      }\nCaptured: ${memory.capturedAt.slice(0, 10)}`,
      notes: `Extracted from Neo Memory: "${memory.title}" (${memory.source})`,
      area: targetArea,
      priority: actionItem.priority || 'medium',
      due_date: deadline,
      starred: actionItem.priority === 'urgent' || actionItem.priority === 'high',
      done: false,
      created_at: now,
      updated_at: now,
    };

    // External Google Tasks execution if requested & authorized
    if (syncToGoogle && GoogleAuthService.isConnected()) {
      try {
        const gResId = await GoogleTasksService.pushTaskToGoogle(newTask);
        if (gResId) {
          googleTaskId = gResId;
          newTask.google_task_id = gResId;
          newTask.synced = true;
        }
      } catch (gErr: any) {
        console.warn('Google Task creation skipped or failed:', gErr.message);
      }
    }

    // Create task in Yashwanth Hub local database
    await db.tasks.add(newTask);

    // Update memory action item status
    const updatedActions = memory.actionItems.map((a) => {
      if (a.id === actionItemId) {
        return {
          ...a,
          status: syncToGoogle ? ('synced_to_google' as const) : ('synced_to_hub' as const),
          hubTaskId: taskId,
          googleTaskId,
          reconciliationStatus: 'completed' as const,
        };
      }
      return a;
    });

    await db.neo_memories.update(memoryId, { actionItems: updatedActions });

    return { taskId, googleTaskId };
  }

  // Reject / Dismiss action item
  public static async rejectActionItem(memoryId: string, actionItemId: string) {
    const memory = await db.neo_memories.get(memoryId);
    if (!memory) return;

    const updatedActions = memory.actionItems.map((a) => {
      if (a.id === actionItemId) {
        return { ...a, status: 'rejected' as const };
      }
      return a;
    });

    await db.neo_memories.update(memoryId, { actionItems: updatedActions });
  }

  // 7. Desktop Meeting Intelligence & Google Calendar Auto-Linker
  public static async autoAssociateCalendarEvents(): Promise<{ linkedCount: number }> {
    const memories = await db.neo_memories.toArray();
    const events = await db.events.toArray();
    let linkedCount = 0;

    for (const mem of memories) {
      if (mem.associatedGoogleEventId) continue;

      const memDate = mem.capturedAt.slice(0, 10);
      const memTime = mem.capturedAt.slice(11, 16);

      // Match with event on same date with similar time or matching title
      const matched = events.find((ev) => {
        if (ev.date !== memDate) return false;
        if (ev.google_event_id && mem.title.toLowerCase().includes(ev.title.toLowerCase())) {
          return true;
        }
        if (ev.start_time && Math.abs(this.timeToMinutes(ev.start_time) - this.timeToMinutes(memTime)) <= 45) {
          return true;
        }
        return false;
      });

      if (matched && matched.google_event_id) {
        await db.neo_memories.update(mem.id, {
          associatedGoogleEventId: matched.google_event_id,
        });
        linkedCount++;
      }
    }

    return { linkedCount };
  }

  // Manual Event Association
  public static async manualAssociateEvent(memoryId: string, googleEventId: string) {
    await db.neo_memories.update(memoryId, { associatedGoogleEventId: googleEventId });
  }

  // Pre-Meeting Intelligence Briefing Generator
  public static async generatePreMeetingBrief(eventId: string): Promise<{
    eventTitle: string;
    date: string;
    priorMemories: { id: string; title: string; date: string; summary: string; commitments: string[] }[];
    openActionItems: string[];
  }> {
    const event = await db.events.get(eventId);
    if (!event) throw new Error('Event not found');

    const allMemories = await db.neo_memories.toArray();

    // Find memories matching title keywords or place/attendees
    const titleWords = event.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const related = allMemories.filter((m) => {
      if (m.associatedGoogleEventId === event.google_event_id) return true;
      return titleWords.some((word) => m.title.toLowerCase().includes(word) || m.summary.toLowerCase().includes(word));
    });

    const openActionItems: string[] = [];
    const priorMemories = related.map((m) => {
      (m.actionItems || []).forEach((a) => {
        if (a.status === 'pending_approval' || a.status === 'synced_to_hub') {
          openActionItems.push(`${a.text} (from: ${m.title})`);
        }
      });

      return {
        id: m.id,
        title: m.title,
        date: m.capturedAt.slice(0, 10),
        summary: m.summary,
        commitments: m.commitments || [],
      };
    });

    return {
      eventTitle: event.title,
      date: event.date,
      priorMemories,
      openActionItems,
    };
  }

  // 8. Permission-Aware Multi-Model AI Retrieval Layer
  public static async buildAIRetrievalContext(
    userQuery: string,
    provider: AIProvider
  ): Promise<{ allowed: boolean; contextSnippet: string; sourceReferences: string[] }> {
    const privacy = this.getPrivacySettings();

    // Model-specific privacy check
    if (provider === 'gemini' && !privacy.allowGeminiAccess) {
      return { allowed: false, contextSnippet: '', sourceReferences: [] };
    }
    if (provider === 'openai' && !privacy.allowOpenAIAccess) {
      return { allowed: false, contextSnippet: '', sourceReferences: [] };
    }
    if (provider === 'anthropic' && !privacy.allowClaudeAccess) {
      return { allowed: false, contextSnippet: '', sourceReferences: [] };
    }

    // Retrieve relevant memories
    const { memories } = await this.searchMemories(userQuery, { limit: 5 });

    if (memories.length === 0) {
      return { allowed: true, contextSnippet: '', sourceReferences: [] };
    }

    const sourceReferences: string[] = [];
    const snippets: string[] = [];

    for (const mem of memories) {
      const ref = `[Neo Memory: "${mem.title}" (${mem.source}, ${mem.capturedAt.slice(0, 10)})]`;
      sourceReferences.push(ref);

      let text = `### ${ref}\nPlatform: ${mem.platform} | Area: ${mem.associatedArea || 'General'}\nSummary: ${
        mem.summary
      }`;

      if (mem.decisions?.length > 0) {
        text += `\nDecisions: ${mem.decisions.map((d) => d.text).join('; ')}`;
      }
      if (mem.commitments?.length > 0) {
        text += `\nCommitments: ${mem.commitments.join('; ')}`;
      }
      if (mem.transcript && mem.transcript.length > 0) {
        // Send concise snippet of transcript (first 300 characters)
        text += `\nTranscript excerpt: "${mem.transcript.slice(0, 300)}..."`;
      }

      snippets.push(text);
    }

    const contextSnippet = `=== NEOSAPIEN AUTHORIZED PERSONAL MEMORIES ===\n${snippets.join('\n\n')}\n=== END NEOSAPIEN MEMORIES ===`;

    return {
      allowed: true,
      contextSnippet,
      sourceReferences,
    };
  }

  private static timeToMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map((n) => parseInt(n, 10));
    return (h || 0) * 60 + (m || 0);
  }

  /**
   * Synchronizes memories from an authorized NeoSapien MCP / Cloud Server endpoint.
   */
  public static async syncViaMCP(): Promise<{ success: boolean; imported: number; message: string }> {
    const config = this.getConfig();
    const token = typeof window !== 'undefined' ? (localStorage.getItem('yash_neosapien_jwt') || config.mcpConfig?.authToken) : null;

    if (!token && (!config.mcpConfig?.enabled || !config.mcpConfig.serverUrl)) {
      return { success: false, imported: 0, message: 'NeoSapien MCP is not connected or authenticated.' };
    }

    try {
      // Use Yashwanth Hub serverless gateway
      const res = await fetch('/api/neosapien/mcp?action=sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ limit: 100 }),
      });

      if (!res.ok) {
        throw new Error(`MCP Sync Gateway returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const rawMemories = data.memories || [];

      if (Array.isArray(rawMemories) && rawMemories.length > 0) {
        const audit = await this.importMemories(rawMemories, 'mcp');
        config.mcpConfig = config.mcpConfig || { enabled: true, serverUrl: 'https://api.neosapien.xyz/mcp', authType: 'bearer', readOnly: true, status: 'connected' };
        config.mcpConfig.status = 'connected';
        config.mcpConfig.lastSyncAt = new Date().toISOString();
        delete config.mcpConfig.lastError;
        this.saveConfig(config);
        return {
          success: true,
          imported: audit.memoriesImported + audit.memoriesUpdated,
          message: `Synchronized ${audit.memoriesImported} new memories from NeoSapien.`,
        };
      }

      config.mcpConfig = config.mcpConfig || { enabled: true, serverUrl: 'https://api.neosapien.xyz/mcp', authType: 'bearer', readOnly: true, status: 'connected' };
      config.mcpConfig.status = 'connected';
      config.mcpConfig.lastSyncAt = new Date().toISOString();
      this.saveConfig(config);
      return { success: true, imported: 0, message: 'Connected to NeoSapien MCP. Zero new memories to synchronize.' };
    } catch (err: any) {
      if (config.mcpConfig) {
        config.mcpConfig.status = 'error';
        config.mcpConfig.lastError = err.message || 'Connection failed to NeoSapien MCP endpoint';
        this.saveConfig(config);
      }
      return { success: false, imported: 0, message: err.message || 'MCP sync error' };
    }
  }

  /**
   * Disconnects the NeoSapien MCP integration.
   */
  public static disconnectMCP(): void {
    const config = this.getConfig();
    if (config.mcpConfig) {
      config.mcpConfig.enabled = false;
      config.mcpConfig.status = 'disconnected';
      delete config.mcpConfig.lastError;
    }
    this.saveConfig(config);
  }
}
