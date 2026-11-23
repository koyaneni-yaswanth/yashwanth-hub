import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotAt, lifeInsights, projectSystem, weekLabel } from '../src/lib/lifeInsights.ts';

const TODAY = '2026-11-23'; // Monday
const iso = (d, t = '09:00:00') => `${d}T${t}.000Z`;
const empty = { habits: [], logs: [], goals: [], milestones: [], sessions: [], tasks: [], notes: [], plans: [] };

test('snapshotAt hides later items and undoes later completions', () => {
  const data = {
    ...empty,
    goals: [
      { id: 'g1', title: 'A', area: 'x', status: 'active', created_at: iso('2026-11-01'), updated_at: iso('2026-11-01') },
      { id: 'g2', title: 'B', area: 'x', status: 'active', created_at: iso('2026-11-20'), updated_at: iso('2026-11-20') },
    ],
    milestones: [
      { id: 'm1', goal_id: 'g1', title: 's', week_start: '2026-11-09', done: true, done_at: iso('2026-11-18'), created_at: iso('2026-11-05'), updated_at: iso('2026-11-18') },
    ],
    logs: [
      { id: 'l1', habit_id: 'h', date: '2026-11-10', created_at: iso('2026-11-10') },
      { id: 'l2', habit_id: 'h', date: '2026-11-19', created_at: iso('2026-11-19') },
    ],
    tasks: [{ id: 't1', text: 't', area: 'x', priority: 'low', starred: false, done: true, created_at: iso('2026-11-02'), updated_at: iso('2026-11-17') }],
    plans: [{ id: '2026-11-14', available_minutes: 60, items: [], rescue: false, created_at: iso('2026-11-14'), updated_at: iso('2026-11-14') }],
  };
  const s = snapshotAt(data, '2026-11-15');
  assert.deepEqual(s.goals.map((g) => g.id), ['g1']);
  assert.equal(s.milestones[0].done, false, 'done on the 18th, so not yet done on the 15th');
  assert.deepEqual(s.logs.map((l) => l.id), ['l1']);
  assert.equal(s.tasks[0].done, false);
  assert.equal(s.plans.length, 1);
  assert.equal(data.milestones[0].done, true, 'the original data is untouched');
});

test('lifeInsights: focus peak, pace, habit, journal theme, task trend', () => {
  const session = (d, t, m) => ({
    id: d + t, date: d, preset: '50-10', planned_minutes: m, break_minutes: 10, label: 'x',
    started_at: `${d}T${t}`, actual_minutes: m, completed: true, interruptions: 0, distractions: [],
  });
  const task = (id, updated) => ({ id, text: id, area: 'x', priority: 'low', starred: false, done: true, created_at: iso('2026-11-01'), updated_at: iso(updated) });
  const note = (id, kind, tags, d) => ({ id, title: '', body: '', pinned: false, kind, tags, created_at: iso(d), updated_at: iso(d) });
  const data = {
    ...empty,
    sessions: [session('2026-11-17', '08:30:00', 90), session('2026-11-10', '09:00:00', 50), session('2026-11-19', '21:00:00', 25)],
    notes: [note('n1', 'reflection', ['testing'], '2026-11-20'), note('n2', 'lesson', ['testing', 'blades'], '2026-11-12'), note('n3', 'note', ['testing'], '2026-11-12')],
    tasks: [task('a', '2026-11-22'), task('b', '2026-11-21'), task('c', '2026-11-14')],
  };
  const g = (id, title) => ({ id, title, area: 'x', status: 'active', created_at: iso('2026-10-01'), updated_at: iso('2026-10-01') });
  const forecasts = [
    { goal: g('g1', 'Ship demo'), done: 3, total: 4, progress: 0.75, expected: 0.5, pace: 'ahead', weeklyRate: 1, projectedDate: TODAY },
    { goal: g('g2', 'TRL 5'), done: 1, total: 5, progress: 0.2, expected: 0.6, pace: 'at-risk', weeklyRate: 0, projectedDate: null },
  ];
  const ins = lifeInsights(data, TODAY, forecasts, [{ title: 'Read', consistency: 0.93 }, { title: 'Run', consistency: 0.5 }], 10);
  const ids = ins.map((i) => i.id);
  assert.ok(ids.includes('focus-peak'));
  assert.match(ins.find((i) => i.id === 'focus-peak').text, /peaked on \w+ mornings/);
  assert.ok(ids.includes('ahead-g1') && ids.includes('behind-g2'));
  assert.match(ins.find((i) => i.id === 'habit-best').text, /“Read” .* 93%/);
  assert.match(ins.find((i) => i.id === 'journal-theme').text, /“testing” came up in 2 journal entries/, 'plain notes are not journal entries');
  assert.match(ins.find((i) => i.id === 'tasks-trend').text, /2 tasks this week, 1 more than last week/);
  assert.equal(lifeInsights(data, TODAY, forecasts, [], 2).length, 2, 'limit is respected');
  assert.deepEqual(lifeInsights(empty, TODAY, [], []), []);
});

