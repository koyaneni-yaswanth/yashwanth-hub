# Yashwanth Hub — Automation Engine Specification & Runbook

## 1. Overview & System Mission
The **Yashwanth Hub Automation Engine** is an event-driven and schedule-based execution pipeline designed to eliminate manual administrative friction for Yashwanth across his startup, robotics research, academic obligations, and personal life.

The engine executes in a serverless environment (Vercel Serverless Functions) with persistent state stored in Supabase PostgreSQL (`xjhkxnfahkkgwbbtmhtk`).

---

## 2. Architecture & Execution Flow

```
                                  +-----------------------------+
                                  |      Trigger Sources        |
                                  |  - Vercel Cron (Scheduled)  |
                                  |  - Client Manual Click      |
                                  |  - Database Webhook / Event |
                                  +-----------------------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |   /api/automations/dispatch |
                                  +-----------------------------+
                                                 |
                    +----------------------------+----------------------------+
                    |                                                         |
                    v                                                         v
      +----------------------------+                            +----------------------------+
      |     Idempotency Check      |                            |     Step Executor Core     |
      | - Cache key: trigger_id +  |                            | - Google Tasks / Calendar  |
      |   timestamp window         |                            | - NeoSapien MCP Gateway    |
      | - Prevents duplicate runs  |                            | - Gemini Multi-Model Eval  |
      +----------------------------+                            +----------------------------+
                    |                                                         |
                    +----------------------------+----------------------------+
                                                 |
                                                 v
                                  +-----------------------------+
                                  |  State & Metrics Recording  |
                                  |  - public.automation_runs   |
                                  |  - duration_ms, status, logs|
                                  +-----------------------------+
```

---

## 3. Serverless API Endpoints

### 3.1 `/api/automations/dispatch`
- **Method**: `POST`
- **Authentication**: Bearer Token / Supabase Auth Header / Service Role
- **Payload Schema**:
```json
{
  "automation_id": "auto_daily_briefing_01",
  "trigger_type": "cron | manual | webhook",
  "idempotency_key": "briefing_2026-11-06T00:00:00Z",
  "context": {
    "user_id": "yashwanth",
    "area": "PAWAN SHAKTI"
  }
}
```
- **Response**:
```json
{
  "status": "completed | cached | failed",
  "run_id": "run_9843a812-c2e1-4c12",
  "duration_ms": 1420,
  "steps_executed": 3,
  "cached": false
}
```

### 3.2 `/api/automations/cron`
- **Schedule**: Defined in `vercel.json` crons table:
  - `0 1 * * *` (Daily morning 6:30 AM IST briefing)
  - `0 14 * * *` (Daily evening 7:30 PM IST synthesis)
  - `0 17 * * 5` (Weekly Friday grant & runway audit)
- **Security**: Protected with `CRON_SECRET` header validation to block unauthorized external invocations.

---

## 4. Supported Action Integrations

### 4.1 Google Tasks & Calendar Action
- Queries user's active access token from `public.integration_tokens`.
- Refreshes expired tokens automatically using OAuth `refresh_token`.
- Inserts due items into Google Tasks or schedules calendar slots for deep work.

### 4.2 NeoSapien MCP Tool Gateway
- Communicates directly with `https://api.neosapien.xyz/mcp`.
- Dispatches tool invocations: `read_memory`, `query_context`, `create_memory_log`.
- Enables automated extraction of action items from Neo 1 wearable conversations.

### 4.3 Diagnostic & Fallback Resilience
- When remote Supabase or external provider endpoints fail or timeout, the engine:
  1. Catches network failures gracefully.
  2. Emits structured diagnostic warnings.
  3. Falls back to deterministic in-memory/local execution to preserve workflow integrity.

---

## 5. Verification & Smoke Testing
To verify the full server-side automation engine locally or in CI:

```bash
# Execute the automated smoke test script
node --experimental-strip-types scripts/verify-automation.ts
```

The smoke test verifies 5 mandatory invariants:
1. Registration of test automation record.
2. Real-time dispatch and completion under 10 seconds.
3. Verification of persistence in `automation_runs`.
4. Idempotency lock validation (rejecting identical run keys).
5. Diagnostic status handling for Google and NeoSapien actions.
