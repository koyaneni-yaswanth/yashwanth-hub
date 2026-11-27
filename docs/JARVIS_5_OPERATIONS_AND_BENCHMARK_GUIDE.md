# JARVIS 5.0 — Setup, Ollama Quantization, Reliability, Security & Troubleshooting Guide

This guide documents installation, Windows/WSL2 background startup, local GPU sizing, reliability mechanisms, security audit verification, and troubleshooting for Yashwanth Hub & the Local JARVIS Runtime.

---

## 1. Verified Workstation Baseline
Audited on host workstation (`2026-11-27`):
- **CPU/OS**: Windows 11 + **WSL2 `Ubuntu-22.04`**
- **Python**: `3.11.9` (`fastapi 0.115.0`, `uvicorn 0.30.6`, `httpx 0.27.2`, `psutil 7.2.2`, `websockets 16.1.1`)
- **GPU**: **NVIDIA GeForce RTX 5060** (`8151 MiB` total VRAM; `~3320 MiB` free under desktop GUI load)

---

## 2. Ollama Installation & Quantized Model Sizing (RTX 5060 8 GB)

Because an 8 GB VRAM GPU typically leaves `3.0–5.5 GB` free alongside Windows display memory, never attempt unquantized FP16/70B weights. Choose quantized Q4_K_M models:

| Role | Model ID | Est. VRAM | Mode on RTX 5060 | Pull Command |
|---|---|---|---|---|
| **FAST / Standby** | `llama3.2:3b` | ~2.0 GB | Pure GPU | `ollama pull llama3.2:3b` |
| **CODING / Architecture** | `qwen2.5-coder:7b-instruct-q4_K_M` | ~4.7 GB | GPU / Partial CPU | `ollama pull qwen2.5-coder:7b-instruct-q4_K_M` |
| **REASONING** | `qwen2.5:7b-instruct-q4_K_M` | ~4.7 GB | GPU / Partial CPU | `ollama pull qwen2.5:7b-instruct-q4_K_M` |
| **Embeddings** | `nomic-embed-text` | ~0.3 GB | Pure GPU | `ollama pull nomic-embed-text` |

**Install Ollama inside Windows or WSL2 Ubuntu**:
- **Windows**: Download from `https://ollama.com/download/windows` or run `winget install Ollama.Ollama`, then `ollama serve`.
- **WSL2 Ubuntu-22.04**:
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ollama serve &
  ollama pull llama3.2:3b
  ```
The Local JARVIS Runtime automatically unloads previous Ollama models (`keep_alive: 0`) before loading a new model to avoid GPU OOM crashes.

---

## 3. Running & Pairing the Local JARVIS Runtime (`127.0.0.1:8787`)

### Windows 11 (Foreground Test & Auto-Start at Login)
```powershell
cd C:\Users\recvn\Desktop\yashwanth-hub\local-agent
pip install -r requirements.txt
.\scripts\start_windows.ps1
```
To register automatic startup at Windows logon (with 3x automatic crash restart):
```powershell
.\scripts\install_autostart_windows.ps1
```

### WSL2 Ubuntu-22.04 (Foreground & `systemd` Daemon)
```bash
cd /mnt/c/Users/recvn/Desktop/yashwanth-hub/local-agent
pip3 install -r requirements.txt
./scripts/start_wsl_ubuntu.sh
# Optional persistent background service:
./scripts/install_systemd_wsl.sh
```

### Pairing with Yashwanth Hub (`/buddy`)
1. Copy the `jlocal_...` Bearer token printed by `scripts/pair_token.py` (stored at `~/.jarvis-local/agent.token` with `0600` permissions).
2. Open `/buddy` -> click **Providers** (or the top status pill) -> **Local Runtime & Ollama GPU**.
3. Keep URL at `http://127.0.0.1:8787`, paste token, and click **Connect & Verify Local Runtime**.
4. The status pill transitions honestly to **`LOCAL ONLINE`** whenever both `127.0.0.1:8787` and Ollama are healthy.

