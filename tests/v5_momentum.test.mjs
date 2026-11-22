import test from 'node:test';
import assert from 'node:assert/strict';
import { momentumScore, bandFor, forecastGoal, nextActions, weeklySignals, weeklyNarrative } from '../src/lib/momentum.ts';
import { addDays } from '../src/lib/habits.ts';

const TODAY = '2026-11-22'; // a Sunday
const iso = (d) => `${d}T09:00:00.000Z`;
const empty = { today: TODAY, habits: [], logs: [], goals: [], milestones: [], sessions: [], tasks: [], notes: [], plans: [] };

let n = 0;
const habit = (o = {}) => ({ id: `h${++n}`, title: 'Read', area: 'Personal', weekly_target: 7, archived: false, created_at: iso('2026-10-01'), updated_at: iso('2026-10-01'), ...o });
const logsFor = (h, days) => days.map((d) => ({ id: `l${++n}`, habit_id: h.id, date: d, created_at: iso(d) }));
const goal = (o = {}) => ({ id: `g${++n}`, title: 'Ship prototype', area: 'PAWAN SHAKTI', status: 'active', created_at: iso('2026-10-01'), updated_at: iso('2026-10-01'), ...o });
const ms = (g, week, done, doneAt) => ({ id: `m${++n}`, goal_id: g.id, title: 'step', week_start: week, done, done_at: doneAt ? iso(doneAt) : undefined, created_at: iso(week), updated_at: iso(week) });
const session = (date, minutes) => ({ id: `s${++n}`, date, preset: '25-5', planned_minutes: minutes, break_minutes: 5, label: 'x', started_at: `${date}T08:00:00`, actual_minutes: minutes, completed: true, interruptions: 0, distractions: [] });
const task = (o = {}) => ({ id: `t${++n}`, text: `Task ${n}`, area: 'IvLabs', priority: 'medium', starred: false, done: false, created_at: iso('2026-11-01'), updated_at: iso('2026-11-01'), ...o });

test('with no data, the score is null ("getting started"), never 0', () => {
  const m = momentumScore(empty);
  assert.equal(m.score, null);
  assert.equal(m.band, 'Getting started');
  assert.ok(m.components.every((c) => c.value === null));
});

test('missing components are left out and the weights renormalise', () => {
  const h = habit();
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(TODAY, -i));
  const m = momentumScore({ ...empty, habits: [h], logs: logsFor(h, last14) });
  assert.equal(m.components.find((c) => c.key === 'habits').value, 100);
  assert.equal(m.score, 100, 'only habits have data, so they alone set the score');
});

test('a new habit is judged on the days it has existed', () => {
  const h = habit({ created_at: iso(addDays(TODAY, -1)) }); // 2 days old, daily
  const m = momentumScore({ ...empty, habits: [h], logs: logsFor(h, [TODAY, addDays(TODAY, -1)]) });
  assert.equal(m.components.find((c) => c.key === 'habits').value, 100);
});

test('focus, tasks and reflection components', () => {
  const m = momentumScore({
    ...empty,
    sessions: [session(TODAY, 150), session(addDays(TODAY, -3), 150), session(addDays(TODAY, -10), 600)],
    tasks: [task({ due_date: TODAY, done: true }), task({ due_date: addDays(TODAY, -2) }), task({ due_date: addDays(TODAY, -30) })],
    notes: [
      { id: 'a', title: 'x', body: '', pinned: false, kind: 'reflection', created_at: iso(TODAY), updated_at: iso(TODAY) },
      { id: 'b', title: 'x', body: '', pinned: false, kind: 'note', created_at: iso(addDays(TODAY, -1)), updated_at: iso(TODAY) },
    ],
    plans: [{ id: addDays(TODAY, -2), available_minutes: 240, items: [], rescue: false, wrap_up: { wrapped_at: iso(TODAY), completed_ids: [], carried_ids: [] }, created_at: iso(TODAY), updated_at: iso(TODAY) }],
  });
  const v = Object.fromEntries(m.components.map((c) => [c.key, c.value]));
  assert.equal(v.focus, 50, '300 of 600 minutes; the old 600-min session is outside the window');
  assert.equal(v.tasks, 50, '1 of 2 due in the last 7 days');
  assert.equal(v.reflection, 50, '2 days (a reflection + a wrap-up; plain notes do not count) of 4');
  assert.equal(m.score, 50);
});

