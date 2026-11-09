# Yashwanth Hub — External Integration & Service Audit

**Document Version:** 2.0.0  
**Audit Date:** November 2026  
**Auditor:** Principal Integration & Security Engineer  
**Scope:** Google Workspace, NeoSapien MCP Second Brain, Supabase PostgreSQL, and Capacitor Native Plugins

---

## 1. Executive Summary

Yashwanth Hub integrates with four external service ecosystems to deliver a seamless personal AI operating system:
1. **Google Workspace:** Calendar, Tasks, Drive, and Gmail via OAuth 2.0 PKCE.
2. **NeoSapien Second Brain:** MCP JSON-RPC 2.0 Gateway (`https://api.neosapien.xyz/mcp`) and Neo 1 wearable memory ingestion.
3. **Supabase Cloud Infrastructure:** PostgreSQL database (`xjhkxnfahkkgwbbtmhtk`, Tokyo `ap-northeast-1`), Realtime WebSocket engine, and serverless authentication.
4. **Capacitor Android Shell:** Native device APIs for deep linking, hardware back buttons, local push notifications, and status bar control.

Every integration has been audited for security, resilience, token lifecycle, and fail-safe diagnostic handling.

---

## 2. Google Workspace Integration Audit

### 2.1 Authentication & Authorization Architecture
- **Protocol:** OAuth 2.0 Authorization Code flow with RFC 7636 PKCE (Proof Key for Code Exchange) and state parameter validation.
- **Client Configuration:**
  - Authorized JavaScript Origins: `https://yashwanth-hub.vercel.app`, `http://localhost:5173`
  - Authorized Redirect URIs: `https://yashwanth-hub.vercel.app`, `https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback`
- **Scope Allocation (Principle of Least Privilege):**
  - `https://www.googleapis.com/auth/tasks` (Google Tasks read/write)
  - `https://www.googleapis.com/auth/calendar.events` (Calendar event read/write)
  - `https://www.googleapis.com/auth/drive.readonly` (Document browsing)
  - `https://www.googleapis.com/auth/gmail.readonly` (Email triage & follow-up detection)
  - `openid email profile` (Identity verification)

### 2.2 Token Lifecycle & Persistence
- **Storage Tier 1 (Client):** Encrypted local storage caching active access tokens and expiry timestamps for offline responsiveness.
- **Storage Tier 2 (Server):** Vaulted in Supabase table `public.integration_tokens` with automatic refresh logic executed by serverless endpoints (`api/auth/google/token.ts`).
- **Session Restoration:** Upon browser reload or device switch, `IntegrationVaultService.initSessionRestoration()` queries Supabase to hydrate the active session without requiring re-authentication.

### 2.3 Service-by-Service Operational Status

| Service | Endpoint / Service Class | Operational Status | Error / Fallback Strategy |
| :--- | :--- | :--- | :--- |
| **Google Tasks** | `/api/integrations/google-tasks`<br>`GoogleTasksSyncService.ts` | **VERIFIED WORKING** | Returns HTTP 500 with diagnostic message if unauthenticated; queues mutations locally in Dexie `sync_queue`. |
| **Google Calendar** | `GoogleCalendarSyncService.ts` | **VERIFIED WORKING** | Truthful empty state when disconnected. Zero synthetic seed data (`MOCK_EVENTS` purged). |
| **Google Drive** | `GoogleDriveService.ts` | **VERIFIED WORKING** | Lists authorized files with mime-type filters; gracefully displays connection prompt if token absent. |
| **Gmail** | `GmailSyncService.ts` | **VERIFIED WORKING** | Scans recent threads for actionable commitments; flags suggestions with `pending` status. |

### 2.4 Forensic Diagnostic Error Handling
- **`401 invalid_client`:** Sanitization logic automatically strips trailing whitespace, newlines, and quotes from user-entered Client IDs. If invalid, the UI surfaces exact step-by-step instructions with direct links to the Google Cloud Console.
- **`redirect_uri_mismatch`:** The diagnostic modal explicitly renders the exact current window origin (`window.location.origin`) to be copied into the Google Cloud Console Authorized URIs.

---

## 3. NeoSapien MCP Second Brain Integration Audit

### 3.1 Architecture & Protocol
- **Transport:** Standard MCP (Model Context Protocol) JSON-RPC 2.0 over HTTP POST.
- **Gateway Endpoint:** Hosted serverless proxy at `/api/integrations/neosapien` and `/api/neosapien/mcp`.
- **Target Upstream:** `https://api.neosapien.xyz/mcp`
- **Security:** Bearer token authentication via NeoSapien API key stored in `integration_tokens` table.

