import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const {
  toCloudConversationRow,
  fromCloudConversationRow,
  toCloudMemoryRow,
  fromCloudMemoryRow,
  isSyncedPreferenceKey,
} = await import('../src/services/sync/extraCloudSyncCore.ts');

const { buildAutonomousRadarItems } = await import('../src/lib/autonomousRadar.ts');

test('M8 Extra Cloud Sync Core: maps conversations, NeoMemories, and synced preferences safely', () => {
  const convCloud = toCloudConversationRow(
    {
      id: 'conv-42',
      title: 'TRL 5 Review',
      agent_id: 'startup_advisor',
      messages: [{ id: 'm1', role: 'user', content: 'Status?' }],
      total_tokens: 150,
      created_at: '2026-11-27T10:00:00Z',
      updated_at: '2026-11-27T10:05:00Z',
    },
    'user-99'
  );
  assert.equal(convCloud.user_id, 'user-99');
  assert.match(String(convCloud.id), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  const convLocal = fromCloudConversationRow(convCloud);
  assert.equal(convLocal.title, 'TRL 5 Review');
  assert.equal(Array.isArray(convLocal.messages), true);

  const memCloud = toCloudMemoryRow(
    {
      id: 'mem-1',
      originalNeoId: 'neo-9',
      title: 'Rotor meeting',
      source: 'json_export',
      platform: 'google_meet',
      capturedAt: '2026-11-27T08:00:00Z',
      summary: 'Discussed helical blade pitch',
      actionItems: [{ id: 'a1', text: 'Run CFD', status: 'pending_approval' }],
    },
    'user-99'
  );
  // Unsupported source string coerces to web_import to honor DB check constraint
  assert.equal(memCloud.source, 'web_import');
  assert.equal(memCloud.original_neo_id, 'neo-9');
  assert.equal(memCloud.associated_area, 'Personal');
  const memLocal = fromCloudMemoryRow(memCloud);
  assert.equal(memLocal.originalNeoId, 'neo-9');
  assert.equal(memLocal.actionItems.length, 1);

  assert.equal(isSyncedPreferenceKey('v3f_assessment_v2'), true);
  assert.equal(isSyncedPreferenceKey('pawan_pv_telemetry_v1'), true);
  assert.equal(isSyncedPreferenceKey('random_local_flag'), false);
});

test('M8 Autonomous Radar prioritizes overdue triage, Neo commitments, and P-v telemetry gate', () => {
  const items = buildAutonomousRadarItems({
    todayISO: '2026-11-27',
    tasks: [
      { id: 't1', text: 'Fix shaft alignment', area: 'PAWAN SHAKTI', priority: 'urgent', due_date: '2026-11-25', done: false, created_at: '', updated_at: '' },
    ],
    activeGoalsCount: 0,
    neoMemoriesPendingCount: 2,
    hasVerifiedPvTelemetry: false,
    queueCount: 1,
    signedIn: false,
  });

  assert.equal(items.length, 3);
  assert.equal(items[0].id, 'radar-overdue');
  assert.equal(items[1].id, 'radar-neo');
  assert.equal(items[2].id, 'radar-pv');
});

test('M8 Multiplexed Realtime, Unified Sync Modal, & Migration Invariants hold cleanly', () => {
  const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  const rtSrc = read('src/services/sync/realtimeSyncManager.ts');
  assert.match(rtSrc, /realtime_yashwanth_hub_unified/);
  assert.match(rtSrc, /applyExtraRealtime/);

  const neoPage = read('src/pages/NeoMemoryCenterPage.tsx');
  assert.ok(!neoPage.includes("enqueueChange('neo_memories'"), 'must never target non-existent neo_memories table');

  const sysPage = read('src/pages/SystemHealthSyncCenterPage.tsx');
  assert.ok(!sysPage.includes('{syncStatus.state}'), 'must expose human-readable health status rather than raw NOT_CONNECTED');
  assert.match(sysPage, /Live Sync Queue &amp; Cross-Device Fleet Inspector/);

  const sql = read('supabase/migrations/20261127_m8_sync_conversations_preferences.sql');
  assert.match(sql, /public\.user_preferences/);
  assert.match(sql, /\(select auth\.uid\(\)\) = user_id/);
  assert.equal(/\bdrop\s+(table|policy|index|extension)\b/i.test(sql), false);
});
