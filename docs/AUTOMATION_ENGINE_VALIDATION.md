# Yashwanth Hub — Background Automation Engine & Queue Validation

**Application:** Yashwanth Hub  
**Date:** November 15, 2026  
**Document Target:** `docs/AUTOMATION_ENGINE_VALIDATION.md`  

---

## 1. Automation Architecture & Trigger Flow

Yashwanth Hub's background automation engine coordinates recurring schedules, event-driven webhooks, and asynchronous action queues.

```
       [ Vercel Cron ] (01:30 & 02:00 UTC / 07:00 & 07:30 IST)
              │
              ▼
   [ /api/cron/process-triggers ]
              │ (Checks CRON_SECRET & DB Keys)
              ▼
    [ sync_queue / automation_runs ]
              │
              ▼
    [ /api/automations/dispatch ]
              │ (Executes isolated action handler)
              ▼
   [ Supabase DB / Dexie Queue ]
```

---

## 2. Serverless Endpoints & Security Controls

### 2.1 `/api/cron/process-triggers`
- **Schedule:** Declared in `vercel.json` (`0 1 * * *` and `30 1 * * *` UTC, corresponding to 07:00 and 07:30 Asia/Kolkata).
- **Authentication:** Enforces `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set in Vercel environment variables.
- **Unattended Execution Requirements:**
  - When `SUPABASE_SERVICE_ROLE_KEY` is present, cron ticks inspect across user queues and trigger due automations.
  - When `SUPABASE_SERVICE_ROLE_KEY` is absent, the endpoint returns HTTP 200 with structured diagnostic JSON:
    ```json
    {
      "status": "skipped",
      "reason": "Unattended background cron requires SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.",
      "userAutomationsOperational": true
    }
    ```
    This avoids 500 errors and false alarms while maintaining complete security.

### 2.2 `/api/automations/dispatch`
- **Purpose:** Handles event-driven automation runs, queue job processing, and manual trigger executions.
- **User-Scoped Database Context:**
  - Uses `createUserScopedClient(userToken)` from `api/_lib/db.ts` to attach the authenticated user's bearer token (`Authorization: Bearer ${token}`).
  - Enforces PostgreSQL Row-Level Security (`auth.uid() = user_id`) on all queries and mutations.
  - Requires **zero service role bypass** for user-initiated executions!

---

## 3. Timezone & Schedule Processing

- **Default Timezone:** `Asia/Kolkata` (IST, UTC+5:30).
- **Schedule Syntax:**
  - Standard cron format: `minute hour * * *` (e.g. `0 7 * * *` for 07:00 IST).
  - Validated by regex parser in `src/services/automationService.ts`.
  - Malformed cron strings are rejected at creation time with user-facing validation errors.

---

## 4. Queue Processing & Retry Backoff

- **Max Retries:** 3 attempts.
- **Backoff Strategy:** Exponential backoff with jitter:
  $$\text{Delay} = 2^{\text{attempt}} \times 60\text{ seconds}$$
- **Dead-Letter Handling:** After 3 consecutive execution failures, the job is marked `failed` and logged to `data_audit_log` with the exact stack trace and error message.

---

## 5. Verification Test Evidence

Verified by automated tests in `tests/hub_automations_constraints.test.mjs` and `tests/v2_automation_engine.test.mjs`:
1. Server endpoints exist and contain zero client-side execution leaks.
2. Scheduled triggers rely on Vercel cron and Supabase queue processor, never browser `setInterval`.
3. Verified database schema and execution logging without fake timers.
4. All secrets remain strictly in server environment variables.
5. `CRON_SECRET` enforcement and timing calculations for Asia/Kolkata pass 100%.
