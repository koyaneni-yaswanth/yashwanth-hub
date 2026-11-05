// Vercel Serverless Function: NeoSapien OAuth 2.0 PKCE & Authentication Service
// Endpoint: /api/neosapien/auth

import crypto from 'crypto';

const NEOSAPIEN_BASE_URL = 'https://api.neosapien.xyz';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const action = req.query.action || (req.body && req.body.action) || 'start';

  try {
    // 1. ACTION: Start OAuth Flow (Dynamic Registration + PKCE Generation)
    if (action === 'start') {
      const redirectUri = req.query.redirect_uri || 'https://yashwanth-hub.vercel.app/api/neosapien/callback';

      // A. Register dynamic client
      let clientId = 'YashwanthHubClient';
      try {
        const regResp = await fetch(`${NEOSAPIEN_BASE_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (regResp.ok) {
          const regData = await regResp.json();
          if (regData.client_id) {
            clientId = regData.client_id;
          }
        }
      } catch (regErr) {
        console.warn('Dynamic registration warning:', regErr);
      }

      // B. Generate PKCE verifier (43-128 chars base64url) and SHA256 challenge
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      const state = `st_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

      // C. Construct authorization URL
      const authParams = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
      });

      const authorizationUrl = `${NEOSAPIEN_BASE_URL}/mcp/authorize?${authParams.toString()}`;

      return res.status(200).json({
        success: true,
        authorizationUrl,
        clientId,
        codeVerifier,
        codeChallenge,
        state,
        redirectUri,
      });
    }

    // 2. ACTION: Exchange Authorization Code for MCP JWT Token
    if (action === 'exchange') {
      const { code, code_verifier, redirect_uri } = req.body || {};

      if (!code || !code_verifier) {
        return res.status(400).json({
          error: 'Missing Parameters',
          message: 'Both "code" and "code_verifier" are required for token exchange.',
        });
      }

      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier,
        redirect_uri: redirect_uri || 'https://yashwanth-hub.vercel.app/api/neosapien/callback',
      });

      const tokenResp = await fetch(`${NEOSAPIEN_BASE_URL}/mcp/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString(),
      });

      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        return res.status(tokenResp.status).json({
          error: 'Token Exchange Failed',
          message: errText,
        });
      }

      const tokenData = await tokenResp.json();

      return res.status(200).json({
        success: true,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type || 'Bearer',
        expiresIn: tokenData.expires_in,
        issuedAt: new Date().toISOString(),
      });
    }

    // 3. ACTION: Exchange NeoSapien API Key for JWT Bearer Token
    if (action === 'apikey') {
      const { apiKey } = req.body || {};

      if (!apiKey || !apiKey.trim()) {
        return res.status(400).json({
          error: 'Missing API Key',
          message: 'A valid NeoSapien API Key is required.',
        });
      }

      const keyResp = await fetch(`${NEOSAPIEN_BASE_URL}/auth/access-token`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey.trim(),
        },
      });

      if (!keyResp.ok) {
        const errData = await keyResp.json().catch(() => ({}));
        return res.status(keyResp.status).json({
          error: 'API Key Authentication Failed',
          message: errData.detail || `Server returned HTTP ${keyResp.status}`,
        });
      }

      const keyData = await keyResp.json();

      return res.status(200).json({
        success: true,
        accessToken: keyData.access_token,
        tokenType: keyData.token_type || 'Bearer',
        issuedAt: new Date().toISOString(),
      });
    }

    // 4. ACTION: Refresh Expired Token
    if (action === 'refresh') {
      const { refresh_token } = req.body || {};

      if (!refresh_token) {
        return res.status(400).json({
          error: 'Missing Refresh Token',
          message: 'refresh_token is required.',
        });
      }

      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
      });

      const refreshResp = await fetch(`${NEOSAPIEN_BASE_URL}/mcp/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: refreshParams.toString(),
      });

      if (!refreshResp.ok) {
        return res.status(refreshResp.status).json({
          error: 'Token Refresh Failed',
          message: 'Refresh token expired or invalid. Please re-authenticate.',
        });
      }

      const tokenData = await refreshResp.json();

      return res.status(200).json({
        success: true,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || refresh_token,
        expiresIn: tokenData.expires_in,
        issuedAt: new Date().toISOString(),
      });
    }

    return res.status(400).json({
      error: 'Invalid Action',
      message: `Unknown action: "${action}". Supported actions: start, exchange, apikey, refresh.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred in /api/neosapien/auth',
    });
  }
}
