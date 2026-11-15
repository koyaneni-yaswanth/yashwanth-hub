# YASHWANTH HUB — CLOUD SECURITY & SECRETS MANAGEMENT REPORT
**Audit Date**: November 15, 2026  
**Auditor**: Application Security Engineer  
**Classification**: High-Assurance Production Baseline  

---

## 1. Security Architecture & Threat Model

Yashwanth Hub processes sensitive executive data, personal calendars, OAuth tokens, and IoT hardware telemetry. The security architecture enforces multi-layered defense-in-depth:

```
[ Public Web / Mobile Client ]
              │
    HTTPS + HSTS + CSP
              ▼
[ Vercel Edge Runtime (Mumbai BOM1) ]
      ├── Static Assets (Precached via SW)
      └── 11 Serverless API Routes (Node.js 20)
              │
    Strict Environment Isolation
              ▼
[ Supabase PostgreSQL 17 (Tokyo ap-northeast-1) ]
      ├── 100% Row Level Security (auth.uid() = user_id)
      ├── Covering Indexes on Foreign Keys
      └── Realtime Publication Access Control
```

---

## 2. Hard Constraint Verification: Secrets Management

### 2.1 Client Bundle Sanitization
- **Rule**: No private API keys, client secrets, service role keys, or OAuth refresh tokens inside client-side JS bundles or files starting with `VITE_`.
- **Verification Method**: Automated regex audit scanning `src/` and compiled `dist/assets/index-*.js`.
- **Finding**: **0 leaked secrets**. Only public identifiers (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`) are bundled in the frontend.

### 2.2 Server Environment Variables in Vercel Production
The following server secrets are strictly configured in Vercel's secure environment vault (`Production` tier) and never revealed to the client:
1. `CRON_SECRET`: 64-character cryptographic token protecting scheduled serverless workers (`/api/cron/process-triggers`).
2. `SUPABASE_ANON_KEY`: Public anon JWT for database communication.
3. `SUPABASE_URL`: Dedicated cloud database endpoint (`https://xjhkxnfahkkgwbbtmhtk.supabase.co`).
4. `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`: Client build configurations.

---

## 3. Row Level Security (RLS) & Multi-Tenant Isolation

### 3.1 Database Policy Audit
Every table in the `public` schema has Row Level Security enabled. Policies enforce strict identity checks:
```sql
using (auth.uid() = user_id)
with check (auth.uid() = user_id)
```

### 3.2 Vulnerability Elimination: `integration_tokens`
- **Previous Finding**: The legacy migration allowed `using (auth.uid() = user_id or auth.uid() is null)` which could allow unauthenticated users or service tokens to read OAuth credentials.
- **Resolution Applied**: Policy replaced with `Strict user ownership for integration_tokens` enforcing `auth.uid() = user_id`. Server background workers access data exclusively via Supabase Service Role client which bypasses RLS securely on the backend only.
- **Test Evidence**: `tests/v2_auth_and_rls.test.mjs` verifies that no SQL in the active migration contains `auth.uid() is null`.

### 3.3 Supabase Database Security Advisor Audit
Running `get_advisors(type: 'security')` on project `xjhkxnfahkkgwbbtmhtk` returned:
```json
{
  "result": {
    "lints": []
  }
}
```
Zero missing RLS policies, zero public tables without RLS, and zero misconfigured security definer views.

---

## 4. Authentication & OAuth Hardening

### 4.1 RFC 7636 PKCE Authentication Flow
- All Google OAuth exchanges utilize Proof Key for Code Exchange (PKCE) using SHA-256 (`S256`).
- Cryptographic state parameter generated with high entropy (`crypto.randomUUID()`) to prevent Cross-Site Request Forgery (CSRF).
- Client-side storage of refresh tokens is completely disabled. Tokens are exchanged and persisted securely server-side.

### 4.2 Webhook Signature Verification
- NeoSapien wearable memory webhooks (`/api/neosapien/mcp?action=webhook`) enforce HMAC-SHA256 signature verification with a 5-minute replay tolerance window.
- Requests with invalid signatures or expired timestamps are rejected with HTTP 401.

---

## 5. Security Headers & Network Transport

The live production deployment emits the following HTTP response headers:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