test('bands', () => {
  assert.equal(bandFor(90), 'Compounding');
  assert.equal(bandFor(72), 'Strong');
  assert.equal(bandFor(40), 'Building');
  assert.equal(bandFor(10), 'Rebuilding');
});

test('forecastGoal: pace against the deadline and a projected finish date', () => {
  const g = goal({ created_at: iso('2026-10-01'), target_date: '2026-12-31' });
  // 4 of 10 milestones done, 2 of them in the last 4 weeks → 0.5/week → 6 left → 12 weeks.
  const list = [
    ms(g, '2026-10-05', true, '2026-10-08'),
    ms(g, '2026-10-12', true, '2026-10-15'),
    ms(g, '2026-11-02', true, '2026-11-05'),
    ms(g, '2026-11-09', true, '2026-11-12'),
    ...Array.from({ length: 6 }, (_, i) => ms(g, addDays('2026-11-16', i * 7), false)),
  ];
  const f = forecastGoal(g, list, TODAY);
  assert.equal(f.done, 4);
  assert.equal(f.total, 10);
  assert.equal(f.weeklyRate, 0.5);
  assert.equal(f.projectedDate, addDays(TODAY, 84));
  assert.ok(f.expected > 0.55 && f.expected < 0.6);
  assert.equal(f.pace, 'at-risk', '40% done vs ~57% expected, and the projection lands after the deadline');

  assert.equal(forecastGoal(goal(), [], TODAY).pace, 'no-plan');
  assert.equal(forecastGoal(goal(), [ms(g, '2026-11-16', false)].map((m) => ({ ...m, goal_id: 'x' })), TODAY).pace, 'no-plan');
});

test('nextActions ranks overdue urgent work and protects streaks, without duplicates', () => {
  const h = habit({ title: 'Stretch' });
  const urgent = task({ priority: 'urgent', due_date: addDays(TODAY, -2), text: 'Order magnets' });
  const plan = { id: TODAY, available_minutes: 240, items: [{ task_id: urgent.id, minutes: 45 }], rescue: false, created_at: iso(TODAY), updated_at: iso(TODAY) };
  const acts = nextActions({
    ...empty,
    hour: 9,
    habits: [h],
    logs: logsFor(h, [addDays(TODAY, -1), addDays(TODAY, -2), addDays(TODAY, -3)]),
    tasks: [urgent],
    todayPlan: plan,
  });
  assert.equal(acts[0].id, `overdue-${urgent.id}`);
  assert.equal(acts[0].taskId, urgent.id);
  assert.ok(acts.some((a) => a.id === `habit-${h.id}`), 'streak at risk is suggested');
  assert.equal(acts.filter((a) => a.taskId === urgent.id).length, 1, 'the planned+overdue task appears once');
});

test('nextActions suggests planning in the morning and wrap-up in the evening', () => {
  const open = task();
  assert.equal(nextActions({ ...empty, hour: 8, tasks: [open], todayPlan: null })[0].id, 'plan-day');
  const plan = { id: TODAY, available_minutes: 240, items: [], rescue: false, created_at: iso(TODAY), updated_at: iso(TODAY) };
  assert.equal(nextActions({ ...empty, hour: 20, tasks: [open], todayPlan: plan })[0].id, 'wrap-up');
});

test('weeklySignals and weeklyNarrative read honestly', () => {
  const h = habit({ title: 'Run' });
  const streak = Array.from({ length: 9 }, (_, i) => addDays(TODAY, -i));
  const input = {
    ...empty,
    habits: [h],
    logs: logsFor(h, streak),
    sessions: [session(TODAY, 120), session(addDays(TODAY, -8), 60)],
    tasks: [task({ due_date: addDays(TODAY, -1) })],
  };
  const s = weeklySignals(input, []);
  assert.ok(s.compounding.some((x) => x.text.includes('Run: 9-day streak')));
  assert.ok(s.compounding.some((x) => x.text.startsWith('Deep work up')));
  assert.ok(s.slipping.some((x) => x.text === '1 overdue task' && x.action));
  const lines = weeklyNarrative(input);
  assert.ok(lines.length >= 2);
  assert.match(lines.join(' '), /Strongest area/);
  assert.match(weeklyNarrative(empty)[0], /Not enough activity yet/);
});
