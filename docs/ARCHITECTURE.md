# Yashwanth Hub — System Architecture & Engineering Blueprint

**Document Version:** 2.1.0  
**Status:** Production  
**Target URL:** `https://yashwanth-hub.vercel.app`  
**Git Branch:** `main`  
**Supabase Reference:** `xjhkxnfahkkgwbbtmhtk` (`ap-northeast-1`, Tokyo)

---

## 1. Architectural Principles

Yashwanth Hub is engineered as an enterprise-grade Personal AI Operating System and Startup Command Center tailored for deep-tech hardware founders. The system adheres to six non-negotiable architectural tenets:

1. **Local-First & Offline Resilience:** The user interface boots instantaneously and operates with 100% functionality offline. All core state is stored in client-side IndexedDB via Dexie.js (`yashwanth_hub_db` v8). Mutations are processed locally first, with background reconciliation to remote services.
2. **Deterministic Serverless Automation:** No background automations, recurring jobs, or scheduled workflows run inside browser interval timers. All scheduled triggers execute server-side via Vercel Serverless Functions (`api/cron/process-triggers.ts`) invoked by Vercel Cron.
3. **Strict Function Ceiling Compliance:** The serverless API footprint is strictly budgeted to 10 endpoints, remaining well under the Vercel Hobby plan ceiling of 12 serverless functions. Reusable logic and database helpers reside in `api/_lib/` which does not generate function allocations.
4. **Zero Client Secret Leakage:** No OAuth client secrets, service role keys, or sensitive backend tokens are packaged into client bundles. Frontend communicates with external services exclusively through authenticated serverless proxies or direct OAuth 2.0 PKCE.
5. **Truthful State & Zero Fake Data:** The user interface never presents fabricated progress, mock sensor readings, or synthetic calendar seed data. If an integration is unconfigured or a sensor is offline, the system explicitly reports "Not Connected" or "No Live Telemetry".
6. **Human-in-the-Loop Governance:** Autonomous AI operations operate under a 3-tier action authorization model. High-consequence mutations (financial logging, database alterations, physical hardware commands) require explicit one-click confirmation with a cryptographic action ID.

---

## 2. System Topology & Component Diagram

```
+---------------------------------------------------------------------------------------------------+
|                                      CLIENT RUNTIME SURFACES                                       |
|  +-------------------------------------------------+  +----------------------------------------+  |
|  |           Vite 8 + React 19 Web Client          |  |      Capacitor 8 Android Mobile App    |  |
|  |     Tailwind CSS / Lucide / KaTeX / Recharts    |  |   Biometrics / Push / Local Storage    |  |
|  |          7-Tab Focused Navigation Model         |  |      Back-Button Navigation Stack      |  |
|  +-------------------------------------------------+  +----------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                    LOCAL-FIRST DATA PLATFORM                                      |
|  +------------------------------+  +-------------------------------+  +-------------------------+  |
|  |      Dexie.js (IndexedDB)    |  |     RealtimeSyncManager       |  |  IntegrationVaultService|  |
|  | 14 Hub Entities & Caches     |  | Offline Mutations & Retries   |  | Cross-Device Token Sync |  |
|  +------------------------------+  +-------------------------------+  +-------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                       +--------------------------+-------------------------+
                       |                                                    |
                       v                                                    v
+--------------------------------------------------+  +---------------------------------------------+
|        VERCEL SERVERLESS ARCHITECTURE (10 FNS)   |  |         SUPABASE CLOUD POSTGRESQL           |
|  1. /api/auth/google/callback                    |  |  - Project: xjhkxnfahkkgwbbtmhtk (Tokyo)    |
|  2. /api/auth/google/token                       |  |  - Direct DB: db.xjhkxnfahkkgwbbtmhtk...    |
|  3. /api/automations/dispatch                    |  |  - Pooler: aws-0-ap-northeast-1.pooler...   |
|  4. /api/cron/process-triggers                   |  |  - Tables: automations, automation_runs,    |
|  5. /api/integrations/google-tasks               |  |    integration_tokens, events, tasks,      |
|  6. /api/integrations/neosapien                  |  |    expenses, projects, memories, notes      |
|  7. /api/integrations/sync                       |  |  - Row Level Security (RLS) Policies        |
|  8. /api/neosapien/callback                      |  |  - Realtime Subscriptions (postgres_changes)|
|  9. /api/neosapien/connect                       |  +---------------------------------------------+
| 10. /api/neosapien/mcp                           |
+--------------------------------------------------+
                       |
                       v
+---------------------------------------------------------------------------------------------------+
|                                  EXTERNAL INTEGRATION PROVIDERS                                   |
|  +-------------------------+  +-------------------------+  +-----------------------------------+  |
|  |     Google Cloud API    |  |   NeoSapien MCP Gateway |  |       Multi-Model AI Gateway      |  |
|  | Tasks, Calendar, Gmail  |  |  Neo 1 Wearable Memory  |  |  Gemini 2.5, Claude 3.5, GPT-4o   |  |
|  +-------------------------+  +-------------------------+  +-----------------------------------+  |
+---------------------------------------------------------------------------------------------------+
```

