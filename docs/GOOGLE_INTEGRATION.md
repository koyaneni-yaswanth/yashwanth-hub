# Google Workspace Integration — OAuth 2.0 & Bidirectional Sync Guide

## 1. Overview
The **Google Workspace Integration** connects Yashwanth Hub with Google Tasks, Google Calendar, and Gmail, establishing a continuous bidirectional synchronization layer between Google cloud services and the local-first hub.

---

## 2. OAuth 2.0 Configuration Blueprint

### 2.1 Google Cloud Console Setup
1. Create or navigate to the Google Cloud Project: `yashwanth-hub`.
2. In **APIs & Services $\rightarrow$ Enabled APIs & Services**, enable:
   - **Google Tasks API**
   - **Google Calendar API**
   - **Gmail API**
3. Configure the **OAuth Consent Screen**:
   - User Type: **External** (in Testing mode with founder email added)
   - Test Users: `yaswanthkoyaneni@gmail.com`
4. Create Credentials $\rightarrow$ **OAuth Client ID**:
   - Application Type: **Web application**
   - Authorized JavaScript origins:
     - `https://yashwanth-hub.vercel.app`
     - `http://localhost:5173`
     - `http://127.0.0.1:5173`
   - Authorized redirect URIs:
     - `https://yashwanth-hub.vercel.app`
     - `https://yashwanth-hub.vercel.app/oauth/callback`
     - `http://localhost:5173`
     - `http://localhost:5173/oauth/callback`

### 2.2 Scopes
- Tasks: `https://www.googleapis.com/auth/tasks`
- Calendar: `https://www.googleapis.com/auth/calendar.events`
- Gmail: `https://www.googleapis.com/auth/gmail.readonly`

---

## 3. Token Persistence & Session Lifecycle

### 3.1 Resolving Session Wipeout & 401 Errors
To prevent repeated login popups or `401 invalid_client` failures:
1. Google OAuth tokens are saved in Supabase `public.integration_tokens`:
   ```sql
   INSERT INTO public.integration_tokens (
     user_id, provider, access_token, refresh_token, expires_at, scopes, updated_at
   ) VALUES (
     auth.uid(), 'google', :access_token, :refresh_token, :expires_at, :scopes, NOW()
   ) ON CONFLICT (user_id, provider) DO UPDATE SET
     access_token = EXCLUDED.access_token,
     refresh_token = COALESCE(EXCLUDED.refresh_token, integration_tokens.refresh_token),
     expires_at = EXCLUDED.expires_at,
     updated_at = NOW();
   ```
2. Frontend loads cached token status on app mount (`initDatabase()`).
3. If `access_token` is expired (`Date.now() >= expires_at - 60000`), the Vercel serverless proxy invokes Google OAuth token refresh using the stored `refresh_token`.

---

## 4. Bidirectional Sync Protocol

### 4.1 Tasks Synchronization (`src/services/google/googleTasksService.ts`)
- **Downstream Sync**: Fetches user's primary task list from Google Tasks and merges into Dexie `tasks` table with `google_task_id`.
- **Upstream Sync**: Newly created local tasks with area `PAWAN SHAKTI` or `PERSONAL` push to Google Tasks via REST API.
- **Completion Sync**: Checking off a task in Yashwanth Hub marks the corresponding Google Task as `completed`.

### 4.2 Calendar Synchronization & Purge Guarantee
- **Clean State Policy**: The calendar guarantees zero hardcoded seed events. Legacy demo events (*"Professor Lab Review"*, *"MG Automation On-site Client Commissioning"*, and *"DST Startup Grant"*) are actively scrubbed on mount.
- **Dynamic Connection Banner**: The UI displays live connection state:
  - Disconnected: *"Google Calendar Sync: Local-First Ready (Connect in Settings when deploying live)"*
  - Connected: *"Google Calendar Sync: Active (Synchronized with Google Calendar API)"*
