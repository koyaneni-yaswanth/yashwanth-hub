import { GoogleAuthService } from './googleAuthService';
import { db } from '../../db';
import type { GoogleDriveFile, DocumentItem } from '../../types';
import { generateId } from '../../lib/utils';

export class GoogleDriveService {
  private static BASE_URL = 'https://www.googleapis.com/drive/v3';

  // Search authorized Google Drive files
  public static async searchFiles(query: string = '', mimeTypeFilter?: string): Promise<GoogleDriveFile[]> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return [];

    let q = 'trashed = false';
    if (query.trim()) {
      q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }
    if (mimeTypeFilter) {
      q += ` and mimeType = '${mimeTypeFilter}'`;
    }

    const fields = 'files(id, name, mimeType, webViewLink, iconLink, size, modifiedTime)';
    const url = `${this.BASE_URL}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(
      fields
    )}&pageSize=30&orderBy=modifiedTime desc`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        GoogleAuthService.updateServiceStatus('drive', { error: `Drive API returned ${res.status}` });
        return [];
      }

      const data = await res.json();
      GoogleAuthService.updateServiceStatus('drive', {
        lastSync: new Date().toISOString(),
        error: undefined,
        authorized: true,
      });
      return data.files || [];
    } catch (e: any) {
      console.warn('Google Drive search error:', e);
      GoogleAuthService.updateServiceStatus('drive', { error: e.message });
      return [];
    }
  }

  // Create Google Doc, Sheet, or Slide directly via Drive API
  public static async createGoogleDoc(
    title: string,
    type: 'document' | 'spreadsheet' | 'presentation'
  ): Promise<GoogleDriveFile | null> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return null;

    const mimeMap = {
      document: 'application/vnd.google-apps.document',
      spreadsheet: 'application/vnd.google-apps.spreadsheet',
      presentation: 'application/vnd.google-apps.presentation',
    };

    try {
      const res = await fetch(`${this.BASE_URL}/files?fields=id,name,mimeType,webViewLink`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: title,
          mimeType: mimeMap[type],
        }),
      });

      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn('Failed to create Google Doc:', e);
      return null;
    }
  }

  // Import a Google Drive file reference into Yashwanth Hub local documents vault
  public static async importDriveFileToHub(
    file: GoogleDriveFile,
    area: string = 'Personal',
    projectId?: string
  ): Promise<DocumentItem> {
    const now = new Date().toISOString();
    const doc: DocumentItem = {
      id: generateId(),
      title: file.name,
      file_name: file.name,
      file_size: file.size || 0,
      mime_type: file.mimeType,
      tags: ['Google Drive'],
      area,
      project_id: projectId,
      google_drive_id: file.id,
      google_drive_link: file.webViewLink,
      created_at: now,
      updated_at: now,
    };
    await db.documents.add(doc);
    return doc;
  }
}
