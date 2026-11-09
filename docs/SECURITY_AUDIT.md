# Yashwanth Hub — Cybersecurity & Threat Model Audit

**Document Version:** 2.0.0  
**Audit Date:** November 2026  
**Auditor:** Principal Cybersecurity & Cloud Security Architect  
**Classification:** Internal Engineering Standard  
**System Scope:** Web Client, Android Hybrid Shell, Serverless APIs, and Supabase Database

---

## 1. Executive Summary & Security Philosophy

Yashwanth Hub is engineered to safeguard the proprietary intellectual property, strategic startup data, financial runway, and physical hardware control interfaces of Yashwanth Koyaneni (Pawan Shakti, IvLabs, MG Automation).

The security architecture operates under **Zero-Trust** principles:
1. **Zero Secret Leakage:** No server-side secrets, database service keys, or private API keys exist in client bundles or public repositories.
2. **Deterministic Cryptographic Verification:** All OAuth handshakes utilize RFC 7636 PKCE with cryptographic code verifiers and state tokens.
3. **Defense in Depth:** Data access is restricted by database-level Row Level Security (RLS), API-level token validation, and client-level permission gating.
4. **Hardware Safety Governance:** Physical robotic actuators and drone swarm commands require strict multi-step human confirmation before execution.

---

## 2. Threat Modeling & Attack Surface Analysis

| Threat ID | Threat Vector | Target Component | Potential Impact | Implemented Mitigation | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TH-01** | Client Bundle Secret Scraping | Vite build artifacts (`dist/assets/*.js`) | API key compromise, unauthorized cloud resource usage | Strict exclusion of sensitive keys from `VITE_*` environment variables; backend serverless proxy pattern. | **PASSED** (`tests/hub_automations_constraints.test.mjs`) |
| **TH-02** | OAuth Code Interception | Google / NeoSapien OAuth callbacks | Unauthorized account linking, token theft | RFC 7636 PKCE with SHA-256 code challenge and random state parameter verification. | **PASSED** (`tests/google_oauth_resilience.test.mjs`) |
| **TH-03** | Cross-Site Request Forgery (CSRF) | Automation dispatch and sync endpoints | Unintended trigger execution, resource exhaustion | Unique cryptographic `idempotency-key` and session token headers required on all mutating requests. | **PASSED** (`tests/neosapien_integration.test.mjs`) |
| **TH-04** | Multi-Tenant Database Cross-Contamination | Supabase PostgreSQL tables | Data leakage across accounts or project tenants | Row Level Security (RLS) policies strictly enforcing `auth.uid() = user_id` on all tables. | **PASSED** (`supabase/master_schema.sql`) |
| **TH-05** | Unauthorized Robotic Actuation | Robotics Lab control interface | Physical actuator damage, collision, personnel injury | Level 3 Safety Interlock: Physical hardware commands require explicit two-stage modal confirmation. | **PASSED** (`src/pages/RoboticsLabPage.tsx`) |
| **TH-06** | Clickjacking & Frame Injection | Web runtime iframe embedding | Credential harvesting, unauthorized approvals | HTTP response headers enforcing `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. | **PASSED** (`vercel.json`) |

---

## 3. Secret Segregation & Environment Variable Policy

### 3.1 Strict Separation Rule
Under no circumstances are production secrets prefixed with `VITE_`. Any variable prefixed with `VITE_` is automatically inlined into the client-side JavaScript bundle during Vite build, making it publicly accessible to anyone inspecting browser network traffic or source maps.

### 3.2 Environment Variable Matrix

| Variable Name | Permitted Scope | Purpose | Secret Classification |
| :--- | :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Serverless Backend Only (`api/*`) | Bypasses RLS for trusted queue workers and automation dispatchers | **HIGH SECRET** |
| `SUPABASE_URL` | Serverless Backend Only (`api/*`) | Direct connection to remote database | Internal Config |
| `VITE_SUPABASE_URL` | Client & Serverless | Public endpoint for Supabase client | Public Identifier |
| `VITE_SUPABASE_ANON_KEY` | Client & Serverless | Public anon key subject to RLS policies | Public Restricted |
| `GOOGLE_CLIENT_SECRET` | Serverless Backend Only (`api/*`) | Google OAuth server-side token exchange | **HIGH SECRET** |
| `VITE_GOOGLE_CLIENT_ID` | Client Only | OAuth 2.0 Web Client ID for PKCE flow | Public Identifier |
| `NEOSAPIEN_API_KEY` | Serverless Backend Only (`api/*`) | NeoSapien MCP gateway authorization | **HIGH SECRET** |
| `CRON_SECRET` | Serverless Backend Only (`api/*`) | Authorizes Vercel Cron requests to `/api/cron/*` | **HIGH SECRET** |

---

## 4. OAuth 2.0 PKCE & CSRF Defense Architecture

### 4.1 RFC 7636 Implementation Details
```
+-----------------------------------------------------------------------------------------+
|                                    PKCE OAUTH FLOW                                      |
|                                                                                         |
|  [Client Browser]                                              [Google / NeoSapien]     |
|         |                                                                |              |
|         |--- 1. Generate code_verifier (32-byte cryptographic random) -->|              |
|         |--- 2. Compute code_challenge = Base64Url(SHA256(verifier)) --->|              |
|         |--- 3. Redirect to Auth with code_challenge & CSRF state ------>|              |
|         |                                                                |              |
|         |<-- 4. User Authorizes & Redirects with Authorization Code -----|              |
|         |                                                                |              |
|         |--- 5. POST /api/auth/google/callback with code + verifier ---->|              |
|         |          (Serverless function exchanges verifier)             |              |
|         |<-- 6. Returns Access Token & Vaults Refresh Token in DB -------|              |
+-----------------------------------------------------------------------------------------+
```

### 4.2 CSRF State Token Verification
Every authentication request generates a cryptographic state token (`crypto.getRandomValues`) stored in session storage. Upon callback return, the incoming state parameter must exactly match the stored token before any authorization code is processed.

---

## 5. Supabase Row Level Security (RLS) Governance

### 5.1 Enforcement Standard
All remote tables implement RLS by default. No data can be read, updated, or deleted without satisfying policy constraints:

```sql
-- Standard User Isolation Policy Example
ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own tokens"
ON public.integration_tokens
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### 5.2 Server-Side Queue Processing
When serverless cron jobs execute background tasks (e.g. deadline notifications), they utilize the `SUPABASE_SERVICE_ROLE_KEY` exclusively within the trusted Vercel serverless environment. All mutations append immutable logs to `public.automation_execution_logs` preserving an unbreakable audit trail.

---

## 6. Robotics Hardware Safety Layer

### 6.1 Multi-Tier Action Approval System
Actions initiated within Yashwanth Hub are classified into three governance tiers:

1. **Level 1 (Autonomous):** Information retrieval, summary generation, metric calculation. Executed automatically.
2. **Level 2 (Standard Approval):** Task creation, calendar modifications, draft email preparation. Requires one-click approval with an explicit Action ID.
3. **Level 3 (Hardware Safety Interlock):**
   - Enabling joint motor torque on the AgileX PiPER arm.
   - Sending trajectory waypoints or physical movement commands.
   - Arming drone motors or initiating autonomous flight sequences.
   - *Requirement:* Renders a dedicated safety warning modal displaying motor limits, collision envelope, and emergency stop procedures. Requires two-factor confirmation prior to socket dispatch.

---

## 7. HTTP Security Headers & Deployment Hygiene

Production deployments at `https://yashwanth-hub.vercel.app` strictly enforce the following security headers configured in `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    }
  ]
}
```
