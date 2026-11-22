import test from 'node:test';
import assert from 'node:assert/strict';
import { createSingleFlight, runWithLock } from '../src/lib/singleFlight.ts';
import { planSeedRepair, seedAreaId } from '../src/db/seedRepair.ts';
import { createTaskMutations } from '../src/services/sync/taskMutations.ts';
import { resolveRemoteUpsert, resolveRemoteDelete } from '../src/services/sync/conflict.ts';
import {
  parseNotificationPrefs,
  isWithinQuietHours,
  shouldRaiseAlert,
  findRecentDuplicate,
  DEFAULT_NOTIFICATION_PREFS,
} from '../src/services/notificationRules.ts';
import { computeHabitStats, weekStart, addDays, milestoneProgress, habitEncouragement } from '../src/lib/habits.ts';

const SEED_AREAS = [
  { name: 'PAWAN SHAKTI', color: '#0b6e6e', description: 'Small wind turbine innovation & TRL development' },
  { name: 'MG Automation', color: '#2563eb', description: 'Industrial automation & motion engineering' },
  { name: 'IvLabs', color: '#7c3aed', description: 'Robotics & autonomous systems research' },
  { name: 'Waffle Whizz', color: '#d97706', description: 'Retail food enterprise operations' },
  { name: 'Personal', color: '#059669', description: 'Health, personal development & finances' },
];

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Serialises callbacks per lock name, like navigator.locks across tabs. */
class FakeLockManager {
  chains = new Map();
  request(name, cb) {
    const prev = this.chains.get(name) ?? Promise.resolve();
    const run = prev.then(() => cb());
    this.chains.set(name, run.catch(() => {}));
    return run;
  }
}

/** Mimics the old check-then-seed startup, with awaits that let concurrent runs interleave. */
function makeSeeder(store, { stableIds }) {
  let counter = 0;
  return async () => {
    const count = store.size;
    await tick();
    if (count === 0) {
      for (const a of SEED_AREAS) {
        await tick();
        const id = stableIds ? seedAreaId(a.name) : `random-${++counter}-${Math.random()}`;
        store.set(id, { id, ...a, created_at: '2026-01-01T00:00:00.000Z' }); // put() semantics
      }
    }
  };
}

// ── Concurrent / repeated initialisation ──────────────────────────────────────

test('single-flight: StrictMode double invocation seeds once', async () => {
  const store = new Map();
  let runs = 0;
  const seed = makeSeeder(store, { stableIds: false });
  const init = createSingleFlight(async () => {
    runs++;
    await seed();
  });
  const [a, b] = [init(), init()];
  assert.equal(a, b, 'concurrent callers share one promise');
  await Promise.all([a, b]);
  assert.equal(runs, 1);
  assert.equal(store.size, 5);
});

test('two tabs starting together seed once when a cross-tab lock is available', async () => {
  const store = new Map();
  const locks = new FakeLockManager();
  const seed = makeSeeder(store, { stableIds: false });
  const tabA = createSingleFlight(() => runWithLock(locks, 'db-init', seed));
  const tabB = createSingleFlight(() => runWithLock(locks, 'db-init', seed));
  await Promise.all([tabA(), tabB()]);
  assert.equal(store.size, 5);
});

test('without a lock, random seed ids reproduce the old duplicate bug', async () => {
  const store = new Map();
  const seed = makeSeeder(store, { stableIds: false });
  await Promise.all([runWithLock(undefined, 'db-init', seed), runWithLock(undefined, 'db-init', seed)]);
  assert.equal(store.size, 10, 'documents the race the fix guards against');
});

test('without a lock, stable seed ids still prevent duplicates (fallback path)', async () => {
  const store = new Map();
  const seed = makeSeeder(store, { stableIds: true });
  await Promise.all([runWithLock(null, 'db-init', seed), runWithLock(null, 'db-init', seed)]);
  assert.equal(store.size, 5);
});

test('repeated startup (page reloads) never adds rows', async () => {
  const store = new Map();
  const locks = new FakeLockManager();
  const seed = makeSeeder(store, { stableIds: true });
  for (let reload = 0; reload < 3; reload++) {
    const init = createSingleFlight(() => runWithLock(locks, 'db-init', seed));
    await init();
    await init();
  }
  assert.equal(store.size, 5);
});

