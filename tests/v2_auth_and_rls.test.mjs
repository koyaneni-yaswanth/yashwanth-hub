import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleAuthService } from '../src/services/google/googleAuthService.ts';
import { verifyNeoSapienWebhookSignature } from '../api/neosapien/mcp.ts';

test('Phase 1 PKCE: generatePkcePair creates RFC 7636 S256 verifier, challenge & CSRF state', async () => {
  const pair = await GoogleAuthService.generatePkcePair();
  assert.ok(pair.codeVerifier.length >= 43);
  assert.ok(pair.state.startsWith('g_'));

  const expectedChallenge = crypto
    .createHash('sha256')
    .update(pair.codeVerifier)
    .digest('base64url');
  assert.equal(pair.codeChallenge, expectedChallenge, 'S256 code_challenge must match SHA-256 of verifier');
});

test('Phase 1 PKCE: buildPkceAuthUrl encodes exact redirect_uri, offline access & S256 challenge', async () => {
  const { url, state, redirectUri } = await GoogleAuthService.buildPkceAuthUrl(
    '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com',
    'https://yashwanth-hub.vercel.app/'
  );
  const parsed = new URL(url);
  assert.equal(redirectUri, 'https://yashwanth-hub.vercel.app');
  assert.equal(parsed.searchParams.get('redirect_uri'), 'https://yashwanth-hub.vercel.app');
  assert.equal(parsed.searchParams.get('response_type'), 'code');
  assert.equal(parsed.searchParams.get('access_type'), 'offline');
  assert.equal(parsed.searchParams.get('prompt'), 'consent');
  assert.equal(parsed.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(parsed.searchParams.get('state'), state);
});

test('Phase 1 Callback Parser: rejects CSRF state mismatch & surfaces 401 invalid_client diagnostics', () => {
  const mismatch = GoogleAuthService.parseOAuthCallback('?code=abc123&state=g_attacker', 'g_expected');
  assert.equal(mismatch.success, false);
  assert.equal(mismatch.error, 'state_mismatch');

  const invalidClient = GoogleAuthService.parseOAuthCallback('?error=invalid_client');
  assert.equal(invalidClient.success, false);
  assert.match(invalidClient.errorMessage || '', /401 invalid_client/);

  const mismatchUri = GoogleAuthService.parseOAuthCallback('?error=redirect_uri_mismatch');
  assert.equal(mismatchUri.success, false);
  assert.match(mismatchUri.errorMessage || '', /400 redirect_uri_mismatch/);
});

test('Phase 1 Storage Safety: saveConfig strips refreshToken from client localStorage', () => {
  const store = new Map();
  globalThis.window = globalThis.window || {};
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  GoogleAuthService.saveConfig({
    connected: true,
    accessToken: 'ya29.short',
    refreshToken: '1//secret_refresh_should_never_persist',
    services: GoogleAuthService.getDefaultServices(),
  });

  const persisted = JSON.parse(store.get('yash_google_config'));
  assert.equal(persisted.accessToken, 'ya29.short');
  assert.equal(persisted.refreshToken, undefined, 'refreshToken MUST NOT persist in client localStorage');
});

test('Phase 1 SQL RLS Hardening: V2 migration enforces auth.uid() = user_id with zero null-auth bypass', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261110_v2_security_and_architecture.sql'),
    'utf-8'
  );
  const sqlStatementsOnly = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  assert.match(sqlStatementsOnly, /drop policy if exists "Users can view and manage their own integration tokens"/);
  assert.match(sqlStatementsOnly, /create policy "Strict user ownership for integration_tokens"/);
  assert.match(sqlStatementsOnly, /using \(auth\.uid\(\) = user_id\)/);
  assert.ok(
    !/auth\.uid\(\)\s+is\s+null/i.test(sqlStatementsOnly),
    'V2 migration SQL statements must NEVER allow null auth.uid() bypass'
  );
});

test('Phase 5 Webhook Security: HMAC-SHA256 verification accepts authentic signature & rejects tampering/replay', () => {
  const secret = 'test_webhook_secret_key_123';
  const body = JSON.stringify({ id: 'mem_1', title: 'Test' });
  const nowMs = 1762770000000;
  const ts = String(Math.floor(nowMs / 1000));
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  const ok = verifyNeoSapienWebhookSignature(body, ts, `sha256=${sig}`, secret, nowMs);
  assert.equal(ok.valid, true);

  const tampered = verifyNeoSapienWebhookSignature(`${body} `, ts, sig, secret, nowMs);
  assert.equal(tampered.valid, false);

  const staleTs = String(Math.floor((nowMs - 600_000) / 1000));
  const staleSig = crypto.createHmac('sha256', secret).update(`${staleTs}.${body}`).digest('hex');
  const stale = verifyNeoSapienWebhookSignature(body, staleTs, staleSig, secret, nowMs);
  assert.equal(stale.valid, false);
});