### 3.2 Tool Catalog & Discovery
The serverless gateway exposes official NeoSapien tools discovered dynamically via the `tools/list` JSON-RPC method:
1. `neosapien_list_memories`: Retrieves captured meetings and wearable voice logs with date and tag filters.
2. `neosapien_get_memory`: Fetches complete audio transcript, summary, and speaker diarization for a specific memory ID.
3. `neosapien_extract_action_items`: Runs natural language MoM extraction to identify commitments, decisions, and deadlines.
4. `neosapien_sync_wearable_status`: Queries battery level, storage state, and BLE connectivity of the Neo 1 wearable.

### 3.3 Memory Processing & Action Approval
- **Transcript Ingestion:** Spoken transcripts are ingested and saved to local Dexie `neo_memories` table and mirrored to Supabase.
- **Deduplication Engine:** Ingested memories compute SHA-256 content checksums to prevent duplicate entries across sync cycles.
- **Commitment Reconciliation:** Spoken commitments default to status `pending_approval`. The founder must explicitly approve items in the UI before they are converted into official tasks in the Hub or Google Tasks.

---

## 4. Supabase Cloud Database & Realtime Audit

### 4.1 Instance Architecture
- **Reference ID:** `xjhkxnfahkkgwbbtmhtk`
- **Region:** `ap-northeast-1` (Tokyo, Japan)
- **Direct Database Host:** `db.xjhkxnfahkkgwbbtmhtk.supabase.co`
- **Connection Pooler:** `aws-0-ap-northeast-1.pooler.supabase.com` (Port 6543)

### 4.2 Database Schema Verification
The remote database contains the required tables validated against `supabase/master_schema.sql`:
- `integration_tokens`: Encrypted provider credentials (`google`, `neosapien`, `github`).
- `automations`: Automation workflow definitions, trigger configurations, and action parameters.
- `automation_runs`: Live execution records with status, execution time, and payload summaries.
- `automation_execution_logs`: Immutable security and execution audit trail.
- `tasks`, `events`, `projects`, `notes`, `expenses`, `neo_memories`: Multi-device synced domain entities.

### 4.3 Row-Level Security (RLS) Policies
- All tables have RLS enabled: `ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;`
- Policies enforce strict ownership: `CREATE POLICY user_isolation_policy ON <table_name> FOR ALL USING (auth.uid() = user_id);`
- Server-side background jobs utilize `SUPABASE_SERVICE_ROLE_KEY` to process queues without bypassing security checks.

### 4.4 Realtime Subscriptions
- `RealtimeSyncManager.ts` connects via Supabase Realtime WebSocket to channels `public:tasks`, `public:events`, and `public:automations`.
- Changes made on desktop immediately broadcast to mobile devices without manual polling.

---

## 5. Capacitor Native Shell & Mobile Integration Audit

### 5.1 Native Shell Capabilities
- **Platform Runtime:** Capacitor 8.6.0 on Android (SDK 34).
- **Service Class:** `src/services/native/capacitorService.ts`

### 5.2 Hardware Back Button Priority Hierarchy
To prevent abrupt application exits on Android devices, the back button listener follows a strict 3-tier dismissal stack:
1. **Tier 1 (Modals & Overlays):** If the Command Palette, Quick Capture modal, or OAuth diagnostic modal is active, the back button closes the overlay and consumes the event.
2. **Tier 2 (Navigation Hierarchy):** If the user is on a secondary hub (e.g. `robotics-lab` or `startup-command`), pressing back navigates to the Home Dashboard (`dashboard`).
3. **Tier 3 (Application Exit):** If already on the Home Dashboard with no modals open, the event is delegated to the system for native exit.
- *Verification:* Verified by automated unit test in `tests/native_capacitor_integration.test.mjs`.

### 5.3 Local Notifications & Quiet Hours Engine
- **Lead Time:** Schedules local device notifications 15 minutes prior to scheduled calendar events and hard task deadlines.
- **Founder Quiet Hours:** All non-urgent notifications are automatically silenced between 22:00 IST and 07:00 IST to preserve circadian sleep rhythm.
- *Verification:* Verified by automated unit test in `tests/native_capacitor_integration.test.mjs`.

### 5.4 Dynamic Status Bar & Safe Area Styling
- Synchronizes Android status bar color and icon contrast dynamically with the active theme (dark slate in dark mode, crisp light in light mode).
- Safe area inset classes prevent layout clipping on devices with camera cutouts and gesture navigation bars.
