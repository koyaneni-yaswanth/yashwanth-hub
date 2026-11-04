// NeoSapien Integration: Data Normalization
import type { NeoMemory, NeoActionItem, NeoDecision, NeoMeetingPlatform, NeoMemorySource } from '../../types';
import { generateId } from '../../lib/utils';

export class NeoNormalizationService {
  // Normalizes an arbitrary raw payload into canonical NeoMemory
  public static normalizeRawMemory(raw: any, defaultSource: NeoMemorySource = 'web_import'): NeoMemory {
    const title = (raw.title || raw.topic || raw.meeting_name || 'Untitled Neo Memory').trim();
    const summary = (raw.summary || raw.overview || raw.description || '').trim();
    const capturedAt = raw.capturedAt || raw.date || raw.timestamp || raw.created_at || new Date().toISOString();

    const source: NeoMemorySource = raw.source || defaultSource;
    const platform: NeoMeetingPlatform = raw.platform || (source === 'desktop_meeting' ? 'google_meet' : 'in_person');

    // Normalize Action Items
    const rawActions = Array.isArray(raw.actionItems || raw.actions || raw.tasks)
      ? (raw.actionItems || raw.actions || raw.tasks)
      : [];
    const actionItems: NeoActionItem[] = rawActions.map((a: any, idx: number) => {
      if (typeof a === 'string') {
        return {
          id: `act_${generateId()}_${idx}`,
          text: a.trim(),
          priority: 'medium',
          status: 'pending_approval',
          isCommitment: true,
        };
      }
      return {
        id: a.id || `act_${generateId()}_${idx}`,
        text: (a.text || a.title || a.description || 'Action item').trim(),
        assigneeName: a.assigneeName || a.assignee || 'Founder',
        detectedDeadline: a.detectedDeadline || a.due_date || a.deadline,
        priority: a.priority || 'medium',
        status: a.status || 'pending_approval',
        isCommitment: Boolean(a.isCommitment ?? true),
        reconciliationStatus: a.reconciliationStatus || 'new_commitment',
      };
    });

    // Normalize Decisions
    const rawDecisions = Array.isArray(raw.decisions) ? raw.decisions : [];
    const decisions: NeoDecision[] = rawDecisions.map((d: any, idx: number) => {
      if (typeof d === 'string') {
        return { id: `dec_${generateId()}_${idx}`, text: d.trim() };
      }
      return {
        id: d.id || `dec_${generateId()}_${idx}`,
        text: (d.text || d.decision || '').trim(),
        context: d.context || d.madeBy,
      };
    });

    const tags: string[] = Array.isArray(raw.tags) ? raw.tags : [];
    const peopleMentioned: string[] = Array.isArray(raw.peopleMentioned || raw.people || raw.attendees)
      ? (raw.peopleMentioned || raw.people || raw.attendees)
      : [];

    const originalNeoId = raw.originalNeoId || raw.id || raw.neo_id;
    const id = generateId();

    const memory: NeoMemory = {
      id,
      originalNeoId,
      title,
      summary,
      source,
      platform,
      capturedAt,
      durationMinutes: Number(raw.durationMinutes || raw.duration) || 15,
      speakers: Array.isArray(raw.speakers) ? raw.speakers : [],
      transcript: raw.transcript || raw.raw_text,
      actionItems,
      decisions,
      commitments: Array.isArray(raw.commitments) ? raw.commitments : [],
      followUps: Array.isArray(raw.followUps) ? raw.followUps : [],
      reminders: Array.isArray(raw.reminders) ? raw.reminders : [],
      tags,
      peopleMentioned,
      associatedProjectId: raw.associatedProjectId || raw.project_id,
      associatedArea: raw.associatedArea || raw.area,
      associatedGoogleEventId: raw.associatedGoogleEventId || raw.google_event_id,
      importedAt: new Date().toISOString(),
      syncMethod: raw.syncMethod || (source === 'webhook' ? 'webhook' : source === 'mcp_sync' ? 'mcp' : 'json_export'),
    };

    return memory;
  }
}
