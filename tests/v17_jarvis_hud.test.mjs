import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const hudMod = await import('../src/lib/jarvisHud.ts');
const aiActivityMod = await import('../src/lib/aiActivity.ts');

test('buildHudWorkspaceNodes returns all 7 HUD workspaces with zero fabricated defaults', () => {
  const nodes = hudMod.buildHudWorkspaceNodes({
    today: '2026-11-25',
    recentCutoffISO: '2026-11-18T00:00:00.000Z',
    tasks: [],
    projects: [],
    notes: [],
    expenses: [],
    habits: [],
    habitLogs: [],
    roboticsRecords: 0,
    neoMemoriesCount: 0,
  });

  assert.equal(nodes.length, 7);
  assert.deepEqual(
    nodes.map((n) => n.id),
    [
      'startup-command',
      'robotics-lab',
      'learning-career',
      'finance',
      'health-routine',
      'projects',
      'knowledge-memory',
    ]
  );
  assert.deepEqual(
    nodes.map((n) => n.label),
    [
      'Pawan Shakti',
      'Robotics Lab',
      'Learning & Career',
      'Finance',
      'Routine & Health',
      'Projects',
      'Notes / Memory Vault',
    ]
  );

  for (const n of nodes) {
    assert.ok(n.stats.length >= 2 && n.stats.length <= 3, `Expected 2-3 stats for ${n.id}`);
    assert.equal(n.hasDueTodayBeam, false);
    assert.equal(n.openTasks, 0);
  }
});

test('buildHudWorkspaceNodes drives activityLevel and due-today data beams from live Dexie records', () => {
  const nodes = hudMod.buildHudWorkspaceNodes({
    today: '2026-11-25',
    recentCutoffISO: '2026-11-18T00:00:00.000Z',
    tasks: [
      {
        id: 't1',
        text: 'Wind tunnel blade validation',
        area: 'PAWAN SHAKTI',
        priority: 'urgent',
        due_date: '2026-11-25',
        starred: true,
        done: false,
        updated_at: '2026-11-25T08:00:00.000Z',
      },
      {
        id: 't2',
        text: 'PiPER IK calibration',
        area: 'Robotics',
        priority: 'high',
        due_date: '2026-11-29',
        done: false,
      },
    ],
    projects: [
      {
        id: 'p1',
        title: 'TRL 6 Prototype',
        area: 'PAWAN SHAKTI',
        status: 'active',
        progress: 48,
        target_date: '2027-01-03',
        milestones: [{ title: 'Blade fatigue test', target_date: '2026-12-01', done: false }],
      },
    ],
    notes: [{ id: 'n1', title: 'Safety checklist', area: 'Learning', updated_at: '2026-11-24T12:00:00.000Z' }],
    expenses: [{ id: 'e1', amount: 12500, date: '2026-11-24', area: 'Finance' }],
    habits: [{ id: 'h1' }],
    habitLogs: [{ id: 'hl1', habit_id: 'h1', date: '2026-11-25' }],
    roboticsRecords: 3,
    neoMemoriesCount: 4,
  });

  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  assert.equal(byId['startup-command'].hasDueTodayBeam, true);
  assert.equal(byId['startup-command'].keyMetric.value, '48%');
  assert.equal(byId['startup-command'].nextMilestone?.title, 'Blade fatigue test');
  assert.ok(byId['startup-command'].activityLevel > byId['learning-career'].activityLevel);

  assert.equal(byId['robotics-lab'].hasDueTodayBeam, false);
  assert.equal(byId['robotics-lab'].keyMetric.value, '3');

  assert.equal(byId['finance'].keyMetric.value, '₹12,500');
  assert.equal(byId['health-routine'].keyMetric.value, '1/1');
  assert.equal(byId['knowledge-memory'].keyMetric.value, '5');
});

test('deriveCoreState maps AI phases and overdue/attention alerts to cyan, amber and red', () => {
  const idle = hudMod.deriveCoreState({ aiPhase: 'idle', overdueCount: 0, dueTodayCount: 0 });
  assert.equal(idle.mode, 'idle');
  assert.equal(idle.primaryHex, '#3BE8FF');

  const attention = hudMod.deriveCoreState({ aiPhase: 'idle', overdueCount: 0, dueTodayCount: 2 });
  assert.equal(attention.mode, 'attention');
  assert.equal(attention.primaryHex, '#FFB547');

  const overdue = hudMod.deriveCoreState({ aiPhase: 'idle', overdueCount: 1, dueTodayCount: 2 });
  assert.equal(overdue.mode, 'overdue');
  assert.equal(overdue.primaryHex, '#FF4D6D');
  assert.ok(overdue.pulseRate > attention.pulseRate);

  const thinking = hudMod.deriveCoreState({ aiPhase: 'thinking', overdueCount: 3, dueTodayCount: 1 });
  assert.equal(thinking.mode, 'thinking');
  assert.ok(thinking.pulseRate > overdue.pulseRate);

  const talking = hudMod.deriveCoreState({ aiPhase: 'talking', overdueCount: 0, dueTodayCount: 0 });
  assert.equal(talking.mode, 'talking');
  assert.equal(talking.primaryHex, '#7C5CFF');
});