test('a failed startup can be retried', async () => {
  let attempt = 0;
  const init = createSingleFlight(async () => {
    attempt++;
    if (attempt === 1) throw new Error('transient');
    return 'ok';
  });
  await assert.rejects(init(), /transient/);
  assert.equal(await init(), 'ok');
  assert.equal(attempt, 2);
});

test('seedAreaId is stable and URL-safe', () => {
  assert.equal(seedAreaId('PAWAN SHAKTI'), 'seed-area-pawan-shakti');
  assert.equal(seedAreaId(' MG Automation '), 'seed-area-mg-automation');
});

// ── Duplicate repair: removes only pristine seed copies ───────────────────────

const area = (id, name, created_at, overrides = {}) => {
  const seed = SEED_AREAS.find((s) => s.name === name) ?? { color: '#000000', description: 'custom' };
  return { id, name, color: seed.color, description: seed.description, created_at, ...overrides };
};

test('repair removes later duplicate seed areas and keeps the oldest', () => {
  const areas = [
    area('b', 'IvLabs', '2026-01-01T00:00:01Z'),
    area('a', 'IvLabs', '2026-01-01T00:00:00Z'),
    area('c', 'Personal', '2026-01-01T00:00:00Z'),
    area('d', 'Personal', '2026-01-01T00:00:00Z'),
  ];
  const plan = planSeedRepair(areas, [], SEED_AREAS);
  assert.deepEqual(plan.areaIdsToDelete.sort(), ['b', 'd']);
});

test('repair never deletes user-created or user-edited areas', () => {
  const areas = [
    area('seed', 'IvLabs', '2026-01-01T00:00:00Z'),
    // Same name but the user changed its colour: not a pristine seed copy.
    area('edited', 'IvLabs', '2026-02-01T00:00:00Z', { color: '#ff0000' }),
    // Entirely user-created.
    area('mine', 'Side Project', '2026-03-01T00:00:00Z'),
    area('mine2', 'Side Project', '2026-03-02T00:00:00Z'),
  ];
  const plan = planSeedRepair(areas, [], SEED_AREAS);
  assert.deepEqual(plan.areaIdsToDelete, []);
});

test('repair keeps one row per area name so name-based references stay valid', () => {
  const areas = SEED_AREAS.flatMap((s, i) => [
    area(`x${i}`, s.name, '2026-01-01T00:00:00Z'),
    area(`y${i}`, s.name, '2026-01-01T00:00:00Z'),
  ]);
  const plan = planSeedRepair(areas, [], SEED_AREAS);
  const remaining = areas.filter((a) => !plan.areaIdsToDelete.includes(a.id)).map((a) => a.name);
  assert.deepEqual(remaining.sort(), SEED_AREAS.map((s) => s.name).sort());
});

