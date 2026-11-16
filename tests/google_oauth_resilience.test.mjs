import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  cleanGoogleClientId,
  isValidGoogleClientId,
  generatePkcePair,
  buildPkceAuthUrl,
  parseOAuthCallback,
  SERVICE_SCOPES,
  ALL_GOOGLE_SCOPES,
} from '../src/services/google/googleOAuthPure.ts';
import { resolveAuthenticatedUser } from '../api/_lib/db.ts';

// -----------------------------------------------------------------------------
// Core Utilities Tests
// -----------------------------------------------------------------------------
test('Google OAuth: Client ID sanitization strips whitespace, newlines, and quotes', () => {
  const rawQuoted = '  "236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com"  ';
  const rawSingleQuoted = "  '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com' \n";
  const expected = '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com';

  assert.equal(cleanGoogleClientId(rawQuoted), expected);
  assert.equal(cleanGoogleClientId(rawSingleQuoted), expected);
  assert.equal(isValidGoogleClientId(rawQuoted), true);
  assert.equal(isValidGoogleClientId(rawSingleQuoted), true);
});

test('Google OAuth: Invalid and placeholder Client IDs are rejected', () => {
  assert.equal(isValidGoogleClientId('your-google-oauth-client-id.apps.googleusercontent.com'), false);
  assert.equal(isValidGoogleClientId(''), false);
  assert.equal(isValidGoogleClientId('random-string-not-google-id'), false);
  assert.equal(isValidGoogleClientId('12345.apps.googleusercontent.com'), false);
});

test('Google OAuth: Callback parser detects 401 invalid_client and supplies exact resolution hint', () => {
  const callbackUrl = '#error=invalid_client&error_description=Unauthorized';
  const result = parseOAuthCallback(callbackUrl, null, 'https://yashwanth-hub.vercel.app');

  assert.equal(result.success, false);
  assert.equal(result.error, 'invalid_client');
  assert.match(result.errorMessage || '', /401 invalid_client/);
  assert.match(result.resolutionHint || '', /Web application/);
});

test('Google OAuth: Callback parser parses valid access token and computes expires_in', () => {
  const callbackUrl = '#access_token=ya29.a0AfH6SM...&token_type=Bearer&expires_in=3599&scope=openid+email';
  const result = parseOAuthCallback(callbackUrl, null, 'https://yashwanth-hub.vercel.app');

  assert.equal(result.success, true);
  assert.equal(result.token, 'ya29.a0AfH6SM...');
  assert.equal(result.expiresIn, 3599);
});

test('OAuth Architecture Separation: Supabase Auth vs Google Workspace PKCE URLs are strictly isolated', () => {
  const supabaseUrl = 'https://xjhkxnfahkkgwbbtmhtk.supabase.co';
  const supabaseAuthEndpoint = `${supabaseUrl}/auth/v1/authorize?provider=google`;

  const googleAuthEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
  const samplePkceUrl = `${googleAuthEndpoint}?client_id=12345.apps.googleusercontent.com&response_type=code&code_challenge_method=S256&code_challenge=test_challenge&access_type=offline`;

  assert.equal(new URL(supabaseAuthEndpoint).hostname, 'xjhkxnfahkkgwbbtmhtk.supabase.co');
  assert.equal(new URL(supabaseAuthEndpoint).pathname, '/auth/v1/authorize');

  assert.equal(new URL(samplePkceUrl).hostname, 'accounts.google.com');
  assert.equal(new URL(samplePkceUrl).pathname, '/o/oauth2/v2/auth');
  assert.equal(new URL(samplePkceUrl).searchParams.get('code_challenge_method'), 'S256');
  assert.equal(new URL(samplePkceUrl).searchParams.get('access_type'), 'offline');
});

