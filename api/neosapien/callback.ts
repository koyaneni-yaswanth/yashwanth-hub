// Vercel Serverless Function: NeoSapien OAuth Callback Handler
// Endpoint: /api/neosapien/callback

/** Escapes text for an HTML body (query values are attacker-controlled). */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON for an inline <script>: "<" is escaped so a value can't close the script tag. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(String(value ?? ''))
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const firstValue = (v: unknown) => (Array.isArray(v) ? v[0] : v);

export default async function handler(req: any, res: any) {
  const query = req.query || {};
  const code = firstValue(query.code);
  const state = firstValue(query.state);
  const error = firstValue(query.error);
  const error_description = firstValue(query.error_description);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (error) {
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>NeoSapien Authorization Failed</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; max-width: 440px; text-align: center; }
          h2 { color: #f87171; margin-top: 0; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
          .btn { display: inline-block; margin-top: 16px; padding: 10px 20px; background: #38bdf8; color: #0f172a; font-weight: bold; border-radius: 8px; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Authorization Failed</h2>
          <p>${escapeHtml(error_description || error || 'Unknown OAuth error received from NeoSapien.')}</p>
          <a class="btn" href="/?tab=integrations">Return to Yashwanth Hub</a>
        </div>
      </body>
      </html>
    `;
    return res.status(400).send(errorHtml);
  }

  const successHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>NeoSapien Authorization Successful</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 28px; max-width: 440px; text-align: center; }
        h2 { color: #34d399; margin-top: 0; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
        .spinner { border: 3px solid rgba(255,255,255,0.1); width: 32px; height: 32px; border-radius: 50%; border-left-color: #38bdf8; animation: spin 1s linear infinite; margin: 20px auto 0; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>NeoSapien Connected!</h2>
        <p>Completing secure authorization and synchronizing your wearable memories...</p>
        <div class="spinner"></div>
      </div>
      <script>
        const authData = {
          type: 'NEOSAPIEN_AUTH_CODE',
          code: ${scriptJson(code)},
          state: ${scriptJson(state)}
        };

        // Notify parent window if opened in a popup
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(authData, '*');
          setTimeout(() => {
            window.close();
          }, 800);
        } else {
          // Direct navigation fallback (e.g. mobile browser)
          const target = '/?tab=integrations&neo_code=' + encodeURIComponent(authData.code) + '&neo_state=' + encodeURIComponent(authData.state);
          setTimeout(() => {
            window.location.href = target;
          }, 600);
        }
      </script>
    </body>
    </html>
  `;

  return res.status(200).send(successHtml);
}
