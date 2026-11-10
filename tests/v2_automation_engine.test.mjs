import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { computeNextCronRun, isValidCronExpression } from '../api/_lib/cronParser.ts';
import { computeRetryBackoffMs, processAutomationTick, processDueQueueJobs } from '../api/_lib/queueEngine.ts';
import { executeAutomationRun } from '../api/_lib/runner.ts';
import { createDispatchHandler } from '../api/automations/dispatch.ts';
import { createCronTriggersHandler } from '../api/cron/process-triggers.ts';

class MemDb {
  tables = {
    automations: [],
    automation_queue: [],
    automation_runs: [],
    notifications: [],
    integration_tokens: [],
    neosapien_connections: [],
    tasks: [],
    meetings: [],
  };
  from(t) {
    if (!this.tables[t]) this.tables[t] = [];
    const rows = this.tables[t];
    const filters = [];
    let op = 'select';
    let payload = null;
    const orderBy = [];
    let maxRows = null;
    let mode = 'many';

    const builder = {
      select() { return builder; },
      insert(d) { op = 'insert'; payload = d; return builder; },
      update(d) { op = 'update'; payload = d; return builder; },
      eq(c, v) { filters.push((r) => r[c] === v); return builder; },
      in(c, vals) { filters.push((r) => vals.includes(r[c])); return builder; },
      lte(c, v) { filters.push((r) => String(r[c] ?? '') <= String(v)); return builder; },
      order(c, opts) { orderBy.push({ c, asc: opts?.ascending !== false }); return builder; },
      limit(n) { maxRows = n; return builder; },
      single() { mode = 'single'; return exec(); },
      maybeSingle() { mode = 'maybeSingle'; return exec(); },
      then(res, rej) { return exec().then(res, rej); },
    };

    async function exec() {
      const match = (r) => filters.every((fn) => fn(r));
      if (op === 'insert') {
        const items = Array.isArray(payload) ? payload : [payload];
        const inserted = [];
        for (const item of items) {
          if (item.idempotency_key && rows.some((x) => x.idempotency_key === item.idempotency_key)) {
            return { data: null, error: { message: 'duplicate idempotency_key' } };
          }
          const r = { id: item.id || crypto.randomUUID(), created_at: new Date().toISOString(), ...structuredClone(item) };
          rows.push(r);
          inserted.push(r);
        }
        return { data: mode === 'many' ? inserted : inserted[0], error: null };
      }
      if (op === 'update') {
        const updated = [];
        for (const r of rows) {
          if (match(r)) {
            Object.assign(r, structuredClone(payload));
            updated.push(r);
          }
        }
        if (mode === 'single' && updated.length === 0) return { data: null, error: { message: 'Not found' } };
        return { data: mode === 'many' ? updated : updated[0] || null, error: null };
      }
      let out = rows.filter(match).map((r) => structuredClone(r));
      for (const o of [...orderBy].reverse()) {
        out.sort((a, b) => (o.asc ? String(a[o.c] ?? '').localeCompare(String(b[o.c] ?? '')) : String(b[o.c] ?? '').localeCompare(String(a[o.c] ?? ''))));
      }
      if (maxRows !== null) out = out.slice(0, maxRows);
      if (mode === 'single') return out.length ? { data: out[0], error: null } : { data: null, error: { message: 'Empty' } };
      if (mode === 'maybeSingle') return { data: out[0] || null, error: null };
      return { data: out, error: null };
    }

    return builder;
  }
}

function callHttp(handler, req) {
  return new Promise((resolve) => {
    let status = 200;
    handler(req, {
      setHeader() {},
      status(c) {
        status = c;
        return {
          json: (body) => resolve({ status, body }),
          end: () => resolve({ status, body: null }),
        };
      },
    });
  });
}

