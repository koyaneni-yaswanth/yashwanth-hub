import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.SUPABASE_URL ||= 'https://unit-test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'unit-test-anon-key';

const {
  parseTelemetryCsv,
  SYNTHETIC_DEMO_CSV,
} = await import('../src/lib/telemetryAnalyzer.ts');

const {
  hashContentForEmbedding,
  cosineSimilarity,
  rankLocalVectors,
  blendKeywordAndSemanticResults,
} = await import('../src/lib/semanticSearchCore.ts');

const { createAiChatHandler } = await import('../api/ai/chat.ts');

function createSseMockRes() {
  const chunks = [];
  return {
    statusCode: 200,
    headers: {},
    ended: false,
    body: null,
    chunks,
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
    write(str) {
      chunks.push(str);
      return true;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test('M7 Telemetry Analyzer: computes P=V*I, >=1Hz V3F compliance, cut-in speed, TSR & bins', () => {
  const res = parseTelemetryCsv(SYNTHETIC_DEMO_CSV, { rotorRadiusM: 0.45 });
  assert.equal(res.sampleCount, 11);
  assert.equal(res.durationSec, 10);
  assert.equal(res.sampleRateHz, 1);
  assert.equal(res.meetsV3f1HzRequirement, true);
  assert.equal(res.cutInWindSpeedMs, 2.6); // 3.4 * 0.42 = 1.428 W >= 0.5 W
  assert.ok(res.peakPowerW > 150);
  assert.equal(res.peakPowerWindMs, 7);
  assert.ok(res.tipSpeedRatioAtPeak && res.tipSpeedRatioAtPeak > 2 && res.tipSpeedRatioAtPeak < 4);
  assert.ok(res.pvCurveBins.length >= 6);

  // Under-sampled data (0.2 Hz) must NOT pass >=1Hz V3F gate
  const slowCsv = [
    'time_s,wind_speed_ms,voltage_v,current_a,rpm',
    '0,2.5,2.0,0.4,70',
    '5,3.5,6.0,1.0,150',
    '10,4.5,11.0,2.0,230',
  ].join('\n');
  const slowRes = parseTelemetryCsv(slowCsv);
  assert.equal(slowRes.meetsV3f1HzRequirement, false);
  assert.ok(slowRes.warnings.length >= 2);
});

test('M7 Semantic Search Core: cosine similarity, local ranking, and hybrid RRF blending', () => {
  assert.equal(cosineSimilarity([1, 0, 0], [1, 0, 0]), 1);
  assert.equal(cosineSimilarity([1, 0, 0], [0, 1, 0]), 0);
  assert.notEqual(hashContentForEmbedding('rotor blade'), hashContentForEmbedding('rotor blades'));

  const vectors = [
    {
      id: 'paper:p1',
      entity_type: 'paper',
      entity_id: 'p1',
      title: 'Helical Wind Rotor Aerodynamics',
      content_excerpt: 'Tip speed ratio and planetary drivetrain losses.',
      content_hash: 'h1',
      tags: ['wind'],
      embedding: [0.95, 0.25, 0],
      updated_at: '2026-11-26T00:00:00Z',
    },
    {
      id: 'note:n1',
      entity_type: 'note',
      entity_id: 'n1',
      title: 'Grocery List',
      content_excerpt: 'Milk and coffee beans.',
      content_hash: 'h2',
      tags: [],
      embedding: [0, 0, 1],
      updated_at: '2026-11-26T00:00:00Z',
    },
  ];

  const semHits = rankLocalVectors([1, 0.2, 0], vectors, { minSimilarity: 0.5 });
  assert.equal(semHits.length, 1);
  assert.equal(semHits[0].entity_id, 'p1');

  const blended = blendKeywordAndSemanticResults(
    [{ entityType: 'task', id: 't1', title: 'Check bearings', subtitle: 'Task', targetTab: 'tasks', score: 10 }],
    semHits,
    10
  );
  assert.equal(blended.length, 2);
  assert.ok(blended.some((b) => b.entityType === 'paper' && b.id === 'p1'));
});

test('M7 SSE AI Streaming: streams Gemini SSE tokens + deterministic fallback SSE chunks cleanly', async () => {
  const prevGemini = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'fake-gemini-key-for-stream-test';

  try {
    const encoder = new TextEncoder();
    const mockFetch = async (url) => {
      if (String(url).includes(':streamGenerateContent')) {
        const sseBody = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello ' }] } }] })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  candidates: [{ content: { parts: [{ text: 'Yaswanth!' }] } }],
                  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 },
                })}\n\n`
              )
            );
            controller.close();
          },
        });
        return new Response(sseBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response(JSON.stringify({ models: [{ name: 'models/gemini-2.5-flash' }] }), { status: 200 });
    };

    const fakeDb = {
      auth: {
        getUser: async (token) =>
          token === 'good-jwt' ? { data: { user: { id: 'u-stream-1' } }, error: null } : { data: { user: null }, error: 'bad' },
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
    };

    const handler = createAiChatHandler(fakeDb, mockFetch);
    const res = createSseMockRes();
    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer good-jwt', accept: 'text/event-stream' },
        body: {
          prompt: 'Summarize priority work',
          provider: 'gemini',
          stream: true,
          workspaceSnapshot: { tasks: [], projects: [], events: [], meetings: [], notes: [], documents: [], robotics_records: [], neo_memories: [] },
        },
      },
      res
    );

    assert.equal(res.ended, true, `Expected SSE stream to end, got status=${res.statusCode} body=${JSON.stringify(res.body)}`);
    assert.ok(String(res.headers['Content-Type']).includes('text/event-stream'));
    const joined = res.chunks.join('');
    assert.ok(joined.includes('"delta":"Hello "'));
    assert.ok(joined.includes('"delta":"Yaswanth!"'));
    assert.ok(joined.includes('"type":"done"'));
    assert.ok(joined.includes('Hello Yaswanth!'));

    // Also verify deterministic fallback SSE chunking when no external LLM key is active
    const envKeys = [
      'GEMINI_API_KEY',
      'OPENROUTER_API_KEY',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'HF_TOKEN',
      'HUGGINGFACE_API_KEY',
      'OLLAMA_BASE_URL',
    ];
    const savedEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    for (const k of envKeys) delete process.env[k];
    try {
      const fallbackRes = createSseMockRes();
      await handler(
        {
          method: 'POST',
          headers: { authorization: 'Bearer good-jwt', accept: 'text/event-stream' },
          body: {
            prompt: 'What are my high priority tasks today?',
            provider: 'auto',
            stream: true,
            workspaceSnapshot: {
              todayISO: '2026-11-27',
              tasks: [{ id: 't-1', text: 'Ship M7 upgrades', priority: 'high', done: false, status: 'in_progress', area: 'PAWAN SHAKTI' }],
              projects: [{ id: 'p-1', title: 'PAWAN SHAKTI', area: 'PAWAN SHAKTI', status: 'active' }],
              events: [],
              meetings: [],
              notes: [],
              documents: [],
              robotics_records: [],
              neo_memories: [],
            },
          },
        },
        fallbackRes
      );
      assert.equal(fallbackRes.ended, true, `Expected fallback SSE stream to end, got status=${fallbackRes.statusCode}`);
      assert.ok(String(fallbackRes.headers['Content-Type']).includes('text/event-stream'));
      const fallbackJoined = fallbackRes.chunks.join('');
      assert.ok(fallbackJoined.includes('"type":"token"'));
      assert.ok(fallbackJoined.includes('"type":"done"'));
      assert.ok(fallbackJoined.includes('"providerMode":"grounded_deterministic"'));
      assert.ok(fallbackJoined.includes('Ship M7 upgrades'));
    } finally {
      for (const k of envKeys) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      }
    }
  } finally {
    if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGemini;
  }
});

test('M7 SQL Migration covers pgvector HNSW index, owner RLS, and zero destructive statements', () => {
  const sql = fs.readFileSync(
    path.resolve(process.cwd(), 'supabase/migrations/20261127_m7_pgvector_and_rls_optimization.sql'),
    'utf8'
  );
  assert.ok(sql.includes('create extension if not exists vector'));
  assert.ok(sql.includes('public.knowledge_embeddings'));
  assert.ok(sql.includes('match_knowledge_embeddings'));
  assert.ok(sql.includes('(select auth.uid()) = user_id'));
  assert.equal(/\bdrop\s+(table|policy|index|extension)\b/i.test(sql), false);
});
