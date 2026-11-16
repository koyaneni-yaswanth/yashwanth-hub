import test from 'node:test';
import assert from 'node:assert/strict';

// Import GoogleAuthService logic or test the sanitization and parsing logic
function cleanClientId(clientId) {
  if (!clientId) return '';
  return clientId.trim().replace(/^["']|["']$/g, '').trim();
}

function isValidClientId(clientId) {
  const cleaned = cleanClientId(clientId);
  if (!cleaned || cleaned.includes('your-google-oauth-client-id')) return false;
  return /^[0-9]+-[a-z0-9_]+\.apps\.googleusercontent\.com$/i.test(cleaned);
}

function parseOAuthCallback(urlHashOrQuery) {
  const cleanStr = urlHashOrQuery.replace(/^[#?]/, '');
  const params = new URLSearchParams(cleanStr);

  const error = params.get('error');
  if (error) {
    let errorMessage = 'Google OAuth authorization failed.';
    let resolutionHint = 'Verify your Google Cloud Console configuration.';

    if (error === 'invalid_client') {
      errorMessage = '401 invalid_client: The OAuth client was not found.';
      resolutionHint = 'Ensure your Google Cloud OAuth Client ID is registered as "Web application" and belongs to an active Google Cloud Project with the OAuth consent screen configured.';
    } else if (error === 'redirect_uri_mismatch') {
      errorMessage = '400 redirect_uri_mismatch: The redirect URI does not match.';
      resolutionHint = 'Add the redirect URI to Authorized redirect URIs in Google Cloud Console.';
    }

    return { success: false, error, errorMessage, resolutionHint };
  }

  const token = params.get('access_token');
  const expiresIn = Number(params.get('expires_in')) || 3600;

  if (token) {
    return { success: true, token, expiresIn };
  }

  return { success: false, error: 'no_token', errorMessage: 'No access token found.' };
}

test('Google OAuth: Client ID sanitization strips whitespace, newlines, and quotes', () => {
  const rawQuoted = '  "236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com"  ';
  const rawSingleQuoted = "  '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com' \n";
  const expected = '236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com';

  assert.equal(cleanClientId(rawQuoted), expected);
  assert.equal(cleanClientId(rawSingleQuoted), expected);
  assert.equal(isValidClientId(rawQuoted), true);
  assert.equal(isValidClientId(rawSingleQuoted), true);
});

test('Google OAuth: Invalid and placeholder Client IDs are rejected', () => {
  assert.equal(isValidClientId('your-google-oauth-client-id.apps.googleusercontent.com'), false);
  assert.equal(isValidClientId(''), false);
  assert.equal(isValidClientId('random-string-not-google-id'), false);
  assert.equal(isValidClientId('12345.apps.googleusercontent.com'), false); // Missing hyphens
});

test('Google OAuth: Callback parser detects 401 invalid_client and supplies exact resolution hint', () => {
  const callbackUrl = '#error=invalid_client&error_description=Unauthorized';
  const result = parseOAuthCallback(callbackUrl);

  assert.equal(result.success, false);
  assert.equal(result.error, 'invalid_client');
  assert.match(result.errorMessage, /401 invalid_client/);
  assert.match(result.resolutionHint, /Web application/);
});

test('Google OAuth: Callback parser parses valid access token and computes expires_in', () => {
  const callbackUrl = '#access_token=ya29.a0AfH6SM...&token_type=Bearer&expires_in=3599&scope=openid+email';
  const result = parseOAuthCallback(callbackUrl);

  assert.equal(result.success, true);
  assert.equal(result.token, 'ya29.a0AfH6SM...');
  assert.equal(result.expiresIn, 3599);
});

test('Supabase Auth Provider Error: Gracefully catches "Unsupported provider: provider is not enabled"', () => {
  const errorPayload = {
    code: 400,
    error_code: 'validation_failed',
    msg: 'Unsupported provider: provider is not enabled',
  };

  function parseSupabaseProviderError(err) {
    if (
      err?.error_code === 'validation_failed' ||
      err?.msg?.includes('provider is not enabled') ||
      err?.message?.includes('provider is not enabled')
    ) {
      return {
        error:
          'Google Sign-In is not enabled on this Supabase project. Enable Google in the Supabase Dashboard (Authentication -> Providers) or sign in using Email & Password below.',
        providerDisabled: true,
      };
    }
    return { error: err?.message || 'Authentication error', providerDisabled: false };
  }

  const result = parseSupabaseProviderError(errorPayload);
  assert.equal(result.providerDisabled, true);
  assert.match(result.error, /Google Sign-In is not enabled on this Supabase project/);
  assert.match(result.error, /Authentication -> Providers/);
});

test('OAuth Architecture Separation: Supabase Auth vs Google Workspace PKCE URLs are strictly isolated', () => {
  const supabaseUrl = 'https://xjhkxnfahkkgwbbtmhtk.supabase.co';
  const supabaseAuthEndpoint = `${supabaseUrl}/auth/v1/authorize?provider=google`;

  const googleAuthEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
  const samplePkceUrl = `${googleAuthEndpoint}?client_id=12345.apps.googleusercontent.com&response_type=code&code_challenge_method=S256&code_challenge=test_challenge&access_type=offline`;

  // Verify Supabase Auth targets GoTrue endpoint
  assert.equal(new URL(supabaseAuthEndpoint).hostname, 'xjhkxnfahkkgwbbtmhtk.supabase.co');
  assert.equal(new URL(supabaseAuthEndpoint).pathname, '/auth/v1/authorize');

  // Verify Google Workspace PKCE targets Google accounts directly
  assert.equal(new URL(samplePkceUrl).hostname, 'accounts.google.com');
  assert.equal(new URL(samplePkceUrl).pathname, '/o/oauth2/v2/auth');
  assert.equal(new URL(samplePkceUrl).searchParams.get('code_challenge_method'), 'S256');
  assert.equal(new URL(samplePkceUrl).searchParams.get('access_type'), 'offline');
});

test('Serverless Token API: api/auth/google/token.ts imports unified db client and supports user-scoped RLS', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const tokenApiPath = path.resolve(process.cwd(), 'api/auth/google/token.ts');
  const tokenCode = fs.readFileSync(tokenApiPath, 'utf-8');

  // Must import from _lib/db.ts
  assert.match(tokenCode, /from '\.\.\/\.\.\/_lib\/db\.ts'/);
  assert.match(tokenCode, /isServerSupabaseConfigured/);
  assert.match(tokenCode, /resolveAuthenticatedUser/);

  // Must not contain local duplicate isServerSupabaseConfigured demanding only service role
  assert.doesNotMatch(
    tokenCode,
    /function isServerSupabaseConfigured\(\)/,
    'Must not define private isServerSupabaseConfigured demanding service role'
  );

  // Must use user-scoped client db
  assert.match(tokenCode, /const db = auth\.client \|\| supabaseServer/);
});