test('Phase 2 Cron Parser: computes exact Asia/Kolkata schedules and validates malformed syntax', () => {
  assert.equal(isValidCronExpression('0 7 * * *'), true);
  assert.equal(isValidCronExpression('*/15 9-17 * * 1-5'), true);
  assert.equal(isValidCronExpression('bad'), false);

  const nextMorning = computeNextCronRun('0 7 * * *', new Date('2026-11-10T01:00:00.000Z'), 'Asia/Kolkata');
  assert.equal(nextMorning.toISOString(), '2026-11-10T01:30:00.000Z');
});

test('Phase 2 Cron Auth: process-triggers enforces CRON_SECRET when configured', async () => {
  const prevSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'super_secret_cron_val';
  try {
    const cronHandler = createCronTriggersHandler(new MemDb());
    const unauth = await callHttp(cronHandler, { method: 'GET', headers: {} });
    assert.equal(unauth.status, 401);
    const wrong = await callHttp(cronHandler, { method: 'GET', headers: { authorization: 'Bearer nope' } });
    assert.equal(wrong.status, 401);
  } finally {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
  }
});

test('Phase 2 Queue Engine: executes isolated scheduled job, blocks cross-user approval, and schedules retry backoff', async () => {
  const db = new MemDb();
  const userA = 'aaaa1111-1111-4111-8111-111111111111';
  const userB = 'bbbb2222-2222-4222-8222-222222222222';
  const dispatch = createDispatchHandler(db, async (req) => {
    if (req.headers?.authorization === 'Bearer A') return { authenticated: true, userId: userA };
    if (req.headers?.authorization === 'Bearer B') return { authenticated: true, userId: userB };
    return { authenticated: false, userId: null };
  });

  const dueAt = new Date('2026-11-10T08:00:00.000Z');
  const created = await callHttp(dispatch, {
    method: 'POST',
    headers: { authorization: 'Bearer A' },
    body: {
      action: 'create_automation',
      name: 'Approval Schedule',
      trigger_type: 'one_time',
      scheduled_for: dueAt.toISOString(),
      action_type: 'isolated_scheduled_check',
      requires_approval: true,
    },
  });
  assert.equal(created.status, 201);

  const tickBeforeApproval = await processAutomationTick(db, executeAutomationRun, {
    now: new Date(dueAt.getTime() + 1000),
  });
  assert.equal(tickBeforeApproval.pendingApprovalCount, 1);
  assert.equal(tickBeforeApproval.executedCount, 0);

  const qJob = db.tables.automation_queue[0];
  const forbiddenApprove = await callHttp(dispatch, {
    method: 'POST',
    headers: { authorization: 'Bearer B' },
    body: { action: 'approve_job', queue_job_id: qJob.id },
  });
  assert.equal(forbiddenApprove.status, 404);

  const validApprove = await callHttp(dispatch, {
    method: 'POST',
    headers: { authorization: 'Bearer A' },
    body: { action: 'approve_job', queue_job_id: qJob.id },
  });
  assert.equal(validApprove.status, 200);
  assert.equal(validApprove.body.executed[0].status, 'completed');

  // Verify backoff helper + retry state
  assert.equal(computeRetryBackoffMs(0, 30000), 30000);
  assert.equal(computeRetryBackoffMs(1, 30000), 60000);

  await db.from('automation_queue').insert({
    automation_id: crypto.randomUUID(),
    user_id: userA,
    action_type: 'isolated_scheduled_check',
    status: 'pending',
    approval_status: 'auto_approved',
    retry_count: 0,
    max_retries: 1,
    scheduled_for: dueAt.toISOString(),
    idempotency_key: 'retry_key_1',
  });
  const failRunner = async (job) => ({
    run_id: job.run_id,
    status: 'failed',
    duration_ms: 5,
    records_affected: 0,
    output_payload: {},
    error_log: 'Transient fail',
    retry_count: 0,
  });
  const retryTick = await processDueQueueJobs(db, failRunner, { now: dueAt, baseBackoffMs: 10000 });
  assert.equal(retryTick.retryScheduledCount, 1);
  assert.equal(retryTick.executedRuns[0].next_retry_at, new Date(dueAt.getTime() + 10000).toISOString());
});
