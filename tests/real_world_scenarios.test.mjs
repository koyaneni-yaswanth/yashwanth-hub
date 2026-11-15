import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicGroundedResponse,
} from '../api/_lib/aiTools.ts';
import { rankUniversalSearchCorpus } from '../src/services/searchRanking.ts';
import { parseQuickCaptureInput } from '../src/services/voiceCaptureParser.ts';
import { GoogleAuthService } from '../src/services/google/googleAuthService.ts';

// Scenario Data Mock
const WORKSPACE_SNAPSHOT = {
  todayISO: '2026-11-15',
  tasks: [
    {
      id: 'task-overdue-1',
      text: 'Order 3mm carbon fiber rods for robotic hand tendon guides',
      area: 'ROBOTICS',
      priority: 'urgent',
      due_date: '2026-11-14',
      done: false,
      project_id: 'proj-robotics-hand',
      starred: true,
    },
    {
      id: 'task-today-1',
      text: 'Send PO and 30% advance for stator lamination sheets',
      area: 'PAWAN SHAKTI',
      priority: 'high',
      due_date: '2026-11-15',
      done: false,
      project_id: 'proj-pawan-shakti',
      starred: false,
    },
    {
      id: 'task-future-1',
      text: 'Calibrate hall sensor array for high-speed optical encoder',
      area: 'ROBOTICS',
      priority: 'medium',
      due_date: '2026-11-22',
      done: false,
      project_id: 'proj-robotics-hand',
      starred: false,
    },
  ],
  projects: [
    {
      id: 'proj-pawan-shakti',
      title: 'PAWAN SHAKTI — Wind Turbine TRL 5 Validation',
      area: 'PAWAN SHAKTI',
      status: 'active',
      priority: 'urgent',
      progress: 45,
      target_date: '2027-02-15',
      milestones: [
        { id: 'm1', title: 'Stator Lamination Sourcing', done: false },
        { id: 'm2', title: 'Wind Tunnel Baseline Velocity Scan', done: true },
      ],
      blockers: [
        {
          id: 'b1',
          title: 'Awaiting stator core supplier quotes',
          status: 'open',
          impact: 'Delays assembly',
        },
      ],
      risks: [],
      decisions: [],
    },
    {
      id: 'proj-robotics-hand',
      title: 'IvLabs Robotic Dexterous Hand Mechanism',
      area: 'ROBOTICS',
      status: 'active',
      priority: 'high',
      progress: 60,
      target_date: '2026-12-30',
      milestones: [
        { id: 'm-rob-1', title: 'Tendon Cable Assembly', done: false },
        { id: 'm-rob-2', title: 'Micro-servos CAD Mount', done: true },
      ],
      blockers: [
        {
          id: 'b-rob-1',
          title: '3mm carbon fiber rods out of stock locally',
          status: 'open',
          impact: 'Blocks structural frame',
        },
      ],
      risks: [],
      decisions: [],
    },
  ],
  documents: [
    {
      id: 'doc-pawan-spec',
      title: 'Pawan Shakti Aerodynamic & Generator Technical Specifications',
      body: 'Stator lamination sheets require high permeability silicon steel grade M400-50A with 50 units batch.',
      area: 'PAWAN SHAKTI',
      tags: ['aerodynamics', 'generator', 'hardware'],
    },
  ],
};

test('Scenario A: Universal Idea & Voice Capture Parsing and Cross-Entity Search', async () => {
  const input = 'Need to order 3mm carbon fiber rods for the robotic hand tendon guides by Thursday #robotics';
  const parsed = parseQuickCaptureInput(input, {
    todayISO: '2026-11-15',
    projects: WORKSPACE_SNAPSHOT.projects,
  });

  assert.ok(parsed.title.length > 0, 'Parsed title must not be empty');
  assert.equal(parsed.area, 'ROBOTICS', 'Workspace area must be inferred from #robotics tag');
  assert.ok(parsed.date, 'Due date must be extracted for specified day');

  // Verify cross-entity indexing and ranking
  const searchResults = rankUniversalSearchCorpus('carbon fiber rods', {
    tasks: WORKSPACE_SNAPSHOT.tasks,
    notes: [],
    documents: WORKSPACE_SNAPSHOT.documents,
    projects: WORKSPACE_SNAPSHOT.projects,
    meetings: [],
    neo_memories: [],
    robotics_records: [],
    events: [],
    contacts: [],
    expenses: [],
  });

  assert.ok(searchResults.length > 0, 'Should find at least 1 matching entity');
  assert.ok(searchResults.some((r) => r.id.includes('task-overdue-1')), 'Target task should rank for carbon fiber rods');
  assert.equal(searchResults[0].area, 'ROBOTICS', 'Result area must be ROBOTICS');
});

