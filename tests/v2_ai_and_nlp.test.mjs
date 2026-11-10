import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_TOOL_DEFINITIONS,
  buildDeterministicGroundedResponse,
  executeAiTool,
} from '../api/_lib/aiTools.ts';
import { createAiChatHandler } from '../api/ai/chat.ts';
import { rankUniversalSearchCorpus } from '../src/services/searchRanking.ts';
import { parseQuickCaptureInput } from '../src/services/voiceCaptureParser.ts';

const SAMPLE_SNAPSHOT = {
  todayISO: '2026-11-10',
  tasks: [
    {
      id: 't1',
      text: 'Wire synchronized tachometer + electrical load DAQ logging CSV',
      area: 'PAWAN SHAKTI',
      priority: 'urgent',
      due_date: '2026-11-09',
      done: false,
      project_id: 'proj-pawan',
    },
    {
      id: 't2',
      text: 'Test SocketCAN 1 Mbps trajectory node on AgileX PiPER',
      area: 'IvLabs',
      priority: 'high',
      due_date: '2026-11-10',
      done: false,
      project_id: 'proj-robotics',
    },
  ],
  projects: [
    {
      id: 'proj-pawan',
      title: 'PAWAN SHAKTI — TRL 4 Benchtop to TRL 5 Integrated Test',
      area: 'PAWAN SHAKTI',
      status: 'active',
      priority: 'urgent',
      progress: 35,
      target_date: '2027-02-08',
      verification_note: 'TRL 4 benchtop prototype only; closed-loop P-v curve CSV not yet recorded.',
      milestones: [
        { id: 'm1', title: 'Publish Indian Patent', done: true },
        { id: 'm2', title: 'Closed-loop integrated bench test', done: false },
      ],
      blockers: [
        {
          id: 'b1',
          title: 'Closed-loop integrated aerodynamic + generator bench test not executed',
          impact: 'Prevents claiming TRL 5 evidence',
          status: 'open',
        },
      ],
      risks: [],
      decisions: [],
    },
    {
      id: 'proj-robotics',
      title: 'Robotics Lab — AgileX PiPER, 3-Drone Swarm & AWR2944 mmWave',
      area: 'IvLabs',
      status: 'active',
      priority: 'high',
      progress: 40,
      milestones: [],
      blockers: [],
      risks: [],
      decisions: [
        {
          id: 'd-piper',
          title: 'AgileX PiPER CAN Bus Bitrate Selection',
          decision: 'Standardize SocketCAN can0 at 1 Mbps for 500 Hz joint feedback loop.',
          rationale: 'Tested lower frame drops compared to 500 kbps.',
          decided_at: '2026-11-05',
        },
      ],
    },
  ],
  notes: [{ id: 'n1', title: 'Generator Stator Spec', body: 'Axial flux notes', area: 'PAWAN SHAKTI', updated_at: '2026-11-08T10:00:00Z' }],
  meetings: [{ id: 'meet1', title: 'Aerodynamic Pitch Review', date: '2026-11-10', start_time: '11:00', status: 'scheduled' }],
  events: [],
  documents: [],
  robotics_records: [
    { id: 'rob1', project: 'AgileX PiPER', title: 'Zero-G bring-up', category: 'Test Run', status: 'active', description: 'Joint zero calibration passed.' },
  ],
  neo_memories: [
    { id: 'neo1', title: 'Private Call', summary: 'Should be filtered when allowAiUsage false', allowAiUsage: false, capturedAt: '2026-11-09T10:00:00Z' },
    { id: 'neo2', title: 'PiPER Gripper Discussion', summary: 'Discussed 15 N force ceiling', allowAiUsage: true, capturedAt: '2026-11-09T12:00:00Z' },
  ],
};

