import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  WORKSPACE_LOCAL_TABLES,
  ensureWorkspaceUuid,
  fromCloudWorkspaceRow,
  isValidUuid,
  resolveLocalWorkspaceTable,
  resolveRemoteWorkspaceTable,
  toCloudWorkspaceRow,
} from '../src/services/sync/workspaceSyncCore.ts';
import { parseQuickCaptureInput } from '../src/services/voiceCaptureParser.ts';
import { formatSyncHudStatus } from '../src/lib/jarvisHud.ts';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('workspaceSyncCore maps contacts, documents, robotics_records, and UUIDs safely', () => {
  assert.equal(resolveRemoteWorkspaceTable('robotics_records'), 'robotics_experiments');
  assert.equal(resolveLocalWorkspaceTable('robotics_experiments'), 'robotics_records');

  const uid = 'bff0efd2-f5e2-4c95-b97c-eef24d36b6b9';
  assert.equal(ensureWorkspaceUuid(uid), uid);
  const legacyConverted = ensureWorkspaceUuid('legacy-note-42');
  assert.equal(isValidUuid(legacyConverted), true);
  assert.equal(legacyConverted, ensureWorkspaceUuid('legacy-note-42'), 'deterministic across devices');

  const contactCloud = toCloudWorkspaceRow(
    'contacts',
    { id: uid, name: 'Dr. Sharma', role: 'Advisor', company: 'VNIT', note: 'Blade review', created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z' },
    'user-123',
  );
  assert.equal(contactCloud.organization, 'VNIT');
  assert.equal(contactCloud.notes, 'Blade review');
  assert.equal(contactCloud.user_id, 'user-123');

  const contactLocal = fromCloudWorkspaceRow('contacts', {
    id: uid,
    user_id: 'user-123',
    name: 'Dr. Sharma',
    role: 'Advisor',
    organization: 'VNIT',
    notes: 'Blade review',
    created_at: '2026-11-26T00:00:00+00:00',
    updated_at: '2026-11-26T00:00:00+00:00',
  });
  assert.equal(contactLocal.company, 'VNIT');
  assert.equal(contactLocal.note, 'Blade review');
  assert.ok(!('organization' in contactLocal) && !('user_id' in contactLocal));

  const fakeBlob = new Blob(['cad']);
  const docCloud = toCloudWorkspaceRow(
    'documents',
    { id: uid, title: 'CAD Spec', file_name: 'cad.pdf', file_size: 2048, mime_type: 'application/pdf', area: 'PAWAN SHAKTI', data_blob: fakeBlob, created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z' },
    'user-123',
  );
  assert.ok(!('data_blob' in docCloud), 'binary blobs stay local');
  assert.equal(docCloud.file_size, '2048');
  assert.equal(docCloud.category, 'PAWAN SHAKTI');

  const docLocal = fromCloudWorkspaceRow('documents', docCloud, { data_blob: fakeBlob });
  assert.equal(docLocal.file_size, 2048);
  assert.equal(docLocal.data_blob, fakeBlob);
});

test('voiceCaptureParser detects goal intent and cleans goal prefix', () => {
  const parsed = parseQuickCaptureInput('goal: Reach TRL 5 integrated prototype #pawan', {
    todayISO: '2026-11-26',
  });
  assert.equal(parsed.type, 'goal');
  assert.equal(parsed.area, 'PAWAN SHAKTI');
  assert.equal(parsed.title, 'Reach TRL 5 integrated prototype');
});

test('formatSyncHudStatus exposes honest signed-out local status without false synced claims', () => {
  const signedOut = formatSyncHudStatus('local', 0, 0, false);
  assert.equal(signedOut.label, 'SYSTEMS NOMINAL · SIGN IN TO SYNC');
  assert.equal(signedOut.tone, 'amber');

  const queuedLocal = formatSyncHudStatus('local', 3, 0, false);
  assert.equal(queuedLocal.label, 'SYSTEMS NOMINAL · SIGN IN TO SYNC (3)');
  assert.equal(queuedLocal.tone, 'amber');
});

test('universal bidirectional sync, realtime auth rebinding, mobile sign-in header, and non-destructive SQL migration', () => {
  const queueSrc = read('src/services/sync/syncQueueService.ts');
  const rtSrc = read('src/services/sync/realtimeSyncManager.ts');
  const coordSrc = read('src/services/sync/cloudSyncCoordinator.ts');
  const lifeSrc = read('src/services/sync/lifeSync.ts');
  const headerSrc = read('src/components/layout/Header.tsx');
  const goalsSrc = read('src/pages/GoalsHabitsPage.tsx');
  const dashSrc = read('src/pages/DashboardPage.tsx');
  const appSrc = read('src/App.tsx');
  const sql = read('supabase/migrations/20261126_universal_workspace_sync_and_realtime.sql');

  assert.match(queueSrc, /onConflict: 'user_id,id'/);
  assert.match(queueSrc, /resolveRemoteWorkspaceTable/);
  assert.match(queueSrc, /payload\?\.user_id \|\| userId/);

  assert.match(rtSrc, /WORKSPACE_LOCAL_TABLES/);
  assert.match(rtSrc, /SupabaseAuthService\.subscribe/);
  assert.match(rtSrc, /applyWorkspaceRealtime/);

  assert.match(coordSrc, /reconcileLifeData/);
  assert.match(coordSrc, /reconcileWorkspaceData/);
  assert.match(lifeSrc, /installWorkspaceSyncHooks/);
  assert.match(lifeSrc, /runFullCloudSync/);
  assert.match(appSrc, /installWorkspaceSyncHooks/);

  assert.match(headerSrc, /Always-visible Account \/ Live Sync Pill/);
  assert.match(goalsSrc, /Sign in to sync/);
  assert.match(dashSrc, /await syncNow\(\)/);

  for (const t of WORKSPACE_LOCAL_TABLES) {
    const remote = resolveRemoteWorkspaceTable(t);
    assert.ok(sql.includes(`'${remote}'`), `migration realtime list must include ${remote}`);
  }
  assert.ok(!/drop table|drop policy|truncate|delete from/i.test(sql), 'strictly additive SQL migration');
});