test('collectDeadlines sorts next-7-day items and flags <24h and overdue deadlines', () => {
  const nowMs = new Date(2026, 10, 25, 10, 0, 0).getTime();
  const deadlines = hudMod.collectDeadlines({
    tasks: [
      { id: 'done', text: 'Already done', due_date: '2026-11-25', done: true },
      { id: 'late', text: 'Overdue invoice', due_date: '2026-11-24', done: false },
      { id: 'today', text: 'Same-day deliverable', due_date: '2026-11-25', done: false },
      { id: 'later', text: 'Friday review', due_date: '2026-11-28', done: false },
      { id: 'far', text: 'Next month', due_date: '2026-12-20', done: false },
    ],
    events: [{ id: 'ev1', title: 'Sponsor call', date: '2026-11-25', start_time: '15:00' }],
    meetings: [],
    nowMs,
    todayISO: '2026-11-25',
    nextWeekISO: '2026-12-02',
  });

  assert.equal(deadlines.length, 4);
  assert.equal(deadlines[0].title, 'Overdue invoice');
  assert.equal(deadlines[0].overdue, true);
  assert.equal(deadlines[0].urgentUnder24h, true);

  const sponsor = deadlines.find((d) => d.title === 'Sponsor call');
  assert.ok(sponsor?.urgentUnder24h);
  assert.equal(sponsor?.overdue, false);

  const friday = deadlines.find((d) => d.title === 'Friday review');
  assert.equal(friday?.urgentUnder24h, false);
});

test('formatSyncHudStatus reflects real sync state and queue depth', () => {
  assert.equal(hudMod.formatSyncHudStatus('synced', 0, 0).label, 'SYSTEMS NOMINAL');
  assert.equal(hudMod.formatSyncHudStatus('synced', 2, 0).label, 'SYSTEMS NOMINAL · 2 QUEUED');
  assert.equal(hudMod.formatSyncHudStatus('offline', 1, 0).tone, 'amber');
  assert.equal(hudMod.formatSyncHudStatus('error', 0, 2).tone, 'danger');
});

test('aiActivity store tracks nested thinking calls before transitioning cleanly', () => {
  assert.equal(aiActivityMod.getAiActivityPhase(), 'idle');
  aiActivityMod.beginAiThinking();
  aiActivityMod.beginAiThinking();
  assert.equal(aiActivityMod.getAiActivityPhase(), 'thinking');
  aiActivityMod.endAiThinking(false);
  assert.equal(aiActivityMod.getAiActivityPhase(), 'thinking');
  aiActivityMod.endAiThinking(false);
  assert.equal(aiActivityMod.getAiActivityPhase(), 'idle');
});

test('Jarvis HUD shaders, DPR cap, 64px rail, scoped theme tokens and accessibility contracts stay intact', () => {
  const sceneSrc = read('src/components/jarvis/JarvisScene.tsx');
  const shaderSrc = read('src/components/jarvis/jarvisShaders.ts');
  const cssSrc = read('src/index.css');
  const sidebarSrc = read('src/components/layout/Sidebar.tsx');
  const dockSrc = read('src/components/jarvis/HudMissionDock.tsx');

  assert.match(shaderSrc, /fresnel\s*=\s*pow/i);
  assert.match(shaderSrc, /HEX_FLOOR_FRAGMENT_SHADER/);
  assert.match(sceneSrc, /const MAX_DPR = 1\.75/);
  assert.match(sceneSrc, /Math\.min\(MAX_DPR,\s*window\.devicePixelRatio/);
  assert.match(sceneSrc, /InstancedMesh/);
  assert.match(sceneSrc, /hasDueTodayBeam/);
  assert.match(sceneSrc, /__JARVIS_HUD_METRICS__/);
  assert.match(cssSrc, /\.jarvis-hud\s*\{[\s\S]*#05070d/);
  assert.match(cssSrc, /:focus-visible/);
  assert.match(sidebarSrc, /compactRail/);
  assert.match(sidebarSrc, /aria-label="HUD Quick Rail"[\s\S]*\bw-16\b/);
  assert.match(dockSrc, /Mission Dock/);
});
