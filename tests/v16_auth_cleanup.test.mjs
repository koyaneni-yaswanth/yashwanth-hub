import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authSrc = readFileSync(new URL('../src/services/auth/supabaseAuthService.ts', import.meta.url), 'utf8');
const supabaseSrc = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
const tokenSrc = readFileSync(new URL('../api/auth/google/token.ts', import.meta.url), 'utf8');

test('no pre-flight probe: signInWithGoogleOAuth does not manually fetch the authorize endpoint', () => {
  const methodBody = authSrc.slice(authSrc.indexOf('signInWithGoogleOAuth'));
  const nextMethod = methodBody.indexOf('signInWithEmail');
  const body = methodBody.slice(0, nextMethod);
  assert.ok(!body.includes('/auth/v1/authorize'), 'should not probe GoTrue authorize endpoint directly');
  assert.ok(!body.includes('redirect: \'manual\''), 'should not issue a manual-redirect fetch');
});

test('no forced consent: hub sign-in uses select_account, not consent', () => {
  const methodBody = authSrc.slice(authSrc.indexOf('signInWithGoogleOAuth'));
  const nextMethod = methodBody.indexOf('signInWithEmail');
  const body = methodBody.slice(0, nextMethod);
  assert.ok(!body.includes("prompt: 'consent'"), 'prompt must not be consent (forces re-consent every time)');
  assert.ok(!body.includes("access_type: 'offline'"), 'access_type offline belongs on the Workspace flow, not hub sign-in');
  assert.ok(body.includes("prompt: 'select_account'"), 'prompt should be select_account');
});

test('Supabase URL/key localStorage override is gated to development', () => {
  assert.ok(supabaseSrc.includes('import.meta.env?.DEV'), 'getSupabaseConfig must check import.meta.env.DEV before reading localStorage');
  const saveIdx = supabaseSrc.indexOf('saveSupabaseConfig');
  const saveBody = supabaseSrc.slice(saveIdx, supabaseSrc.indexOf('}', saveIdx + 60) + 1);
  assert.ok(saveBody.includes('import.meta.env?.DEV'), 'saveSupabaseConfig must also be gated to dev');
});

test('token.ts uses safeError, never logs the raw error object', () => {
  assert.ok(tokenSrc.includes('safeError(error)'), 'catch block should use safeError');
  const catchIdx = tokenSrc.lastIndexOf('catch');
  const catchBlock = tokenSrc.slice(catchIdx, catchIdx + 300);
  assert.ok(!catchBlock.includes('JSON.stringify(error)'), 'must not stringify the full error (leaks code and verifier)');
  assert.ok(!catchBlock.includes('console.error(error)'), 'must not log the raw error object');
});
