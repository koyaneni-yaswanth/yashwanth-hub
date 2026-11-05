// Vercel Serverless Function: Google OAuth Callback Handler
// Endpoint: /api/auth/google/callback
// Handles HTTP redirect from Google OAuth consent screen, exchanges code, and redirects to Hub frontend.

import { google } from 'googleapis';
import { supabaseServer } from '../../_lib/db.ts';

export default async function handler(req: any, res: any) {
  const code = req.query.code;
  const error = req.query.error;

  if (error) {
    return res.redirect(`/integrations?error=${encodeURIComponent(String(error))}`);
  }

  if (!code) {
    return res.redirect('/integrations?error=missing_auth_code');
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const host = req.headers?.host || 'yashwanth-hub.vercel.app';
    const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
    const redirectUri = isLocal
      ? `http://${host}/api/auth/google/callback`
      : 'https://yashwanth-hub.vercel.app/api/auth/google/callback';

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    let userEmail: string | undefined = undefined;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const profile = await oauth2.userinfo.get();
      userEmail = profile.data.email || undefined;
    } catch (e) {
      console.warn('[Google Callback] Could not fetch profile:', e);
    }

    const defaultUserId = '00000000-0000-0000-0000-000000000001';
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 3600000).toISOString();

    let refreshToken = tokens.refresh_token || null;
    if (!refreshToken) {
      const { data: existing } = await supabaseServer
        .from('integration_tokens')
        .select('refresh_token, encrypted_refresh_token')
        .eq('user_id', defaultUserId)
        .eq('provider', 'google')
        .single();
      refreshToken = existing?.refresh_token || existing?.encrypted_refresh_token || null;
    }

    await supabaseServer
      .from('integration_tokens')
      .upsert({
        user_id: defaultUserId,
        provider: 'google',
        access_token: tokens.access_token || null,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        token_type: tokens.token_type || 'Bearer',
        scopes: tokens.scope ? tokens.scope.split(' ') : [],
        account_email: userEmail || null,
        encrypted_access_token: tokens.access_token || null,
        encrypted_refresh_token: refreshToken,
        token_expires_at: expiresAt,
        token_expiry: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,provider' });

    // Redirect user back to Hub with success query flag
    return res.redirect('/integrations?google_connected=true');
  } catch (err: any) {
    console.error('[Google Callback] Token exchange failed:', err);
    return res.redirect(`/integrations?error=${encodeURIComponent(err.message || 'token_exchange_failed')}`);
  }
}
