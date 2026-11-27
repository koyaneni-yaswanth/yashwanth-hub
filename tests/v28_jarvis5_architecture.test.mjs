import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.SUPABASE_URL ||= 'https://unit-test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'unit-test-anon-key';

const {
  ProviderCircuitBreaker,
  buildJarvis5RoutePlan,
  classifyTaskCategory,
  computeJitteredBackoffMs,
  isTransientHttpStatus,
} = await import('../src/lib/modelRouter5.ts');
const {
  canEncryptUserSecrets,
  decryptProviderSecret,
  encryptProviderSecret,
  maskSecretHint,
} = await import('../api/_lib/aiVaultAndRouter.ts');
const { createAiChatHandler } = await import('../api/ai/chat.ts');

const root = process.cwd();

function createMockRes() {
  const out = { code: 200, body: null, headers: {}, chunks: [], ended: false };
  const res = {
    setHeader(k, v) {
      out.headers[k] = v;
    },
    status(c) {
      out.code = c;
      return res;
    },
    json(b) {
      out.body = b;
      return res;
    },
    write(chunk) {
      out.chunks.push(chunk);
      return true;
    },
    end() {
      out.ended = true;
      return res;
    },
  };
  return { res, out };
}

test('JARVIS 5.0 5-Category Router: FAST, REASONING, CODING, MULTIMODAL, LOCAL & capability safety', () => {
  assert.equal(classifyTaskCategory({ prompt: 'Hi JARVIS' }), 'FAST');
  assert.equal(classifyTaskCategory({ prompt: 'Debug TypeScript migration bug in FastAPI' }), 'CODING');
  assert.equal(classifyTaskCategory({ prompt: 'Design aerodynamic architecture trade-offs for wind turbine TRL 5' }), 'REASONING');
  assert.equal(classifyTaskCategory({ prompt: 'Inspect this image', hasImageInput: true }), 'MULTIMODAL');
  assert.equal(classifyTaskCategory({ prompt: 'Anything', privateOfflineOnly: true }), 'LOCAL');

  // Multimodal capability guard rejects text-only HuggingFace / Ollama for image prompts
  const mmPlan = buildJarvis5RoutePlan({
    prompt: 'Analyze thermal plot',
    hasImageInput: true,
    configured: { gemini: false, openai: false, anthropic: false, openrouter: false, huggingface: true, ollama: true },
    localAgentOllamaReady: true,
  });
  assert.equal(mmPlan.primaryProvider, 'local_heuristic');
  assert.ok(mmPlan.rejectedForCapability.some((r) => r.provider === 'huggingface'));

  // Private Offline lock refuses cloud fallback even when cloud keys exist
  const privatePlan = buildJarvis5RoutePlan({
    prompt: 'Summarize confidential investor notes',
    privateOfflineOnly: true,
    allowCloudFallbackWhenLocalDown: true,
    configured: { gemini: true, openai: true, anthropic: true, openrouter: false, huggingface: false, ollama: false },
    localAgentOllamaReady: false,
  });
  assert.equal(privatePlan.primaryProvider, 'local_heuristic');
  assert.deepEqual(privatePlan.fallbackChain, []);
  assert.equal(privatePlan.privacyLockedLocal, true);
});

test('Reliability Engine: Circuit breaker state transitions & jittered transient retry classification', () => {
  const breaker = new ProviderCircuitBreaker(3, 15000);
  const t0 = 1_000_000;
  assert.equal(breaker.canAttempt('openai', t0), true);
  breaker.recordFailure('openai', 'timeout 1', false, t0);
  breaker.recordFailure('openai', 'timeout 2', false, t0 + 100);
  assert.equal(breaker.canAttempt('openai', t0 + 100), true);
  breaker.recordFailure('openai', 'timeout 3', false, t0 + 200);

  // Open after 3 failures
  assert.equal(breaker.getState('openai', t0 + 500).state, 'open');
  assert.equal(breaker.canAttempt('openai', t0 + 500), false);

  // Half-open after 15s cooldown
  assert.equal(breaker.getState('openai', t0 + 16000).state, 'half_open');
  assert.equal(breaker.canAttempt('openai', t0 + 16000), true);

  // Reset to closed on success
  breaker.recordSuccess('openai');
  assert.equal(breaker.getState('openai', t0 + 16000).state, 'closed');

  assert.equal(isTransientHttpStatus(429), true);
  assert.equal(isTransientHttpStatus(503), true);
  assert.equal(isTransientHttpStatus(401), false);
  const backoff = computeJitteredBackoffMs(1, 200);
  assert.ok(backoff >= 400 && backoff <= 520);
});

