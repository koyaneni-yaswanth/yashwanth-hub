import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { escapeHtml, scriptJson } from '../api/neosapien/callback.ts';

// The server client is built at import time; give it a dummy project (no network is used).
process.env.SUPABASE_URL ||= 'https://unit-test-project.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'unit-test-anon-key';
const { createAiChatHandler } = await import('../api/ai/chat.ts');

function fakeRes() {
  const out = { code: 200, body: undefined, headers: {} };
  const res = {
    setHeader: (k, v) => { out.headers[k] = v; },
    status: (c) => { out.code = c; return res; },
    send: (b) => { out.body = b; return res; },
    json: (b) => { out.body = b; return res; },
    end: () => res,
  };
  return { res, out };
}

test('NeoSapien callback: escaping helpers', () => {
  assert.equal(escapeHtml('<img src=x onerror="a()">&\''), '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;');
  assert.equal(escapeHtml(undefined), '');
  const json = scriptJson('</script><script>alert(1)</script>');
  assert.ok(!json.includes('<'), 'no raw < inside an inline script');
  assert.equal(JSON.parse(json), '</script><script>alert(1)</script>', 'still the same value once parsed');
  assert.equal(JSON.parse(scriptJson('a b')), 'a b');
});

test('NeoSapien callback: an error description from the URL cannot inject markup', async () => {
  const { res, out } = fakeRes();
  await handler({ query: { error: 'access_denied', error_description: '<script>alert(document.cookie)</script>' } }, res);
  assert.equal(out.code, 400);
  assert.ok(!out.body.includes('<script>alert'), 'payload is not rendered as a tag');
  assert.ok(out.body.includes('&lt;script&gt;alert(document.cookie)&lt;/script&gt;'));
});

test('NeoSapien callback: a code value cannot close the inline script', async () => {
  const { res, out } = fakeRes();
  await handler({ query: { code: '</script><script>alert(1)</script>', state: ['s1', 's2'] } }, res);
  assert.equal(out.body.match(/<\/script>/g).length, 1, 'only the page\'s own closing tag');
  assert.ok(out.body.includes('state: "s1"'), 'repeated query values use the first one');
});

test('AI chat: anonymous POSTs are refused before any model call', async () => {
  const chat = createAiChatHandler();
  const { res, out } = fakeRes();
  await chat({ method: 'POST', headers: {}, query: {}, body: { prompt: 'Plan my day' } }, res);
  assert.equal(out.code, 401);
  assert.equal(out.body.code, 'auth_required');
});

test('AI chat: a bad token is refused, a valid session is served', async () => {
  const empty = { data: [], error: null };
  const chain = new Proxy(function () {}, {
    get: (_t, k) => (k === 'then' ? (ok) => ok(empty) : chain),
    apply: () => chain,
  });
  const dbClient = {
    auth: {
      getUser: async (token) =>
        token === 'good' ? { data: { user: { id: 'u1', email: 'owner@example.test' } }, error: null } : { data: {}, error: { message: 'invalid' } },
    },
    from: () => chain,
  };
  const chat = createAiChatHandler(dbClient);

  const bad = fakeRes();
  await chat({ method: 'POST', headers: { authorization: 'Bearer nope' }, query: {}, body: { prompt: 'Plan my day' } }, bad.res);
  assert.equal(bad.out.code, 401);

  const saved = { g: process.env.GEMINI_API_KEY, o: process.env.OPENAI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  try {
    const good = fakeRes();
    await chat({ method: 'POST', headers: { authorization: 'Bearer good' }, query: {}, body: { prompt: 'Plan my day' } }, good.res);
    assert.notEqual(good.out.code, 401);
    assert.equal(good.out.code, 200);
  } finally {
    for (const [k, v] of [['GEMINI_API_KEY', saved.g], ['OPENAI_API_KEY', saved.o], ['ANTHROPIC_API_KEY', saved.a]]) if (v !== undefined) process.env[k] = v;
  }
});
