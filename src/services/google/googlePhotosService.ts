import { GoogleAuthService } from './googleAuthService';
import { db } from '../../db';
import type { GooglePhotoItem } from '../../types';
import { generateId } from '../../lib/utils';

export class GooglePhotosService {
  private static PICKER_URL = 'https://photospicker.googleapis.com/v1';

  // 1. Create a Google Photos Picker Session
  public static async createPickerSession(): Promise<{ sessionId: string; pickerUri: string } | null> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) {
      console.warn('Google Access Token missing for Photos Picker');
      return null;
    }

    try {
      const res = await fetch(`${this.PICKER_URL}/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        GoogleAuthService.updateServiceStatus('photos', {
          error: `Photos Picker API returned ${res.status}: ${res.statusText}`,
        });
        return null;
      }

      const data = await res.json();
      return {
        sessionId: data.id,
        pickerUri: data.pickerUri,
      };
    } catch (e: any) {
      console.warn('Failed to create Photos Picker session:', e);
      GoogleAuthService.updateServiceStatus('photos', { error: e.message });
      return null;
    }
  }

  // 2. Poll and retrieve selected media items from the session
  public static async retrieveSelectedPhotos(sessionId: string, projectId?: string, area: string = 'Personal'): Promise<GooglePhotoItem[]> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return [];

    try {
      // Check session status
      const sessionRes = await fetch(`${this.PICKER_URL}/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sessionRes.ok) return [];
      const sessionData = await sessionRes.json();

      if (!sessionData.mediaItemsSet) {
        return []; // User hasn't finished selecting photos yet
      }

      // Fetch the selected media items
      const itemsRes = await fetch(`${this.PICKER_URL}/mediaItems?sessionId=${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!itemsRes.ok) return [];
      const itemsData = await itemsRes.json();

      const imported: GooglePhotoItem[] = [];
      const rawItems = itemsData.mediaItems || [];

      for (const item of rawItems) {
        const photo: GooglePhotoItem = {
          id: generateId(),
          mediaItemId: item.id,
          filename: item.filename || 'GooglePhoto.jpg',
          mimeType: item.mimeType || 'image/jpeg',
          baseUrl: item.mediaFile?.baseUrl || item.baseUrl || '',
          productUrl: item.productUrl,
          description: item.description,
          selectedAt: new Date().toISOString(),
          project_id: projectId,
          area,
        };

        await db.photos_media.add(photo);
        imported.push(photo);
      }

      GoogleAuthService.updateServiceStatus('photos', {
        lastSync: new Date().toISOString(),
        error: undefined,
        authorized: true,
      });

      return imported;
    } catch (e: any) {
      console.warn('Failed to retrieve selected photos:', e);
      GoogleAuthService.updateServiceStatus('photos', { error: e.message });
      return [];
    }
  }
}
