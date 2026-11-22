import test from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreTask,
  rankTasks,
  buildPlan,
  moveItem,
  planLoad,
  pruneMissing,
  splitForWrapUp,
  formatMinutes,
  RESCUE_MINUTES,
} from '../src/lib/dailyCompass.ts';
import {
  elapsedMs,
  remainingMs,
  pause,
  resume,
  formatClock,
  weeklyFocus,
  bestFocusWindow,
  clampMinutes,
  formatHour,
} from '../src/lib/focus.ts';

const TODAY = '2026-11-22';
let n = 0;
const task = (over = {}) => ({
  id: `t${++n}`,
  text: `Task ${n}`,
  area: 'IvLabs',
  priority: 'medium',
  starred: false,
  done: false,
  created_at: `2026-11-01T00:00:0${n % 10}.000Z`,
  updated_at: '2026-11-01T00:00:00.000Z',
  ...over,
});

// --- Daily Compass ---------------------------------------------------------

test('scoreTask: overdue urgent beats due-today medium beats undated low', () => {
  const overdue = scoreTask({ priority: 'urgent', due_date: '2026-11-20', starred: false }, TODAY);
  const dueToday = scoreTask({ priority: 'medium', due_date: TODAY, starred: false }, TODAY);
  const undated = scoreTask({ priority: 'low', starred: false }, TODAY);
  assert.ok(overdue > dueToday && dueToday > undated);
  assert.equal(scoreTask({ priority: 'low', starred: true }, TODAY), 15);
});

test('rankTasks skips done tasks and keeps a stable order on ties', () => {
  const a = task({ priority: 'high' });
  const b = task({ priority: 'high' });
  const done = task({ priority: 'urgent', done: true });
  assert.deepEqual(rankTasks([b, done, a], TODAY).map((t) => t.id), [a.id, b.id]);
});

test('buildPlan fills only up to the available time and skips to smaller tasks that fit', () => {
  const big = task({ priority: 'urgent' }); // 45
  const big2 = task({ priority: 'high' }); // 45
  const small = task({ priority: 'low' }); // 30
  const plan = buildPlan([big, big2, small], TODAY, { availableMinutes: 80 });
  assert.deepEqual(plan.map((i) => i.task_id), [big.id, small.id]);
  assert.equal(planLoad(plan, 80).plannedMinutes, 75);
});

test('buildPlan always includes the best task even if it alone exceeds the time', () => {
  const huge = task({ priority: 'urgent' });
  const plan = buildPlan([huge], TODAY, { availableMinutes: 10, estimates: { [huge.id]: 120 } });
  assert.deepEqual(plan, [{ task_id: huge.id, minutes: 120 }]);
});

test('buildPlan in rescue mode returns one small step', () => {
  const a = task({ priority: 'urgent' });
  const b = task({ priority: 'high' });
  const plan = buildPlan([a, b], TODAY, { rescue: true });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].task_id, a.id);
  assert.ok(plan[0].minutes <= RESCUE_MINUTES);
});

test('buildPlan with no open tasks is empty', () => {
  assert.deepEqual(buildPlan([task({ done: true })], TODAY), []);
});

test('moveItem reorders without mutating and clamps out-of-range targets', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(list, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(list, 0, 99), ['b', 'c', 'd', 'a']);
  assert.deepEqual(moveItem(list, 9, 0), list);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

test('planLoad reports light, balanced and over-planned days', () => {
  assert.equal(planLoad([{ task_id: 'x', minutes: 30 }], 240).state, 'light');
  assert.equal(planLoad([{ task_id: 'x', minutes: 200 }], 240).state, 'balanced');
  const over = planLoad([{ task_id: 'x', minutes: 300 }], 240);
  assert.equal(over.state, 'over');
  assert.equal(over.overBy, 60);
});

test('pruneMissing and splitForWrapUp ignore deleted tasks', () => {
  const items = [
    { task_id: 'a', minutes: 30 },
    { task_id: 'gone', minutes: 30 },
    { task_id: 'b', minutes: 30 },
  ];
  assert.deepEqual(pruneMissing(items, new Set(['a', 'b'])).map((i) => i.task_id), ['a', 'b']);
  const split = splitForWrapUp(items, new Map([['a', { done: true }], ['b', { done: false }]]));
  assert.deepEqual(split, { completed_ids: ['a'], open_ids: ['b'] });
});

test('formatMinutes', () => {
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(135), '2 h 15 min');
});

