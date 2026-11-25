import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildGoogleTokenErrorDiagnostic,
  cleanEnvValue,
  deriveCallbackRedirectUri,
  extractCookie,
  normalizeRedirectUri,
  resolveGoogleOAuthConfig,
  sanitizeSupabaseError,
  summarizeGoogleTokenResponse,
} from '../api/_lib/googleOAuth.ts';
import callbackHandler from '../api/auth/google/callback.ts';
import { parseOAuthCallback } from '../src/services/google/googleOAuthPure.ts';
import { GoogleAuthService } from '../src/services/google/googleAuthService.ts';

function makeRes() {
  const headers = new Map();
  return {
    statusCode: 200,
    redirectTarget: null,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    redirect(url) {
      this.statusCode = 302;
      this.redirectTarget = url;
      return this;
    },
  };
}

test('env helpers strip quotes/newlines and identify exact missing GOOGLE_CLIENT_ID vs GOOGLE_CLIENT_SECRET', () => {
  const prevId = process.env.GOOGLE_CLIENT_ID;
  const prevViteId = process.env.VITE_GOOGLE_CLIENT_ID;
  const prevSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = '  "secret_value_should_never_leak" \n';

    const missingId = resolveGoogleOAuthConfig();
    assert.deepEqual(missingId.missingEnvVars, ['GOOGLE_CLIENT_ID']);
    assert.equal(missingId.presence.hasClientSecret, true);
    assert.equal(cleanEnvValue(process.env.GOOGLE_CLIENT_SECRET), 'secret_value_should_never_leak');
    assert.equal(JSON.stringify(missingId.presence).includes('secret_value_should_never_leak'), false);

    process.env.GOOGLE_CLIENT_ID = '123456-abc.apps.googleusercontent.com';
    const complete = resolveGoogleOAuthConfig();
    assert.deepEqual(complete.missingEnvVars, []);
    assert.equal(complete.presence.hasGoogleClientId, true);
  } finally {
    if (prevId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prevId;
    if (prevViteId === undefined) delete process.env.VITE_GOOGLE_CLIENT_ID;
    else process.env.VITE_GOOGLE_CLIENT_ID = prevViteId;
    if (prevSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = prevSecret;
  }
});

test('deriveCallbackRedirectUri handles proxy CSV headers cleanly without trailing slash mismatch', () => {
  const req = {
    headers: {
      'x-forwarded-host': 'yashwanth-hub.vercel.app',
      'x-forwarded-proto': 'https,http',
    },
  };
  assert.equal(deriveCallbackRedirectUri(req), 'https://yashwanth-hub.vercel.app/api/auth/google/callback');
  assert.equal(normalizeRedirectUri('https://yashwanth-hub.vercel.app/'), 'https://yashwanth-hub.vercel.app');
  assert.equal(extractCookie({ headers: { cookie: 'a=1; yash_google_pkce_v=verif%2B123; b=2' } }, 'yash_google_pkce_v'), 'verif+123');
});

test('summarizeGoogleTokenResponse and sanitizeSupabaseError never expose secrets', () => {
  const tokenSummary = summarizeGoogleTokenResponse(400, {
    error: 'invalid_grant',
    error_description: 'Bad Request: code expired',
    access_token: 'ya29.topsecret',
    refresh_token: '1//topsecret',
    id_token: 'eyJ.topsecret',
    scope: 'openid email',
  });
  assert.equal(tokenSummary.status, 400);
  assert.equal(tokenSummary.error, 'invalid_grant');
  assert.equal(tokenSummary.error_description, 'Bad Request: code expired');
  assert.equal(tokenSummary.has_access_token, true);
  assert.equal(tokenSummary.has_refresh_token, true);
  assert.equal(JSON.stringify(tokenSummary).includes('topsecret'), false);

  const dbSummary = sanitizeSupabaseError({
    code: '42501',
    message: 'new row violates row-level security policy',
    details: 'Failing row contains (...)',
    hint: 'Ensure auth.uid() matches user_id',
  });
  assert.equal(dbSummary?.code, '42501');
  assert.match(dbSummary?.message || '', /row-level security/);
});

test('parseOAuthCallback surfaces exact Supabase server_error reason and Google invalid_grant reason', () => {
  const supaQuery =
    '?error=server_error&error_code=unexpected_failure&error_description=' +
    encodeURIComponent('Unable to exchange external code: oauth2: "invalid_client"');
  const resSupa = parseOAuthCallback(supaQuery, null, 'https://yashwanth-hub.vercel.app');
  assert.equal(resSupa.success, false);
  assert.equal(resSupa.error, 'server_error');
  assert.match(resSupa.errorMessage || '', /Unable to exchange external code/);
  assert.match(resSupa.resolutionHint || '', /Supabase Dashboard -> Authentication -> Providers -> Google/);

  const googleErr = '?tab=integrations&google_error=invalid_grant&google_error_desc=' +
    encodeURIComponent('invalid_grant: Malformed auth code.');
  const resGoogle = parseOAuthCallback(googleErr, null, 'https://yashwanth-hub.vercel.app');
  assert.equal(resGoogle.success, false);
  assert.equal(resGoogle.error, 'invalid_grant');
  assert.match(resGoogle.errorMessage || '', /Malformed auth code/);
});

test('callback handler surfaces real Google invalid_grant error instead of generic server_error and logs safely', async () => {
  const prevId = process.env.GOOGLE_CLIENT_ID;
  const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
  const prevFetch = globalThis.fetch;
  const prevInfo = console.info;
  const logs = [];

  try {
    process.env.GOOGLE_CLIENT_ID = '236257519636-testclient.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret_never_logged';

    let sentParams = null;
    globalThis.fetch = async (_url, init) => {
      sentParams = new URLSearchParams(String(init?.body || ''));
      return new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Missing or invalid code verifier.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    };

    console.info = (...args) => logs.push(args);

    const req = {
      query: { code: '4/0AcvDMrTestAuthCode' },
      headers: {
        'x-forwarded-host': 'yashwanth-hub.vercel.app',
        'x-forwarded-proto': 'https',
        cookie: 'yash_google_pkce_v=pkce_verifier_12345; yash_google_oauth_r=https%3A%2F%2Fyashwanth-hub.vercel.app%2Fapi%2Fauth%2Fgoogle%2Fcallback',
      },
    };
    const res = makeRes();
    await callbackHandler(req, res);

    assert.equal(res.statusCode, 302);
    assert.ok(res.redirectTarget);
    const redirectParams = new URLSearchParams(res.redirectTarget.split('?')[1]);
    assert.equal(redirectParams.get('google_error'), 'invalid_grant');
    assert.match(redirectParams.get('google_error_desc') || '', /Missing or invalid code verifier/);
    assert.equal(sentParams?.get('redirect_uri'), 'https://yashwanth-hub.vercel.app/api/auth/google/callback');
    assert.equal(sentParams?.get('code_verifier'), 'pkce_verifier_12345');

    // Verify logged token response includes status & error_description, zero secrets/codes/verifiers
    const logBlob = JSON.stringify(logs);
    assert.match(logBlob, /invalid_grant/);
    assert.match(logBlob, /Missing or invalid code verifier/);
    assert.equal(logBlob.includes('test_google_secret_never_logged'), false);
    assert.equal(logBlob.includes('4/0AcvDMrTestAuthCode'), false);
    assert.equal(logBlob.includes('pkce_verifier_12345'), false);
  } finally {
    console.info = prevInfo;
    globalThis.fetch = prevFetch;
    if (prevId === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = prevId;
    if (prevSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
    else process.env.GOOGLE_CLIENT_SECRET = prevSecret;
  }
});

test('PKCE code_verifier & redirect_uri survive sessionStorage eviction via localStorage fallback', async () => {
  const prevWin = globalThis.window;
  const prevSS = globalThis.sessionStorage;
  const prevLS = globalThis.localStorage;
  const ss = new Map();
  const ls = new Map();

  try {
    globalThis.window = { location: { origin: 'https://yashwanth-hub.vercel.app/', protocol: 'https:' } };
    globalThis.sessionStorage = {
      getItem: (k) => ss.get(k) ?? null,
      setItem: (k, v) => ss.set(k, v),
      removeItem: (k) => ss.delete(k),
    };
    globalThis.localStorage = {
      getItem: (k) => ls.get(k) ?? null,
      setItem: (k, v) => ls.set(k, v),
      removeItem: (k) => ls.delete(k),
    };

    const started = await GoogleAuthService.buildPkceAuthUrl(
      '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com',
      'https://yashwanth-hub.vercel.app/'
    );
    assert.equal(started.redirectUri, 'https://yashwanth-hub.vercel.app');
    assert.equal(GoogleAuthService.hasStoredPkceSession(), true);

    // Simulate cross-redirect clearing sessionStorage while localStorage backup remains
    ss.clear();
    assert.equal(GoogleAuthService.hasStoredPkceSession(), true);
    assert.equal(GoogleAuthService.getSavedPkceState(), started.state);
  } finally {
    globalThis.window = prevWin;
    globalThis.sessionStorage = prevSS;
    globalThis.localStorage = prevLS;
  }
});

test('App handles query-string Supabase OAuth ?error=server_error even without PKCE state and builds error diagnostics', () => {
  const appCode = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');
  assert.match(appCode, /hasQueryOAuthError/);
  assert.match(appCode, /parsedErr\.errorDescription/);

  const diag = buildGoogleTokenErrorDiagnostic('invalid_grant', 'Code was already redeemed.', 'https://yashwanth-hub.vercel.app');
  assert.equal(diag.code, 'invalid_grant');
  assert.equal(diag.message, 'invalid_grant: Code was already redeemed.');
});
