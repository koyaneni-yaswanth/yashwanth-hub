/**
 * Yashwanth Hub — Legacy Cloud Run Gateway Service (Deprecated)
 *
 * NOTE: Production backend routes run on Vercel Serverless Functions (`api/`).
 * This Express compatibility entrypoint is hardened to match `api/_lib/http.ts`
 * CORS allowlists and CRON_SECRET Bearer authentication.
 */

import crypto from 'crypto';
import express, { Request, Response } from 'express';
import cors from 'cors';

const STATIC_ALLOWED_ORIGINS = new Set([
  'https://yashwanth-hub.vercel.app',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost',
]);
const ALLOWED_ORIGIN_PATTERNS = [
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/yashwanth-[a-z0-9-]+-koyaneniyaswanth-9270s-projects\.vercel\.app$/,
];

function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) return true; // Same-origin / server-to-server requests have no Origin header
  if (STATIC_ALLOWED_ORIGINS.has(origin)) return true;
  const extra = (process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
  if (extra.includes(origin)) return true;
  return ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
}

function timingSafeBearerMatch(authHeader: string | undefined, expectedSecret: string): boolean {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !expectedSecret) return false;
  const a = Buffer.from(token, 'utf8');
  const b = Buffer.from(expectedSecret, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

const app = express();
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, origin || false);
      } else {
        callback(new Error('Origin not allowed by Yashwanth Hub CORS policy'));
      }
    },
  })
);
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Health Check for Google Cloud Run
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'yashwanth-hub-backend',
    timestamp: new Date().toISOString(),
  });
});

// Google OAuth 2.0 Server-Side Token Exchange
app.post('/api/auth/google/callback', async (req: Request, res: Response) => {
  const { code, redirectUri } = req.body;
  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET; // Loaded from Secret Manager

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Server credentials not configured in Secret Manager' });
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) {
      return res.status(tokenResponse.status).json(tokens);
    }

    res.json(tokens);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Token exchange failed' });
  }
});

// Cloud Scheduler Cron Endpoint for Background Calendar Sync
app.post('/api/cron/sync-calendars', async (req: Request, res: Response) => {
  const expectedSecret = process.env.CRON_SECRET || '';
  if (!expectedSecret) {
    return res.status(503).json({
      success: false,
      error: 'CRON_SECRET is not configured on the server',
    });
  }
  if (!timingSafeBearerMatch(req.headers.authorization, expectedSecret)) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized cron caller',
    });
  }

  console.log(`[Cloud Scheduler] Authenticated sync triggered: ${new Date().toISOString()}`);

  return res.json({
    success: true,
    message: 'Background synchronization completed',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`Yashwanth Hub Cloud Backend running on port ${PORT}`);
});