test('projectSystem prefers milestones, then tasks, then the manual figure', () => {
  const p = (o) => ({
    id: 'p1', title: 'P', description: '', area: 'x', status: 'active', priority: 'high', start_date: '', target_date: '',
    progress: 40, milestones: [], created_at: iso('2026-11-01'), updated_at: iso('2026-11-01'), ...o,
  });
  const t = (id, done, project_id) => ({ id, text: '', area: 'x', priority: 'low', starred: false, done, project_id, created_at: iso('2026-11-01'), updated_at: iso('2026-11-01') });
  const tasks = [t('t1', true, 'p1'), t('t2', false, 'p1'), t('t3', true, 'other')];
  const withMs = projectSystem(
    p({ milestones: [{ id: 'a', title: 'A', done: true }, { id: 'b', title: 'B', done: false }, { id: 'c', title: 'C', done: false }, { id: 'd', title: 'D', done: true }] }),
    tasks
  );
  assert.equal(withMs.source, 'milestones');
  assert.equal(withMs.progress, 0.5);
  assert.deepEqual([withMs.openTasks, withMs.doneTasks], [1, 1]);
  const byTasks = projectSystem(p({}), tasks);
  assert.equal(byTasks.source, 'tasks');
  assert.equal(byTasks.progress, 0.5);
  const manual = projectSystem(p({}), []);
  assert.equal(manual.source, 'manual');
  assert.equal(manual.progress, 0.4);
});

test('weekLabel', () => {
  assert.equal(weekLabel(0, TODAY), 'This week');
  assert.equal(weekLabel(1, '2026-11-16'), 'Last week');
  assert.equal(weekLabel(3, '2026-11-02'), 'Week of Oct 27');
});

test('rangeBuckets: week, month, quarter and year end today', async () => {
  const { rangeBuckets, sumByBucket } = await import('../src/lib/timeRanges.ts');
  const T = '2026-11-23';
  const w = rangeBuckets('week', T);
  assert.equal(w.length, 7);
  assert.equal(w.at(-1).from, T);
  assert.ok(w.at(-1).current);
  const m = rangeBuckets('month', T);
  assert.equal(m.length, 30);
  assert.equal(m[0].from, '2026-10-25');
  const q = rangeBuckets('quarter', T);
  assert.equal(q.length, 13);
  assert.equal(q.at(-1).from, '2026-11-23', 'Monday of this week');
  assert.equal(q[0].from, '2026-08-31');
  const y = rangeBuckets('year', T);
  assert.equal(y.length, 12);
  assert.deepEqual([y[0].from, y[0].to], ['2025-12-01', '2025-12-31']);
  assert.deepEqual([y.at(-1).from, y.at(-1).to], ['2026-11-01', '2026-11-30']);
  assert.equal(y[2].to, '2026-02-28', 'month ends respect month length');
  const sums = sumByBucket(q, [{ d: '2026-11-24', v: 2 }, { d: '2026-11-17', v: 5 }, { d: '2025-01-01', v: 9 }], (x) => x.d, (x) => x.v);
  assert.equal(sums.at(-1), 2);
  assert.equal(sums.at(-2), 5);
  assert.equal(sums.reduce((a, b) => a + b, 0), 7, 'out-of-range items are ignored');
});

test('describeRunningFocus reads a stored session safely', async () => {
  const { describeRunningFocus } = await import('../src/lib/focus.ts');
  const now = 1_000_000;
  const stored = JSON.stringify({ label: 'Blade test report', goal_id: 'g1', timer: { startedAt: now - 10 * 60000, plannedMs: 25 * 60000, pausedMs: 0 } });
  const r = describeRunningFocus(stored, now);
  assert.equal(r.label, 'Blade test report');
  assert.equal(r.goalId, 'g1');
  assert.equal(r.remainingMs, 15 * 60000);
  assert.equal(r.progress, 0.4);
  assert.equal(r.paused, false);
  assert.equal(describeRunningFocus(null, now), null);
  assert.equal(describeRunningFocus('{not json', now), null);
  assert.equal(describeRunningFocus(JSON.stringify({ timer: { startedAt: now - 30 * 60000, plannedMs: 25 * 60000, pausedMs: 0 } }), now), null, 'a finished session is not running');
  const paused = describeRunningFocus(JSON.stringify({ timer: { startedAt: now - 10 * 60000, plannedMs: 25 * 60000, pausedMs: 0, pausedAt: now - 5 * 60000 } }), now);
  assert.equal(paused.paused, true);
  assert.equal(paused.remainingMs, 20 * 60000, 'time while paused does not count');
});

test('toDueKey and dueStatus: overdue is never "due today", timestamps compare correctly', async () => {
  const { toDueKey, dueStatus } = await import('../src/lib/utils.ts');
  assert.equal(toDueKey('2026-11-04'), '2026-11-04');
  assert.equal(toDueKey('2026-11-04T00:00:00.000Z'), '2026-11-04', 'Google Tasks date-only encoding keeps its date');
  assert.equal(toDueKey('2026-11-04T00:00:00Z'), '2026-11-04');
  assert.equal(toDueKey(''), '');
  assert.equal(toDueKey(undefined), '');
  assert.equal(toDueKey('not a date'), '');
  const T = '2026-11-23';
  assert.equal(dueStatus('2026-11-04', false, T), 'overdue', 'the reported case: overdue since 4 Nov');
  assert.equal(dueStatus('2026-11-04T00:00:00.000Z', false, T), 'overdue');
  assert.equal(dueStatus('2026-11-23T00:00:00.000Z', false, T), 'today', 'a timestamp due today is today, not missing');
  assert.equal(dueStatus('2026-11-23', false, T), 'today');
  assert.equal(dueStatus('2026-11-25', false, T), 'upcoming');
  assert.equal(dueStatus('2026-11-04', true, T), 'none', 'done tasks are never overdue');
  assert.equal(dueStatus(undefined, false, T), 'none');
});