test('Phase 3 AI Tools: exposes structured tool schemas & /api/ai/chat GET ?action=tools works', async () => {
  assert.ok(AI_TOOL_DEFINITIONS.some((t) => t.name === 'query_projects'));
  assert.ok(AI_TOOL_DEFINITIONS.some((t) => t.name === 'propose_create_task'));

  const handler = createAiChatHandler();
  let code = 200;
  let body = null;
  await handler(
    { method: 'GET', query: { action: 'tools' }, headers: {} },
    { setHeader() {}, status: (c) => ({ json: (b) => { code = c; body = b; }, end: () => {} }) }
  );
  assert.equal(code, 200);
  assert.equal(body.success, true);
  assert.ok(Array.isArray(body.tools) && body.tools.length >= 6);
});

test('Phase 3 AI Grounding: answers realistic Chief of Staff queries without fabricating claims', () => {
  // 1. Blocker query
  const blockerResp = buildDeterministicGroundedResponse('What is blocking Pawan Shakti?', SAMPLE_SNAPSHOT);
  assert.match(blockerResp.text, /Closed-loop integrated aerodynamic \+ generator bench test/);
  assert.match(blockerResp.text, /Verified Facts/);
  assert.ok(!blockerResp.text.includes('TRL 5 achieved'));

  // 2. Last decision query & privacy filter
  const decisionResp = buildDeterministicGroundedResponse('Find my last decision about the PiPER setup.', SAMPLE_SNAPSHOT);
  assert.match(decisionResp.text, /AgileX PiPER CAN Bus Bitrate Selection/);
  assert.ok(!decisionResp.text.includes('Private Call'), 'Private Neo memory must NEVER leak');

  // 3. Task creation preview (write confirmation gate)
  const createResp = buildDeterministicGroundedResponse('Create a task to test the generator tomorrow.', SAMPLE_SNAPSHOT);
  assert.equal(createResp.proposed_actions.length, 1);
  assert.equal(createResp.proposed_actions[0].type, 'create_task');
  assert.equal(createResp.proposed_actions[0].payload.due_date, '2026-11-11');
  assert.equal(createResp.proposed_actions[0].status, 'pending');

  // 4. Weekly robotics report + Plan my day + Unfinished work
  const robResp = buildDeterministicGroundedResponse('Prepare my weekly robotics progress report.', SAMPLE_SNAPSHOT);
  assert.match(robResp.text, /Unknowns/);
  const dayResp = buildDeterministicGroundedResponse('Plan my day.', SAMPLE_SNAPSHOT);
  assert.match(dayResp.text, /Daily Operating Brief/);
  const unfinishedResp = buildDeterministicGroundedResponse('Summarise my unfinished work.', SAMPLE_SNAPSHOT);
  assert.match(unfinishedResp.text, /Unfinished Work Summary/);
});

test('Phase 5 Search & Phase 6 Voice Parser: ranks cross-entity matches and suggests project & date', () => {
  const hits = rankUniversalSearchCorpus('PiPER CAN', SAMPLE_SNAPSHOT, { includeNeoMemories: true });
  assert.ok(hits.some((h) => h.entityType === 'decision' && h.title.includes('PiPER')));
  assert.ok(hits.some((h) => h.entityType === 'task'));
  assert.ok(hits.some((h) => h.entityType === 'robotics'));

  const blockedHits = rankUniversalSearchCorpus('Private Call', SAMPLE_SNAPSHOT, { includeNeoMemories: false });
  assert.equal(blockedHits.some((h) => h.entityType === 'memory'), false);

  const parsed = parseQuickCaptureInput('Create a task to test Pawan Shakti generator tomorrow at 4pm urgent', {
    projects: SAMPLE_SNAPSHOT.projects,
    todayISO: '2026-11-10',
  });
  assert.equal(parsed.type, 'task');
  assert.equal(parsed.date, '2026-11-11');
  assert.equal(parsed.time, '4PM');
  assert.equal(parsed.priority, 'urgent');
  assert.equal(parsed.projectId, 'proj-pawan');
  assert.equal(parsed.area, 'PAWAN SHAKTI');
});

test('Phase 3 Tool Execution: executeAiTool search respects allowAiUsage privacy flag', () => {
  const hit = executeAiTool('search_knowledge_and_decisions', { query: 'Private Call' }, SAMPLE_SNAPSHOT);
  assert.equal(hit.data.matches.length, 0);
});