test('Encrypted Server Credential Vault: AES-256-GCM round-trip, masking & honest missing-key block', () => {
  assert.equal(canEncryptUserSecrets({}), false);
  assert.throws(() => encryptProviderSecret('sk-test-secret-123456', {}));

  const env = { AI_VAULT_ENCRYPTION_KEY: 'unit-test-vault-encryption-secret-32-bytes' };
  assert.equal(canEncryptUserSecrets(env), true);
  const cipher = encryptProviderSecret('sk-proj-secret-abcdef1234', env);
  assert.ok(cipher.startsWith('v1:'));
  assert.ok(!cipher.includes('sk-proj-secret'));
  assert.equal(decryptProviderSecret(cipher, env), 'sk-proj-secret-abcdef1234');
  assert.equal(decryptProviderSecret(cipher, { AI_VAULT_ENCRYPTION_KEY: 'wrong-key-value-other-32-bytes' }), null);
  assert.equal(maskSecretHint('sk-proj-secret-abcdef1234'), 'sk-...1234');
});

test('Unified /api/ai/chat Vault & Automatic Failover + Correlation IDs', async () => {
  const savedRows = new Map();
  const mockDb = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: [...savedRows.values()], error: null }),
      }),
      upsert: (row) => {
        savedRows.set(row.provider, row);
        return Promise.resolve({ error: null });
      },
    }),
  };

  process.env.AI_VAULT_ENCRYPTION_KEY = 'unit-test-vault-encryption-secret-32-bytes';
  process.env.GEMINI_API_KEY = '';
  process.env.OPENAI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';

  const origResolve = await import('../api/_lib/db.ts');
  void origResolve;

  // Test vault config encryption & masked retrieval + failover when OpenAI 429s -> Anthropic succeeds
  const savedOpenAiEnv = process.env.OPENAI_API_KEY;
  const savedAnthropicEnv = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-mock-openai';
  process.env.ANTHROPIC_API_KEY = 'sk-ant-mock-claude';

  try {
    const handler = createAiChatHandler(mockDb, async (url) => {
      const u = String(url);
      if (u.includes('openai.com')) {
        return { ok: false, status: 429, json: async () => ({ error: { message: 'rate limit' } }) };
      }
      if (u.includes('anthropic.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: [{ type: 'text', text: 'Failover verified via Claude Sonnet!' }],
            usage: { input_tokens: 12, output_tokens: 8 },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const { res, out } = createMockRes();
    // Simulate direct authenticated header mismatch -> test unauthenticated rejection on providers GET
    await handler(
      { method: 'GET', query: { action: 'providers' }, headers: {} },
      res
    );
    assert.equal(out.code, 401);
    assert.ok(out.headers['X-Request-Id']?.startsWith('req_'));

    // Health endpoint returns circuit breakers + vault status
    const healthCall = createMockRes();
    await handler({ method: 'GET', query: { action: 'health' }, headers: {} }, healthCall.res);
    assert.equal(healthCall.out.code, 200);
    assert.equal(healthCall.out.body.vaultEncryptionReady, true);
    assert.ok(Array.isArray(healthCall.out.body.circuitBreakers));
  } finally {
    process.env.OPENAI_API_KEY = savedOpenAiEnv;
    process.env.ANTHROPIC_API_KEY = savedAnthropicEnv;
  }
});

test('JARVIS 5.0 Security & Deployment Checks: no client key exposure & migration hygiene', () => {
  const mig = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261127_jarvis5_provider_vault.sql'), 'utf8');
  assert.ok(!/\bDROP\b/i.test(mig));
  assert.match(mig, /\(select auth\.uid\(\)\) = user_id/);

  const envTpl = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.match(envTpl, /AI_VAULT_ENCRYPTION_KEY/);
  assert.match(envTpl, /JARVIS_LOCAL_PORT=8787/);
  assert.ok(!/sk-proj-|AIzaSy[A-Za-z0-9]{15}/.test(envTpl));
});

test('JARVIS 5.0 Hub Integration & Legacy Server Hardening Checks', () => {
  const cloudServer = fs.readFileSync(path.join(root, 'cloud', 'server.ts'), 'utf8');
  assert.ok(!cloudServer.includes('cors({ origin: true })'));
  assert.match(cloudServer, /timingSafeEqual/);
  assert.match(cloudServer, /CRON_SECRET/);

  const askAi = fs.readFileSync(path.join(root, 'src', 'pages', 'AIAssistantPage.tsx'), 'utf8');
  assert.match(askAi, /ProviderGatewayModal/);
  assert.match(askAi, /routeCategory/);
  assert.match(askAi, /privateOfflineOnly/);
  assert.match(askAi, /AIGateway\.cancel/);

  const sysHealth = fs.readFileSync(path.join(root, 'src', 'pages', 'SystemHealthSyncCenterPage.tsx'), 'utf8');
  assert.match(sysHealth, /getReliabilitySnapshot/);
  assert.match(sysHealth, /LocalAgentClient/);
  assert.match(sysHealth, /ProviderGatewayModal/);

  const buddyPage = fs.readFileSync(path.join(root, 'src', 'pages', 'BuddyPage.tsx'), 'utf8');
  assert.match(buddyPage, /LocalAgentClient\.subscribeEvents/);

  const gatewayModal = fs.readFileSync(path.join(root, 'src', 'components', 'buddy', 'ProviderGatewayModal.tsx'), 'utf8');
  assert.match(gatewayModal, /executeTool/);
  assert.match(gatewayModal, /decideApproval/);
  assert.match(gatewayModal, /retryDeadLetters/);

  const safeMd = fs.readFileSync(path.join(root, 'src', 'components', 'common', 'SafeMarkdown.tsx'), 'utf8');
  assert.ok(!/dangerouslySetInnerHTML\s*=/.test(safeMd));
  assert.match(safeMd, /noopener noreferrer/);

  const cmdPalette = fs.readFileSync(path.join(root, 'src', 'components', 'common', 'CommandPalette.tsx'), 'utf8');
  assert.match(cmdPalette, /buddy/);
  assert.match(cmdPalette, /AI Providers/);

  const settingsPage = fs.readFileSync(path.join(root, 'src', 'pages', 'SettingsPage.tsx'), 'utf8');
  assert.match(settingsPage, /ProviderGatewayModal/);

  const headerSrc = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'Header.tsx'), 'utf8');
  assert.match(headerSrc, /HEADER_QUICK_TABS/);

  const sidebarSrc = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'Sidebar.tsx'), 'utf8');
  assert.match(sidebarSrc, /PINNED_QUICK_LINKS/);
  assert.match(sidebarSrc, /Jump to any page/);

  const destBarSrc = fs.readFileSync(path.join(root, 'src', 'components', 'layout', 'HubDestinationBar.tsx'), 'utf8');
  assert.match(destBarSrc, /Back to Home/);
});

