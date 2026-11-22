/**
 * Pure planning logic for repairing duplicates created by the old first-run seeding
 * race. It only ever returns ids to delete; the caller performs the deletes.
 *
 * Safety rules:
 * - An area is only removed if it is an exact copy of a built-in seed area
 *   (same name, colour and description) AND an earlier copy of the same name is kept.
 *   Areas a user created or edited never match a seed signature, so they are never removed.
 * - Areas are referenced elsewhere by name (tasks.area, notes.area, ...), never by id,
 *   so keeping one row per name preserves every reference.
 * - A notification is only removed when every user-visible and state field matches
 *   another notification exactly; the earliest-kept copy keeps its read state if either was read.
 */

export interface SeedAreaDefinition {
  name: string;
  color: string;
  description?: string;
}

export interface AreaRow {
  id: string;
  name: string;
  color: string;
  description?: string;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  read: boolean;
  scheduled_for?: string;
  action_link?: string;
  related_record_id?: string;
  created_at: string;
}

export interface SeedRepairPlan {
  areaIdsToDelete: string[];
  notificationIdsToDelete: string[];
  /** Kept notifications that should be marked read because a removed copy was read. */
  notificationIdsToMarkRead: string[];
}

/** Stable id for a built-in seed area, so re-seeding with put() can never duplicate it. */
export function seedAreaId(name: string): string {
  return `seed-area-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

const byAge = <T extends { id: string; created_at: string }>(a: T, b: T) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

function matchesSeed(area: AreaRow, seeds: SeedAreaDefinition[]): boolean {
  return seeds.some(
    (s) =>
      s.name === area.name &&
      s.color === area.color &&
      (s.description ?? '') === (area.description ?? '')
  );
}

export function planSeedRepair(
  areas: AreaRow[],
  notifications: NotificationRow[],
  seedAreas: SeedAreaDefinition[]
): SeedRepairPlan {
  // Areas: keep the oldest row per name; drop later rows only if they are pristine seed copies.
  const areaIdsToDelete: string[] = [];
  const keptNames = new Set<string>();
  for (const area of [...areas].sort(byAge)) {
    const key = area.name.trim().toLowerCase();
    if (!keptNames.has(key)) {
      keptNames.add(key);
      continue;
    }
    if (matchesSeed(area, seedAreas)) areaIdsToDelete.push(area.id);
  }

  // Notifications: exact duplicates on every relevant field except id and read state.
  const notificationIdsToDelete: string[] = [];
  const notificationIdsToMarkRead = new Set<string>();
  const keptByKey = new Map<string, NotificationRow>();
  for (const n of [...notifications].sort(byAge)) {
    const key = JSON.stringify([
      n.title,
      n.message,
      n.type,
      n.priority,
      n.created_at,
      n.scheduled_for ?? null,
      n.action_link ?? null,
      n.related_record_id ?? null,
    ]);
    const kept = keptByKey.get(key);
    if (!kept) {
      keptByKey.set(key, n);
      continue;
    }
    notificationIdsToDelete.push(n.id);
    if (n.read && !kept.read) notificationIdsToMarkRead.add(kept.id);
  }

  return {
    areaIdsToDelete,
    notificationIdsToDelete,
    notificationIdsToMarkRead: [...notificationIdsToMarkRead],
  };
}
