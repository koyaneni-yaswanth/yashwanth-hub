# JARVIS 5.0 — Architecture & Repository Audit Report

**Project**: Yashwanth Hub (`https://yashwanth-hub.vercel.app`)  
**Audit Date**: 2026-11-27  
**Baseline Commit**: `c175b7f` (`v4-jarvis-hud` & `main`)

---

## 1. Phase 1 Repository & Local System Audit

### 1.1 Empirical Host Environment Findings
Measured directly on the workstation:
- **Python Runtime**: `Python 3.11.9` (`pip 26.0.1`) with `fastapi 0.115.0`, `uvicorn 0.30.6`, `httpx 0.27.2`, `websockets 16.1.1`, `pydantic 2.9.2`, `psutil 7.2.2`, `SQLAlchemy 2.0.35`, `cryptography 49.0.0`, `pytest 8.3.3` installed.
- **GPU**: `NVIDIA GeForce RTX 5060` (`8151 MiB` total VRAM, `3320 MiB` free under desktop load). Optimal local quantized models: `qwen2.5-coder:7b-instruct-q4_K_M` (~4.7 GB) and `llama3.2:3b` (~2.0 GB) with CPU fallback when VRAM is constrained.
- **WSL2**: `Ubuntu-22.04` (Running, WSL2, Python `3.10.12`), `Ubuntu-26.04` (Stopped, WSL2).
- **Ollama Daemon**: Not currently installed on Windows PATH or `Ubuntu-22.04` WSL (`127.0.0.1:11434` inactive).

### 1.2 Existing Codebase Architecture Inventory
- **Frontend**: React `19.3`, Vite `8.3` (`rolldown`), Tailwind CSS v4, Dexie `4.4.7` (schema v10), Three.js `0.187.0` (`JarvisScene` + `BuddyCoreScene` on `/buddy`), PWA Workbox, Capacitor Android/iOS.
- **Vercel Serverless Functions (`12 / 12` Hobby limit — saturated)**:
  - `api/ai/chat.ts`, `api/buddy.ts`, `api/auth/google/callback.ts`, `api/auth/google/token.ts`, `api/automations/dispatch.ts`, `api/cron/process-triggers.ts`, `api/integrations/google-tasks.ts`, `api/integrations/neosapien.ts`, `api/integrations/sync.ts`, `api/neosapien/callback.ts`, `api/neosapien/connect.ts`, `api/neosapien/mcp.ts`.
  - **Hard Constraint**: Any new backend endpoints MUST live inside shared `api/_lib/*` modules routed via `?action=` on `api/ai/chat.ts` or `api/buddy.ts` (never adding a 13th function file in `api/`).
- **Supabase Postgres**: Owner-only `(select auth.uid()) = user_id` RLS, `pgvector` HNSW indexes (`knowledge_embeddings`, `companion_memories`), `companion_timeline`, `awareness_sources`, `automation_queue`, `user_preferences`.

### 1.3 Identified Gaps, Duplicate/Legacy Paths & Reliability Risks
1. **Legacy Duplicate Server Stub (`cloud/server.ts`)**: Unused Cloud Run Express stub containing wildcard CORS (`origin: true`) and an unauthenticated cron route; isolated from Vercel production routes and flagged for deprecation/isolation in security documentation.
2. **AI Gateway Contract & Cancellation Gaps (`src/services/ai/aiGateway.ts`)**:
   - Missing standardized `stream()`, `chat()`, `listModels()`, and `cancel()` (`AbortController`) lifecycle across active requests.
   - Missing per-provider **circuit breakers**, **jittered backoff**, **request/correlation IDs**, and explicit **capability mismatch protection** (avoiding silent downgrade from complex reasoning models to weak/incompatible providers).
   - Missing **per-provider independent configuration UI** (enable/disable switch, connection test, encrypted server-side credential storage, rate-limit/circuit state).