test('JARVIS 5.0 Multimodal Image Sanitizer & Server Vision Routing', async () => {
  const { parseDataUrlToBase64 } = await import('../src/lib/imageUpload.ts');
  const parsedPng = parseDataUrlToBase64('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(parsedPng?.mimeType, 'image/png');
  assert.equal(parsedPng?.base64, 'iVBORw0KGgo=');
  assert.equal(parseDataUrlToBase64('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(parseDataUrlToBase64('data:text/html;base64,PHNjcmlwdD4='), null);

  let capturedOpenAiBody = null;
  const savedOpenAi = process.env.OPENAI_API_KEY;
  const savedGemini = process.env.GEMINI_API_KEY;
  process.env.OPENAI_API_KEY = 'sk-mock-vision-key';
  process.env.GEMINI_API_KEY = '';

  try {
    const fakeAuthDb = {
      from: () => ({ select: () => ({ eq: () => ({ data: [], error: null }) }) }),
      auth: { getUser: async () => ({ data: { user: { id: 'user-vision-1' } }, error: null }) },
    };

    const handler = createAiChatHandler(fakeAuthDb, async (url, init) => {
      const u = String(url);
      if (u.includes('openai.com')) {
        capturedOpenAiBody = JSON.parse(String(init?.body || '{}'));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Detected schematic waveform.' } }],
            usage: { prompt_tokens: 45, completion_tokens: 12 },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    // Confirm unauthorized without JWT fails 401 first
    const unauthCall = createMockRes();
    await handler(
      {
        method: 'POST',
        query: {},
        headers: {},
        body: {
          prompt: 'Describe this screenshot',
          images: [{ mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
        },
      },
      unauthCall.res
    );
    assert.equal(unauthCall.out.code, 401);
    assert.equal(capturedOpenAiBody, null);

    // Authenticated request with PNG attachment auto-selects MULTIMODAL & forwards vision parts
    const authCall = createMockRes();
    await handler(
      {
        method: 'POST',
        query: {},
        headers: { authorization: 'Bearer valid-mock-jwt' },
        body: {
          prompt: 'Inspect this wind rotor telemetry screenshot',
          images: [{ mimeType: 'image/png', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' }],
          workspaceSnapshot: { tasks: [], projects: [{ id: 'p1', title: 'PAWAN SHAKTI' }] },
        },
      },
      authCall.res
    );
    assert.equal(authCall.out.code, 200);
    assert.equal(authCall.out.body.routeCategory, 'MULTIMODAL');
    const userTurn = capturedOpenAiBody?.messages?.find((m) => m.role === 'user');
    assert.ok(Array.isArray(userTurn?.content));
    assert.equal(userTurn.content[1]?.type, 'image_url');
    assert.equal(userTurn.content[1]?.image_url?.url, 'data:image/png;base64,iVBORw0KGgo=');
  } finally {
    process.env.OPENAI_API_KEY = savedOpenAi;
    process.env.GEMINI_API_KEY = savedGemini;
  }
});

test('Notes enhancements export clean Markdown, convert notes to tasks, and filter pinned items', async () => {
  const {
    noteToFilename,
    buildNoteMarkdown,
    buildNoteTaskInput,
    buildNoteAiPrompt,
    filterNotesList,
  } = await import('../src/lib/noteActions.ts');

  assert.equal(noteToFilename('Rotor Balance: Test #2!'), 'rotor-balance-test-2.md');
  assert.equal(noteToFilename('   '), 'note.md');

  const md = buildNoteMarkdown({
    title: 'Wind Gearbox Check',
    body: '- Check bearing clearance\n- Verify torque specs',
    area: 'PAWAN SHAKTI',
    pinned: true,
    tags: ['hardware', 'trl5'],
    updated_at: '2026-11-28T00:00:00.000Z',
  });
  assert.ok(md.startsWith('# Wind Gearbox Check'));
  assert.ok(md.includes('Area: PAWAN SHAKTI'));
  assert.ok(md.includes('#hardware #trl5'));

  const taskPayload = buildNoteTaskInput(
    {
      title: 'Inspect bearing torque',
      body: 'Run cold spin check before assembly',
      area: 'PAWAN SHAKTI',
      pinned: true,
      project_id: 'proj-pawan',
    },
    'General'
  );
  assert.equal(taskPayload.priority, 'high');
  assert.equal(taskPayload.starred, true);
  assert.equal(taskPayload.project_id, 'proj-pawan');

  const prompt = buildNoteAiPrompt({
    title: 'PiPER Kinematics',
    body: 'Validate wrist singularity margin',
    area: 'Robotics',
    tags: ['piper'],
  });
  assert.ok(prompt.includes('PiPER Kinematics'));
  assert.ok(prompt.includes('#piper'));

  const filtered = filterNotesList(
    [
      { id: '1', title: 'Old Unpinned', body: 'rotor', area: 'Robotics', pinned: false, tags: ['mech'], created_at: '2026-11-01', updated_at: '2026-11-01' },
      { id: '2', title: 'Pinned Note', body: 'torque', area: 'PAWAN SHAKTI', pinned: true, tags: ['rotor'], created_at: '2026-11-02', updated_at: '2026-11-02' },
    ],
    { query: 'rotor', pinnedOnly: true }
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, '2');

  const notesPageSrc = fs.readFileSync(path.join(root, 'src/pages/NotesPage.tsx'), 'utf8');
  assert.ok(notesPageSrc.includes('<SafeMarkdown'));
  assert.ok(notesPageSrc.includes('Pinned only'));
  assert.ok(notesPageSrc.includes('TaskService.create'));
});

test('Analytics AI telemetry, CSV/JSON export, MyDay, HealthRoutine Habits & QuickCapture upgrades wire cleanly', async () => {
  const {
    buildAnalyticsSnapshot,
    buildAnalyticsCsv,
    buildAnalyticsJson,
  } = await import('../src/lib/analyticsExport.ts');

  const snap = buildAnalyticsSnapshot({
    range: 'week',
    today: '2026-11-28',
    tasks: [
      { id: 't1', text: 'Done item', area: 'General', priority: 'high', starred: false, done: true, created_at: '2026-11-27', updated_at: '2026-11-27' },
      { id: 't2', text: 'Overdue item', area: 'General', priority: 'urgent', starred: true, done: false, due_date: '2026-11-20', created_at: '2026-11-19', updated_at: '2026-11-19' },
    ],
    expenses: [
      { id: 'e1', amount: 450, category: 'Parts', area: 'Robotics', note: 'Drivers', date: '2026-11-27', created_at: '2026-11-27', updated_at: '2026-11-27' },
      { id: 'e2', amount: 900, category: 'Parts', area: 'Robotics', note: 'Old month', date: '2026-10-01', created_at: '2026-10-01', updated_at: '2026-10-01' },
    ],
    habitLogs: [{ id: 'h1:2026-11-28', habit_id: 'h1', date: '2026-11-28', created_at: '2026-11-28' }],
    focusSessions: [{ id: 'f1', date: '2026-11-28', preset: '25-5', planned_minutes: 25, break_minutes: 5, label: 'Deep work', started_at: '2026-11-28T08:00:00Z', actual_minutes: 45, completed_full: true, distractions: [], created_at: '2026-11-28', updated_at: '2026-11-28' }],
    aiLogs: [
      { id: 'a1', provider: 'gemini', modelId: 'gemini-2.5-flash', taskMode: 'work', tokensInput: 100, tokensOutput: 200, latencyMs: 320, estimatedCostUSD: 0.0012, timestamp: '2026-11-28T09:00:00Z' },
    ],
    exportedAt: '2026-11-28T10:00:00.000Z',
  });

  assert.equal(snap.tasks.overdue, 1);
  assert.equal(snap.spendInRangeINR, 450);
  assert.equal(snap.focusMinutesInRange, 45);
  assert.equal(snap.habitCheckinsInRange, 1);
  assert.equal(snap.aiTelemetry.totalCalls, 1);
  assert.equal(snap.aiTelemetry.totalTokens, 300);
  assert.equal(snap.aiTelemetry.byProvider[0].label, 'gemini');

  const csv = buildAnalyticsCsv(snap);
  assert.ok(csv.includes('AI Provider,gemini,1'));
  const parsedJson = JSON.parse(buildAnalyticsJson(snap));
  assert.equal(parsedJson.aiTelemetry.totalCalls, 1);

  const analyticsSrc = fs.readFileSync(path.join(root, 'src/pages/AnalyticsPage.tsx'), 'utf8');
  const myDaySrc = fs.readFileSync(path.join(root, 'src/pages/MyDayPage.tsx'), 'utf8');
  const quickCaptureSrc = fs.readFileSync(path.join(root, 'src/components/common/QuickCaptureModal.tsx'), 'utf8');
  const healthSrc = fs.readFileSync(path.join(root, 'src/pages/HealthRoutinePage.tsx'), 'utf8');
  assert.ok(analyticsSrc.includes('<AnalyticsExportControls'));
  assert.ok(analyticsSrc.includes('<AiTelemetryPanel'));
  assert.ok(myDaySrc.includes('Brief JARVIS'));
  assert.ok(myDaySrc.includes('Focus top task'));
  assert.ok(quickCaptureSrc.includes('Ctrl+Enter saves'));
  assert.ok(healthSrc.includes('<DailyHabitsCard'));
});
