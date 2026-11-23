import test from 'node:test';
import assert from 'node:assert/strict';
import { domainOf, goalDomain, habitDomain, domainBalance, hash01, DOMAINS, DOMAIN_DISPLAY_ORDER } from '../src/lib/lifeDomains.ts';
import { scoreHistory } from '../src/lib/momentum.ts';
import { addDays } from '../src/lib/habits.ts';

test('domainOf infers life domains from words, defaulting to career', () => {
  assert.equal(domainOf('Run a half marathon'), 'health');
  assert.equal(domainOf('Build a 6-month savings buffer'), 'finance');
  assert.equal(domainOf('Weekly call with parents'), 'relationships');
  assert.equal(domainOf('Write one blog post a week'), 'creativity');
  assert.equal(domainOf('Finish the ROS 2 course'), 'learning');
  assert.equal(domainOf('Robot arm demo', 'IvLabs'), 'learning');
  assert.equal(domainOf('Reach TRL 5 bench test', 'PAWAN SHAKTI'), 'career');
  assert.equal(goalDomain({ title: 'Ship v2', area: 'MG Automation', why: 'grow revenue' }), 'finance');
});

test('habits take their goal’s domain when linked', () => {
  const goals = new Map([['g1', { title: 'Run a marathon', area: 'Personal' }]]);
  assert.equal(habitDomain({ title: 'Log bench reading', area: 'PAWAN SHAKTI', goal_id: 'g1' }, goals), 'health');
  assert.equal(habitDomain({ title: 'Read 20 pages', area: 'Personal' }, goals), 'learning');
});

test('domainBalance averages progress and consistency; empty domains are null', () => {
  const goals = new Map();
  const b = domainBalance(
    [
      { goal: { title: 'Run a marathon', area: 'Personal' }, progress: 0.5, total: 4 },
      { goal: { title: 'Plan a goal with no milestones', area: 'X' }, progress: 0, total: 0 },
    ],
    [{ habit: { title: 'Morning run', area: 'Personal' }, consistency: 1 }],
    goals
  );
  const by = Object.fromEntries(b.map((x) => [x.domain.id, x]));
  assert.equal(by.health.score, 75, 'mean of 50% progress and 100% consistency');
  assert.equal(by.health.goals, 1);
  assert.equal(by.health.habits, 1);
  assert.equal(by.career.score, null, 'a goal with no milestones adds no value');
  assert.equal(by.career.goals, 1);
  assert.equal(by.finance.score, null);
  assert.deepEqual(b.map((x) => x.domain.id), DOMAIN_DISPLAY_ORDER);
});

test('palette and hashing are stable', () => {
  assert.equal(DOMAINS.length, 6);
  assert.equal(new Set(DOMAINS.map((d) => d.color)).size, 6);
  assert.equal(hash01('abc'), hash01('abc'));
  assert.ok(hash01('abc') >= 0 && hash01('abc') < 1);
  assert.notEqual(hash01('abc'), hash01('abd'));
});

test('scoreHistory returns one score per week, oldest first', () => {
  const TODAY = '2026-11-22';
  const session = (date, m) => ({ id: date, date, preset: '25-5', planned_minutes: m, break_minutes: 5, label: 'x', started_at: `${date}T08:00:00`, actual_minutes: m, completed: true, interruptions: 0, distractions: [] });
  const h = scoreHistory({ today: TODAY, habits: [], logs: [], goals: [], milestones: [], sessions: [session(TODAY, 300), session(addDays(TODAY, -7), 600)], tasks: [], notes: [], plans: [] }, 3);
  assert.deepEqual(h.map((x) => x.end), [addDays(TODAY, -14), addDays(TODAY, -7), TODAY]);
  assert.deepEqual(h.map((x) => x.score), [0, 100, 50]);
});