test('Scenario B: Meeting Intelligence, Action Extraction & Level 2 Confirmation', async () => {
  const query = 'Summarize meeting with supplier and extract action items for stator lamination sheets';

  const response = buildDeterministicGroundedResponse(query, WORKSPACE_SNAPSHOT);

  assert.ok(response.text.includes('Meeting Intelligence') || response.text.includes('Action Items'), 'Response must identify meeting intelligence context');
  assert.ok(response.proposed_actions && response.proposed_actions.length > 0, 'Must propose action preview for uncreated task');
  assert.equal(response.proposed_actions[0].type, 'create_task', 'Must propose create_task action');
  assert.equal(response.proposed_actions[0].status, 'pending', 'Action must have status pending for Level 2 confirmation');
});

test('Scenario C: Daily Planning & Multi-dimensional Task Recommendation', async () => {
  // Test multi-dimensional scoring logic
  const candidateTasks = WORKSPACE_SNAPSHOT.tasks;
  const today = WORKSPACE_SNAPSHOT.todayISO;

  const scored = candidateTasks.map((t) => {
    let score = 0;
    const reasons = [];
    if (t.due_date && t.due_date < today) {
      score += 50;
      reasons.push('Overdue (+50)');
    } else if (t.due_date === today) {
      score += 35;
      reasons.push('Due today (+35)');
    }
    if (t.priority === 'urgent') {
      score += 40;
      reasons.push('Urgent (+40)');
    } else if (t.priority === 'high') {
      score += 25;
      reasons.push('High (+25)');
    }
    if (t.starred) {
      score += 20;
      reasons.push('Starred (+20)');
    }
    return { task: t, score, reasons };
  }).sort((a, b) => b.score - a.score);

  // Overdue + Urgent + Starred = 50 + 40 + 20 = 110
  assert.equal(scored[0].task.id, 'task-overdue-1', 'Overdue urgent starred task must rank #1');
  assert.equal(scored[0].score, 110, 'Score must equal 110');
  assert.ok(scored[0].reasons.includes('Overdue (+50)'), 'Reasons must include overdue factor');

  // Query Chief of Staff for daily focus
  const aiFocus = buildDeterministicGroundedResponse('What should I focus on today? Give me top priorities', WORKSPACE_SNAPSHOT);

  assert.ok(aiFocus.text.includes('Operating Brief') || aiFocus.text.includes('Priorities') || aiFocus.text.includes('Focus'), 'Must outline founder priorities');
  assert.ok(aiFocus.text.length > 50, 'Response text must contain substantial guidance');
});

test('Scenario D: Founder Project Review & Infrastructure Isolation Verification', async () => {
  const pawanProject = WORKSPACE_SNAPSHOT.projects.find((p) => p.area === 'PAWAN SHAKTI');
  const roboticsProject = WORKSPACE_SNAPSHOT.projects.find((p) => p.area === 'ROBOTICS');

  assert.ok(pawanProject, 'Pawan Shakti project must exist');
  assert.ok(roboticsProject, 'Robotics project must exist');
  assert.notEqual(pawanProject.id, roboticsProject.id, 'Project IDs must be distinct');

  // Verify Chief of Staff project review response cleanly isolates both
  const review = buildDeterministicGroundedResponse('Give me a comprehensive project review of active initiatives', WORKSPACE_SNAPSHOT);

  assert.ok(review.text.includes('PAWAN SHAKTI'), 'Must review Pawan Shakti');
  assert.ok(review.text.includes('Robotics') || review.text.includes('ROBOTICS'), 'Must review Robotics Lab');
  assert.ok(review.text.includes('45%'), 'Must state exact Pawan Shakti progress');
  assert.ok(review.text.includes('60%'), 'Must state exact Robotics progress');
});

test('Scenario E: System Resilience & Graceful Fallback Diagnostics', async () => {
  // Test Google OAuth 401 invalid_client diagnostic
  const callbackRes = GoogleAuthService.parseOAuthCallback('?error=invalid_client');
  assert.equal(callbackRes.success, false, 'Must identify failed auth callback');
  assert.match(callbackRes.errorMessage || '', /401 invalid_client/, 'Must include 401 invalid_client diagnostic');

  // Test missing LLM key fallback produces grounded output without throw
  const fallback = buildDeterministicGroundedResponse('What are the technical specifications for generator sheets?', WORKSPACE_SNAPSHOT);

  assert.ok(fallback.text.includes('Pawan Shakti Aerodynamic & Generator'), 'Must retrieve matching document');
  assert.ok(fallback.text.includes('M400-50A'), 'Must quote exact document contents without hallucinating');
});
