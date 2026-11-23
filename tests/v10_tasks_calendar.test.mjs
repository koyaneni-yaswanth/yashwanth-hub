import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nextDueDate,
  describeRecurrence,
  buildNextOccurrence,
  normaliseRecurrence,
  subtaskProgress,
  cleanSubtasks,
  openBlockers,
  isBlocked,
  wouldCreateCycle,
  boardColumnOf,
  moveToColumn,
  mergeRemoteTask,
  stripTaskV3Fields,
  TASK_V3_FIELDS,
} from '../src/lib/taskModel.ts';
import { createTaskMutations } from '../src/services/sync/taskMutations.ts';
import { toMinutes, timeSpan, clashesWith, findClashes, endBeforeStart, rangeFor, sortDay, itemKey } from '../src/lib/calendarModel.ts';

const T = (id, extra = {}) => ({ id, text: `Task ${id}`, area: 'Personal', priority: 'medium', starred: false, done: false, created_at: 'c', updated_at: 'u', ...extra });

test('nextDueDate: daily, weekdays, weekly, monthly clamp, yearly leap, until', () => {
  assert.equal(nextDueDate({ freq: 'daily', interval: 1 }, '2026-11-23', '2026-11-23'), '2026-11-24');
  assert.equal(nextDueDate({ freq: 'daily', interval: 3 }, '2026-12-30', 'x'), '2027-01-02');
  assert.equal(nextDueDate({ freq: 'weekdays', interval: 1 }, '2026-11-27', 'x'), '2026-11-30', 'Friday -> Monday');
  assert.equal(nextDueDate({ freq: 'weekly', interval: 2 }, '2026-11-23', 'x'), '2026-12-07');
  assert.equal(nextDueDate({ freq: 'monthly', interval: 1 }, '2027-01-31', 'x'), '2027-02-28', 'clamped to month end');
  assert.equal(nextDueDate({ freq: 'yearly', interval: 1 }, '2028-02-29', 'x'), '2029-02-28');
  assert.equal(nextDueDate({ freq: 'weekly', interval: 1, until: '2026-11-29' }, '2026-11-23', 'x'), null, 'past until -> series ends');
  assert.equal(nextDueDate({ freq: 'daily', interval: 1 }, undefined, '2026-11-23'), '2026-11-24', 'no due date counts from today');
});

test('describe / normalise recurrence', () => {
  assert.equal(describeRecurrence({ freq: 'weekly', interval: 1 }), 'Every week');
  assert.equal(describeRecurrence({ freq: 'monthly', interval: 3, until: '2027-06-01' }), 'Every 3 months until 2027-06-01');
  assert.equal(describeRecurrence({ freq: 'daily', interval: 1 }), 'Daily');
  assert.equal(normaliseRecurrence({ freq: 'bogus', interval: 1 }), undefined);
  assert.equal(normaliseRecurrence({ freq: 'weekly', interval: 0 }).interval, 1);
});

test('buildNextOccurrence resets done, subtasks and Google link', () => {
  const t = T('a', { due_date: '2026-11-23', recurrence: { freq: 'weekly', interval: 1 }, done: true, google_task_id: 'g', subtasks: [{ id: 's', text: 'x', done: true }] });
  const n = buildNextOccurrence(t, '2026-11-23', 'b', 'now');
  assert.equal(n.id, 'b');
  assert.equal(n.due_date, '2026-11-30');
  assert.equal(n.done, false);
  assert.equal(n.google_task_id, undefined);
  assert.equal(n.subtasks[0].done, false);
  assert.deepEqual(n.recurrence, t.recurrence, 'the series moves to the new copy');
});

test('completing a repeating task creates exactly one next occurrence, even after undo + redo', async () => {
  const rows = new Map();
  const queued = [];
  const store = {
    add: async (t) => rows.set(t.id, t),
    update: async (id, ch) => {
      const next = { ...rows.get(id), ...ch };
      for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
      rows.set(id, next);
    },
    put: async (t) => rows.set(t.id, t),
    delete: async (id) => rows.delete(id),
    bulkDelete: async (ids) => ids.forEach((i) => rows.delete(i)),
  };
  let n = 0;
  const m = createTaskMutations(store, { enqueueChange: async (...a) => queued.push(a) }, { newId: () => `new${++n}`, now: () => 'now', today: () => '2026-11-23' });
  const t = T('a', { due_date: '2026-11-23', recurrence: { freq: 'daily', interval: 1 } });
  rows.set('a', t);
  const r1 = await m.update(rows.get('a'), { done: true });
  assert.equal(r1.next.id, 'new1');
  assert.equal(rows.get('new1').due_date, '2026-11-24');
  assert.equal(rows.get('a').recurrence, undefined, 'finished copy hands the series over');
  assert.equal(rows.get('a').recurred_to, 'new1');
  await m.update(rows.get('a'), { done: false });
  const r3 = await m.update(rows.get('a'), { done: true });
  assert.equal(r3.next, undefined, 'no duplicate on redo');
  assert.equal([...rows.keys()].length, 2);
  assert.ok(queued.some(([table, id, action]) => table === 'tasks' && id === 'new1' && action === 'INSERT'));
});

