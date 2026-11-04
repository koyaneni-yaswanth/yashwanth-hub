// Meeting Intelligence & AI Memory Automation Service
// Connects Google Calendar events with NeoSapien desktop/wearable conversation memories
// Implements approval-controlled AI workflow and idempotent task/event reconciliation.

import { db } from '../db';
import { getSupabaseClient } from '../lib/supabase';
import type {
  Meeting,
  NeoMemory,
  MeetingSummaryRecord,
  NeoActionItem,
  EventItem,
} from '../types';
import { GoogleCalendarService } from './google/googleCalendarService';
import { AIGateway } from './ai/aiGateway';
import { generateId, getTodayISO } from '../lib/utils';
import { SyncQueueService } from './sync/syncQueueService';

export interface MeetingBrief {
  meetingId: string;
  meetingTitle: string;
  scheduledTime: string;
  attendees: string[];
  pastMemoriesFound: number;
  relevantContextSnippet: string;
  previousOpenActionItems: string[];
  suggestedAgendaTopics: string[];
  preparedAt: string;
}

export interface MeetingIntelligenceResult {
  summaryRecord: MeetingSummaryRecord;
  extractedActionItems: NeoActionItem[];
  suggestedNextMeetingSlot?: string;
  draftFollowUpEmail: string;
  requiresUserApproval: boolean;
}

export class MeetingIntelligenceService {
  /**
   * Generates a Pre-Meeting Preparation Brief
   * Scans upcoming meeting, searches Neo memories for past mentions of attendees or topic,
   * and compiles uncompleted action items.
   */
  public static async generateMeetingBrief(meeting: Meeting): Promise<MeetingBrief> {
    const attendees = meeting.attendees
      ? meeting.attendees.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)
      : [];

    const keywords = meeting.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

    // Retrieve memories mentioning these attendees or keywords
    const allMemories = await db.neo_memories.toArray();
    const relevantMemories = allMemories.filter((mem) => {
      const text = `${mem.title} ${mem.summary} ${mem.peopleMentioned.join(' ')}`.toLowerCase();
      const matchAttendee = attendees.some((att) => text.includes(att));
      const matchKeyword = keywords.some((kw) => text.includes(kw));
      return matchAttendee || matchKeyword;
    });

    // Extract any previous open action items from those memories
    const openActionItems: string[] = [];
    relevantMemories.forEach((m) => {
      m.actionItems.forEach((ai) => {
        if (ai.status === 'pending_approval' || ai.status === 'approved') {
          openActionItems.push(ai.text);
        }
      });
    });

    const contextSnippets = relevantMemories
      .slice(0, 3)
      .map((m) => `[${m.capturedAt.slice(0, 10)}] ${m.title}: ${m.summary}`)
      .join('\n\n');

    // Use AI Gateway for intelligent agenda suggestion if available
    let suggestedAgenda: string[] = [
      `Review status of open commitments: ${openActionItems.slice(0, 2).join('; ') || 'None pending'}`,
      `Core discussion: ${meeting.title}`,
      `Confirm next steps and delivery owners`,
    ];

    try {
      const prompt = `You are an executive Chief of Staff. Generate 3 concise agenda bullet points for an upcoming meeting.\nTitle: ${meeting.title}\nContext from previous meetings:\n${contextSnippets || 'No previous recorded meetings.'}`;
      const response = await AIGateway.executePrompt(prompt, { mode: 'meeting' });
      const lines = response.text
        .split('\n')
        .map((l: string) => l.replace(/^[-*•\d.]\s*/, '').trim())
        .filter((l: string) => l.length > 5)
        .slice(0, 3);
      if (lines.length > 0) suggestedAgenda = lines;
    } catch {
      // Fallback heuristic agenda
    }

