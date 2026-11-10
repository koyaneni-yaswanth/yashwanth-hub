/**
 * Yashwanth Hub Server-Side Automation Engine: Verification & Smoke Test Script
 * Uses live server DB if SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are configured,
 * otherwise runs cleanly against an explicit isolated test DB adapter so no fake HTTP bypass exists in production routes.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isServerSupabaseConfigured, supabaseServer } from '../api/_lib/db.ts';
import { executeAutomationRun } from '../api/_lib/runner.ts';
import { createDispatchHandler } from '../api/automations/dispatch.ts';

function createLocalTestDb() {
  const tables: Record<string, any[]> = {
    automations: [],
    automation_queue: [],
    automation_runs: [],
    notifications: [],
    integration_tokens: [],
    tasks: [],
    meetings: [],
  };

  return {
    from(table: string) {
      if (!tables[table]) tables[table] = [];
      const rows = tables[table];
      const filters: Array<(r: any) => boolean> = [];
      let op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
      let payload: any = null;
      let singleMode = false;

      const b: any = {
        select: () => b,
        insert: (d: any) => { op = 'insert'; payload = d; return b; },
        update: (d: any) => { op = 'update'; payload = d; return b; },
        upsert: (d: any) => { op = 'upsert'; payload = d; return b; },
        eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return b; },
        in: (c: string, vals: any[]) => { filters.push((r) => vals.includes(r[c])); return b; },
        lte: (c: string, v: any) => { filters.push((r) => String(r[c] ?? '') <= String(v)); return b; },
        order: () => b,
        limit: () => b,
        single: () => { singleMode = true; return exec(); },
        then: (res: any, rej: any) => exec().then(res, rej),
      };

      async function exec() {
        const match = (r: any) => filters.every((fn) => fn(r));
        if (op === 'insert') {
          const item = { id: payload.id || crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
          rows.push(item);
          return { data: singleMode ? item : [item], error: null };
        }
        if (op === 'upsert') {
          const idx = rows.findIndex((r) => r.id === payload.id);
          const item = { id: payload.id || crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
          if (idx >= 0) rows[idx] = { ...rows[idx], ...item };
          else rows.push(item);
          return { data: singleMode ? item : [item], error: null };
        }
        if (op === 'update') {
          const m = rows.filter(match);
          m.forEach((r) => Object.assign(r, payload));
          return { data: singleMode ? m[0] || null : m, error: null };
        }
        const res = rows.filter(match);
        if (singleMode) return res.length ? { data: res[0], error: null } : { data: null, error: { message: 'Not found' } };
        return { data: res, error: null };
      }

      return b;
    },
  };
}

async function runSmokeTest() {
  console.log('=== YASHWANTH HUB AUTOMATION ENGINE SMOKE TEST ===\n');
  const liveDb = isServerSupabaseConfigured();
  const dbAdapter = liveDb ? supabaseServer : createLocalTestDb();
  const testUserId = '00000000-0000-0000-0000-000000000001';

  console.log(
    liveDb
      ? 'Mode: LIVE Supabase Service Role DB'
      : 'Mode: Isolated Local Test DB Adapter (SUPABASE_SERVICE_ROLE_KEY not configured locally)\n'
  );

  const testIdempotencyKey = `idemp_smoke_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const dispatch = createDispatchHandler(
    dbAdapter,
    async () => ({ authenticated: true, userId: testUserId, email: 'smoke@yashwanth-hub.local' })
  );

  try {
    console.log('[1/5] Registering test automation...');
    const { data: createdAuto } = await dbAdapter
      .from('automations')
      .upsert({
        id: 'a0000000-0000-0000-0000-000000000099',
        user_id: testUserId,
        name: 'Smoke Test Scheduled Scanner',
        description: 'Automated verification test automation validating serverless execution and idempotency.',
        trigger_type: 'cron',
        trigger_config: { cron_expression: '0 * * * *', timezone: 'Asia/Kolkata' },
        action_type: 'task_deadline_scan',
        action_config: { lead_time_minutes: 45 },
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    console.log('  ✔ Automation registered. ID:', createdAuto.id);

    console.log('\n[2/5] Dispatching automation run...');
    const invokeDispatch = async (req: any) =>
      new Promise<{ status: number; body: any }>((resolve) => {
        let code = 200;
        dispatch(req, {
          setHeader: () => {},
          status: (c: number) => {
            code = c;
            return {
              json: (body: any) => resolve({ status: code, body }),
              end: () => resolve({ status: code, body: null }),
            };
          },
        });
      });

    const first = await invokeDispatch({
      method: 'POST',
      headers: { authorization: 'Bearer test', 'idempotency-key': testIdempotencyKey },
      body: {
        automation_id: 'a0000000-0000-0000-0000-000000000099',
        action_type: 'task_deadline_scan',
        input_payload: { lead_time_minutes: 45 },
        idempotency_key: testIdempotencyKey,
      },
    });
    assert.equal(first.status, 200);
    assert.ok(first.body.run_id);
    assert.ok(typeof first.body.duration_ms === 'number');
    console.log(`  ✔ Executed in ${first.body.duration_ms}ms (status: "${first.body.status}")`);

    console.log('\n[3/5] Verifying run persistence in automation_runs...');
    const { data: runInDb } = await dbAdapter
      .from('automation_runs')
      .select('*')
      .eq('id', first.body.run_id)
      .single();
    assert.equal(runInDb.status, 'completed');
    assert.equal(runInDb.idempotency_key, testIdempotencyKey);
    console.log('  ✔ Verified run persistence record.');

    console.log('\n[4/5] Testing Idempotency Lock...');
    const second = await invokeDispatch({
      method: 'POST',
      headers: { authorization: 'Bearer test', 'idempotency-key': testIdempotencyKey },
      body: {
        automation_id: 'a0000000-0000-0000-0000-000000000099',
        action_type: 'task_deadline_scan',
        idempotency_key: testIdempotencyKey,
      },
    });
    assert.equal(second.body.idempotent, true);
    assert.equal(second.body.run_id, first.body.run_id);
    console.log('  ✔ Idempotency lock verified.');

    console.log('\n[5/5] Verifying diagnostic handling on missing Google credentials...');
    const unauthed = await executeAutomationRun(
      {
        run_id: `test_run_${Date.now()}`,
        automation_id: 'a0000000-0000-0000-0000-000000000003',
        user_id: 'unauthorized_user_test',
        action_type: 'google_calendar',
        action_config: {},
        max_retries: 0,
      },
      dbAdapter
    );
    assert.equal(unauthed.status, 'needs_authorization');
    console.log('  ✔ Missing credentials accurately flagged as needs_authorization.\n');
    console.log('🎉 ALL 5 SMOKE TEST ASSERTIONS PASSED!');
  } catch (err: any) {
    console.error('\n❌ Smoke test failed:', err);
    process.exit(1);
  }
}

runSmokeTest();