test('subtasks helpers', () => {
  assert.deepEqual(subtaskProgress({ subtasks: [{ done: true }, { done: false }] }), { done: 1, total: 2 });
  assert.equal(cleanSubtasks([{ id: '1', text: '  ', done: false }]), undefined);
  assert.equal(cleanSubtasks([{ id: '1', text: ' a ', done: false }])[0].text, 'a');
});

test('blocked by: open blockers, finished/missing ignored, cycles prevented', () => {
  const a = T('a', { blocked_by: ['b', 'c', 'gone'] });
  const b = T('b');
  const c = T('c', { done: true });
  const byId = new Map([a, b, c].map((t) => [t.id, t]));
  assert.deepEqual(openBlockers(a, byId).map((t) => t.id), ['b']);
  assert.ok(isBlocked(a, byId));
  assert.ok(!isBlocked({ ...a, done: true }, byId));
  // b waiting on a would loop (a already waits on b)
  assert.ok(wouldCreateCycle('b', 'a', byId));
  assert.ok(!wouldCreateCycle('c', 'b', byId));
  assert.ok(wouldCreateCycle('a', 'a', byId));
});

test('board columns', () => {
  assert.equal(boardColumnOf({ done: true, stage: 'doing' }), 'done');
  assert.equal(boardColumnOf({ done: false, stage: 'doing' }), 'doing');
  assert.equal(boardColumnOf({ done: false }), 'todo');
  assert.deepEqual(moveToColumn('done'), { done: true });
  assert.deepEqual(moveToColumn('doing'), { done: false, stage: 'doing' });
});

test('cloud safety: realtime merge keeps v3 fields the cloud lacks; stripping removes only v3 fields', () => {
  const local = T('a', { subtasks: [{ id: 's', text: 'x', done: false }], stage: 'doing' });
  const remote = T('a', { text: 'renamed' });
  const merged = mergeRemoteTask(local, remote);
  assert.equal(merged.text, 'renamed');
  assert.equal(merged.stage, 'doing');
  assert.equal(merged.subtasks.length, 1);
  assert.equal(mergeRemoteTask(local, { ...remote, stage: null }).stage, null, 'a cloud copy that has the column wins');
  const stripped = stripTaskV3Fields({ ...local, recurrence: { freq: 'daily', interval: 1 } });
  for (const k of TASK_V3_FIELDS) assert.ok(!(k in stripped));
  assert.equal(stripped.text, 'Task a');
});

test('task v3 migration is additive and adds every v3 column', () => {
  const sql = readFileSync('supabase/migrations/20261125_phase3_task_fields.sql', 'utf8');
  for (const k of TASK_V3_FIELDS) assert.ok(sql.includes(`add column if not exists ${k} `), k);
  assert.ok(!/drop |truncate|delete from/i.test(sql));
});

test('calendar: minutes, spans, end-before-start', () => {
  assert.equal(toMinutes('09:30'), 570);
  assert.equal(toMinutes('25:00'), null);
  assert.deepEqual(timeSpan({ source: 'event', start: '10:00' }), [600, 660], 'no end -> 1 hour');
  assert.equal(timeSpan({ source: 'task', start: '10:00' }), null);
  assert.equal(timeSpan({ source: 'event' }), null, 'all-day items never clash');
  assert.ok(endBeforeStart('11:00', '10:00'));
  assert.ok(endBeforeStart('11:00', '11:00'));
  assert.ok(!endBeforeStart('11:00', ''));
});

test('calendar: clash detection across events and meetings', () => {
  const items = [
    { id: 'e1', source: 'event', title: 'Lab', date: '2026-11-23', start: '10:00', end: '11:00' },
    { id: 'm1', source: 'meeting', title: 'Client', date: '2026-11-23', start: '10:30', end: '11:30' },
    { id: 'e2', source: 'event', title: 'Lunch', date: '2026-11-23', start: '11:30', end: '12:30' },
    { id: 'e3', source: 'event', title: 'Other day', date: '2026-11-24', start: '10:00', end: '11:00' },
    { id: 't1', source: 'task', title: 'Task', date: '2026-11-23' },
  ];
  const c = findClashes(items);
  assert.deepEqual([...c.keys()].sort(), ['event:e1', 'meeting:m1']);
  assert.ok(!c.has('event:e2'), 'touching end-to-start is not a clash');
  assert.deepEqual(clashesWith({ id: 'e1', source: 'event', date: '2026-11-23', start: '10:00', end: '11:00' }, items).map((x) => x.id), ['m1'], 'editing an event ignores itself');
  assert.equal(itemKey(items[0]), 'event:e1');
});

test('calendar: view ranges and day sorting', () => {
  const wed = new Date(2026, 10, 25);
  const week = rangeFor('week', wed);
  assert.equal(week.length, 7);
  assert.equal(week[0], '2026-11-22', 'weeks start on Sunday like the month grid');
  assert.deepEqual(rangeFor('day', wed), ['2026-11-25']);
  assert.equal(rangeFor('agenda', wed).length, 14);
  assert.deepEqual(sortDay([{ title: 'b', start: '09:00' }, { title: 'a' }, { title: 'c', start: '08:00' }]).map((x) => x.title), ['a', 'c', 'b']);
});
