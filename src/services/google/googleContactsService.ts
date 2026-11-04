import { GoogleAuthService } from './googleAuthService';
import { db } from '../../db';
import type { Contact } from '../../types';
import { generateId } from '../../lib/utils';

export class GoogleContactsService {
  private static BASE_URL = 'https://people.googleapis.com/v1';

  // Fetch contacts from Google People API
  public static async fetchContacts(): Promise<Contact[]> {
    const token = GoogleAuthService.getAccessToken();
    if (!token) return [];

    try {
      const res = await fetch(
        `${this.BASE_URL}/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        GoogleAuthService.updateServiceStatus('contacts', { error: `People API error: ${res.status}` });
        return [];
      }

      const data = await res.json();
      const connections = data.connections || [];
      const localContacts = await db.contacts.toArray();
      const imported: Contact[] = [];

      for (const p of connections) {
        const name = p.names?.[0]?.displayName || 'Unnamed Contact';
        const email = p.emailAddresses?.[0]?.value || '';
        const phone = p.phoneNumbers?.[0]?.value || '';
        const company = p.organizations?.[0]?.name || '';
        const role = p.organizations?.[0]?.title || 'Contact';

        // Duplicate avoidance check
        const exists = localContacts.find(
          (c) => (email && c.email?.toLowerCase() === email.toLowerCase()) || (phone && c.phone === phone)
        );

        if (!exists) {
          const now = new Date().toISOString();
          const newContact: Contact = {
            id: generateId(),
            name,
            email,
            phone,
            company,
            role,
            area: 'Personal',
            created_at: now,
            updated_at: now,
          };
          await db.contacts.add(newContact);
          imported.push(newContact);
        }
      }

      GoogleAuthService.updateServiceStatus('contacts', {
        lastSync: new Date().toISOString(),
        error: undefined,
        authorized: true,
      });

      return imported;
    } catch (e: any) {
      console.warn('Google Contacts sync error:', e);
      GoogleAuthService.updateServiceStatus('contacts', { error: e.message });
      return [];
    }
  }
}
