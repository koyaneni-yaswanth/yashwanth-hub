# YASHWANTH HUB — GOOGLE OAUTH REDIRECT MISMATCH FORENSIC REPORT

**Date of Audit:** 6 November 2026  
**Auditor Role:** Senior Google OAuth 2.0 & Supabase Auth Systems Architect  
**Production URL:** [https://yashwanth-hub.vercel.app](https://yashwanth-hub.vercel.app)  
**Supabase Project ID:** `xjhkxnfahkkgwbbtmhtk` (`https://xjhkxnfahkkgwbbtmhtk.supabase.co`)  
**Audit Mode:** READ-ONLY DIAGNOSTIC (Zero records deleted, zero credentials modified, zero code pushed).

---

## 1. Actual Authentication Architecture in Codebase

A complete inspection of all authentication calls across `src/` and `api/` reveals a dual-mode client/server architecture:

```
+-------------------------------------------------------------------------------------------------------+
|                                  USER INTERFACE: WEB APP (SPA)                                        |
|  Location: src/pages/IntegrationsPage.tsx & src/pages/SettingsPage.tsx                                |
|                                                                                                       |
|  [Click "Connect Google" / "Sign in with Google"]                                                     |
|                           |                                                                           |
|                           v                                                                           |
|  PRIMARY: Google Identity Services (GIS) Token Client                                                 |
|  Method: google.accounts.oauth2.initTokenClient({ client_id, scope, callback })                       |
|  Trigger: Opens an in-page popup modal (accounts.google.com/gsi)                                       |
|  Validation Check: Checks "Authorized JavaScript origins"                                            |
|                           |                                                                           |
|                           +---> IF POPUP IS BLOCKED OR USER FALLS BACK:                              |
|                                 v                                                                     |
|  FALLBACK: Full-Page Browser Redirect Flow                                                            |
|  Method: GoogleAuthService.getAuthUrl(...) -> window.location.href                                    |
|  Target URL: https://accounts.google.com/o/oauth2/v2/auth?response_type=token&...                     |
|  Explicit Param: redirect_uri = window.location.origin (https://yashwanth-hub.vercel.app)             |
|  Validation Check: Checks "Authorized redirect URIs"                                                  |
+-------------------------------------------------------------------------------------------------------+
                                            |
                                            v
+-------------------------------------------------------------------------------------------------------+
|                            BACKEND SERVERLESS AUTOMATION ENGINE                                       |
|  Location: api/auth/google/callback.ts & api/auth/google/token.ts                                     |
|                                                                                                       |
|  OAuth Code Exchange Flow for Offline Background Crons & Sync:                                        |
|  Target Endpoint: /api/auth/google/callback                                                           |
|  Explicit Param: redirect_uri = https://yashwanth-hub.vercel.app/api/auth/google/callback             |
|  Token Storage: public.integration_tokens in Supabase PostgreSQL (Server-side)                        |
|  Validation Check: Checks "Authorized redirect URIs"                                                  |
+-------------------------------------------------------------------------------------------------------+
                                            |
                                            v
+-------------------------------------------------------------------------------------------------------+
|                                SUPABASE AUTH GOOGLE PROVIDER                                          |
|  Location: src/pages/SettingsPage.tsx (line 196: client.auth.signInWithOAuth)                         |
|                                                                                                       |
|  Used for: Native Capacitor Mobile Authentication & Supabase User Session Management                  |
|  Target Endpoint: https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback                           |
|  Validation Check: Checks "Authorized redirect URIs"                                                  |
+-------------------------------------------------------------------------------------------------------+
```

### Key Finding on Implementation
The production web application's primary "Connect Google" button on [Integrations](https://yashwanth-hub.vercel.app) is **NOT** delegating to Supabase Auth's redirect endpoint (`/auth/v1/callback`).  
Instead, it directly executes **`GoogleAuthService.requestGisToken()`** (Google Identity Services SPA client) and falls back to **`GoogleAuthService.getAuthUrl()`** directly pointing to Google's OAuth 2.0 authorization endpoint.

---

## 2. Root Cause of `Error 400: redirect_uri_mismatch`

### The exact failure mechanism:
1. Google Cloud Console's OAuth client currently only has **`https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback`** registered under **Authorized redirect URIs**.
2. When you click **"Connect Google"** on the website, if Google Identity Services (GIS) popup falls back to full-page redirect, the code executes:
   ```typescript
   // src/services/google/googleAuthService.ts (Line 76-82)
   public static getRedirectUri(): string {
     if (typeof window === 'undefined') return 'http://localhost:5173';
     if (Capacitor.isNativePlatform()) {
       return 'com.yaswanth.hub://auth/callback';
     }
     return window.location.origin; // In production: https://yashwanth-hub.vercel.app
   }
   ```
3. The browser navigates to:
   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fyashwanth-hub.vercel.app&response_type=token&...
   ```
4. Google compares the incoming `redirect_uri=https://yashwanth-hub.vercel.app` against the registered **Authorized redirect URIs**.
5. Because `https://yashwanth-hub.vercel.app` was placed **only** in "Authorized JavaScript origins" (or omitted from the redirect list), Google **immediately halts execution with `Error 400: redirect_uri_mismatch`**.

---

## 3. Configuration Comparison Matrix

| Configuration Item | Actual Value in Code / Runtime | Required Value in External Dashboards | Status / Mismatch Detected |
| :--- | :--- | :--- | :--- |
| **Google OAuth Client ID** | `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com` | Same across Google Cloud, Supabase, and Vercel | Verified in `.env` & `GoogleAuthService` |
| **Google Application Type** | Web application | **Web application** (NOT Desktop / Android / iOS) | **Required** |
| **Google Authorized JavaScript Origin (Prod)** | `window.location.origin` = `https://yashwanth-hub.vercel.app` | `https://yashwanth-hub.vercel.app` (NO trailing slash) | **Must be in Google Cloud Console** |
| **Google Authorized JavaScript Origin (Dev)** | `http://localhost:5173` | `http://localhost:5173` | **Must be in Google Cloud Console** |
| **Google Authorized Redirect URI (SPA Web)** | `https://yashwanth-hub.vercel.app` | `https://yashwanth-hub.vercel.app` | **CRITICAL MISMATCH: Currently Missing** |
| **Google Authorized Redirect URI (Serverless)** | `https://yashwanth-hub.vercel.app/api/auth/google/callback` | `https://yashwanth-hub.vercel.app/api/auth/google/callback` | **CRITICAL MISMATCH: Currently Missing** |
| **Google Authorized Redirect URI (Supabase)** | `https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback` | `https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback` | Present |
| **Google Authorized Redirect URI (Dev)** | `http://localhost:5173` & `http://localhost:5173/api/auth/google/callback` | `http://localhost:5173` | Recommended for local testing |
| **Supabase Site URL** | `https://yashwanth-hub.vercel.app` | `https://yashwanth-hub.vercel.app` | Must be saved in Supabase URL Config |
| **Supabase Additional Redirect URLs** | `https://yashwanth-hub.vercel.app/**`, `http://localhost:5173/**`, `com.yaswanth.hub://auth/callback` | Same allow-list | Required for Supabase Auth flows |

---

## 4. Environment Variables Forensic Audit

Inspection of `.env`, `.env.example`, and serverless function handlers confirms:

1. **Frontend Client Variables (`VITE_*`)**:
   - `VITE_SUPABASE_URL=https://xjhkxnfahkkgwbbtmhtk.supabase.co` (Confirmed)
   - `VITE_GOOGLE_CLIENT_ID=236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com` (Confirmed)
   - `VITE_APP_URL=https://yashwanth-hub.vercel.app` (Confirmed)
2. **Serverless Backend Variables (Vercel Environment)**:
   - `GOOGLE_CLIENT_ID`: Must match `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET`: Configured in Vercel project environment (never committed to git)
   - `SUPABASE_SERVICE_ROLE_KEY`: Configured in Vercel project environment
3. **No Stale or Conflicting IDs**: The client ID in `.env` matches the client ID hardcoded as fallback in `googleAuthService.ts`. There are no conflicting alternate project IDs.

---

## 5. Session Handling & Token Persistence Audit

- **Why session was dropping on refresh**: When Google threw `redirect_uri_mismatch`, the OAuth transaction never returned an access token. Therefore, `localStorage.setItem('yash_google_config', ...)` and `supabase.from('integration_tokens').upsert(...)` were never executed.
- **Session Restoration Mechanism**:
  On app boot (`App.tsx` $\rightarrow$ `initializeDatabase()`), the app calls:
  ```typescript
  IntegrationVaultService.initSessionRestoration();
  ```
  This queries Supabase `public.integration_tokens` for `provider = 'google'`. As soon as a valid OAuth handshake completes, the token is vaulted both in local memory and server-side PostgreSQL, ensuring your session persists across refreshes and devices.
- **Zero LocalStorage Refresh Tokens**: Refresh tokens are stored exclusively on the server in `public.integration_tokens` with Row-Level Security, satisfying institutional security requirements.

---

## 6. Step-by-Step Manual Correction Procedure for Yashwanth

Follow these exact steps in your external management consoles:

### STEP 1: Update Google Cloud Console (The Primary Fix)

1. Navigate to: [Google Cloud Console $\rightarrow$ APIs & Services $\rightarrow$ Credentials](https://console.cloud.google.com/apis/credentials).
2. Under **OAuth 2.0 Client IDs**, click on your client:  
   `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`
3. Verify **Application type** is set to: **Web application**.
4. In **Authorized JavaScript origins**, ensure you have:
   ```text
   https://yashwanth-hub.vercel.app
   http://localhost:5173
   http://127.0.0.1:5173
   ```
5. In **Authorized redirect URIs**, add ALL of the following (Google allows multiple URIs):
   ```text
   https://yashwanth-hub.vercel.app
   https://yashwanth-hub.vercel.app/api/auth/google/callback
   https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback
   http://localhost:5173
   http://localhost:5173/api/auth/google/callback
   ```
   > **CRITICAL:** Do NOT include a trailing slash on `https://yashwanth-hub.vercel.app`. Google matches strings character-for-character.
6. Click **Save** at the bottom of the page.
   *(Note: Google Cloud changes can take between 1 to 5 minutes to propagate across Google's edge authentication servers).*

---

### STEP 2: Verify Supabase Auth Settings

1. Navigate to: [Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ Providers $\rightarrow$ Google](https://supabase.com/dashboard/project/xjhkxnfahkkgwbbtmhtk/auth/providers).
2. Confirm **Enable Sign in with Google** is toggled **ON**.
3. Confirm **Client ID** is:  
   `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`
4. Confirm **Client Secret** matches the secret from your Google Cloud Console.
5. Navigate to: [Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ URL Configuration](https://supabase.com/dashboard/project/xjhkxnfahkkgwbbtmhtk/auth/url-configuration).
6. Set **Site URL** to:
   ```text
   https://yashwanth-hub.vercel.app
   ```
7. Under **Redirect URLs**, add:
   ```text
   https://yashwanth-hub.vercel.app/**
   http://localhost:5173/**
   com.yaswanth.hub://auth/callback
   ```
8. Click **Save**.

---

### STEP 3: Verify Vercel Serverless Environment Variables

1. Navigate to: [Vercel Dashboard $\rightarrow$ yashwanth-hub $\rightarrow$ Settings $\rightarrow$ Environment Variables](https://vercel.com/koyaneniyaswanth-9270s-projects/yashwanth-hub/settings/environment-variables).
2. Confirm the following exist for **Production**:
   - `GOOGLE_CLIENT_ID`: `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET`: `[Your Google Client Secret]`
   - `VITE_GOOGLE_CLIENT_ID`: `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`
   - `SUPABASE_URL`: `https://xjhkxnfahkkgwbbtmhtk.supabase.co`
   - `VITE_SUPABASE_URL`: `https://xjhkxnfahkkgwbbtmhtk.supabase.co`

---

## 7. Safe Verification Procedure (Zero Data Risk)

After saving the settings in Google Cloud Console:

1. Open a fresh browser tab in **Incognito / Private Mode** (to bypass any stale OAuth session cookies).
2. Open DevTools (`F12`) and select the **Network** tab (check **Preserve log**).
3. Navigate to: [https://yashwanth-hub.vercel.app](https://yashwanth-hub.vercel.app)
4. Open **Hub 12: Integrations & Sync** (or click `Ctrl+K` $\rightarrow$ `Go to 12. Integrations & MCP Hub`).
5. Under **Google Workspace Integration**, click **Connect Google Account**.
6. **Expected Behavior**:
   - Google Identity Services opens the Google account selection prompt.
   - You select your account (`yaswanthkoyaneni@gmail.com`).
   - Consent screen displays requested scopes (Calendar, Tasks, Gmail).
   - Upon clicking "Continue", the window returns to Yashwanth Hub with a green **Connected** badge displaying your email and profile avatar.
7. **Inspect Network Request in DevTools**:
   - Filter by `auth` or `oauth`.
   - Inspect the outgoing request to `accounts.google.com`.
   - Confirm `redirect_uri` equals `https://yashwanth-hub.vercel.app`.
   - Status code is `200` or `302`, confirming zero `redirect_uri_mismatch` errors.

---

## 8. Clarification Regarding Existing Tasks and Data

**Option Selected: B (Zero Deletion Policy)**
- All your existing tasks, reminders, Pawan Shakti milestone roadmaps, robotics experiments, financial records, and automations are **100% safe, persisted, and untouched**.
- No database records, user accounts, or automations have been reset.
- The only items purged earlier were the three static hardcoded demo seed strings (*"Professor Lab Review"*, *"MG Automation On-site Client Commissioning"*, and *"DST Startup Grant"*) to ensure your calendar shows only genuine, live records.