---

## 3. Navigation & UX Hierarchy

The system employs a streamlined **7-Primary Tab** navigation structure, eliminating cognitive clutter while maintaining instant one-click access to all specialized engineering workspaces:

```
[PRIMARY NAVIGATION BAR]
  1. Home (dashboard)          -> Morning briefing, KPI stats, "What should I do next?", focus mode
  2. My Day (my-day)           -> Daily planning ritual, merged timeline, top 3 outcomes, evening review
  3. Projects (projects)       -> Multi-workspace portfolio (Pawan Shakti, PiPER, Swarm, OS, Career)
  4. AI Assistant (ai-assist)  -> Multi-model chat, specialist personas, Level 1-3 action approval cards
  5. Automations (automations) -> Serverless triggers, cron schedules, idempotency run logs, metrics
  6. Search (Command Palette)  -> Omnipresent modal (Ctrl+K), instant deep-linking, quick action launcher
  7. More (Drawer / Sheet)     -> Expandable container housing domain-specific command hubs:
       ├── Calendar            -> Day/Week/Month views, Google Calendar sync
       ├── Tasks               -> Kanban board, prioritized list, Google Tasks sync
       ├── Notes               -> Markdown technical journal, full-text search
       ├── Documents           -> File vault, CAD, BOM, Google Drive browser
       ├── Startup Command     -> Pawan Shakti V3F assessment, 15 Nov countdown, BOM economics
       ├── Robotics Lab        -> AgileX PiPER, 3-Drone Swarm, TI mmWave radar, safety layer
       ├── Learning & Career   -> Technical skills matrix, research papers, CV versions
       ├── Finance & Capital   -> Live cash, monthly burn, runway, ANRF ₹25L grant tracker
       ├── Health & Routine    -> 7.2h Circadian sleep, 4.5h Deep Work block timer, habit tracker
       ├── Knowledge & Memory  -> Neo 1 Wearable, MoM intelligence, decision vault
       ├── System Health       -> Device fleet telemetry, storage metrics, sync queue
       ├── Integrations & MCP  -> Google Workspace, NeoSapien tokens, connection health
       └── Settings            -> Workspace areas, theme switcher, JSON backup/restore
```

---

## 4. Local-First Data Layer (Dexie.js IndexedDB)

The local client database (`yashwanth_hub_db` v8) manages 14 primary entities:

| Table | Primary Key | Key Indexes | Purpose |
| :--- | :--- | :--- | :--- |
| `tasks` | `id` (UUID) | `area, due_date, starred, done, project_id, google_task_id` | Core action items, subtasks, founder sprint targets |
| `projects` | `id` (UUID) | `area, status, priority, target_date` | Multi-venture tracking and milestone delivery |
| `events` | `id` (UUID) | `date, kind, area, google_event_id` | Scheduled calendar entries, meetings, deadlines |
| `meetings` | `id` (UUID) | `date, start_time` | Formal stakeholder and team meetings |
| `notes` | `id` (UUID) | `category, starred, updated_at` | Technical notes, sprint logs, research papers |
| `expenses` | `id` (UUID) | `date, category, area` | Financial ledger entries and grant expenditures |
| `documents` | `id` (UUID) | `category, project_id` | Technical assets, CAD links, BOM specifications |
| `neo_memories` | `id` (UUID) | `source, capturedAt, platform, associatedProjectId` | Spoken MoM records, transcript summaries, action items |
| `notifications` | `id` (UUID) | `read, scheduled_for, priority` | System and deadline alert queue |
| `device_fleet` | `id` (UUID) | `platform, status, lastActive` | Active device fleet sessions and heartbeat monitoring |
| `sync_queue` | `id` (UUID) | `service, status, timestamp` | Offline mutation staging and retry queue |
| `ai_logs` | `id` (UUID) | `provider, timestamp` | AI model prompt logs, latencies, and token counts |
| `areas` | `id` (UUID) | `name, color` | Top-level workspace partitions |
| `travel` | `id` (UUID) | `departure_date, return_date` | Travel itineraries and logistics |

