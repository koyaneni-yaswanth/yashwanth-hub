import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorkspaceNodes, areaStatus, nodeAngles, MAX_NODES } from '../src/lib/jarvisWorkspaces.ts';

const AREAS = [
  { name: 'PAWAN SHAKTI', color: '#0b6e6e', description: 'Wind' },
  { name: 'MG Automation', color: '#2563eb', description: 'Industrial automation' },
  { name: 'IvLabs', color: '#7c3aed', description: '' },
  { name: 'Personal', color: 'not-a-colour' },
];

test('nodes: only real destinations, workspace pages first, then the user\'s areas', () => {
  const nodes = buildWorkspaceNodes({ areas: AREAS, tasks: [], projects: [], roboticsRecords: 0 });
  assert.deepEqual(nodes.map((n) => n.label), ['Pawan Shakti', 'Robotics Lab', 'Learning & Career', 'MG Automation', 'IvLabs', 'Personal']);
  assert.deepEqual(nodes.find((n) => n.label === 'Pawan Shakti').target, { tab: 'startup-command' });
  assert.deepEqual(nodes.find((n) => n.label === 'IvLabs').target, { tab: 'projects', area: 'IvLabs' });
  assert.ok(!nodes.some((n) => n.label === 'PAWAN SHAKTI'), 'the area with its own page is not duplicated');
  assert.equal(nodes.find((n) => n.label === 'IvLabs').description, 'Everything in the IvLabs area.', 'empty description gets an honest default');
  assert.equal(nodes.find((n) => n.label === 'Personal').color, '#8ba8c8', 'invalid colours fall back to the palette');
});

test('status: counted from records, null when there is nothing (never invented)', () => {
  const tasks = [
    { area: 'IvLabs', done: false },
    { area: 'ivlabs', done: false },
    { area: 'IvLabs', done: true },
    { area: 'PAWAN SHAKTI', done: false },
  ];
  const projects = [
    { area: 'IvLabs', status: 'active' },
    { area: 'IvLabs', status: 'completed' },
  ];
  assert.equal(areaStatus('IvLabs', tasks, projects), '2 open tasks · 1 active project');
  assert.equal(areaStatus('Personal', tasks, projects), null);
  const nodes = buildWorkspaceNodes({ areas: AREAS, tasks, projects, roboticsRecords: 1 });
  assert.equal(nodes.find((n) => n.label === 'Pawan Shakti').status, '1 open task');
  assert.equal(nodes.find((n) => n.label === 'Robotics Lab').status, '1 record');
  assert.equal(nodes.find((n) => n.label === 'Learning & Career').status, null);
  assert.equal(buildWorkspaceNodes({ areas: AREAS, tasks: [], projects: [], roboticsRecords: 0 }).find((n) => n.label === 'Robotics Lab').status, null);
});

test('limits and layout', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `Area ${i}` }));
  assert.equal(buildWorkspaceNodes({ areas: many, tasks: [], projects: [], roboticsRecords: 0 }).length, MAX_NODES);
  const a = nodeAngles(4);
  assert.equal(a.length, 4);
  assert.ok(Math.abs(a[0] - Math.PI / 2) < 1e-9, 'first node faces the camera');
  assert.ok(Math.abs(a[1] - a[0] - Math.PI / 2) < 1e-9, 'evenly spaced');
});

test('wiring: lazy, accessible, disposes, with a non-3D path', () => {
  const cc = readFileSync(new URL('../src/components/jarvis/JarvisCommandCenter.tsx', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../src/components/jarvis/JarvisScene.tsx', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  assert.match(cc, /lazy\(\(\) => import\('\.\/JarvisScene'\)/, 'scene is a lazy chunk');
  assert.match(cc, /requestIdleCallback/, 'starts after first paint');
  assert.match(cc, /aria-expanded=\{expanded\}/, 'collapsible');
  assert.match(scene, /aria-hidden', 'true'/, 'canvas hidden from assistive tech');
  assert.match(scene, /aria-label=\{`\$\{n\.label\}/, 'each node is a labelled button');
  assert.match(scene, /webglcontextlost/, 'handles context loss');
  assert.match(scene, /rig\.dispose\(\);[\s\S]*postFX\.dispose\(\);[\s\S]*lighting\.dispose\(\);[\s\S]*renderer\.dispose\(\);/);
  assert.match(scene, /status === 'unsupported'[\s\S]*<NodeButtons/, 'no-WebGL fallback lists the workspaces');
  assert.match(home, /<JarvisCommandCenter areas=\{areas\} onNavigate=\{onNavigate\} onSelectArea=\{onSelectArea\} \/>/);
});
