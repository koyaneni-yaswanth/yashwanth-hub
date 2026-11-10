# Yashwanth Hub V2 — Google OAuth & Supabase Authentication Forensic Report

**Branch:** `feat/v2-real-ai-os`  
**Audit Date:** 10 November 2026  
**Production URL:** `https://yashwanth-hub.vercel.app`  
**Local Dev URL:** `http://localhost:5173`  
**Supabase Project Reference:** `xjhkxnfahkkgwbbtmhtk` (`https://xjhkxnfahkkgwbbtmhtk.supabase.co`)

---

## 1. Root Causes Discovered in V1 Codebase & Environment

Inspecting the actual code, database schema, local `.env*` files, and Vercel deployment state identified **five concrete root causes** behind Google OAuth failures and session drop-offs:

1. **Vercel Production Environment Variables Were Empty (`No Environment Variables found`)**:
   - Verified via `npx vercel env ls` and probing `https://yashwanth-hub.vercel.app/api/cron/process-triggers` (returned `TypeError: fetch failed` because `api/_lib/db.ts` fell back to `https://sample-project.supabase.co`).
   - Missing on Vercel: `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`.
   - Local `.env` and `.env.local` contain only 4 keys (`VITE_SUPABASE_URL`, `SUPABASE_URL`, `VITE_GOOGLE_CLIENT_ID`, `VITE_APP_URL`); `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` were absent, preventing live Supabase Auth session persistence locally as well.
2. **Legacy Implicit Flow (`response_type=token`) Instead of Authorization Code + PKCE**:
   - V1 `GoogleAuthService.getAuthUrl()` sent `response_type=token` directly to Google without `code_challenge` (PKCE) or offline refresh token exchange (`/api/auth/google/token`), leaving GIS/redirect sessions valid for only ~1 hour with zero server refresh capability.
   - Fixed in V2: `GoogleAuthService.buildPkceAuthUrl()` uses RFC 7636 PKCE (`S256` `code_challenge` + `code_verifier`), `response_type=code`, `access_type=offline`, and cryptographic CSRF `state` verification, exchanging codes server-side at `POST /api/auth/google/token`.
3. **Web App Had No Active Supabase User Login (`auth.uid()` Was `null`)**:
   - `supabase.auth.signInWithOAuth` in `SettingsPage.tsx` was gated behind `if (CapacitorService.isNative())`. Web users never established a Supabase Auth session, causing `auth.uid()` to remain `null`.
   - Furthermore, V1 migration `20261105_google_tasks_and_neosapien_persistence.sql` had `using (auth.uid() = user_id or auth.uid() is null)` on `integration_tokens` (an RLS security leak).
   - Fixed in V2: Added `SupabaseAuthService` for Web & Native user sign-in/sign-out/refresh, tightened `integration_tokens` RLS in `20261110_v2_security_and_architecture.sql` to strictly `auth.uid() = user_id`, and scoped `/api/auth/google/token` to authenticated Supabase user JWTs.
4. **Google Cloud Console Redirect URI Mismatch (`redirect_uri_mismatch`)**:
   - Web PKCE flow sends exact `redirect_uri = window.location.origin` (no trailing slash).
   - Server callback (`api/auth/google/callback.ts`) sends `${proto}://${host}/api/auth/google/callback`.
   - Supabase Auth Google provider sends `https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback`.
   - Native Android Capacitor flow uses `com.yaswanth.hub://auth/callback`.
   - All active redirect URIs must match **character-for-character** in Google Cloud Console.
5. **Broken Callback Path Assumptions**:
   - V1 `/api/auth/google/callback` redirected to `/integrations?google_connected=true` (and expected `integrations` tab parsing on a specific subpath). Updated to redirect cleanly to `/?tab=integrations` and fixed `App.tsx` query/hash callback handling for `?code=...&state=...`, `?tab=integrations`, and `?error=...` / `?google_error=...`.

---

## 2. Exact Configuration Matrix (Must Match Character-for-Character)

| Setting Key | Required Exact Value (Production) | Required Exact Value (Localhost Dev) |
| :--- | :--- | :--- |
| **OAuth Application Type** | `Web application` | `Web application` |
| **Google Client ID** | `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com` | `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com` |
| **Authorized JavaScript Origins** | `https://yashwanth-hub.vercel.app` | `http://localhost:5173` and `http://127.0.0.1:5173` |
| **Authorized Redirect URI (Web PKCE SPA)** | `https://yashwanth-hub.vercel.app` *(NO trailing `/`)* | `http://localhost:5173` *(NO trailing `/`)* |
| **Authorized Redirect URI (Server Callback)** | `https://yashwanth-hub.vercel.app/api/auth/google/callback` | `http://localhost:5173/api/auth/google/callback` *(and `:3000` if using `vercel dev`)* |
| **Authorized Redirect URI (Supabase Auth)** | `https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback` | `https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback` |
| **Supabase Site URL** | `https://yashwanth-hub.vercel.app` | *(Same; allow localhost via Additional Redirect URLs)* |
| **Supabase Additional Redirect URLs** | `https://yashwanth-hub.vercel.app/**`<br>`com.yaswanth.hub://auth/callback` | `http://localhost:5173/**`<br>`http://127.0.0.1:5173/**` |
| **Native Capacitor Deep Link Scheme** | `com.yaswanth.hub://auth/callback` | `com.yaswanth.hub://auth/callback` |