    return {
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      scheduledTime: `${meeting.date} ${meeting.start_time}`,
      attendees,
      pastMemoriesFound: relevantMemories.length,
      relevantContextSnippet: contextSnippets || 'No historical memories found for these attendees.',
      previousOpenActionItems: openActionItems.slice(0, 5),
      suggestedAgendaTopics: suggestedAgenda,
      preparedAt: new Date().toISOString(),
    };
  }

  /**
   * Automated Post-Meeting Pipeline (Approval-Controlled)
   * Ingests a new meeting memory, extracts executive summary, decisions, action items,
   * generates follow-up email draft, and finds an open calendar slot for the next meeting.
   */
  public static async processMeetingMemory(
    memory: NeoMemory,
    targetMeetingId?: string
  ): Promise<MeetingIntelligenceResult> {
    const meetingId = targetMeetingId || memory.associatedGoogleEventId || memory.id;

    // 1. Synthesize Executive Summary & Decisions
    const summaryText = memory.summary || 'Meeting completed with action items noted.';
    const decisions = memory.decisions.map((d) => d.text);
    if (decisions.length === 0 && memory.commitments.length > 0) {
      decisions.push(...memory.commitments);
    }

    // 2. Draft Professional Follow-Up Email
    const attendeesStr = memory.peopleMentioned.join(', ') || 'Team';
    const draftEmail = `Subject: Summary & Action Items: ${memory.title}

Hi ${attendeesStr},

Thank you for your time today. Here is the concise summary of our discussion and agreed-upon action items:

Summary:
${summaryText}

Key Decisions:
${decisions.map((d) => `• ${d}`).join('\n') || '• No major formal decisions recorded.'}

Agreed Next Steps:
${memory.actionItems.map((a) => `• ${a.text} ${a.assigneeName ? `(@${a.assigneeName})` : ''} ${a.detectedDeadline ? `[Due: ${a.detectedDeadline}]` : ''}`).join('\n') || '• No immediate action items assigned.'}

Please let me know if anything was missed or requires adjustment.

Best regards,
Yashwanth`;

    // 3. Suggest Next Meeting Time Slot (Checking Google Calendar for zero conflicts)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 7); // Default 1 week out
    const targetDateStr = tomorrow.toISOString().slice(0, 10);
    const conflicts = await GoogleCalendarService.detectConflicts(targetDateStr, '11:00', '12:00');
    const suggestedSlot = conflicts.length === 0 ? `${targetDateStr} 11:00 AM` : `${targetDateStr} 03:00 PM`;

    // 4. Create Structured MeetingSummaryRecord
    const summaryRecord: MeetingSummaryRecord = {
      id: `ms_${generateId()}`,
      meeting_id: meetingId,
      source_memory_id: memory.id,
      executive_summary: summaryText,
      key_decisions: decisions,
      action_items: memory.actionItems.map((a) => ({
        text: a.text,
        assignee: a.assigneeName,
        due: a.detectedDeadline,
      })),
      draft_follow_up_email: draftEmail,
      sentiment: 'constructive',
      suggested_next_meeting: suggestedSlot,
      approved_by_user: false, // Strict approval gate
      created_at: new Date().toISOString(),
    };

    // Store in IndexedDB and Supabase
    await db.meeting_summaries.put(summaryRecord);

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('meeting_summaries').upsert(summaryRecord);
      } catch (e) {
        console.warn('Supabase meeting summary sync deferred:', e);
      }
    }

    return {
      summaryRecord,
      extractedActionItems: memory.actionItems,
      suggestedNextMeetingSlot: suggestedSlot,
      draftFollowUpEmail: draftEmail,
      requiresUserApproval: true,
    };
  }

  /**
   * User Approval Gate: Approves Action Items and Creates Hub / Google Tasks
   */
  public static async approveAndCommitActionItems(
    actionItems: NeoActionItem[],
    area: string = 'Personal'
  ): Promise<{ committedCount: number }> {
    let count = 0;
    const now = new Date().toISOString();

    for (const item of actionItems) {
      if (item.status === 'approved' || item.status === 'synced_to_hub') continue;

      // Check for duplicate task text to enforce idempotency
      const existing = await db.tasks.where('text').equals(item.text).first();
      if (!existing) {
        const newTaskId = generateId();
        const newTask = {
          id: newTaskId,
          text: item.text,
          area: area as any,
          priority: item.priority || 'medium',
          starred: item.isCommitment,
          done: false,
          due_date: item.detectedDeadline ? item.detectedDeadline.slice(0, 10) : undefined,
          notes: `Auto-extracted from meeting memory. Assignee: ${item.assigneeName || 'Self'}`,
          created_at: now,
          updated_at: now,
        };
        await db.tasks.add(newTask);
        SyncQueueService.enqueueChange('tasks', newTaskId, 'INSERT', newTask);

        item.status = 'synced_to_hub';
        item.hubTaskId = newTaskId;
        count++;
      }
    }

    return { committedCount: count };
  }

  /**
   * User Approval Gate: Schedules Suggested Next Meeting
   * Never modifies or creates calendar event without explicit user call to this function
   */
  public static async approveAndScheduleNextMeeting(
    title: string,
    date: string,
    startTime: string,
    endTime: string,
    attendees: string,
    area: string = 'Personal'
  ): Promise<Meeting> {
    const newMeeting: Meeting = {
      id: generateId(),
      title: `Follow-up: ${title}`,
      date,
      start_time: startTime,
      end_time: endTime,
      attendees,
      location_or_link: 'https://meet.google.com/',
      area: area as any,
      agenda_and_notes: 'Scheduled via Yashwanth Hub Meeting Intelligence approval workflow.',
      status: 'scheduled',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.meetings.add(newMeeting);
    SyncQueueService.enqueueChange('meetings', newMeeting.id, 'INSERT', newMeeting);

    // Sync to Supabase if configured
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('meetings').insert(newMeeting);
      } catch (e) {
        console.warn('Supabase meeting sync deferred:', e);
      }
    }

    return newMeeting;
  }
}
