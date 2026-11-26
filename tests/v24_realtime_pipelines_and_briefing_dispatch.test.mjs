import test from 'node:test';
import assert from 'node:assert/strict';

const {
  M3_SYNC_TABLES,
  applyM3PayloadToArray,
} = await import('../src/services/sync/m3RealtimeCore.ts');

const { executeAutomationRun } = await import('../api/_lib/runner.ts');

function createMockSupabase() {
  const store = {
    automation_runs: [],
    notifications: [],
    research_bookmarks: [],
    agent_execution_logs: [],
    tasks: [
      { id: 't1', user_id: 'u1', text: 'Inspect V3F Rotor Blades', done: false, priority: 'urgent', due_date: '2026-11-20' },
    ],
    meetings: [
      { id: 'm1', user_id: 'u1', title: 'IvLabs Review', date: new Date().toISOString().split('T')[0], start_time: '10:00', status: 'scheduled' },
    ],
  };

  return {
    store,
    from(table) {
      return {
        upsert: async (row) => {
          store[table] = store[table] || [];
          store[table] = [row, ...store[table].filter((r) => r.id !== row.id)];
          return { data: row, error: null };
        },
        insert: async (row) => {
          store[table] = store[table] || [];
          store[table].push(row);
          return { data: row, error: null };
        },
        update: () => ({
          eq: async () => ({ error: null }),
        }),
        select: () => {
          const filters = [];
          const query = {
            eq(col, val) {
              filters.push([col, val]);
              return query;
            },
            limit() {
              return query;
            },
            then(resolve) {
              let rows = [...(store[table] || [])];
              for (const [col, val] of filters) {
                rows = rows.filter((r) => r[col] === val);
              }
              return Promise.resolve(resolve({ data: rows, error: null }));
            },
          };
          return query;
        },
      };
    },
  };
}

test('M4: Cross-device M3 realtime reconciliation handles inserts, stale echoes, updates, and deletes', () => {
  assert.deepEqual([...M3_SYNC_TABLES], ['knowledge_links', 'research_bookmarks', 'agent_execution_logs']);

  let rows = applyM3PayloadToArray([], {
    eventType: 'INSERT',
    new: { id: 'l1', title: 'Initial link', updated_at: '2026-11-26T10:00:00.000Z' },
  });
  assert.equal(rows.length, 1);

  // Stale cloud echo must NOT overwrite newer local item
  rows = applyM3PayloadToArray(rows, {
    eventType: 'UPDATE',
    new: { id: 'l1', title: 'Stale title', updated_at: '2026-11-26T09:00:00.000Z' },
  });
  assert.equal(rows[0].title, 'Initial link');

  // Newer cloud edit wins
  rows = applyM3PayloadToArray(rows, {
    eventType: 'UPDATE',
    new: { id: 'l1', title: 'Mobile updated', updated_at: '2026-11-26T11:00:00.000Z' },
  });
  assert.equal(rows[0].title, 'Mobile updated');

  // Delete removes record cleanly
  rows = applyM3PayloadToArray(rows, {
    eventType: 'DELETE',
    old: { id: 'l1' },
  });
  assert.equal(rows.length, 0);
});

test('M4: Runner research_digest fetches feeds, upserts bookmarks, logs execution, and notifies webhook', async () => {
  const db = createMockSupabase();
  const webhookPayloads = [];

  const mockFetch = async (url, init) => {
    const u = String(url);
    if (u.includes('export.arxiv.org')) {
      const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <id>http://arxiv.org/abs/2611.0001v1</id>
          <title>Archimedes Spiral Wind Turbine Aerodynamics Optimization</title>
          <summary>Tip speed ratio analysis for spiral vertical rotors.</summary>
          <published>2026-11-20T00:00:00Z</published>
          <author><name>Y. Koyaneni</name></author>
        </entry>
      </feed>`;
      return new Response(xml, { status: 200 });
    }
    if (u.includes('api.openalex.org')) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    if (u.includes('api.crossref.org')) {
      return new Response(JSON.stringify({ message: { items: [] } }), { status: 200 });
    }
    if (u.includes('hooks.example.org')) {
      webhookPayloads.push(JSON.parse(init.body));
      return new Response('{"ok":true}', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };

  const result = await executeAutomationRun(
    {
      run_id: 'run_rd_1',
      automation_id: 'auto_rd_1',
      user_id: 'u1',
      action_type: 'research_digest',
      action_config: {
        query: 'archimedes wind turbine',
        max_bookmarks: 3,
        notify_channel: 'webhook',
        webhook_url: 'https://hooks.example.org/n8n/digest',
      },
      max_retries: 0,
    },
    db,
    {
      fetchImpl: mockFetch,
      channelEnv: { WEBHOOK_SIGNING_SECRET: 'm4-secret' },
    }
  );

  assert.equal(result.status, 'completed');
  assert.equal(result.records_affected, 1);
  assert.equal(db.store.research_bookmarks.length, 1);
  assert.equal(db.store.agent_execution_logs.length, 1);
  assert.equal(db.store.agent_execution_logs[0].action_type, 'research_digest');
  assert.equal(webhookPayloads.length, 1);
  assert.ok(webhookPayloads[0].title.includes('Research Digest'));
});

test('M4: Runner self_healing_audit & morning_briefing execute deterministically with channel push', async () => {
  const db = createMockSupabase();
  db.store.automation_runs.push({ id: 'old_fail', user_id: 'u1', status: 'failed' });
  const dispatched = [];

  const mockFetch = async (url, init) => {
    dispatched.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response('{"ok":true}', { status: 200 });
  };

  const auditRes = await executeAutomationRun(
    {
      run_id: 'run_sha_1',
      automation_id: 'auto_sha_1',
      user_id: 'u1',
      action_type: 'self_healing_audit',
      action_config: {
        notify_channel: 'webhook',
        webhook_url: 'https://hooks.example.org/n8n/health',
      },
      max_retries: 0,
    },
    db,
    { fetchImpl: mockFetch, channelEnv: {} }
  );

  assert.equal(auditRes.status, 'completed');
  assert.equal(auditRes.output_payload.overdueCount, 1);
  assert.equal(auditRes.output_payload.failedRunsCount, 1);
  assert.equal(db.store.agent_execution_logs.at(-1).action_type, 'self_healing_audit');
  assert.equal(dispatched.length, 1);

  const briefRes = await executeAutomationRun(
    {
      run_id: 'run_mb_1',
      automation_id: 'auto_mb_1',
      user_id: 'u1',
      action_type: 'morning_briefing',
      action_config: {
        notify_channel: 'webhook',
        webhook_url: 'https://hooks.example.org/n8n/briefing',
      },
      max_retries: 0,
    },
    db,
    { fetchImpl: mockFetch, channelEnv: {} }
  );

  assert.equal(briefRes.status, 'completed');
  assert.equal(briefRes.output_payload.tasksAnalyzed, 1);
  assert.equal(dispatched.length, 2);
  assert.ok(dispatched[1].body.title.includes('Executive Morning Briefing'));
});
