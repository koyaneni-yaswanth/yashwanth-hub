import { db } from '../db';
import { NeoSapienMemoryService } from './neoSapienMemoryService';
import {
  rankUniversalSearchCorpus,
  type SearchHit,
  type SearchableCorpus,
} from './searchRanking';
import { SemanticMemoryService } from './semanticMemoryService';
import { blendKeywordAndSemanticResults } from '../lib/semanticSearchCore';

export { rankUniversalSearchCorpus, type SearchHit, type SearchableCorpus };

export class UniversalSearchService {
  public static async searchHybrid(query: string, limit = 25): Promise<SearchHit[]> {
    const [keywordHits, semanticMatches] = await Promise.all([
      this.searchAll(query, limit),
      SemanticMemoryService.searchSemantic(query, { limit: 8, minSimilarity: 0.35 }).catch(() => []),
    ]);
    if (semanticMatches.length === 0) return keywordHits;
    return blendKeywordAndSemanticResults(keywordHits, semanticMatches, limit);
  }

  public static async searchAll(query: string, limit = 25): Promise<SearchHit[]> {
    const [
      tasks,
      projects,
      notes,
      documents,
      neo_memories,
      robotics_records,
      meetings,
      events,
      contacts,
      expenses,
      goals,
      goal_milestones,
      habits,
    ] = await Promise.all([
      db.tasks.toArray(),
      db.projects.toArray(),
      db.notes.toArray(),
      db.documents.toArray(),
      db.neo_memories.toArray(),
      db.robotics_records.toArray().catch(() => []),
      db.meetings.toArray(),
      db.events.toArray(),
      db.contacts.toArray(),
      db.expenses.toArray(),
      db.goals.toArray().catch(() => []),
      db.goal_milestones.toArray().catch(() => []),
      db.habits.toArray().catch(() => []),
    ]);

    const privacy = NeoSapienMemoryService.getPrivacySettings();
    const allowNeo =
      privacy.allowGeminiAccess || privacy.allowOpenAIAccess || privacy.allowClaudeAccess;

    return rankUniversalSearchCorpus(
      query,
      {
        tasks,
        projects,
        notes,
        documents,
        neo_memories,
        robotics_records,
        meetings,
        events,
        contacts,
        expenses,
        goals,
        goal_milestones,
        habits,
      },
      { limit, includeNeoMemories: allowNeo }
    );
  }
}
