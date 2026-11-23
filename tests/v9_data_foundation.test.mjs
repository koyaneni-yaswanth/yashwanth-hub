import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIFE_TABLES, LIFE_COLUMNS, toCloudRow, fromCloudRow, rowStamp, planReconcile, applyMods, isLifeTable } from '../src/services/sync/lifeSyncCore.ts';

const none = () => ({ upserts: new Set(), deletes: new Set() });
const goal = (id, updated_at, extra = {}) => ({ id, title: `Goal ${id}`, area: 'Personal', status: 'active', created_at: '2026-11-01T00:00:00.000Z', updated_at, ...extra });

test('toCloudRow sends every column, nulls for cleared fields, drops unknown fields', () => {
  const habit = { id: 'h1', title: 'Run', area: 'Personal', weekly_target: 3, archived: false, created_at: 'a', updated_at: 'b', localOnly: 1 };
  const row = toCloudRow('habits', habit, 'user-1');
  assert.equal(row.goal_id, null, 'unlinked goal is sent as null so the cloud clears it');
  assert.equal(row.user_id, 'user-1');
  assert.ok(!('localOnly' in row));
  assert.equal(toCloudRow('goals', goal('g', 't', { target_date: '' })).target_date, null, 'empty date -> null');
});

test('fromCloudRow drops user_id and nulls, normalises timestamps and numbers', () => {
  const r = fromCloudRow('focus_sessions', { user_id: 'u', id: 'f1', date: '2026-11-23', started_at: '2026-11-23T10:00:00+00:00', ended_at: null, actual_minutes: '24.5', distractions: [] });
  assert.ok(!('user_id' in r) && !('ended_at' in r));
  assert.equal(r.started_at, '2026-11-23T10:00:00.000Z');
  assert.equal(r.actual_minutes, 24.5);
});

test('rowStamp compares across timestamp formats', () => {
  assert.equal(rowStamp('goals', { updated_at: '2026-11-23T10:00:00.123Z' }), rowStamp('goals', { updated_at: '2026-11-23T10:00:00.123+00:00' }));
  assert.equal(rowStamp('focus_sessions', { started_at: '2026-11-23T10:00:00Z', ended_at: '2026-11-23T10:25:00Z' }), Date.parse('2026-11-23T10:25:00Z'));
});

test('planReconcile: newer wins, ties do nothing, new remote rows come down', () => {
  const local = [goal('a', '2026-11-20T00:00:00.000Z'), goal('b', '2026-11-22T00:00:00.000Z'), goal('c', '2026-11-21T00:00:00.000Z')];
  const remote = [goal('a', '2026-11-21T00:00:00+00:00'), goal('b', '2026-11-20T00:00:00+00:00'), goal('c', '2026-11-21T00:00:00+00:00'), goal('d', '2026-11-19T00:00:00+00:00')];
  const plan = planReconcile('goals', local, remote, none(), new Set());
  assert.deepEqual(plan.applyLocal.map((r) => r.id).sort(), ['a', 'd']);
  assert.deepEqual(plan.upload.map((r) => r.id), ['b']);
  assert.deepEqual(plan.deleteLocal, []);
});

test('planReconcile: queued local edits always win over the cloud copy', () => {
  const pending = { upserts: new Set(['a']), deletes: new Set(['d']) };
  const plan = planReconcile('goals', [goal('a', '2026-11-01T00:00:00Z')], [goal('a', '2026-11-30T00:00:00Z'), goal('d', '2026-11-30T00:00:00Z')], pending, new Set());
  assert.deepEqual(plan.applyLocal, [], 'a newer cloud copy must not overwrite a queued edit, nor resurrect a queued delete');
});

test('planReconcile: deleted elsewhere vs never uploaded', () => {
  const local = [goal('gone', 't1'), goal('fresh', 't1')];
  const plan = planReconcile('goals', local, [], none(), new Set(['gone']));
  assert.deepEqual(plan.deleteLocal, ['gone'], 'cloud had it before, now missing -> deleted on another device');
  assert.deepEqual(plan.upload.map((r) => r.id), ['fresh'], 'never seen in the cloud -> upload (first-time backfill)');
});

test('applyMods removes fields set to undefined', () => {
  assert.deepEqual(applyMods({ id: 'h', goal_id: 'g', title: 'x' }, { goal_id: undefined, title: 'y' }), { id: 'h', title: 'y' });
});

test('migration covers every synced table with owner-only RLS and realtime', () => {
  const sql = readFileSync('supabase/migrations/20261124_phase2_goals_habits_focus_sync.sql', 'utf8');
  for (const t of LIFE_TABLES) {
    const start = sql.indexOf(`create table if not exists public.${t} (`);
    assert.ok(start >= 0, t);
    const block = sql.slice(start, sql.indexOf('\n);', start));
    for (const col of Object.keys(LIFE_COLUMNS[t])) assert.ok(block.includes(`\n  ${col} `), `${t}.${col}`);
  }
  assert.match(sql, /enable row level security/);
  assert.match(sql, /using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/);
  assert.ok(!/drop table|truncate|delete from/i.test(sql), 'additive only');
  assert.ok(isLifeTable('habits') && !isLifeTable('tasks'));
});
