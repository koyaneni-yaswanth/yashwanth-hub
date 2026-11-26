import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const {
  validatePublicHttpsUrl,
  signWebhookPayload,
  verifyWebhookSignature,
  getNotificationChannelsStatus,
  dispatchNotificationToChannels,
} = await import('../api/_lib/notificationChannels.ts');

const { createDispatchHandler } = await import('../api/automations/dispatch.ts');

const {
  classifyActionPermission,
  guardActionExecutionCore: guardActionExecution,
  runDiagnosticCore: runLevel1SelfHealingDiagnostics,
} = await import('../src/lib/selfHealingCore.ts');

const { buildKnowledgeGraph } = await import('../src/lib/knowledgeGraph.ts');

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
  return res;
}

test('M3: Channel status honestly reflects empty vs configured credentials without leaking secrets', () => {
  const emptyStatus = getNotificationChannelsStatus({});
  assert.equal(emptyStatus.webhookSigningConfigured, false);
  assert.equal(emptyStatus.channels.length, 3);
  assert.ok(emptyStatus.channels.every((c) => !c.configured && c.status === 'not_configured'));

  const secretToken = '123456:ABC-SECRET-TELEGRAM-TOKEN';
  const liveStatus = getNotificationChannelsStatus({
    TELEGRAM_BOT_TOKEN: secretToken,
    TELEGRAM_CHAT_ID: '998877',
    DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/abc',
    N8N_WEBHOOK_URL: 'https://n8n.example.org/webhook/hub',
    WEBHOOK_SIGNING_SECRET: 'super-hmac-secret',
  });
  assert.equal(liveStatus.webhookSigningConfigured, true);
  assert.ok(liveStatus.channels.every((c) => c.configured && c.status === 'connected'));
  assert.equal(JSON.stringify(liveStatus).includes(secretToken), false);
});

test('M3: SSRF protection blocks private IPs, localhost, metadata hosts, and plain http URLs', () => {
  const disallowed = [
    'http://hooks.example.com/hook',
    'https://localhost:5678/webhook',
    'https://127.0.0.1/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/webhook',
    'https://192.168.1.10/webhook',
    'https://172.20.0.2/webhook',
    'https://[::1]/webhook',
    'https://user:pass@hooks.example.com/webhook',
  ];
  for (const url of disallowed) {
    const res = validatePublicHttpsUrl(url);
    assert.equal(res.valid, false, `Expected ${url} to be blocked`);
  }

  const allowed = validatePublicHttpsUrl('https://n8n.example.org/webhook/yashwanth-hub');
  assert.equal(allowed.valid, true);
});

test('M3: HMAC-SHA256 signing verifies valid payloads and rejects tampered or expired requests', () => {
  const secret = 'signing-secret-xyz';
  const rawBody = JSON.stringify({ event: 'yashwanth_hub.notification', title: 'Test' });
  const nowSec = 1764000000;
  const signatureHeader = signWebhookPayload(secret, nowSec, rawBody);

  const ok = verifyWebhookSignature(secret, signatureHeader, rawBody, { nowSec: nowSec + 30 });
  assert.equal(ok.valid, true);

  const tampered = verifyWebhookSignature(secret, signatureHeader, `${rawBody} `, { nowSec: nowSec + 30 });
  assert.equal(tampered.valid, false);

  const expired = verifyWebhookSignature(secret, signatureHeader, rawBody, { nowSec: nowSec + 450 });
  assert.equal(expired.valid, false);
});

test('M3: Dispatch sends signed n8n webhooks & blocks unsafe URLs', async () => {
  const capturedCalls = [];
  const mockFetch = async (url, init) => {
    capturedCalls.push({ url, init });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  };

  const blocked = await dispatchNotificationToChannels(
    {
      channel: 'webhook',
      title: 'SSRF Probe',
      message: 'Should fail safely',
      webhookUrl: 'https://192.168.0.1/admin',
    },
    { fetchImpl: mockFetch, env: {} },
  );
  assert.equal(blocked[0].status, 'blocked');
  assert.equal(capturedCalls.length, 0);

  const results = await dispatchNotificationToChannels(
    {
      channel: 'webhook',
      title: 'Deployment Healthy',
      message: 'Pawan Shakti M3 rollout active.',
      severity: 'info',
      webhookUrl: 'https://n8n.example.org/webhook/jarvis',
    },
    {
      fetchImpl: mockFetch,
      env: { WEBHOOK_SIGNING_SECRET: 'hmac-test-key' },
      nowSec: 1764000100,
    },
  );

  assert.equal(results[0].ok, true);
  assert.equal(results[0].status, 'sent');
  assert.equal(capturedCalls.length, 1);
  const sig = capturedCalls[0].init.headers['X-Hub-Signature-256'];
  assert.ok(sig && sig.startsWith('t=1764000100,v1='));
  assert.equal(
    verifyWebhookSignature('hmac-test-key', sig, capturedCalls[0].init.body, { nowSec: 1764000110 }).valid,
    true,
  );
});

