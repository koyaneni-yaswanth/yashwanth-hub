import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.SUPABASE_URL ||= 'https://unit-test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'unit-test-anon-key';

const {
  FOCUS_WORKSPACES,
  HUB_DESTINATIONS,
  destinationForTab,
  filterItemsForFocusWorkspace,
} = await import('../src/lib/hubArchitecture.ts');
const { TAB_TITLES, canonicalTab } = await import('../src/lib/navigation.ts');
const {
  AI_PROVIDER_REGISTRY,
  buildProviderExecutionChain,
  detectConfiguredProviders,
  probeAllProviders,
  selectRecommendedProvider,
} = await import('../api/_lib/aiProviderAdapters.ts');
const { createAiChatHandler } = await import('../api/ai/chat.ts');

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function fakeRes() {
  const out = { code: 200, body: null, headers: {} };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status: (c) => { out.code = c; return res; },
    json: (b) => { out.body = b; return res; },
    end: () => res,
  };
  return { res, out };
}

test('6-Destination Information Architecture maps every existing route cleanly without deletions', () => {
  assert.equal(HUB_DESTINATIONS.length, 6);
  assert.deepEqual(
    HUB_DESTINATIONS.map((d) => d.label),
    ['Home', 'Command', 'AI Studio', 'Workspace', 'Intelligence', 'System']
  );

  const allMappedTabs = new Set(HUB_DESTINATIONS.flatMap((d) => d.routes.map((r) => r.tab)));
  for (const tab of Object.keys(TAB_TITLES)) {
    const canon = canonicalTab(tab);
    assert.ok(allMappedTabs.has(canon), `Canonical tab "${canon}" must belong to one of the 6 hubs`);
    const dest = destinationForTab(canon);
    assert.ok(dest && HUB_DESTINATIONS.some((h) => h.id === dest.id));
  }
});

test('Focus Mode supports all 4 founder workspaces and filters items cleanly', () => {
  assert.equal(FOCUS_WORKSPACES.length, 4);
  assert.deepEqual(
    FOCUS_WORKSPACES.map((w) => w.label),
    [
      'Startup & Pawan Shakti',
      'Robotics & Engineering',
      'Research & Learning',
      'Career & Professional Development',
    ]
  );

  const sampleTasks = [
    { id: '1', area: 'PAWAN SHAKTI', text: 'Closed-loop wind test' },
    { id: '2', area: 'IvLabs', text: 'PiPER CAN calibration' },
    { id: '3', area: 'Personal', text: 'Update CV and grant notes', tags: ['career'] },
  ];

  const pawanOnly = filterItemsForFocusWorkspace(sampleTasks, 'startup-pawan');
  assert.deepEqual(pawanOnly.map((t) => t.id), ['1']);

  const roboticsOnly = filterItemsForFocusWorkspace(sampleTasks, 'robotics-engineering');
  assert.deepEqual(roboticsOnly.map((t) => t.id), ['2']);

  const careerOnly = filterItemsForFocusWorkspace(sampleTasks, 'career-development');
  assert.deepEqual(careerOnly.map((t) => t.id), ['3']);
});

