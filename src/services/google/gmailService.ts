import { GoogleAuthService } from './googleAuthService';
import { db } from '../../db';
import type { GmailFollowUpItem, Task } from '../../types';
import { generateId, getTodayISO } from '../../lib/utils';

export class GmailService {
  private static BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

  // Search messages with query
  public static async searchMessages(query: string = 'label:INBOX'): Promise<GmailFollowUpItem[]> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return [];

    try {
      const listUrl = `${this.BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=15`;
      const res = await fetch(listUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        GoogleAuthService.updateServiceStatus('gmail', { error: `Gmail API returned ${res.status}` });
        return [];
      }

      const listData = await res.json();
      const messages = listData.messages || [];
      const results: GmailFollowUpItem[] = [];

      for (const m of messages.slice(0, 10)) {
        const msgRes = await fetch(
          `${this.BASE_URL}/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!msgRes.ok) continue;

        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || 'No Subject';
        const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || 'Unknown';
        const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || '';
        const snippet = msgData.snippet || '';

        // Heuristic analysis for deadlines & follow-ups
        let detectedDeadline: string | undefined;
        let suggestedAction: string | undefined;

        const lower = snippet.toLowerCase();
        if (lower.includes('by tomorrow')) {
          detectedDeadline = 'Tomorrow';
          suggestedAction = 'Review deliverable or reply with milestone status';
        } else if (lower.includes('by friday') || lower.includes('due') || lower.includes('deadline')) {
          detectedDeadline = 'Upcoming milestone';
          suggestedAction = 'Review deliverable or reply with milestone status';
        } else if (lower.includes('call') || lower.includes('meeting') || lower.includes('schedule')) {
          suggestedAction = 'Confirm meeting time or provide calendar slot';
        }

        const item: GmailFollowUpItem = {
          id: m.id,
          threadId: m.threadId,
          from,
          subject,
          date,
          snippet,
          detectedDeadline,
          suggestedAction,
          status: 'pending',
        };

        results.push(item);
      }

      // Cache in Dexie gmail_messages
      if (results.length > 0) {
        await db.gmail_messages.bulkPut(results);
      }

      GoogleAuthService.updateServiceStatus('gmail', {
        lastSync: new Date().toISOString(),
        error: undefined,
        authorized: true,
      });

      return results;
    } catch (e: any) {
      console.warn('Gmail search error:', e);
      GoogleAuthService.updateServiceStatus('gmail', { error: e.message });
      return [];
    }
  }

  // Convert an email item to a Yashwanth Hub task with deep-link
  public static async convertEmailToTask(item: GmailFollowUpItem, area: string = 'Personal'): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      id: generateId(),
      text: `Follow up: ${item.subject}`,
      description: `From: ${item.from}\nDate: ${item.date}\nSnippet: ${item.snippet}\nSuggested: ${item.suggestedAction || 'Reply'}`,
      area,
      priority: item.detectedDeadline ? 'high' : 'medium',
      due_date: getTodayISO(),
      starred: true,
      done: false,
      notes: `Gmail Thread ID: ${item.threadId}`,
      created_at: now,
      updated_at: now,
    };
    await db.tasks.add(task);
    return task;
  }

  // Create a draft reply in Gmail (never sends automatically per security specification)
  public static async createDraftReply(
    to: string,
    subject: string,
    bodyText: string,
    threadId?: string
  ): Promise<boolean> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return false;

    // Build standard RFC 2822 email message
    const emailLines = [
      `To: ${to}`,
      `Subject: Re: ${subject.replace(/^Re:\s*/i, '')}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      bodyText,
    ];
    const rawEmail = emailLines.join('\r\n');
    const encodedRaw = btoa(unescape(encodeURIComponent(rawEmail)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const payload: any = {
      message: {
        raw: encodedRaw,
      },
    };
    if (threadId) {
      payload.message.threadId = threadId;
    }

    try {
      const res = await fetch(`${this.BASE_URL}/drafts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      return res.ok;
    } catch (e) {
      console.warn('Failed to create Gmail draft:', e);
      return false;
    }
  }
}
