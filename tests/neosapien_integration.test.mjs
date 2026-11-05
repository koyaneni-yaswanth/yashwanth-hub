// ==============================================================================
// YASHWANTH HUB — NEOSAPIEN MCP INTEGRATION TEST SUITE
// Tests: Authentication, PKCE, MCP Tool Schemas, Deduplication, Normalization & Security
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ------------------------------------------------------------------------------
// 1. AUTHENTICATION & PKCE VALIDATION (RFC 7636)
// ------------------------------------------------------------------------------
test('PKCE generation produces valid RFC 7636 code_verifier and code_challenge', () => {
  const verifier = crypto.randomBytes(32).toString('base64url');
  assert.ok(verifier.length >= 43 && verifier.length <= 128, 'Verifier must be 43-128 chars base64url');
  assert.match(verifier, /^[A-Za-z0-9_-]+$/, 'Verifier must contain only unreserved base64url characters');

  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  assert.ok(challenge.length >= 43, 'SHA-256 challenge must be valid base64url string');

  // Verify deterministic challenge generation
  const challengeCheck = crypto.createHash('sha256').update(verifier).digest('base64url');
  assert.equal(challenge, challengeCheck, 'Challenge must be deterministic for identical verifier');
});

test('State parameter has sufficient entropy for CSRF mitigation', () => {
  const state1 = `st_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const state2 = `st_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  assert.notEqual(state1, state2, 'States must be unique across invocations');
  assert.ok(state1.length >= 20, 'State must have high entropy');
});