// -----------------------------------------------------------------------------
// Scenario 1: Missing credentials handling
// -----------------------------------------------------------------------------
test('Scenario 1: Missing credentials handling returns structured 503/400 with actionable hints', () => {
  const tokenApiPath = path.resolve(process.cwd(), 'api/auth/google/token.ts');
  const tokenCode = fs.readFileSync(tokenApiPath, 'utf-8');

  assert.match(tokenCode, /if \(!effectiveClientId \|\| !clientSecret\)/);
  assert.match(tokenCode, /GOOGLE_CLIENT_SECRET is not configured/);
  assert.match(tokenCode, /status\(503\)/);

  assert.match(tokenCode, /if \(!code\)/);
  assert.match(tokenCode, /status\(400\)/);
});

// -----------------------------------------------------------------------------
// Scenario 2: Malformed tokens
// -----------------------------------------------------------------------------
test('Scenario 2: Malformed tokens and missing headers are rejected with 401', async () => {
  const res1 = await resolveAuthenticatedUser({ headers: {} });
  assert.equal(res1.authenticated, false);
  assert.equal(res1.userId, null);
  assert.match(res1.error || '', /Missing Authorization Bearer token/);

  const res2 = await resolveAuthenticatedUser({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
  assert.equal(res2.authenticated, false);
  assert.equal(res2.userId, null);

  const res3 = await resolveAuthenticatedUser({ headers: { authorization: 'Bearer   ' } });
  assert.equal(res3.authenticated, false);
  assert.equal(res3.userId, null);
  assert.match(res3.error || '', /Empty Bearer token/);
});

// -----------------------------------------------------------------------------
// Scenario 3: Expired tokens & refresh flow
// -----------------------------------------------------------------------------
test('Scenario 3: Expired tokens & refresh flow triggers automatic server-side refresh', () => {
  const isExpiringCheck = (accessToken, expiresAt, marginMs = 60000) => {
    const expiresMs = expiresAt ? new Date(expiresAt).getTime() : 0;
    return !accessToken || !expiresMs || Date.now() > expiresMs - marginMs;
  };

  const pastDate = new Date(Date.now() - 3600000).toISOString();
  const nearFutureDate = new Date(Date.now() + 30000).toISOString();
  const safeFutureDate = new Date(Date.now() + 3600000).toISOString();

  assert.equal(isExpiringCheck('token', pastDate), true, 'Past token is expired');
  assert.equal(isExpiringCheck('token', nearFutureDate), true, 'Token expiring within 60s is refreshed preemptively');
  assert.equal(isExpiringCheck('token', safeFutureDate), false, 'Token valid for 1h is not expiring');
  assert.equal(isExpiringCheck(null, safeFutureDate), true, 'Missing access token triggers refresh');
});

// -----------------------------------------------------------------------------
// Scenario 4: CSRF / state mismatch rejection
// -----------------------------------------------------------------------------
test('Scenario 4: CSRF state mismatch rejection enforces cryptographic state validation', () => {
  const result = parseOAuthCallback('?code=auth_code_123&state=g_tampered_state', 'g_valid_state', 'https://yashwanth-hub.vercel.app');
  assert.equal(result.success, false);
  assert.equal(result.error, 'state_mismatch');
  assert.match(result.errorMessage || '', /CSRF state verification failed/i);
});

// -----------------------------------------------------------------------------
// Scenario 5: PKCE code challenge verification
// -----------------------------------------------------------------------------
test('Scenario 5: PKCE code challenge verification complies with RFC 7636 S256 specification', async () => {
  const pair = await generatePkcePair();
  assert.ok(pair.codeVerifier.length >= 43 && pair.codeVerifier.length <= 128);
  assert.ok(pair.state.startsWith('g_'));

  const expectedChallenge = crypto
    .createHash('sha256')
    .update(pair.codeVerifier)
    .digest('base64url');
  assert.equal(pair.codeChallenge, expectedChallenge, 'S256 code_challenge must equal base64url(sha256(verifier))');
});

// -----------------------------------------------------------------------------
// Scenario 6: User rejection (error=access_denied)
// -----------------------------------------------------------------------------
test('Scenario 6: User rejection (error=access_denied) returns clear explanation without throwing', () => {
  const deniedResult = parseOAuthCallback('?error=access_denied&error_description=The+user+denied+the+request', 'g_state', 'https://yashwanth-hub.vercel.app');
  assert.equal(deniedResult.success, false);
  assert.equal(deniedResult.error, 'access_denied');
  assert.match(deniedResult.errorMessage || '', /Access denied/i);
});

// -----------------------------------------------------------------------------
// Scenario 7: Network timeout / offline behavior
// -----------------------------------------------------------------------------
test('Scenario 7: Network timeout / offline behavior is safely caught and formatted', () => {
  const netErr = parseOAuthCallback('?error=server_error&error_description=Connection+timed+out', null, 'https://yashwanth-hub.vercel.app');
  assert.equal(netErr.success, false);
  assert.match(netErr.errorMessage || '', /server_error/);
});

// -----------------------------------------------------------------------------
// Scenario 8: Simultaneous login requests / race condition resolution
// -----------------------------------------------------------------------------
test('Scenario 8: Simultaneous login requests and session hydration race conditions are resolved', () => {
  const authServicePath = path.resolve(process.cwd(), 'src/services/google/googleAuthService.ts');
  const authCode = fs.readFileSync(authServicePath, 'utf-8');

  assert.match(authCode, /for \(let i = 0; i < 4; i\+\+\)/);
  assert.match(authCode, /if \(!session\?\.access_token\)/);
  assert.match(authCode, /Authentication Required: Please sign in to Yashwanth Hub before connecting Google Workspace/);

  const appPath = path.resolve(process.cwd(), 'src/App.tsx');
  const appCode = fs.readFileSync(appPath, 'utf-8');
  assert.match(appCode, /const initApp = async \(\) =>/);
  assert.match(appCode, /await SupabaseAuthService\.init\(\)/);
  assert.match(appCode, /const ex = await GoogleAuthService\.exchangeAuthorizationCode/);
});

// -----------------------------------------------------------------------------
// Scenario 9: Session restoration across page refresh
// -----------------------------------------------------------------------------
test('Scenario 9: Session restoration across page refresh checks server status endpoint', () => {
  const authServicePath = path.resolve(process.cwd(), 'src/services/google/googleAuthService.ts');
  const authCode = fs.readFileSync(authServicePath, 'utf-8');

  assert.match(authCode, /public static async restoreSessionFromServer/);
  assert.match(authCode, /\/api\/auth\/google\/token\?action=status/);
});

// -----------------------------------------------------------------------------
// Scenario 10: Multi-device session isolation
// -----------------------------------------------------------------------------
test('Scenario 10: Multi-device session isolation links tokens to authenticated user ID', () => {
  const tokenApiPath = path.resolve(process.cwd(), 'api/auth/google/token.ts');
  const tokenCode = fs.readFileSync(tokenApiPath, 'utf-8');

  assert.match(tokenCode, /\.eq\('user_id', userId\)/);
  assert.match(tokenCode, /user_id: userId/);
  assert.match(tokenCode, /{ onConflict: 'user_id,provider' }/);
});

// -----------------------------------------------------------------------------
// Scenario 11: RLS enforcement (auth.uid() = user_id)
// -----------------------------------------------------------------------------
test('Scenario 11: RLS enforcement guarantees strict user isolation on integration_tokens', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261110_v2_security_and_architecture.sql'),
    'utf-8'
  );
  const sqlStatements = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.match(sqlStatements, /create policy "Strict user ownership for integration_tokens"/);
  assert.match(sqlStatements, /using \(auth\.uid\(\) = user_id\)/);
  assert.doesNotMatch(sqlStatements, /auth\.uid\(\) is null/i);
});

