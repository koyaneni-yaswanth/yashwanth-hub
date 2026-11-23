// Regression tests for the defects found in the Phase 3 pre-deploy review.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNextOccurrence,
  nextDueAfterToday,
  normaliseRecurrence,
  alignAnchorDay,
  toCloudTaskPayload,
  hasTaskV3Values,
  mergeRemoteTask,
  classifyColumnProbeError,
  cleanSubtasks,
  TASK_V3_FIELDS,
} from '../src/lib/taskModel.ts';
import { createTaskMutations } from '../src/services/sync/taskMutations.ts';
import { resolveRemoteUpsert } from '../src/services/sync/conflict.ts';
import { matchLocalTask, decideStatusSync } from '../src/lib/googleTaskSync.ts';
import { timeSpan, formatTimeRange, clashesWith } from '../src/lib/calendarModel.ts';

const T = (id, extra = {}) => ({ id, text: `Task ${id}`, area: 'Personal', priority: 'medium', starred: false, done: false, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', ...extra });

/** A Dexie-like store with get(), plus a queue that records every change. */
function harness({ withGet = true } = {}) {
  const rows = new Map();
  const queued = [];
  const store = {
    add: async (t) => rows.set(t.id, structuredClone(t)),
    update: async (id, ch) => {
      if (!rows.has(id)) return 0;
      const next = { ...rows.get(id), ...ch };
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      rows.set(id, next);
      return 1;
    },
    put: async (t) => rows.set(t.id, structuredClone(t)),
    delete: async (id) => rows.delete(id),
    bulkDelete: async (ids) => ids.forEach((i) => rows.delete(i)),
  };
  if (withGet) store.get = async (id) => (rows.has(id) ? structuredClone(rows.get(id)) : undefined);
  let n = 0;
  let clock = 0;
  const svc = createTaskMutations(store, { enqueueChange: async (...a) => queued.push(a) }, {
    newId: () => `next${++n}`,
    now: () => new Date(Date.UTC(2026, 10, 24, 10, 0, clock++)).toISOString(),
    today: () => '2026-11-24',
  });
  return { rows, queued, svc };
}

// ---------------------------------------------------------------------------
// Repeating tasks
// ---------------------------------------------------------------------------

test('double-click with a stale task creates only one next occurrence', async () => {
  const { rows, svc, queued } = harness();
  const a = T('a', { due_date: '2026-11-24', recurrence: { freq: 'weekly', interval: 1 } });
  rows.set('a', a);
  const stale = structuredClone(a);
  await svc.toggleDone(stale);
  await svc.toggleDone(stale); // same snapshot again, as before the list re-renders
  const open = [...rows.values()].filter((t) => !t.done);
  assert.equal(open.length, 1, 'exactly one open next copy');
  assert.equal(rows.get('a').recurred_to, open[0].id);
  assert.equal(queued.filter(([, , action]) => action === 'INSERT').length, 1);
});

test('two completions at the same moment create only one next occurrence', async () => {
  const { rows, svc } = harness();
  rows.set('a', T('a', { due_date: '2026-11-24', recurrence: { freq: 'daily', interval: 1 } }));
  const snap = structuredClone(rows.get('a'));
  await Promise.all([svc.update(snap, { done: true }), svc.update(snap, { done: true })]);
  assert.equal([...rows.values()].filter((t) => !t.done).length, 1);
});

test('monthly series keeps its day of month after a short month (31 -> 28 -> 31)', () => {
  let t = T('m', { due_date: '2026-01-31', recurrence: { freq: 'monthly', interval: 1 } });
  const dues = [];
  for (let i = 0; i < 4; i++) {
    t = buildNextOccurrence(t, '2026-01-01', `m${i}`, 'now');
    dues.push(t.due_date);
  }
  assert.deepEqual(dues, ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  assert.equal(t.recurrence.day, 31);
});

test('yearly Feb 29 series comes back to Feb 29 in the next leap year', () => {
  let t = T('y', { due_date: '2028-02-29', recurrence: { freq: 'yearly', interval: 1 } });
  const dues = [];
  for (let i = 0; i < 4; i++) {
    t = buildNextOccurrence(t, '2028-01-01', `y${i}`, 'now');
    dues.push(t.due_date);
  }
  assert.deepEqual(dues, ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
});

test('a late or long-overdue completion schedules the next copy in the future', () => {
  assert.equal(nextDueAfterToday({ freq: 'daily', interval: 1 }, '2026-11-01', '2026-11-24'), '2026-11-25');
  assert.equal(nextDueAfterToday({ freq: 'weekly', interval: 1 }, '2026-11-02', '2026-11-24'), '2026-11-30', 'keeps the Monday rhythm');
  assert.equal(nextDueAfterToday({ freq: 'monthly', interval: 1 }, '2026-11-01', '2026-11-24'), '2026-12-01', 'one step is already in the future');
  assert.equal(nextDueAfterToday({ freq: 'daily', interval: 1, until: '2026-11-20' }, '2026-11-01', '2026-11-24'), null, 'series already ended');
  assert.equal(nextDueAfterToday({ freq: 'daily', interval: 1 }, '2026-11-24', '2026-11-24'), '2026-11-25', 'on-time completion: tomorrow');
});

test('a timestamp due date on a repeating task still steps by calendar days', () => {
  const n = buildNextOccurrence(T('ts', { due_date: '2026-11-24T00:00:00.000Z', recurrence: { freq: 'daily', interval: 1 } }), '2026-11-24', 'n', 'now');
  assert.equal(n.due_date, '2026-11-25');
});

test('anchor day: kept for monthly/yearly, re-aligned when the due date moves, dropped otherwise', () => {
  assert.equal(normaliseRecurrence({ freq: 'monthly', interval: 1, day: 31 }).day, 31);
  assert.equal(normaliseRecurrence({ freq: 'weekly', interval: 1, day: 31 }).day, undefined);
  assert.equal(normaliseRecurrence({ freq: 'monthly', interval: 1, day: 40 }).day, undefined);
  assert.equal(alignAnchorDay({ freq: 'monthly', interval: 1, day: 31 }, '2027-02-28').day, 31, 'clamped month end keeps the anchor');
  assert.equal(alignAnchorDay({ freq: 'monthly', interval: 1, day: 31 }, '2026-12-15').day, 15, 'moved due date re-anchors');
  assert.deepEqual(alignAnchorDay({ freq: 'weekly', interval: 1 }, '2026-12-15'), { freq: 'weekly', interval: 1 });
});

test('a task given a repeat again after finishing an old series starts a new one', async () => {
  const { rows, svc } = harness();
  rows.set('old', T('old', { done: false, recurred_to: 'x', due_date: '2026-11-24' }));
  await svc.update(rows.get('old'), { recurrence: { freq: 'weekly', interval: 1 }, recurred_to: undefined });
  const res = await svc.update(rows.get('old'), { done: true });
  assert.ok(res.next, 'completing it now creates the next copy');
});

// ---------------------------------------------------------------------------
// Cloud sync of the v3 fields
// ---------------------------------------------------------------------------

test('upload payload: stripped without the columns, every v3 column sent (null = empty) with them', () => {
  const row = T('a', { subtasks: [{ id: 's', text: 'x', done: false }], stage: 'doing' });
  const without = toCloudTaskPayload(row, false);
  for (const k of TASK_V3_FIELDS) assert.ok(!(k in without), k);
  const withCols = toCloudTaskPayload(row, true);
  assert.equal(withCols.subtasks.length, 1);
  assert.equal(withCols.stage, 'doing');
  assert.equal(withCols.recurrence, null);
  assert.equal(withCols.blocked_by, null);
  assert.equal(withCols.recurred_to, null);
  assert.equal(withCols.text, 'Task a');
});

test('hasTaskV3Values ignores defaults', () => {
  assert.ok(!hasTaskV3Values(T('a', { stage: 'todo', subtasks: [], blocked_by: [] })));
  assert.ok(hasTaskV3Values(T('a', { stage: 'doing' })));
  assert.ok(hasTaskV3Values(T('a', { recurrence: { freq: 'daily', interval: 1 } })));
  assert.ok(hasTaskV3Values(T('a', { subtasks: [{ id: 's', text: 'x', done: false }] })));
});

/** A PostgREST-like upsert: keys present in the body replace the stored ones. */
const cloudUpsert = (cloud, payload) => cloud.set(payload.id, { ...(cloud.get(payload.id) ?? {}), ...JSON.parse(JSON.stringify(payload)) });

test('clearing subtasks, the repeat and blockers sticks after the realtime echo (columns present)', async () => {
  const { rows, svc, queued } = harness();
  const start = T('a', { subtasks: [{ id: 's1', text: 'x', done: false }], recurrence: { freq: 'daily', interval: 1 }, blocked_by: ['b'] });
  rows.set('a', start);
  const cloud = new Map();
  cloudUpsert(cloud, toCloudTaskPayload(start, true));
  await svc.update(rows.get('a'), { subtasks: cleanSubtasks([]), recurrence: undefined, blocked_by: undefined });
  const [, , , payload] = queued.at(-1);
  cloudUpsert(cloud, toCloudTaskPayload(payload, true)); // what the flush sends
  const echo = cloud.get('a');
  assert.equal(echo.subtasks, null);
  assert.equal(resolveRemoteUpsert(rows.get('a'), echo, false), 'apply');
  const merged = mergeRemoteTask(rows.get('a'), echo);
  assert.equal(merged.subtasks, undefined);
  assert.equal(merged.recurrence, undefined);
  assert.equal(merged.blocked_by, undefined);
});

test('completing a repeating task clears the repeat on the finished copy in the cloud', async () => {
  const { rows, svc, queued } = harness();
  rows.set('a', T('a', { due_date: '2026-11-24', recurrence: { freq: 'daily', interval: 1 } }));
  await svc.toggleDone(rows.get('a'));
  const finished = queued.find(([, id, action]) => id === 'a' && action === 'UPDATE')[3];
  assert.equal(toCloudTaskPayload(finished, true).recurrence, null);
  assert.equal(toCloudTaskPayload(finished, true).recurred_to, 'next1');
});

test('v3 values saved before the columns existed survive the echo of a stripped upload', () => {
  const local = T('a', { subtasks: [{ id: 's1', text: 'x', done: false }], recurrence: { freq: 'weekly', interval: 1 } });
  // Echo of a row whose new columns are null (migration applied, values never uploaded).
  const echo = { ...T('a', { starred: true, updated_at: '2026-11-25T00:00:00.000Z' }), subtasks: null, recurrence: null, blocked_by: null, stage: null, recurred_to: null };
  const kept = mergeRemoteTask(local, echo, { keepLocalV3: true });
  assert.equal(kept.subtasks.length, 1);
  assert.equal(kept.recurrence.freq, 'weekly');
  assert.equal(kept.starred, true, 'other fields still update');
  const notProtected = mergeRemoteTask(local, echo);
  assert.equal(notProtected.subtasks, undefined, 'without protection a null means empty');
});

test('a cloud row without the v3 keys keeps local values; a brand-new remote task drops nulls', () => {
  const local = T('a', { stage: 'doing' });
  assert.equal(mergeRemoteTask(local, T('a')).stage, 'doing');
  const fresh = mergeRemoteTask(undefined, { ...T('b'), subtasks: null, stage: null });
  assert.ok(!('subtasks' in fresh) && !('stage' in fresh));
});

test('column check: only a missing column/table means no; network or server errors are unknown', () => {
  assert.equal(classifyColumnProbeError(null), 'yes');
  assert.equal(classifyColumnProbeError({ code: '42703', message: 'column tasks.subtasks does not exist' }), 'no');
  assert.equal(classifyColumnProbeError({ code: 'PGRST204', message: "Could not find the 'stage' column" }), 'no');
  assert.equal(classifyColumnProbeError({ message: 'column tasks.recurrence does not exist' }), 'no');
  assert.equal(classifyColumnProbeError({ message: 'TypeError: Failed to fetch', code: '' }), 'unknown');
  assert.equal(classifyColumnProbeError({ code: '503', message: 'Service Unavailable' }), 'unknown');
  assert.equal(classifyColumnProbeError({ code: 'PGRST301', message: 'JWT expired' }), 'unknown');
});

// ---------------------------------------------------------------------------
// Google Tasks
// ---------------------------------------------------------------------------

test('Google match: linked id first; title fallback skips repeats, finished copies, done and linked tasks', () => {
  const finished = T('fin', { text: 'Pay rent', done: true, recurred_to: 'nxt', google_task_id: 'g1' });
  const next = T('nxt', { text: 'Pay rent', recurrence: { freq: 'monthly', interval: 1 } });
  const plain = T('p', { text: 'Buy milk' });
  const tasks = [next, finished, plain];
  assert.equal(matchLocalTask({ id: 'g1', title: 'Pay rent' }, tasks).id, 'fin', 'by id, even though the open copy sorts first');
  assert.equal(matchLocalTask({ id: 'g2', title: 'Pay rent' }, tasks), undefined, 'never title-matches a repeating task');
  assert.equal(matchLocalTask({ id: 'g3', title: ' buy MILK ' }, tasks).id, 'p');
  assert.equal(matchLocalTask({ id: 'g3', title: 'Buy milk' }, tasks, new Set(['p'])), undefined, 'one local task per Google task');
});

test('Google status: newest side wins; a finished series copy is never reopened', () => {
  const at = (iso) => iso;
  assert.equal(decideStatusSync({ status: 'completed', updated: at('2026-11-24T10:00:00Z') }, { done: true, updated_at: at('2026-11-24T09:00:00Z') }), 'none');
  assert.equal(decideStatusSync({ status: 'needsAction', updated: at('2026-11-24T09:00:00Z') }, { done: true, updated_at: at('2026-11-24T10:00:00Z') }), 'export', 'hub completed later');
  assert.equal(decideStatusSync({ status: 'completed', updated: at('2026-11-24T11:00:00Z') }, { done: false, updated_at: at('2026-11-24T10:00:00Z') }), 'import', 'ticked in Google later');
  assert.equal(decideStatusSync({ status: 'needsAction', updated: at('2026-11-24T12:00:00Z') }, { done: true, updated_at: at('2026-11-24T10:00:00Z'), recurred_to: 'n' }), 'export', 'finished copy stays done');
  assert.equal(decideStatusSync({ status: 'completed' }, { done: false, updated_at: at('2026-11-24T10:00:00Z') }), 'import', 'no Google time: Google wins as before');
});

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

test('overnight events: span to midnight on the start date, labelled "next day", and they clash', () => {
  assert.deepEqual(timeSpan({ source: 'event', start: '23:00', end: '01:00' }), [1380, 1440]);
  assert.equal(formatTimeRange({ start: '23:00', end: '01:00' }), '23:00–01:00 (next day)');
  const items = [{ id: 'late', source: 'meeting', title: 'Late call', date: '2026-11-24', start: '23:30', end: '23:45' }];
  assert.equal(clashesWith({ source: 'event', date: '2026-11-24', start: '23:00', end: '01:00' }, items).length, 1);
});
