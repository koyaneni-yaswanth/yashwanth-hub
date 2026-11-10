// Vercel Serverless Function: Google OAuth PKCE Exchange, Token Refresh & Session Vault
// Endpoint: /api/auth/google/token
// Hard Constraints:
// 1. Refresh tokens are stored strictly server-side in public.integration_tokens (never returned to client).
// 2. Requires authenticated Supabase session JWT for multi-user RLS isolation.

import { google } from 'googleapis';
import { supabaseServer } from '../../_lib/db.ts';

function isServerSupabaseConfigured(): boolean {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return Boolean(url && key && !url.includes('sample-project') && !key.includes('placeholder'));
}

async function resolveAuthenticatedUser(req: any): Promise<{ userId: string | null; error?: string }> {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing Authorization Bearer JWT.' };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { userId: null, error: 'Empty Bearer JWT.' };
  }

  try {
    const {
      data: { user },
      error,
    } = await supabaseServer.auth.getUser(token);
    if (error || !user) {
      return { userId: null, error: error?.message || 'Invalid or expired user session.' };
    }
    return { userId: user.id };
  } catch (err: any) {
    return { userId: null, error: err?.message || 'Auth verification failed.' };
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isServerSupabaseConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Server Configuration Required',
      message:
        'Supabase server credentials (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are not configured in Vercel Environment Variables.',
      missingEnvVars: [
        !process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL ? 'SUPABASE_URL' : null,
        !process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : null,
      ].filter(Boolean),
    });
  }

  const auth = await resolveAuthenticatedUser(req);
  if (!auth.userId) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: auth.error || 'Please sign in to Yashwanth Hub before managing Google Workspace tokens.',
    });
  }
  const userId = auth.userId;

  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  try {
    // -------------------------------------------------------------------------
    // GET: Restore Session Status & Server-Side Auto-Refresh Expired Access Token
    // -------------------------------------------------------------------------
    if (req.method === 'GET') {
      const { data: tokenRecord, error: fetchErr } = await supabaseServer
        .from('integration_tokens')
        .select('id, user_id, provider, access_token, encrypted_access_token, refresh_token, encrypted_refresh_token, expires_at, token_expires_at, account_email, scopes, updated_at')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();

      if (fetchErr || !tokenRecord) {
        return res.status(200).json({
          success: true,
          connected: false,
          has_refresh_token: false,
        });
      }

      let accessToken = tokenRecord.access_token || tokenRecord.encrypted_access_token || null;
      const refreshToken = tokenRecord.refresh_token || tokenRecord.encrypted_refresh_token || null;
      let expiresAt = tokenRecord.expires_at || tokenRecord.token_expires_at || null;
      const expiresMs = expiresAt ? new Date(expiresAt).getTime() : 0;
      const isExpiring = !accessToken || !expiresMs || Date.now() > expiresMs - 60000;

      if (isExpiring && refreshToken && clientId && clientSecret) {
        try {
          const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
          oauth2Client.setCredentials({ refresh_token: refreshToken });
          const { credentials } = await oauth2Client.refreshAccessToken();
          if (credentials.access_token) {
            accessToken = credentials.access_token;
            expiresAt = credentials.expiry_date
              ? new Date(credentials.expiry_date).toISOString()
              : new Date(Date.now() + 3600000).toISOString();

            await supabaseServer
              .from('integration_tokens')
              .update({
                access_token: accessToken,
                encrypted_access_token: accessToken,
                expires_at: expiresAt,
                token_expires_at: expiresAt,
                token_expiry: expiresAt,
                updated_at: new Date().toISOString(),
              })
              .eq('id', tokenRecord.id);
          }
        } catch (refreshErr: any) {
          return res.status(200).json({
            success: false,
            connected: false,
            has_refresh_token: Boolean(refreshToken),
            account_email: tokenRecord.account_email,
            error: 'refresh_failed',
            message: `Google token refresh failed (${refreshErr.message}). Please reconnect Google Workspace.`,
          });
        }
      }

      return res.status(200).json({
        success: true,
        connected: Boolean(accessToken && (!expiresAt || new Date(expiresAt).getTime() > Date.now())),
        account_email: tokenRecord.account_email,
        access_token: accessToken,
        expires_at: expiresAt,
        has_refresh_token: Boolean(refreshToken),
        scopes: tokenRecord.scopes || [],
      });
    }

    // -------------------------------------------------------------------------
    // DELETE: Sign Out / Disconnect Google Workspace & Purge User Token
    // -------------------------------------------------------------------------
    if (req.method === 'DELETE') {
      const { data: existing } = await supabaseServer
        .from('integration_tokens')
        .select('access_token, encrypted_access_token, refresh_token, encrypted_refresh_token')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();

      const tokenToRevoke = existing?.refresh_token || existing?.encrypted_refresh_token || existing?.access_token;
      if (tokenToRevoke) {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          });
        } catch {
          // Ignore network revocation failures; still purge from DB
        }
      }

      await supabaseServer
        .from('integration_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'google');

      return res.status(200).json({
        success: true,
        disconnected: true,
        message: 'Google Workspace session disconnected and tokens purged from server vault.',
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed', message: 'Supported: GET, POST, DELETE' });
    }

    // -------------------------------------------------------------------------
    // POST action=vault_access_token: Vault GIS Popup Token Safely
    // -------------------------------------------------------------------------
    const body = req.body || {};
    if (body.action === 'vault_access_token' && body.access_token) {
      const expiresAt = body.expires_at || new Date(Date.now() + 3600000).toISOString();
      const { error: upsertErr } = await supabaseServer
        .from('integration_tokens')
        .upsert(
          {
            user_id: userId,
            provider: 'google',
            access_token: body.access_token,
            encrypted_access_token: body.access_token,
            expires_at: expiresAt,
            token_expires_at: expiresAt,
            token_expiry: expiresAt,
            account_email: body.account_email || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,provider' }
        );

      if (upsertErr) {
        return res.status(500).json({ success: false, error: 'DB Persist Failed', message: upsertErr.message });
      }

      return res.status(200).json({
        success: true,
        provider: 'google',
        account_email: body.account_email || null,
        expires_at: expiresAt,
        has_refresh_token: false,
      });
    }

    // -------------------------------------------------------------------------
    // POST (Primary PKCE Authorization Code Exchange)
    // -------------------------------------------------------------------------
    const code = req.query?.code || body.code;
    const codeVerifier = body.code_verifier || body.codeVerifier;
    const redirectUri = req.query?.redirect_uri || body.redirect_uri || 'https://yashwanth-hub.vercel.app';
    const effectiveClientId = (body.client_id || clientId).trim();

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing required "code" parameter for token exchange.',
      });
    }

    if (!effectiveClientId || !clientSecret) {
      return res.status(503).json({
        success: false,
        error: 'Google OAuth Server Secret Missing',
        message:
          'GOOGLE_CLIENT_SECRET is not configured in Vercel serverless environment variables. Configure GOOGLE_CLIENT_SECRET and redeploy.',
        hint: 'Go to Vercel Project Settings -> Environment Variables and add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from Google Cloud Console.',
      });
    }

    const oauth2Client = new google.auth.OAuth2(effectiveClientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken({
      code: String(code),
      codeVerifier: codeVerifier ? String(codeVerifier) : undefined,
      redirect_uri: String(redirectUri),
    });
    oauth2Client.setCredentials(tokens);

    let userEmail: string | undefined;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const profileRes = await oauth2.userinfo.get();
      userEmail = profileRes.data.email || undefined;
    } catch {
      // Non-fatal if scope omitted profile
    }

    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : new Date(Date.now() + 3600000).toISOString();
    const scopesList = tokens.scope ? tokens.scope.split(' ') : [];

    let refreshToken = tokens.refresh_token || null;
    if (!refreshToken) {
      const { data: existing } = await supabaseServer
        .from('integration_tokens')
        .select('refresh_token, encrypted_refresh_token')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .single();
      refreshToken = existing?.refresh_token || existing?.encrypted_refresh_token || null;
    }

    const { error: upsertErr } = await supabaseServer
      .from('integration_tokens')
      .upsert(
        {
          user_id: userId,
          provider: 'google',
          access_token: tokens.access_token || null,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          token_type: tokens.token_type || 'Bearer',
          scopes: scopesList,
          account_email: userEmail || null,
          encrypted_access_token: tokens.access_token || null,
          encrypted_refresh_token: refreshToken,
          token_expires_at: expiresAt,
          token_expiry: expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' }
      );

    if (upsertErr) {
      return res.status(500).json({
        success: false,
        error: 'Database Persistence Failed',
        message: upsertErr.message,
      });
    }

    // Clear needs_authorization status on any Google automations owned by this user
    await supabaseServer
      .from('automations')
      .update({ status: 'active' })
      .eq('user_id', userId)
      .in('action_type', ['google_calendar', 'google_gmail', 'google_workspace']);

    return res.status(200).json({
      success: true,
      message: 'Google Workspace tokens exchanged via PKCE and vaulted securely in integration_tokens.',
      provider: 'google',
      account_email: userEmail || null,
      access_token: tokens.access_token || null,
      has_refresh_token: Boolean(refreshToken),
      expires_at: expiresAt,
    });
  } catch (error: any) {
    console.error('[Google Auth Token] Exchange error:', error);
    return res.status(500).json({
      success: false,
      error: 'Token Exchange Failed',
      message: error.message || 'Error exchanging authorization code with Google.',
      hint: 'Verify that redirect_uri matches Authorized redirect URIs in Google Cloud Console with zero trailing slash mismatch.',
    });
  }
}