test('M3: /api/automations/dispatch exposes channel_status safely and enforces auth on POST notify', async () => {
  const insertedLogs = [];
  const fakeDb = {
    from: () => ({
      insert: async (row) => {
        insertedLogs.push(row);
        return { data: row, error: null };
      },
    }),
  };

  const handler = createDispatchHandler(
    fakeDb,
    async (req) => {
      if (req.headers?.authorization === 'Bearer valid-jwt') {
        return { authenticated: true, userId: 'user-123' };
      }
      return { authenticated: false, userId: null, error: 'Unauthorized' };
    },
    {
      channelEnv: {
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: '101',
        WEBHOOK_SIGNING_SECRET: 'handler-secret',
      },
      channelFetch: async () => new Response('{"ok":true}', { status: 200 }),
    },
  );

  // GET ?action=channel_status works without requiring service key or user JWT
  const statusReq = { method: 'GET', query: { action: 'channel_status' }, headers: {} };
  const statusRes = createMockRes();
  await handler(statusReq, statusRes);
  assert.equal(statusRes.statusCode, 200);
  assert.equal(statusRes.body.success, true);
  assert.equal(statusRes.body.channels.find((c) => c.id === 'telegram').configured, true);

  // Unauthenticated POST notify rejected
  const unauthReq = {
    method: 'POST',
    headers: {},
    body: { action: 'notify', channel: 'telegram', title: 'Hi', message: 'World' },
  };
  const unauthRes = createMockRes();
  await handler(unauthReq, unauthRes);
  assert.equal(unauthRes.statusCode, 401);

  // Authenticated POST notify succeeds and logs execution
  const authReq = {
    method: 'POST',
    headers: { authorization: 'Bearer valid-jwt' },
    body: { action: 'notify', channel: 'telegram', title: 'Alert', message: 'Verified telegram send' },
  };
  const authRes = createMockRes();
  await handler(authReq, authRes);
  assert.equal(authRes.statusCode, 200);
  assert.equal(authRes.body.success, true);
  assert.equal(authRes.body.results[0].status, 'sent');
  assert.equal(insertedLogs.length, 1);
  assert.equal(insertedLogs[0].permission_level, 2);
});

test('M3: Self-healing permission matrix & deduplicated Level-1 diagnostic scan', async () => {
  assert.equal(classifyActionPermission('diagnostic_scan'), 1);
  assert.equal(classifyActionPermission('notify_discord'), 2);
  assert.equal(classifyActionPermission('delete_records'), 3);
  assert.equal(classifyActionPermission('financial_transaction'), 3);

  const logs = [];
  const persistLog = async (entry) => {
    const rec = { id: `log_${logs.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...entry };
    logs.push(rec);
    return rec;
  };

  // Level 3 always blocked
  const l3 = await guardActionExecution(
    { actionType: 'delete_records', summary: 'Drop user items', approvedByHuman: true },
    persistLog,
  );
  assert.equal(l3.allowed, false);
  assert.equal(l3.status, 'blocked');

  // Level 2 requires confirmation
  const l2Wait = await guardActionExecution(
    { actionType: 'retry_sync_queue', summary: 'Retry sync', approvedByHuman: false },
    persistLog,
  );
  assert.equal(l2Wait.allowed, false);
  assert.equal(l2Wait.status, 'pending_approval');

  const l2Ok = await guardActionExecution(
    { actionType: 'retry_sync_queue', summary: 'Retry sync', approvedByHuman: true },
    persistLog,
  );
  assert.equal(l2Ok.allowed, true);
  assert.equal(l2Ok.status, 'executed');

  // Level-1 diagnostics deduplicates overdue alerts per day
  const alertStore = [];
  const deps = {
    todayISO: '2026-11-26',
    readSyncQueue: async () => [{ id: 'sq1', status: 'failed' }, { id: 'sq2', status: 'pending' }],
    readTasks: async () => [
      { id: 't1', title: 'Test Wind Rotor', completed: false, dueDate: '2026-11-20' },
      { id: 't2', title: 'Future item', completed: false, dueDate: '2026-12-01' },
    ],
    readNotifications: async () => alertStore,
    writeNotification: async (n) => {
      alertStore.push(n);
    },
    readGoogleAuthMeta: async () => ({ connected: true, expiresAt: Date.now() - 10_000 }),
    checkAiGatewayHealth: async () => ({ ok: true, connectedProviders: 1 }),
    persistLog,
  };

  const scan1 = await runLevel1SelfHealingDiagnostics(deps);
  assert.equal(scan1.failedSyncCount, 1);
  assert.equal(scan1.pendingSyncCount, 1);
  assert.equal(scan1.overdueTaskCount, 1);
  assert.equal(scan1.newAlertsCreated, 1);
  assert.equal(scan1.overallStatus, 'attention');

  const scan2 = await runLevel1SelfHealingDiagnostics(deps);
  assert.equal(scan2.newAlertsCreated, 0);
  assert.equal(scan2.suppressedDuplicateAlerts, 1);
  assert.equal(alertStore.length, 1);
});

test('M3: Knowledge graph renders saved research bookmarks & user-created knowledge links', () => {
  const graph = buildKnowledgeGraph({
    projects: [{ id: 'p_wind', title: 'Pawan Shakti V3', area: 'PAWAN SHAKTI' }],
    researchBookmarks: [
      {
        id: 'arxiv:2501.001',
        source: 'arxiv',
        external_id: '2501.001',
        title: 'Archimedes Spiral VAWT Blade Aerodynamics',
        year: 2025,
        topic: 'PAWAN SHAKTI',
      },
    ],
    customLinks: [
      {
        id: 'link_1',
        source_type: 'paper',
        source_id: '2501.001',
        target_type: 'project',
        target_id: 'p_wind',
        relation: 'researched_by',
      },
    ],
  });

  assert.equal(graph.stats.byKind.paper, 1);
  assert.equal(graph.stats.userEdges, 1);
  const edge = graph.edges.find((e) => e.kind === 'user_link');
  assert.ok(edge);
  assert.equal(edge.label, 'researched_by');
  assert.equal(edge.customLinkId, 'link_1');
});

test('M3: Vercel serverless endpoint count remains <= 12', () => {
  const apiDir = path.resolve(process.cwd(), 'api');
  const endpoints = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '_lib') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) endpoints.push(full);
    }
  };
  walk(apiDir);
  assert.ok(endpoints.length <= 12, `Expected <= 12 endpoints, found ${endpoints.length}`);
});
