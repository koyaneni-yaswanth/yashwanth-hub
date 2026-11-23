import test from 'node:test';
import assert from 'node:assert/strict';
import { rankGeminiModels, chooseGeminiModels } from '../api/_lib/geminiRanking.ts';

const LIST = [
  'models/gemini-1.5-flash', 'models/gemini-2.0-flash', 'models/gemini-2.0-flash-lite',
  'models/gemini-2.5-flash', 'models/gemini-2.5-flash-lite', 'models/gemini-2.5-pro',
  'models/gemini-3.0-flash-preview', 'models/gemini-2.5-flash-preview-tts', 'models/gemini-2.5-flash-image',
  'models/text-embedding-004', 'models/gemini-embedding-001', 'models/gemma-3-27b-it', 'models/gemini-2.5-flash-preview-09-2025',
];

test('rankGeminiModels prefers newest stable flash, skips special-purpose variants', () => {
  const r = rankGeminiModels(LIST, 'flash');
  assert.equal(r[0], 'gemini-2.5-flash');
  assert.ok(r.indexOf('gemini-2.0-flash') > r.indexOf('gemini-2.5-flash-lite'), 'newer lite ranks above older full? lite after full of same version only');
  assert.ok(!r.some((id) => /tts|image|embedding|gemma/.test(id)));
  assert.ok(r.indexOf('gemini-3.0-flash-preview') > r.indexOf('gemini-1.5-flash'), 'stable before preview');
});

test('rankGeminiModels pro tier falls back to flash', () => {
  const r = rankGeminiModels(LIST, 'pro');
  assert.equal(r[0], 'gemini-2.5-pro');
  assert.ok(r.includes('gemini-2.5-flash'));
});

test('chooseGeminiModels: aliases, explicit ids, retired and invented ids', () => {
  const ids = LIST.map((n) => n.replace('models/', ''));
  assert.deepEqual(chooseGeminiModels(ids, 'gemini-auto'), { primary: 'gemini-2.5-flash', fallback: 'gemini-2.5-flash-lite' });
  assert.equal(chooseGeminiModels(ids, 'gemini-auto-pro').primary, 'gemini-2.5-pro');
  assert.equal(chooseGeminiModels(ids, 'gemini-2.0-flash').primary, 'gemini-2.0-flash', 'an available explicit id is honoured');
  assert.equal(chooseGeminiModels(['gemini-2.5-flash', 'gemini-2.5-pro'], 'gemini-1.5-pro').primary, 'gemini-2.5-pro', 'retired pro -> best pro');
  assert.equal(chooseGeminiModels(ids, 'gemini-3.8-flash').primary, 'gemini-2.5-flash', 'invented id -> best flash');
  assert.equal(chooseGeminiModels(ids, '').primary, 'gemini-2.5-flash');
  assert.deepEqual(chooseGeminiModels(null, 'gemini-auto'), { primary: 'gemini-2.5-flash', fallback: null }, 'listing failed: sensible default');
  assert.deepEqual(chooseGeminiModels(null, 'gemini-2.0-flash'), { primary: 'gemini-2.0-flash', fallback: null }, 'listing failed: pass explicit id through');
});

import { isAllowedOrigin, applyCors, safeError } from '../api/_lib/http.ts';
import { canonicalTab, readTabFromSearch } from '../src/lib/navigation.ts';
import { toast, subscribeToasts, dismissToast } from '../src/lib/toast.ts';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

test('CORS allowlist: app origins only, never a wildcard', () => {
  for (const o of ['https://yashwanth-hub.vercel.app', 'capacitor://localhost', 'https://localhost', 'http://localhost:5174', 'http://127.0.0.1:3000',
    'https://yashwanth-mjo5739lw-koyaneniyaswanth-9270s-projects.vercel.app']) assert.ok(isAllowedOrigin(o), o);
  for (const o of ['https://evil.example', 'https://yashwanth-hub.vercel.app.evil.example', 'https://evil-koyaneniyaswanth-9270s-projects.vercel.app', 'null', '', undefined])
    assert.ok(!isAllowedOrigin(o), String(o));
  const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; } };
  applyCors({ headers: { origin: 'https://evil.example' } }, res, 'GET');
  assert.equal(headers['Access-Control-Allow-Origin'], undefined);
  applyCors({ headers: { origin: 'capacitor://localhost' } }, res, 'GET, POST');
  assert.equal(headers['Access-Control-Allow-Origin'], 'capacitor://localhost');
  assert.equal(headers.Vary, 'Origin');
});

test('no API route sends Access-Control-Allow-Origin: *', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const f of walk('api').filter((p) => p.endsWith('.ts'))) {
    assert.ok(!/Allow-Origin',\s*'\*'/.test(readFileSync(f, 'utf8')), f);
  }
});

test('safeError logs code and message only, never request config', () => {
  const err = Object.assign(new Error('invalid_client'), { response: { data: { error: 'invalid_client' } }, config: { data: 'code=SECRET&code_verifier=VERIFIER' } });
  const out = safeError(err);
  assert.match(out, /invalid_client/);
  assert.ok(!/SECRET|VERIFIER/.test(out));
});

test('duplicate routes resolve to one canonical tab', () => {
  assert.equal(canonicalTab('wind-plan'), 'startup-command');
  assert.equal(canonicalTab('neo-memory'), 'knowledge-memory');
  assert.equal(canonicalTab('files'), 'documents');
  assert.equal(canonicalTab('expenses'), 'finance');
  assert.equal(canonicalTab('tasks'), 'tasks');
  assert.equal(readTabFromSearch('?tab=wind-plan'), 'startup-command');
  assert.equal(readTabFromSearch('?tab=bogus'), null);
});

test('toasts: queue, cap at three, dismiss; no alert() left in src', () => {
  let seen = [];
  const off = subscribeToasts((items) => { seen = items; });
  const ids = ['a', 'b', 'c', 'd'].map((m) => toast(m, 'info', 60000));
  assert.deepEqual(seen.map((t) => t.message), ['b', 'c', 'd']);
  dismissToast(ids[3]);
  assert.deepEqual(seen.map((t) => t.message), ['b', 'c']);
  seen.forEach((t) => dismissToast(t.id));
  off();
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const f of walk('src').filter((p) => /\.tsx?$/.test(p))) {
    const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.ok(!/(^|[^.\w])alert\(/.test(code), f);
  }
});