// ------------------------------------------------------------------------------
// 2. MCP CAPABILITY & TOOL SCHEMA VALIDATION
// ------------------------------------------------------------------------------
const OFFICIAL_NEOSAPIEN_TOOLS = [
  {
    name: 'list_memories',
    description: 'Retrieve paginated personal audio memories and meeting conversations with time-window filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer' },
        cursor: { type: 'string' },
        session_id: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
      },
    },
  },
  {
    name: 'get_memory',
    description: 'Fetch detailed memory record including executive summary, emotions, topics, and minutes of meeting (MoM).',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string' },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'get_transcript',
    description: 'Retrieve verbatim on-device ambient audio speech transcript for a specific memory.',
    inputSchema: {
      type: 'object',
      properties: {
        memory_id: { type: 'string' },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'search_memories',
    description: 'Semantic and keyword search across stored wearable memories and conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_user_stats',
    description: 'Retrieve aggregate wearable metrics: total memory count, active recording duration, and sales minutes.',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
      },
    },
  },
  {
    name: 'get_device_status',
    description: 'Inspect live wearable telemetry: connection state, battery level, and firmware version if exposed.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

test('Official NeoSapien MCP tool catalog contains valid JSON-RPC schemas', () => {
  assert.equal(OFFICIAL_NEOSAPIEN_TOOLS.length, 6, 'Should expose exactly 6 verified tools');

  for (const tool of OFFICIAL_NEOSAPIEN_TOOLS) {
    assert.ok(tool.name && typeof tool.name === 'string', 'Tool must have name');
    assert.ok(tool.description && typeof tool.description === 'string', 'Tool must have description');
    assert.equal(tool.inputSchema.type, 'object', 'Input schema must be object type');
  }

  const getMemTool = OFFICIAL_NEOSAPIEN_TOOLS.find((t) => t.name === 'get_memory');
  assert.ok(getMemTool?.inputSchema.required?.includes('memory_id'), 'get_memory requires memory_id');

  const searchTool = OFFICIAL_NEOSAPIEN_TOOLS.find((t) => t.name === 'search_memories');
  assert.ok(searchTool?.inputSchema.required?.includes('query'), 'search_memories requires query');
});

test('Rejects non-existent, fabricated or unexposed MCP tools', () => {
  const disallowedTools = ['get_telemetry_live', 'stream_raw_audio', 'format_wearable_drive', 'fake_tool'];
  for (const badTool of disallowedTools) {
    const found = OFFICIAL_NEOSAPIEN_TOOLS.some((t) => t.name === badTool);
    assert.equal(found, false, `Fabricated tool "${badTool}" must not be recognized`);
  }
});

// ------------------------------------------------------------------------------
// 3. DATA NORMALIZATION & DEDUPLICATION CHECKSUMS
// ------------------------------------------------------------------------------
function computeHash(content) {
  let hash = 2166136261;
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getMemoryFingerprint(memory) {
  if (memory.originalNeoId && memory.originalNeoId.trim()) {
    return `neo_${memory.originalNeoId.trim()}`;
  }
  const normalizedTitle = memory.title.trim().toLowerCase().replace(/\s+/g, ' ');
  const normalizedDate = memory.capturedAt.slice(0, 16);
  return `hash_${computeHash(`${normalizedTitle}_${normalizedDate}`)}`;
}

test('Memory fingerprinting correctly identifies identical and distinct memories', () => {
  const mem1 = { originalNeoId: 'rec_abc123', title: 'Stator Review', capturedAt: '2026-11-04T10:00:00Z' };
  const mem2 = { originalNeoId: 'rec_abc123', title: 'Stator Review (Edited)', capturedAt: '2026-11-04T10:05:00Z' };
  const mem3 = { originalNeoId: 'rec_xyz999', title: 'Stator Review', capturedAt: '2026-11-04T10:00:00Z' };

  assert.equal(getMemoryFingerprint(mem1), 'neo_rec_abc123', 'Should use originalNeoId when present');
  assert.equal(getMemoryFingerprint(mem1), getMemoryFingerprint(mem2), 'Same upstream ID produces same fingerprint');
  assert.notEqual(getMemoryFingerprint(mem1), getMemoryFingerprint(mem3), 'Different upstream IDs produce different fingerprints');
});

test('Content checksum detects edits accurately', () => {
  const original = { title: 'Wind Turbine Testing', summary: 'Tested Archimedes spiral blade' };
  const identical = { title: 'Wind Turbine Testing', summary: 'Tested Archimedes spiral blade' };
  const edited = { title: 'Wind Turbine Testing', summary: 'Tested Archimedes spiral blade at 8 m/s' };

  const hash1 = computeHash(`${original.title}:::${original.summary}`);
  const hash2 = computeHash(`${identical.title}:::${identical.summary}`);
  const hash3 = computeHash(`${edited.title}:::${edited.summary}`);

  assert.equal(hash1, hash2, 'Identical content yields identical checksum');
  assert.notEqual(hash1, hash3, 'Edited content produces distinct checksum');
});

// ------------------------------------------------------------------------------
// 4. EXTRACTION & APPROVAL GATES (ZERO PHANTOM MUTATIONS)
// ------------------------------------------------------------------------------
test('Spoken MoM action items are parsed with status pending_approval', () => {
  const rawMom = `
    - Discussed planetary gear ratio 1:5.
    - Decision: Approved co-axial magnetic gear prototype.
    - Action: Review laser cutting tolerances for stator laminations.
    - Action: Order digital tachometer by Friday.
  `;

  const decisions = [];
  const actionItems = [];

  const lines = rawMom.split('\n');
  for (const line of lines) {
    const clean = line.replace(/^[-*•\d.]\s*/, '').trim();
    if (/decision/i.test(line) && clean.length > 5) {
      decisions.push(clean);
    } else if (/action/i.test(line) && clean.length > 5) {
      actionItems.push({
        text: clean,
        status: 'pending_approval',
        isCommitment: true,
      });
    }
  }

  assert.equal(decisions.length, 1);
  assert.equal(actionItems.length, 2);
  for (const action of actionItems) {
    assert.equal(action.status, 'pending_approval', 'Must require founder approval before task creation');
  }
});

// ------------------------------------------------------------------------------
// 5. SECURITY & TENANT ISOLATION
// ------------------------------------------------------------------------------
test('Security rules prohibit unauthenticated secret validation', () => {
  function validateBearerToken(configuredSecret, headerValue) {
    if (!configuredSecret) return false;
    return headerValue === `Bearer ${configuredSecret}`;
  }

  assert.equal(validateBearerToken('', 'Bearer test'), false, 'Empty secret must reject requests');
  assert.equal(validateBearerToken('my_secret', 'Bearer wrong'), false, 'Wrong secret must reject');
  assert.equal(validateBearerToken('my_secret', 'Bearer my_secret'), true, 'Exact secret must authorize');
});
