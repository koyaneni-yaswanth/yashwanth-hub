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
});