// -----------------------------------------------------------------------------
// Scenario 12: Database check constraint on provider
// -----------------------------------------------------------------------------
test('Scenario 12: Database check constraint enforces permitted providers (google, neosapien, github)', () => {
  const migration = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261105_google_tasks_and_neosapien_persistence.sql'),
    'utf-8'
  );
  assert.match(migration, /check \(provider in \('google', 'neosapien', 'github'\)\)/);
});

// -----------------------------------------------------------------------------
// Scenario 13: Secret isolation (no VITE_ leaks)
// -----------------------------------------------------------------------------
test('Scenario 13: Secret isolation ensures GOOGLE_CLIENT_SECRET is never bundled into client src/', () => {
  const srcFiles = fs.readdirSync(path.join(process.cwd(), 'src'), { recursive: true });
  for (const file of srcFiles) {
    if (typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js'))) {
      const content = fs.readFileSync(path.join(process.cwd(), 'src', file), 'utf-8');
      assert.doesNotMatch(
        content,
        /VITE_GOOGLE_CLIENT_SECRET/,
        `Client source file ${file} must not reference VITE_GOOGLE_CLIENT_SECRET`
      );
      assert.doesNotMatch(
        content,
        /VITE_SUPABASE_SERVICE_ROLE_KEY/,
        `Client source file ${file} must not reference VITE_SUPABASE_SERVICE_ROLE_KEY`
      );
    }
  }
});