---

## 4. Security Audit Checklist
1. **Loopback-Only Local Binding**: FastAPI refuses non-`127.0.0.1` hosts unless `JARVIS_ALLOW_NON_LOOPBACK=true` is explicitly set.
2. **Bearer Token & Origin Allowlist**: All `/status`, `/models`, `/tasks`, `/chat`, `/tools/execute`, `/approvals`, and `WS /events` endpoints enforce constant-time `secrets.compare_digest` Bearer auth and reject disallowed `Origin` headers with `403`.
3. **Filesystem & Shell Containment**: `resolve_authorized_path` canonicalizes paths against `JARVIS_ALLOWED_DIRS`, blocks `..` traversal, forbids reading `.env`, `*.pem`, `*.key`, `agent.token`, and permits only explicit read-only diagnostic commands in `SHELL_DIAGNOSTIC_ALLOWLIST`.
4. **Tiered Approval Policy**: `write_doc` queues a Tier 2 approval; destructive/shell operations (`shell_exec`, `delete_file`, `wipe_db`) are Tier 3 blocked (`403`).
5. **Server-Side AES-256-GCM Credential Vault**: Cloud provider API keys submitted from the UI are encrypted server-side in `public.provider_credentials` (`v1:iv:tag:cipher` using `AI_VAULT_ENCRYPTION_KEY`) and masked on read (`sk-...1234`); plain keys never enter Dexie, localStorage, or client JS bundles.
6. **Memory Secret Scrubber & Prompt Injection Guard**: Passwords/tokens are rejected before companion memory storage, and external data is fenced inside `<untrusted_external_data>`.
7. **Legacy File Note**: `cloud/server.ts` is an inactive historical Express stub outside Vercel routing (`vercel.json`) and should not be deployed without strict origin/auth hardening.

---

## 5. Reliability, Benchmarks & Backups
- **Measured Production Build & Automated Verification (`2026-11-27`)**:
  - Frontend build (`tsc -b && vite build`): `~1.5s` production bundle cleanly code-split.
  - Cloud health endpoint latency (`GEMINI_API_KEY` probe via `/api/ai/chat?action=health`): `~120ms`.
  - Automated Test Suite: All Python FastAPI runtime tests (`pytest`) and all Node unit + reliability + router + security tests pass cleanly.
- **Reliability Features**:
  - **5-Category Router** (`FAST`, `REASONING`, `CODING`, `MULTIMODAL`, `LOCAL`) + capability gate prevents silent broken downgrades.
  - **Per-Provider Circuit Breaker**: Opens for 30s after 3 consecutive transient errors, probes `half_open`, and fails over transparently with visible notice.
  - **SQLite Crash Recovery & Dead-Letter Queue**: Any `running` task interrupted by crash recovers back to `queued` on restart; tasks exhausting `max_retries` move to `dead_letter` until retried via `/tasks/retry-dead-letter`.
- **Database Backups**: Export long-term companion memories anytime via `/buddy -> Memory -> Export JSON`, enable Supabase scheduled PITR/backups on Postgres (`provider_credentials`, `companion_memories`, `tasks`, `projects`), and back up `~/.jarvis-local/jarvis_local.db`.

---

## 6. Troubleshooting
- **Status pill shows `CLOUD ONLINE` instead of `LOCAL ONLINE`**: Ensure `start_windows.ps1` (or WSL service) AND `ollama serve` are both running and your `jlocal_...` token is pasted in the Local Runtime drawer.
- **Cannot save encrypted cloud API key in Provider Config**: Verify `AI_VAULT_ENCRYPTION_KEY` (32+ chars) or `SUPABASE_SERVICE_ROLE_KEY` is configured in Vercel Environment Variables.
- **Ollama OOM / slow CPU generation**: Unload active models via `/buddy -> Providers -> Local Runtime -> Unload VRAM`, pull `llama3.2:3b`, and retry.
