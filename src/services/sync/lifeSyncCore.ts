/**
 * Pure rules for syncing the local-first "life" tables (goals, milestones,
 * habits, habit logs, daily plans, focus sessions) with their Supabase copies.
 * No Dexie or network here, so every rule is unit-tested.
 */

export const LIFE_TABLES = ['goals', 'habits', 'goal_milestones', 'habit_logs', 'daily_plans', 'focus_sessions'] as const;
export type LifeTable = (typeof LIFE_TABLES)[number];

type Kind = 'text' | 'date' | 'ts' | 'json' | 'num' | 'bool';

/** Cloud columns per table (see supabase/migrations/20261124_phase2_goals_habits_focus_sync.sql). */
export const LIFE_COLUMNS: Record<LifeTable, Record<string, Kind>> = {
  goals: { id: 'text', title: 'text', why: 'text', area: 'text', target_date: 'date', status: 'text', created_at: 'ts', updated_at: 'ts' },
  goal_milestones: { id: 'text', goal_id: 'text', title: 'text', week_start: 'date', done: 'bool', done_at: 'ts', created_at: 'ts', updated_at: 'ts' },
  habits: { id: 'text', title: 'text', goal_id: 'text', area: 'text', weekly_target: 'num', archived: 'bool', created_at: 'ts', updated_at: 'ts' },
  habit_logs: { id: 'text', habit_id: 'text', date: 'date', created_at: 'ts' },
  daily_plans: { id: 'text', available_minutes: 'num', items: 'json', rescue: 'bool', wrap_up: 'json', created_at: 'ts', updated_at: 'ts' },
  focus_sessions: {
    id: 'text', date: 'date', preset: 'text', planned_minutes: 'num', break_minutes: 'num', task_id: 'text', goal_id: 'text',
    label: 'text', started_at: 'ts', ended_at: 'ts', actual_minutes: 'num', completed: 'bool', interruptions: 'num',
    distractions: 'json', focus_rating: 'num', reflection: 'text',
  },
};

export function isLifeTable(name: string): name is LifeTable {
  return (LIFE_TABLES as readonly string[]).includes(name);
}

type Row = Record<string, unknown>;

/**
 * Local row -> cloud row. Every column is sent, with missing values as null,
 * so clearing a field locally (e.g. unlinking a habit from a goal) also clears
 * it in the cloud. Unknown local fields are dropped.
 */
export function toCloudRow(table: LifeTable, row: Row, userId?: string | null): Row {
  const out: Row = {};
  for (const [col, kind] of Object.entries(LIFE_COLUMNS[table])) {
    let v = row[col];
    if (v === undefined || (v === '' && (kind === 'date' || kind === 'ts'))) v = null;
    out[col] = v;
  }
  if (userId) out.user_id = userId;
  return out;
}

/** Cloud row -> local row: drops user_id, turns null into "absent", normalises timestamps to ISO. */
export function fromCloudRow(table: LifeTable, row: Row): Row {
  const out: Row = {};
  for (const [col, kind] of Object.entries(LIFE_COLUMNS[table])) {
    const v = row[col];
    if (v === null || v === undefined) continue;
    if (kind === 'ts') {
      const t = Date.parse(String(v));
      out[col] = Number.isNaN(t) ? v : new Date(t).toISOString();
    } else if (kind === 'num') {
      out[col] = typeof v === 'number' ? v : Number(v);
    } else if (kind === 'date') {
      out[col] = String(v).slice(0, 10);
    } else {
      out[col] = v;
    }
  }
  return out;
}

/** When a row last changed, in ms. Habit logs never change; focus sessions change when they end. */
export function rowStamp(table: LifeTable, row: Row | undefined): number {
  if (!row) return 0;
  const raw = table === 'focus_sessions' ? row.ended_at ?? row.started_at : row.updated_at ?? row.created_at;
  const t = Date.parse(String(raw ?? ''));
  return Number.isNaN(t) ? 0 : t;
}

export interface PendingIds {
  upserts: Set<string>;
  deletes: Set<string>;
}

export interface ReconcilePlan {
  /** Cloud rows to write locally (already converted to local shape). */
  applyLocal: Row[];
  /** Local ids deleted on another device. */
  deleteLocal: string[];
  /** Local rows the cloud is missing or has an older copy of. */
  upload: Row[];
  /** Ids now known to exist in the cloud (used to tell "deleted elsewhere" from "never uploaded"). */
  seen: string[];
}

/**
 * Two-way merge for one table.
 * - Queued local changes always win; their upload brings the cloud in line.
 * - Otherwise the newer copy wins (by rowStamp); ties change nothing.
 * - A local-only row that the cloud once had was deleted elsewhere: delete it.
 *   A local-only row the cloud never had is new here: upload it.
 */
export function planReconcile(
  table: LifeTable,
  localRows: Row[],
  remoteRows: Row[],
  pending: PendingIds,
  previouslySeen: Set<string>
): ReconcilePlan {
  const local = new Map(localRows.map((r) => [String(r.id), r]));
  const remote = new Map(remoteRows.map((r) => [String(r.id), fromCloudRow(table, r)]));
  const plan: ReconcilePlan = { applyLocal: [], deleteLocal: [], upload: [], seen: [...remote.keys()] };

  for (const [id, r] of remote) {
    if (pending.upserts.has(id) || pending.deletes.has(id)) continue;
    const l = local.get(id);
    if (!l) {
      plan.applyLocal.push(r);
      continue;
    }
    const lt = rowStamp(table, l);
    const rt = rowStamp(table, r);
    if (rt > lt) plan.applyLocal.push(r);
    else if (lt > rt) plan.upload.push(l);
  }

  for (const [id, l] of local) {
    if (remote.has(id) || pending.upserts.has(id)) continue;
    if (previouslySeen.has(id)) plan.deleteLocal.push(id);
    else plan.upload.push(l);
  }

  return plan;
}

/** Applies Dexie-style update mods ({ field: value }, undefined = remove) to a copy of the row. */
export function applyMods(row: Row, mods: Row): Row {
  const next: Row = { ...row };
  for (const [k, v] of Object.entries(mods)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next;
}