---

## 3. Manual Configuration Checklist for You (No Secrets Pasted in Chat)

Because external dashboards and account secrets remain private to you, please apply these exact steps directly in your own browser sessions:

### A. Google Cloud Console (`APIs & Services -> Credentials`)
1. Open your OAuth 2.0 Web Client: `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`.
2. Verify **Authorized JavaScript origins** includes:
   - `https://yashwanth-hub.vercel.app`
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
3. Verify **Authorized redirect URIs** includes ALL 5 exact entries:
   - `https://yashwanth-hub.vercel.app`
   - `https://yashwanth-hub.vercel.app/api/auth/google/callback`
   - `https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback`
   - `http://localhost:5173`
   - `http://localhost:5173/api/auth/google/callback`
4. Verify **OAuth consent screen -> Audience / Test users** lists your Google email if publishing status is `Testing` (note: Google Testing mode expires refresh tokens after 7 days; publish to Production or stay aware of 7-day refresh renewal).
5. Enable APIs in Google Cloud Console (`APIs & Services -> Library`): **Google Calendar API**, **Google Tasks API**, **Gmail API**, **Google Drive API**, **Google People API**.

### B. Supabase Dashboard (`xjhkxnfahkkgwbbtmhtk`)
1. **Authentication -> Providers -> Google**:
   - Enable Google provider.
   - Enter exact Google Client ID and Client Secret from Google Cloud Console.
2. **Authentication -> URL Configuration**:
   - **Site URL**: `https://yashwanth-hub.vercel.app`
   - **Redirect URLs**:
     - `https://yashwanth-hub.vercel.app/**`
     - `http://localhost:5173/**`
     - `com.yaswanth.hub://auth/callback`
3. **Database / SQL Editor**:
   - Apply `supabase/migrations/20261110_v2_security_and_architecture.sql` (or push via `npx supabase db push` after `npx supabase login` & `npx supabase link --project-ref xjhkxnfahkkgwbbtmhtk`).

### C. Vercel Dashboard (`yashwanth-hub -> Settings -> Environment Variables`) & Local `.env.local`
Set the following variables for **Production** (and Preview/Development as needed), then **redeploy**:
- **Client-safe (`VITE_*`)**:
  - `VITE_SUPABASE_URL=https://xjhkxnfahkkgwbbtmhtk.supabase.co`
  - `VITE_SUPABASE_ANON_KEY` *(from Supabase Project Settings -> API)*
  - `VITE_GOOGLE_CLIENT_ID=236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`
  - `VITE_APP_URL=https://yashwanth-hub.vercel.app`
- **Server-only (NEVER prefixed `VITE_`)**:
  - `SUPABASE_URL=https://xjhkxnfahkkgwbbtmhtk.supabase.co`
  - `SUPABASE_SERVICE_ROLE_KEY` *(from Supabase Project Settings -> API)*
  - `GOOGLE_CLIENT_ID=236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`
  - `GOOGLE_CLIENT_SECRET` *(from Google Cloud Console)*
  - `CRON_SECRET` *(random 32+ byte secret token)*
  - `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` *(at least one for server-side AI Chief of Staff)*
  - `NEOSAPIEN_WEBHOOK_SECRET` *(optional, from NeoSapien webhook registration)*

---

## 4. Expected Verification Behavior (Once Configured)
1. **User Session**: Sign in via Google or Email in **Account & Sync** -> Supabase `auth.uid()` active, persisted across browser refresh.
2. **Workspace PKCE Connection**: Click **Connect Google Workspace (PKCE Offline Sync)** -> redirects to `accounts.google.com` with `response_type=code` + `code_challenge` -> returns `?code=...&state=...` -> `App.tsx` verifies CSRF `state` -> posts `{ code, code_verifier, redirect_uri }` + `Authorization: Bearer <supabase_jwt>` to `/api/auth/google/token` -> refresh token saved strictly in `public.integration_tokens`.
3. **Failure Handling**: Denying consent or using an unregistered URI shows explicit diagnostic modal with exact mismatched URI & recovery instructions.
4. **Refresh & Auto-Refresh**: Reloading browser restores connection via `GET /api/auth/google/token?action=status` (and transparently refreshes expired access tokens server-side).
5. **Sign-Out & Reconnect**: Clicking **Disconnect** calls `DELETE /api/auth/google/token` + Google OAuth revoke + clears local cache; reconnecting re-establishes clean server vault state.
