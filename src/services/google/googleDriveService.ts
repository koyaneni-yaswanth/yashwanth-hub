import { GoogleAuthService } from './googleAuthService';
import type { GoogleDriveFile } from '../../types';

export class GoogleDriveService {
  private static BASE_URL = 'https://www.googleapis.com/drive/v3';

  // Search authorized Google Drive files
  public static async searchFiles(query: string = ''): Promise<GoogleDriveFile[]> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) throw new Error('Google Workspace is not connected.');

    let q = 'trashed = false';
    if (query.trim()) {
      q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
    }

    const fields = 'files(id, name, mimeType, webViewLink, iconLink, size, modifiedTime)';
    const url = `${this.BASE_URL}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(
      fields
    )}&pageSize=20`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Google Drive API error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  }
}
