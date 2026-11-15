# Yashwanth Hub — Integration Verification Matrix & Protocol Specification

**Application:** Yashwanth Hub  
**Date:** November 15, 2026  
**Document Target:** `docs/INTEGRATION_VERIFICATION_MATRIX.md`  

---

## 1. Integration Status Overview

| Provider / Protocol | Target Capabilities | Status | Forensic Root Cause / Active Fallback |
| :--- | :--- | :--- | :--- |
| **Google Workspace (OAuth Code Flow)** | Calendar, Tasks, Gmail, Drive sync via server | `BLOCKED (401 invalid_client)` | `GOOGLE_CLIENT_SECRET` missing in Vercel production environment |
| **Google Identity Services (GIS)** | Browser-based calendar & tasks access | `READY / CLIENT-SIDE` | Operates directly in browser via GIS popup without server secret |
| **Gemini AI (Google)** | Generative conversational responses | `STANDBY / UNCONFIGURED` | `GEMINI_API_KEY` unconfigured; falls back to Grounded Deterministic Engine |
| **OpenAI / Anthropic** | Generative conversational fallbacks | `STANDBY / UNCONFIGURED` | API keys unconfigured; falls back to Grounded Deterministic Engine |
| **NeoSapien MCP & Wearable** | Ambient audio MoM, memory sync, tool calls | `READY / VERIFIED` | Official schemas exposed; HMAC-SHA256 webhook active; Level 2 safety gate |
| **Supabase Cloud Database** | Realtime data, auth, RLS policies, audit | `ACTIVE / VERIFIED` | Ref `xjhkxnfahkkgwbbtmhtk`, 27 tables, 100% RLS enabled, user-scoped client |

---

## 2. Google Workspace Integration Forensic Investigation

### 2.1 The Issue: 401 invalid_client
When initiating authorization code exchange (`https://oauth2.googleapis.com/token`) in serverless functions (`api/auth/google/token.ts` and `api/auth/google/callback.ts`), Google returns:
```json
{
  "error": "invalid_client",
  "error_description": "Unauthorized"
}
```

### 2.2 Forensic Probe Findings
1. Direct probe to Google's OAuth 2.0 authorization endpoint:
   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com&redirect_uri=https://yashwanth-hub.vercel.app&response_type=code&scope=openid%20email
   ```
   **Result:** HTTP 302 redirecting to `https://accounts.google.com/v3/signin/identifier?flowName=GeneralOAuthLite&app_domain=https://yashwanth-hub.vercel.app`.
2. **Analysis:** The Client ID itself is recognized and valid on Google's authorization endpoint, and the redirect URI domain matches the registered app domain.
3. **Root Cause:** The Client ID was created as a "Web application" in Google Cloud Console. Google requires a valid `client_secret` when exchanging an authorization `code` for tokens at `https://oauth2.googleapis.com/token`. Because `GOOGLE_CLIENT_SECRET` is not set in Vercel environment variables, the server request fails with `401 invalid_client`.

### 2.3 Exact Resolution Protocol
To activate the server-side Google Workspace sync:
1. Log into [Google Cloud Console](https://console.cloud.google.com/) under the project containing OAuth Client `236257519636-...`.
2. Navigate to **APIs & Services > Credentials**.
3. Under **OAuth 2.0 Client IDs**, click the Web client used by Yashwanth Hub.
4. Copy the **Client Secret** (or generate a new secret if unknown).
5. Verify Authorized Redirect URIs include:
   - `https://yashwanth-hub.vercel.app`
   - `https://yashwanth-hub.vercel.app/api/auth/google/callback`
6. Add the secret to Vercel:
   ```bash
   npx vercel env add GOOGLE_CLIENT_SECRET production
   ```
7. Re-deploy or promote the deployment to inject the environment variable.

### 2.4 Browser-Based Fallback (No Server Secret Required)
The frontend implements Google Identity Services (GIS) token flow via `GoogleAuthService.requestGisToken()` in `src/services/google/googleAuthService.ts`. This requests a short-lived bearer access token directly in the browser without exchanging an authorization code on the server, permitting immediate client-side sync with Google Tasks and Calendar.

---

## 3. AI Providers & Grounded Chief of Staff Execution

### 3.1 Zero-Hallucination Fallback Architecture
In production, when neither `GEMINI_API_KEY`, `OPENAI_API_KEY`, nor `ANTHROPIC_API_KEY` are defined in the server environment:
- The system returns `configuredProviders: { gemini: false, openai: false, anthropic: false }` from `GET /api/ai/chat?action=tools`.
- Chat queries are directed to `buildDeterministicGroundedResponse` in `api/_lib/aiTools.ts`.
- The engine uses 7 deterministic intent processors to parse user questions against actual workspace data:
  1. Task & Event Creation requests (outputs Level 2 `propose_create_task` previews).
  2. Meeting Intelligence & Action Item Extraction.
  3. Approaching Deadlines & Calendar Horizons (14-day scan).
  4. Goal Decomposition & Milestone Breakdown (7-day and 14-day checkpoints).
  5. Document Search & Technical Knowledge Retrieval (searches docs, notes, specifications).
  6. Comprehensive Project Review & Baseline Comparison.
  7. Project Blocker Inquiries.

### 3.2 Activating Generative AI Providers
To enable generative natural-language synthesis:
```bash
npx vercel env add GEMINI_API_KEY production
```
Supported variables: `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

---

## 4. NeoSapien Wearable & MCP Protocol

### 4.1 MCP Tool Catalog
The official NeoSapien tool catalog is exposed via `/api/ai/chat?action=tools`:
- `hub_add_task`: Drafts structured tasks with priority and due date.
- `hub_search_notes`: Queries notes and founder directives.
- `hub_record_expense`: Logs INR expenses with categories.
- `hub_get_schedule`: Retrieves daily events and meetings.
- `hub_get_project_status`: Summarizes project progress and blockers.

### 4.2 Webhook Security & Safety
- **Endpoint:** `/api/neosapien/mcp`
- **Authentication:** HMAC-SHA256 signature verification over request body using `NEOSAPIEN_WEBHOOK_SECRET`.
- **Level 2 Safety Gate:** All ambient audio commitments parsed by NeoSapien are assigned `status: 'pending_approval'`. They are never inserted as completed or active without founder confirmation in the UI.