const notif = (id, overrides = {}) => ({
  id,
  title: 'Review blade pitch data',
  message: 'Due tomorrow',
  type: 'deadline',
  priority: 'high',
  read: false,
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('repair removes only exact duplicate notifications and preserves read state', () => {
  const notifications = [
    notif('n1'),
    notif('n2', { read: true }), // exact copy (read state is not part of identity)
    notif('n3', { created_at: '2026-01-01T00:00:00.001Z' }), // different time: kept
    notif('n4', { message: 'Due today' }), // different message: kept
    notif('n5', { action_link: 'tasks' }), // different link: kept
  ];
  const plan = planSeedRepair([], notifications, SEED_AREAS);
  assert.deepEqual(plan.notificationIdsToDelete, ['n2']);
  assert.deepEqual(plan.notificationIdsToMarkRead, ['n1']);
});

// ── Task synchronisation pathway ──────────────────────────────────────────────

function makeTaskHarness({ failQueue = false } = {}) {
  const rows = new Map();
  const queued = [];
  const store = {
    add: async (t) => { if (rows.has(t.id)) throw new Error('exists'); rows.set(t.id, { ...t }); },
    update: async (id, ch) => { rows.set(id, { ...rows.get(id), ...ch }); },
    put: async (t) => { rows.set(t.id, { ...t }); },
    delete: async (id) => { rows.delete(id); },
    bulkDelete: async (ids) => ids.forEach((id) => rows.delete(id)),
  };
  const queue = {
    enqueueChange: async (table, id, action, payload) => {
      if (failQueue) throw new Error('queue unavailable');
      queued.push({ table, id, action, payload });
    },
  };
  let clock = 0;
  const errors = [];
  const tasks = createTaskMutations(store, queue, {
    now: () => `2026-01-01T00:00:0${clock++}.000Z`,
    newId: () => `t${rows.size + 1}`,
    onQueueError: (e) => errors.push(e),
  });
  return { rows, queued, tasks, errors };
}

const baseTask = { text: 'Bench test generator', area: 'PAWAN SHAKTI', priority: 'high', starred: false, done: false };

test('create writes locally then queues an INSERT with the full task', async () => {
  const h = makeTaskHarness();
  const { task, sync } = await h.tasks.create(baseTask);
  assert.equal(sync, 'queued');
  assert.deepEqual(h.rows.get(task.id), task);
  assert.equal(h.queued.length, 1);
  assert.equal(h.queued[0].action, 'INSERT');
  assert.equal(h.queued[0].table, 'tasks');
  assert.deepEqual(h.queued[0].payload, task);
});

test('complete, star and schedule each persist and queue an UPDATE with the merged task', async () => {
  const h = makeTaskHarness();
  const { task } = await h.tasks.create(baseTask);
  const done = (await h.tasks.toggleDone(task)).task;
  const starred = (await h.tasks.toggleStar(done)).task;
  const scheduled = (await h.tasks.scheduleFor(starred, '2026-01-05')).task;
  const local = h.rows.get(task.id);
  assert.equal(local.done, true);
  assert.equal(local.starred, true);
  assert.equal(local.due_date, '2026-01-05');
  assert.equal(local.updated_at, scheduled.updated_at);
  const updates = h.queued.filter((q) => q.action === 'UPDATE');
  assert.equal(updates.length, 3);
  assert.deepEqual(updates.at(-1).payload, scheduled);
  assert.ok(updates.at(-1).payload.updated_at > task.updated_at);
});

test('delete with undo: no cloud delete until committed, restore leaves nothing queued', async () => {
  const h = makeTaskHarness();
  const { task } = await h.tasks.create(baseTask);
  await h.tasks.removeLocally(task);
  assert.equal(h.rows.has(task.id), false);
  await h.tasks.restore(task);
  assert.deepEqual(h.rows.get(task.id), task);
  assert.equal(h.queued.filter((q) => q.action === 'DELETE').length, 0);

  await h.tasks.removeLocally(task);
  await h.tasks.commitRemove(task.id);
  assert.deepEqual(h.queued.at(-1), { table: 'tasks', id: task.id, action: 'DELETE', payload: { id: task.id } });
});

test('a sync-queue failure never discards the local change and is reported', async () => {
  const h = makeTaskHarness({ failQueue: true });
  const { task, sync } = await h.tasks.create(baseTask);
  assert.equal(sync, 'queue-failed');
  assert.ok(h.rows.has(task.id), 'local write kept');
  assert.equal(h.errors.length, 1);
});

test('removeMany deletes locally and queues one DELETE per task', async () => {
  const h = makeTaskHarness();
  const a = (await h.tasks.create(baseTask)).task;
  const b = (await h.tasks.create({ ...baseTask, text: 'Other' })).task;
  await h.tasks.removeMany([a, b]);
  assert.equal(h.rows.size, 0);
  assert.deepEqual(h.queued.filter((q) => q.action === 'DELETE').map((q) => q.id).sort(), [a.id, b.id].sort());
});

// ── Conflict rules ────────────────────────────────────────────────────────────

test('remote changes never overwrite unsynced local edits', () => {
  const local = { updated_at: '2026-01-02T00:00:00Z' };
  assert.equal(resolveRemoteUpsert(undefined, { updated_at: '2026-01-01T00:00:00Z' }, false), 'apply');
  assert.equal(resolveRemoteUpsert(local, { updated_at: '2026-01-03T00:00:00Z' }, false), 'apply');
  assert.equal(resolveRemoteUpsert(local, { updated_at: '2026-01-01T00:00:00Z' }, false), 'keep-local');
  assert.equal(resolveRemoteUpsert(local, { updated_at: '2026-01-09T00:00:00Z' }, true), 'keep-local');
  assert.equal(resolveRemoteDelete(true), 'keep-local');
  assert.equal(resolveRemoteDelete(false), 'apply');
});

// ── Notifications ─────────────────────────────────────────────────────────────

test('notification prefs: defaults, legacy quiet hours and validation', () => {
  assert.deepEqual(parseNotificationPrefs(null), DEFAULT_NOTIFICATION_PREFS);
  const legacy = parseNotificationPrefs(null, JSON.stringify({ start: 23, end: 6 }));
  assert.equal(legacy.quietStart, 23);
  assert.equal(legacy.quietEnd, 6);
  const bad = parseNotificationPrefs('{"quietStart": 99, "mutedAlertTypes": ["ai", 4]}');
  assert.equal(bad.quietStart, 22);
  assert.deepEqual(bad.mutedAlertTypes, ['ai']);
  assert.deepEqual(parseNotificationPrefs('not json'), DEFAULT_NOTIFICATION_PREFS);
});

test('quiet hours wrap midnight and muted types never raise alerts', () => {
  const prefs = { ...DEFAULT_NOTIFICATION_PREFS, mutedAlertTypes: ['ai'] };
  assert.equal(isWithinQuietHours(23, prefs), true);
  assert.equal(isWithinQuietHours(3, prefs), true);
  assert.equal(isWithinQuietHours(12, prefs), false);
  assert.equal(isWithinQuietHours(23, { ...prefs, quietHoursEnabled: false }), false);
  assert.equal(shouldRaiseAlert('deadline', 12, prefs), true);
  assert.equal(shouldRaiseAlert('ai', 12, prefs), false);
  assert.equal(shouldRaiseAlert('deadline', 23, prefs), false);
});

test('an identical unread notification within the window is treated as a duplicate', () => {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const existing = [notif('n1', { created_at: '2026-01-01T10:00:00Z' })];
  const candidate = { title: existing[0].title, message: existing[0].message, type: 'deadline' };
  assert.equal(findRecentDuplicate(existing, candidate, now)?.id, 'n1');
  assert.equal(findRecentDuplicate([{ ...existing[0], read: true }], candidate, now), undefined);
  assert.equal(findRecentDuplicate(existing, { ...candidate, message: 'x' }, now), undefined);
  assert.equal(findRecentDuplicate(existing, candidate, now + 24 * 3600 * 1000), undefined);
});

// ── Habits & goals ────────────────────────────────────────────────────────────

test('week starts on Monday and date maths crosses month boundaries', () => {
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // Sunday → Monday
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.equal(addDays('2026-11-30', 1), '2026-12-01');
});

test('daily streak is not broken just because today is not checked off yet', () => {
  const today = '2026-11-22';
  const s = computeHabitStats(['2026-11-19', '2026-11-20', '2026-11-21'], today);
  assert.equal(s.current, 3);
  assert.equal(s.doneToday, false);
  const s2 = computeHabitStats(['2026-11-19', '2026-11-20', '2026-11-21', today], today);
  assert.equal(s2.current, 4);
  assert.equal(s2.best, 4);
});

test('a missed day resets the current streak but best streak is remembered', () => {
  const s = computeHabitStats(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-20', '2026-11-21'], '2026-11-22');
  assert.equal(s.current, 2);
  assert.equal(s.best, 4);
  assert.equal(s.last7, 2);
});

test('weekly habits streak by weeks that met the target; an in-progress week does not count against it', () => {
  // Target 3/week. Weeks of Nov 2 and Nov 9 met (3 each); current week (Nov 16) has 1 so far.
  const dates = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-12', '2026-11-18'];
  const s = computeHabitStats(dates, '2026-11-22', 3);
  assert.equal(s.unit, 'week');
  assert.equal(s.current, 2, 'the two completed weeks still count while this week is in progress');
  assert.equal(s.best, 2);
  // Once a past week misses its target, the chain before it no longer counts.
  const gap = computeHabitStats(['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-18'], '2026-11-22', 3);
  assert.equal(gap.current, 0);
  assert.equal(gap.best, 1);
  assert.equal(s.thisWeek, 1);
  assert.match(habitEncouragement(s, 3), /2 more this week/);
});

test('milestone progress and encouragement copy never shame', () => {
  assert.equal(milestoneProgress([]), 0);
  assert.equal(milestoneProgress([{ done: true }, { done: false }, { done: true }, { done: false }]), 50);
  const fresh = computeHabitStats([], '2026-11-22');
  const msg = habitEncouragement(fresh, 7);
  assert.doesNotMatch(msg, /fail|missed|broke|lost/i);
});