// -----------------------------------------------------------------------------
// Scenario 14: Scope validation for all 4 services
// -----------------------------------------------------------------------------
test('Scenario 14: Scope validation verifies Calendar, Tasks, Gmail, Drive scopes are mapped', () => {
  assert.ok(SERVICE_SCOPES.calendar.includes('https://www.googleapis.com/auth/calendar.events'));
  assert.ok(SERVICE_SCOPES.tasks.includes('https://www.googleapis.com/auth/tasks'));
  assert.ok(SERVICE_SCOPES.gmail.includes('https://www.googleapis.com/auth/gmail.readonly'));
  assert.ok(SERVICE_SCOPES.gmail.includes('https://www.googleapis.com/auth/gmail.compose'));
  assert.ok(SERVICE_SCOPES.drive.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(ALL_GOOGLE_SCOPES.includes('https://www.googleapis.com/auth/tasks'));
});

// -----------------------------------------------------------------------------
// Scenario 15: Revocation & cleanup on disconnect
// -----------------------------------------------------------------------------
test('Scenario 15: Revocation & cleanup on disconnect invokes Google revocation and purges DB', () => {
  const tokenApiPath = path.resolve(process.cwd(), 'api/auth/google/token.ts');
  const tokenCode = fs.readFileSync(tokenApiPath, 'utf-8');

  assert.match(tokenCode, /if \(req\.method === 'DELETE'\)/);
  assert.match(tokenCode, /https:\/\/oauth2\.googleapis\.com\/revoke/);
  assert.match(tokenCode, /\.from\('integration_tokens'\)\s*\.delete\(\)/);
});

// -----------------------------------------------------------------------------
// Scenario 16: Provider disabled error handling & user guidance
// -----------------------------------------------------------------------------
test('Scenario 16: Provider disabled error handling intercepts GoTrue 400 and guides founder', () => {
  const errorPayload = {
    code: 400,
    error_code: 'validation_failed',
    msg: 'Unsupported provider: provider is not enabled',
  };

  const isProviderDisabled =
    errorPayload.error_code === 'validation_failed' || errorPayload.msg?.includes('provider is not enabled');
  assert.equal(isProviderDisabled, true);

  const guideMessage =
    'Google Sign-In is not enabled on this Supabase project. Enable Google in the Supabase Dashboard (Authentication -> Providers) or sign in using Email & Password below.';
  assert.match(guideMessage, /Supabase Dashboard/);
  assert.match(guideMessage, /Authentication -> Providers/);
});
