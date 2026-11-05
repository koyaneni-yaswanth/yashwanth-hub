# Yashwanth Hub — System Architecture & Engineering Blueprint

## 1. Executive Summary & Philosophy
**Yashwanth Hub** is a local-first, multi-device, offline-capable AI Personal Operating System, Automation Engine, and Deep-Tech Startup Command Center built specifically for Yashwanth Koyaneni (VNIT Nagpur graduate, founder of Pawan Shakti, robotics lead at IvLabs, engineer at MG Automation).

The architecture adheres to three core tenets:
1. **Local-First & Resilient Data Ownership**: The system boots instantly and operates 100% offline using IndexedDB (Dexie.js), maintaining local cryptographic state, queued mutations, and deterministic caching.
2. **Authenticated Cloud Synchronization**: High-fidelity bidirectional sync with Supabase PostgreSQL (`xjhkxnfahkkgwbbtmhtk`, Tokyo `ap-northeast-1`), Google Workspace (Tasks, Calendar, Gmail), and NeoSapien MCP (`https://api.neosapien.xyz/mcp`).
3. **Multi-Model Orchestration**: Dynamic gateway routing across Google Gemini (2.5 Flash / Pro), Anthropic Claude (3.5 Haiku / Sonnet), and OpenAI (GPT-4o) with dedicated agent specialist personas and explicit human-in-the-loop action approval.

---

## 2. High-Level Architectural Topology

```
+---------------------------------------------------------------------------------------------------+
|                                      CLIENT RUNTIME SURFACES                                       |
|  +-------------------------------------------------+  +----------------------------------------+  |
|  |             Vite + React 18 Web App             |  |      Capacitor 8 Android Mobile App    |  |
|  |     Tailwind CSS / Lucide / KaTeX / Recharts    |  |   Biometrics / Push / Local Storage    |  |
|  +-------------------------------------------------+  +----------------------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                    LOCAL-FIRST DATA PLATFORM                                      |
|  +------------------------------+  +-------------------------------+  +-------------------------+  |
|  |      Dexie.js (IndexedDB)    |  |     SyncQueueService (Queue)  |  |  AgentPresenceService   |  |
|  | 14 Hub Entities & Caches     |  | Offline Mutations & Retries   |  | Floating Cursor / Tour  |  |
|  +------------------------------+  +-------------------------------+  +-------------------------+  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                       +--------------------------+-------------------------+
                       |                                                    |
                       v                                                    v
+--------------------------------------------------+  +---------------------------------------------+
|          VERCEL SERVERLESS AUTOMATION ENGINE     |  |         SUPABASE CLOUD POSTGRESQL           |
|  - /api/automations/dispatch (Execution Engine)  |  |  - Project: xjhkxnfahkkgwbbtmhtk (Tokyo)    |
|  - /api/automations/cron (Scheduled Runs)        |  |  - Tables: automations, automation_runs,    |
|  - /api/google/tasks-sync (Google Sync)          |  |    integration_tokens, events, tasks,      |
|  - /api/neosapien/mcp (Tool Dispatcher)          |  |    expenses, projects, memories, notes      |
+--------------------------------------------------+  |  - Row Level Security (RLS) Policies        |
                       |                              +---------------------------------------------+
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

## 3. The 14 Unified Master Hubs

Yashwanth Hub structures all life, engineering, robotics, startup, and automation workflows into 14 numbered master hubs:

| Hub ID | Name | Route / Key | Primary Core Capabilities |
| :--- | :--- | :--- | :--- |
| **1** | **Home Dashboard** | `dashboard` | KPI stats grid, universal 8-action execution bar, strategic founder cards (Pawan Shakti, Robotics, Routine), live schedule, quick tasks. |
| **2** | **AI Assistant (Jarvis)** | `ai-assistant` | Multi-model chat gateway, specialist selection (Orchestrator, Planning, Research, Execution, Startup, Robotics, Productivity), action approvals with IDs. |
| **3** | **Automations Engine** | `automations` | Event-driven and cron-scheduled workflows, idempotency locking, diagnostic status checks, run history, manual triggers. |
| **4** | **Calendar** | `calendar` | Day/Week/Month views, Google Calendar bidirectional sync, automated purging of legacy seed data, local event creation. |
| **5** | **Tasks** | `tasks` | Kanban and list views, Google Tasks bidirectional token sync, priorities, recurring rules, subtask checklists. |
| **6** | **Projects** | `projects` | Multi-workspace tracker (Pawan Shakti, IvLabs, MG Automation, Personal), milestones, deliverable progress. |
| **7** | **Startup Command** | `startup-command` | Pawan Shakti command center, 6-category V3F 0-3 assessment rubric, 15 Nov countdown, BOM economics (50 and 500 units), risk register. |
| **8** | **Robotics Lab** | `robotics-lab` | AgileX PiPER 6-DOF (ROS 2 / MuJoCo / Isaac Sim), 3-drone swarm (SIYI HM30 mesh), TI AWR2944 77GHz mmWave radar telemetry. |
| **9** | **Knowledge & Memory** | `knowledge-memory` | Neo 1 Wearable & MCP integration, Engineering Notes Vault, Meeting Intelligence & MoMs, Research Vault. |
| **10** | **Finance & Capital** | `finance` | Cash balance, monthly burn, runway projections, unit economics, ANRF ₹25L grant tracker, expense logging modal. |
| **11** | **Health & Routine** | `health-routine` | Circadian sleep tracking (7.2h), 4.5h deep work block timer, founder daily discipline checklist, energy optimization. |
| **12** | **Integrations & MCP** | `integrations` | OAuth token vault, Google Tasks/Calendar/Gmail status, NeoSapien live endpoint health, device fleet telemetry. |
| **13** | **Analytics** | `analytics` | Historical trends, task completion velocity, financial burn curves, Deep Work efficiency indices. |
| **14** | **Settings** | `settings` | Local storage management, data import/export, dark/light theme, area workspace configurations. |

---

## 4. Database & Synchronization Architecture

### 4.1 Local Storage Layer (Dexie.js / IndexedDB)
- Database schema: `yashwanth_hub_db` (Version 8)
- Stores: `tasks`, `projects`, `events`, `meetings`, `notes`, `expenses`, `documents`, `neo_memories`, `notifications`, `travel`, `contacts`, `sync_queue`, `device_fleet`, `ai_logs`.
- Indexes optimized on `[area+due_date]`, `synced`, `category`, and `starred`.

### 4.2 Remote Storage Layer (Supabase PostgreSQL)
- Direct PostgreSQL instance: `db.xjhkxnfahkkgwbbtmhtk.supabase.co`
- Connection pooler: `aws-0-ap-northeast-1.pooler.supabase.com`
- Tables adhere to `supabase/master_schema.sql` with full Row-Level Security (`auth.uid() = user_id`).
- Automated token storage in `public.integration_tokens` with automatic refresh logic.

---

## 5. Security & Isolation Model
1. **Zero Secret Leakage**: No API keys, OAuth client secrets, or private tokens are packaged into client bundles. Frontend accesses services via authenticated Vercel serverless endpoints.
2. **Encrypted Token Vault**: Third-party tokens are stored server-side in Supabase with RLS or client-side in browser `localStorage` with explicit user consent.
3. **Human-in-the-Loop Action Approval**: All autonomous agent actions generate an explicit `Action ID` and require one-click founder approval prior to mutating tasks, schedules, or financial logs.
