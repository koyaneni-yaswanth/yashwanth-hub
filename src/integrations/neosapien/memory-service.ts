// NeoSapien Integration: Memory Management & Knowledge Linking
import type { NeoMemory } from './types';
import { db } from '../../db';

export class NeoMemoryService {
  // Retrieve all memories
  public static async getAllMemories(): Promise<NeoMemory[]> {
    return db.neo_memories.orderBy('capturedAt').reverse().toArray();
  }

  // Get memory by ID
  public static async getMemoryById(id: string): Promise<NeoMemory | undefined> {
    return db.neo_memories.get(id);
  }

  // Link memory to a Yashwanth Hub project
  public static async linkProject(memoryId: string, projectId: string | undefined): Promise<void> {
    await db.neo_memories.update(memoryId, { associatedProjectId: projectId });
  }

  // Link memory to a Google Calendar event
  public static async linkCalendarEvent(memoryId: string, googleEventId: string | undefined): Promise<void> {
    await db.neo_memories.update(memoryId, { associatedGoogleEventId: googleEventId });
  }

  // Toggle important/starred status
  public static async toggleImportant(memoryId: string, isImportant: boolean): Promise<void> {
    await db.neo_memories.update(memoryId, { isImportant });
  }

  // Update user notes on a memory
  public static async updateUserNotes(memoryId: string, userNotes: string): Promise<void> {
    await db.neo_memories.update(memoryId, { userNotes });
  }

  // Delete a memory
  public static async deleteMemory(memoryId: string): Promise<void> {
    await db.neo_memories.delete(memoryId);
  }
}