3. **5-Category Task Router Missing (`FAST` / `REASONING` / `CODING` / `MULTIMODAL` / `LOCAL`)**: Currently routing uses simple latency sorting or fixed `simple`/`moderate`/`complex` lists without modality/privacy/GPU/circuit awareness.
4. **No Persistent Local Autonomous Agent**: Browser-only direct calls to `127.0.0.1:11434` stop when tabs close and cannot execute approved local project diagnostics/file searches cleanly or manage Ollama VRAM/model loading.
5. **Website-to-Local Status Surface**: `/buddy` lacks a compact unified `LOCAL ONLINE | CLOUD ONLINE | DEGRADED | OFFLINE` pill backed by diagnostics (local agent WebSocket + circuit breakers + dead-letter queue + Abort/Cancel stream control).

---

## 2. Target JARVIS 5.0 Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                      YASHWANTH HUB WEB / PWA / CAPACITOR UI                       |
|   /buddy 3D Companion  |  Ask AI Studio  |  Provider Config & Reliability Drawer   |
|   Status Pill: [ LOCAL ONLINE | CLOUD ONLINE | DEGRADED | OFFLINE ]               |
+---------------+-----------------------------------+-------------------------------+
                | Authenticated HTTPS + SSE         | Loopback HTTP/WS (127.0.0.1:8787)
                | (Supabase JWT + X-Request-Id)     | (Bearer Token + Origin Check)
                v                                   v
+-----------------------------------+   +-------------------------------------------+
|    VERCEL SERVERLESS GATEWAY      |   |    LOCAL JARVIS AGENT (Python FastAPI)    |
|  /api/ai/chat (Router + Vault)    |   |  /health /status /models /tasks /chat     |
|  /api/buddy   (Companion + Cron)  |   |  /agents /events (WS) /approvals          |
|  - Circuit Breaker + Backoff      |   |  - SQLite Persistent Task & Log Queue     |
|  - Encrypted Provider Keys (GCM)  |   |  - Bounded Concurrency + Approval Gate    |
|  - 5-Category Router              |   |  - Allowlisted Read/Diag/Script Tools     |
+-------+-------------------+-------+   +-------------------+-----------------------+
        |                   |                               |
        v                   v                               v
+---------------+   +---------------+           +-------------------------------+
| CLOUD AI APIS |   | SUPABASE PG   |           |   LOCAL OLLAMA ENGINE         |
| Gemini, GPT,  |   | RLS + pgvector|           |   127.0.0.1:11434             |
| Claude, OR,   |   | Memory + Queue|           |   GPU/VRAM Monitor (RTX 5060) |
| HuggingFace   |   | Vault (AES)   |           |   Quantized Load/Unload/CPU   |
+---------------+   +---------------+           +-------------------------------+
```

---

## 3. Incremental Delivery Milestones (JARVIS 5.0)
1. **Phase 1**: Repository, hardware & security audit + Architecture blueprint (this document).
2. **Milestones 2, 3 & 7**: Unified AI Gateway (`generate`, `stream`, `chat`, `analyze`, `embed`, `healthCheck`, `listModels`, `getUsage`, `cancel`), 5-category smart router (`FAST`, `REASONING`, `CODING`, `MULTIMODAL`, `LOCAL`), circuit breaker + jittered retry, encrypted server-side per-user credential vault (`provider_credentials`), & transparent fallback notifications.
3. **Milestones 4 & 5**: Python FastAPI Local JARVIS Runtime (`local-agent/`) with SQLite persistence, WebSocket `/events`, loopback binding, origin & token auth, workspace-bounded tools, shell allowlist, approval queue, Ollama GPU/VRAM/CPU orchestrator, Windows & WSL2 startup scripts + `pytest` tests.
4. **Milestones 6, 8 & 9**: Connect `/buddy` & Hub Settings to Local Agent + Provider Config Manager + System Reliability Monitor (`LOCAL ONLINE | CLOUD ONLINE | DEGRADED | OFFLINE`), stream cancellation, dead-letter visibility, and real-time logs.
5. **Milestone 10**: Comprehensive unit/reliability/E2E/benchmark verification, security review, documentation & live production deployment.