// --- Deep Work -------------------------------------------------------------

test('timer survives pauses and never goes negative', () => {
  let t = { startedAt: 0, plannedMs: 25 * 60_000, pausedMs: 0 };
  assert.equal(remainingMs(t, 60_000), 24 * 60_000);
  t = pause(t, 60_000);
  assert.equal(elapsedMs(t, 10 * 60_000), 60_000, 'time while paused does not count');
  t = resume(t, 10 * 60_000);
  assert.equal(elapsedMs(t, 11 * 60_000), 2 * 60_000);
  assert.equal(remainingMs(t, 999 * 60_000), 0);
  assert.equal(pause(pause(t, 1), 5).pausedAt, 1, 'double pause keeps the first pause time');
});

test('formatClock and clampMinutes', () => {
  assert.equal(formatClock(25 * 60_000), '25:00');
  assert.equal(formatClock(59_001), '01:00');
  assert.equal(formatClock(-5), '00:00');
  assert.equal(clampMinutes(2), 5);
  assert.equal(clampMinutes(999), 180);
  assert.equal(clampMinutes(Number.NaN), 5);
});

const session = (over = {}) => ({
  id: `s${++n}`,
  date: TODAY,
  preset: '25-5',
  planned_minutes: 25,
  break_minutes: 5,
  label: 'x',
  started_at: '2026-11-22T08:00:00',
  actual_minutes: 25,
  completed: true,
  interruptions: 0,
  distractions: [],
  ...over,
});

test('weeklyFocus totals Monday–Sunday and ignores other weeks', () => {
  const w = weeklyFocus(
    [
      session({ date: '2026-11-16', actual_minutes: 50, interruptions: 2, focus_rating: 4 }), // Monday
      session({ date: '2026-11-22', actual_minutes: 25, completed: false, focus_rating: 2 }), // Sunday
      session({ date: '2026-11-15', actual_minutes: 90 }), // previous Sunday
    ],
    '2026-11-19'
  );
  assert.equal(w.weekStart, '2026-11-16');
  assert.equal(w.days.length, 7);
  assert.equal(w.days[0].minutes, 50);
  assert.equal(w.days[6].minutes, 25);
  assert.equal(w.totalMinutes, 75);
  assert.equal(w.sessions, 2);
  assert.equal(w.completedSessions, 1);
  assert.equal(w.interruptions, 2);
  assert.equal(w.averageRating, 3);
});

test('bestFocusWindow needs enough sessions, then finds the busiest 3 hours', () => {
  const morning = (h) => session({ started_at: `2026-11-22T0${h}:15:00`, actual_minutes: 50 });
  assert.equal(bestFocusWindow([morning(7), morning(8)]), null);
  const w = bestFocusWindow([
    morning(7),
    morning(8),
    morning(9),
    morning(8),
    session({ started_at: '2026-11-22T21:00:00', actual_minutes: 25 }),
  ]);
  assert.deepEqual(w, { startHour: 7, endHour: 10, minutes: 200 });
  assert.equal(formatHour(7), '7 AM');
  assert.equal(formatHour(12), '12 PM');
  assert.equal(formatHour(0), '12 AM');
});

test('replan keeps finished tasks, counts their time, and carries estimates over', async () => {
  const { replan } = await import('../src/lib/dailyCompass.ts');
  const done = task({ priority: 'urgent', done: true });
  const a = task({ priority: 'high' });
  const b = task({ priority: 'medium' });
  const current = [
    { task_id: done.id, minutes: 60 },
    { task_id: a.id, minutes: 20 },
  ];
  const next = replan(current, [done, a, b], TODAY, { availableMinutes: 90 });
  // 90 available − 60 done = 30 left: a (20, user estimate) fits, b (30) does not.
  assert.deepEqual(next, [
    { task_id: a.id, minutes: 20 },
    { task_id: done.id, minutes: 60 },
  ]);
  const rescue = replan(current, [done, a, b], TODAY, { rescue: true });
  assert.equal(rescue.at(-1).task_id, done.id, 'rescue keeps finished work too');
  assert.equal(rescue.length, 2);
});
