import { GoogleAuthService } from './googleAuthService';
import type { GmailFollowUpItem } from '../../types';

export class GmailService {
  private static BASE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me';

  // Fetch recent messages with metadata analysis for follow-ups
  public static async fetchImportantFollowUps(): Promise<GmailFollowUpItem[]> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) throw new Error('Google Workspace is not connected.');

    // Query for important or unread messages with follow-up signals
    const query = 'is:important or label:UNREAD';
    const listUrl = `${this.BASE_URL}/messages?q=${encodeURIComponent(query)}&maxResults=10`;

    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Gmail API error: ${res.statusText}`);
    }

    const listData = await res.json();
    const messages = listData.messages || [];
    const followUps: GmailFollowUpItem[] = [];

    for (const m of messages.slice(0, 5)) {
      const msgRes = await fetch(`${this.BASE_URL}/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
      if (lower.includes('by friday') || lower.includes('due') || lower.includes('deadline')) {
        suggestedAction = 'Review deliverable or reply with milestone status';
      } else if (lower.includes('call') || lower.includes('meeting') || lower.includes('schedule')) {
        suggestedAction = 'Confirm meeting time or provide calendar slot';
      }

      followUps.push({
        id: m.id,
        threadId: m.threadId,
        from,
        subject,
        date,
        snippet,
        detectedDeadline,
        suggestedAction,
        status: 'pending',
      });
    }

    return followUps;
  }
}
