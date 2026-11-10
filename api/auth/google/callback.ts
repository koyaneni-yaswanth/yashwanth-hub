// Vercel Serverless Function: Google OAuth Direct Callback Handler
// Endpoint: /api/auth/google/callback
// Exchanges code cleanly if invoked via server redirect and forwards safe status query params.

import { google } from 'googleapis';

export default async function handler(req: any, res: any) {
  const code = req.query?.code;
  const error = req.query?.error;

  if (error) {
    return res.redirect(`/?tab=integrations&google_error=${encodeURIComponent(String(error))}`);
  }

  if (!code) {
    return res.redirect('/?tab=integrations&google_error=missing_auth_code');
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) {
    return res.redirect(
      '/?tab=integrations&google_error=server_misconfigured&google_error_desc=' +
        encodeURIComponent('GOOGLE_CLIENT_SECRET is missing from Vercel Environment Variables.')
    );
  }

  try {
    const host = req.headers?.['x-forwarded-host'] || req.headers?.host || 'yashwanth-hub.vercel.app';
    const proto = req.headers?.['x-forwarded-proto'] || (host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https');
    const redirectUri = `${proto}://${host}/api/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth2Client.getToken(String(code));

    if (!tokens.access_token) {
      return res.redirect('/?tab=integrations&google_error=no_access_token');
    }

    // Security: Redirect back to SPA with short-lived access token only; never pass refresh_token in URL
    const hashParams = new URLSearchParams({
      access_token: tokens.access_token,
      expires_in: String(tokens.expiry_date ? Math.max(60, Math.round((tokens.expiry_date - Date.now()) / 1000)) : 3600),
      token_type: tokens.token_type || 'Bearer',
    });

    return res.redirect(`/?tab=integrations#${hashParams.toString()}`);
  } catch (err: any) {
    console.error('[Google Callback] Token exchange failed:', err);
    return res.redirect(
      `/?tab=integrations&google_error=token_exchange_failed&google_error_desc=${encodeURIComponent(err.message || 'Exchange error')}`
    );
  }
}