---

## 5. Serverless Backend & API Specifications

The Vercel Serverless Architecture consists of exactly 10 endpoints:

### 5.1 Authentication Endpoints
- `GET /api/auth/google/callback`: Handles Google OAuth 2.0 authorization code exchange and PKCE validation.
- `POST /api/auth/google/token`: Exchanges refresh tokens for active access tokens server-side.

### 5.2 Automation & Cron Engine
- `POST /api/automations/dispatch`: Executes automation runs with idempotency locking and timing metrics.
- `GET/POST /api/cron/process-triggers`: Invoked by Vercel Cron (`30 1 * * *` and `0 2 * * *`) to process scheduled triggers, deadline scans, and morning briefings.

### 5.3 External Integrations
- `GET/POST /api/integrations/google-tasks`: Serverless proxy for Google Tasks REST API with automated token vaulting.
- `GET/POST /api/integrations/neosapien`: MCP JSON-RPC 2.0 gateway connecting to `https://api.neosapien.xyz/mcp`.
- `POST /api/integrations/sync`: Central coordinator orchestrating bidirectional sync across all external providers.

### 5.4 NeoSapien Second Brain
- `GET /api/neosapien/callback`: Handles NeoSapien OAuth authentication redirect.
- `GET/POST /api/neosapien/connect`: Manages NeoSapien connection lifecycle and credential storage.
- `GET/POST /api/neosapien/mcp`: Consolidated MCP endpoint handling tool listings, memory sync, and webhooks.

### 5.5 Reusable Serverless Library (`api/_lib/`)
- `api/_lib/db.ts`: Server-side Supabase client with service role key support and immutable execution logging.
- `api/_lib/executor.ts`: Idempotency manager and action execution router.
- `api/_lib/runner.ts`: Core automation logic (task deadline scanning, morning briefings, evening carry-forward).

---

## 6. Remote Database Schema (Supabase PostgreSQL)

Supabase PostgreSQL (`xjhkxnfahkkgwbbtmhtk`, `ap-northeast-1`) mirrors the local schema with Row Level Security (RLS) policies enforcing multi-tenant isolation:

- `public.integration_tokens`: Stores vaulted OAuth access and refresh tokens encrypted with user ownership checks (`user_id = auth.uid()`).
- `public.automations`: Stores registered automation workflows, triggers, and action definitions.
- `public.automation_runs`: Tracks execution history, duration, status, and output payloads.
- `public.automation_execution_logs`: Immutable audit log of every serverless execution.
- `public.tasks`: Remote task mirror supporting bi-directional conflict resolution via `updated_at` timestamps.
- `public.events`: Remote calendar event repository.
- `public.neo_memories`: Cloud storage for wearable and meeting memory transcripts.

---

## 7. Security Architecture & Threat Model

1. **OAuth 2.0 with RFC 7636 PKCE:** Client applications generate cryptographic `code_verifier` and SHA-256 `code_challenge` parameters, completely eliminating authorization code interception risks.
2. **Strict Client-Side Sanitization:** Google Client IDs are stripped of whitespace, quotes, and newlines before submission. Placeholder credentials fail fast with actionable UI diagnostics.
3. **Hardware Safety Interlock:** Physical commands in the Robotics Lab (AgileX PiPER joint enable, drone launch) require Level 3 explicit user confirmation with double-check dialogs to prevent accidental actuator triggering.
4. **Content Security & Frame Headers:** Deployed with strict HTTP headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, and strict Referrer-Policy).