test('Unified Multi-AI Provider Registry covers all 6 providers and routes fastest healthy first', async () => {
  assert.deepEqual(
    Object.keys(AI_PROVIDER_REGISTRY).sort(),
    ['anthropic', 'gemini', 'huggingface', 'ollama', 'openai', 'openrouter']
  );

  const cfg = detectConfiguredProviders({
    GEMINI_API_KEY: 'g-key',
    OPENROUTER_API_KEY: 'or-key',
    HF_TOKEN: 'hf-key',
  });
  assert.equal(cfg.gemini, true);
  assert.equal(cfg.openrouter, true);
  assert.equal(cfg.huggingface, true);
  assert.equal(cfg.openai, false);
  assert.equal(cfg.anthropic, false);

  const autoChain = buildProviderExecutionChain('auto', cfg, {
    gemini: 420,
    openrouter: 190,
    huggingface: 810,
  });
  assert.deepEqual(autoChain, ['openrouter', 'gemini', 'huggingface']);

  const explicitChain = buildProviderExecutionChain('gemini', cfg, {
    gemini: 420,
    openrouter: 190,
    huggingface: 810,
  });
  assert.deepEqual(explicitChain, ['gemini', 'openrouter', 'huggingface']);

  const mockFetch = async (url) => {
    const u = String(url);
    if (u.includes('openrouter.ai')) {
      return new Response(JSON.stringify({ data: [{ id: 'openrouter/auto' }, { id: 'qwen/qwen-2.5' }] }), { status: 200 });
    }
    if (u.includes('generativelanguage.googleapis.com')) {
      return new Response(JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash' }] }), { status: 200 });
    }
    if (u.includes('huggingface.co')) {
      return new Response(JSON.stringify({ data: [{ id: 'Qwen/Qwen2.5-72B-Instruct' }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: 'unauthorized' } }), { status: 401 });
  };

  const reports = await probeAllProviders({ GEMINI_API_KEY: 'test-key' }, mockFetch, 2000);
  assert.equal(reports.length, 6);
  const gemini = reports.find((r) => r.id === 'gemini');
  const openrouter = reports.find((r) => r.id === 'openrouter');
  const hf = reports.find((r) => r.id === 'huggingface');
  assert.equal(gemini.status, 'connected');
  assert.equal(openrouter.status, 'not_configured');
  assert.equal(hf.capabilities.tools, true);

  const rec = selectRecommendedProvider(reports);
  assert.equal(rec.provider, 'gemini');
});

test('Server /api/ai/chat supports GET ?action=health and routes OpenRouter with deterministic tool grounding', async () => {
  const chain = new Proxy(function () {}, {
    get: (_t, k) => (k === 'then' ? (ok) => ok({ data: [], error: null }) : chain),
    apply: () => chain,
  });
  const dbClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1', email: 'owner@test.dev' } }, error: null }),
    },
    from: () => chain,
  };

  const handler = createAiChatHandler(dbClient);

  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('openrouter.ai/api/v1/chat/completions')) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '### Verified Facts\nOpenRouter verified test.' } }],
          usage: { prompt_tokens: 120, completion_tokens: 45 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  const prevOpenRouter = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'or-test-key';

  try {
    const healthCall = fakeRes();
    await handler({ method: 'GET', query: { action: 'health' }, headers: {} }, healthCall.res);
    assert.equal(healthCall.out.code, 200);
    assert.equal(healthCall.out.body.success, true);
    assert.equal(healthCall.out.body.providers.length, 6);

    const chatCall = fakeRes();
    await handler(
      {
        method: 'POST',
        query: {},
        headers: { authorization: 'Bearer valid-jwt' },
        body: { prompt: 'Summarize tasks', provider: 'openrouter', modelId: 'openrouter/auto' },
      },
      chatCall.res
    );
    assert.equal(chatCall.out.code, 200);
    assert.equal(chatCall.out.body.provider, 'openrouter');
    assert.equal(chatCall.out.body.providerMode, 'server_llm');
    assert.match(chatCall.out.body.text, /OpenRouter verified test/);

    const embedCall = fakeRes();
    await handler(
      {
        method: 'POST',
        query: { action: 'embed' },
        headers: { authorization: 'Bearer valid-jwt' },
        body: { action: 'embed', text: 'Wind turbine aerodynamics', provider: 'anthropic' },
      },
      embedCall.res
    );
    assert.equal(embedCall.out.code, 422);
    assert.equal(embedCall.out.body.unsupported, true);
  } finally {
    globalThis.fetch = origFetch;
    if (prevOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevOpenRouter;
  }
});

test('UX Progressive Disclosure: Home caps task preview, collapses secondary actions, and wires Focus Mode', () => {
  const sidebarSrc = read('src/components/layout/Sidebar.tsx');
  const dashSrc = read('src/pages/DashboardPage.tsx');
  const rightSrc = read('src/components/jarvis/HudRightPanel.tsx');
  const dockSrc = read('src/components/jarvis/HudMissionDock.tsx');
  const appSrc = read('src/App.tsx');

  assert.match(sidebarSrc, /HUB_DESTINATIONS/);
  assert.match(sidebarSrc, /aria-label="HUD Quick Rail"[\s\S]*\bw-16\b/);
  assert.match(rightSrc, /Planning &amp; quick actions/);
  assert.match(rightSrc, /focusMode\?\.enabled/);
  assert.match(dockSrc, /dueAndOverdueTasks\.slice\(0, 3\)/);
  assert.match(dashSrc, /useFocusMode/);
  assert.match(dashSrc, /!focus\.enabled && \(\s*<HudMissionDock/);
  assert.match(appSrc, /<HubDestinationBar/);
  assert.match(appSrc, /<FocusModePickerModal/);
});
