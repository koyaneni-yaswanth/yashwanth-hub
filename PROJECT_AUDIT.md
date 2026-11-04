# YASHWANTH HUB — COMPREHENSIVE PROJECT AUDIT
**Date**: November 5, 2026 | **Auditor**: Principal Systems Architect & Engineering Lead
**Repository**: `https://github.com/koyaneni-yaswanth/yashwanth-hub.git`
**Production Deployment**: `https://yashwanth-hub.vercel.app` (Vercel Ready)
**Founder**: Yaswanth (`koyaneniyaswanth@gmail.com`)

---

## 1. Executive Summary
Yashwanth Hub is an operational, production-deployed local-first Personal AI Operating System and founder command dashboard. It is designed to bridge the founder's daily hardware engineering sprints (Pawan Shakti, Robotics/IvLabs, MG Automation), Google Workspace digital life, and NeoSapien wearable memory streams into a single unified interface.

This audit establishes the ground-truth technical baseline of the repository at commit `8e5d8fd` prior to initiating the multi-phase Personal AI Operating System expansion.

---

## 2. Technology Stack & Environment

| Component | Technology | Version | Purpose / Architecture |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | React | `19.3.1` | Concurrent root mode, hooks-based functional UI |
| **Language** | TypeScript | `~7.0.2` | Strict typing with `tsconfig.app.json` and `tsconfig.node.json` |
| **Build Tooling** | Vite | `8.3.5` | Instant HMR, Rolldown-backed build pipeline, PWA plugin |
| **Styling** | Tailwind CSS | `4.3.4` | Modern `@tailwindcss/vite` engine with custom CSS variables in `index.css` |
| **Icons & UI** | Lucide React | `1.68.0` | Feather/Lucide vector icon library |
| **Local Database** | Dexie.js | `4.4.7` | Client-side IndexedDB wrapper with reactive hooks (`dexie-react-hooks` `4.4.0`) |
| **Cloud Database** | Supabase JS | `2.118.0` | PostgreSQL client with Row Level Security (RLS) and Realtime WebSocket pub/sub |
| **PWA & Offline** | Vite Plugin PWA | `2.0.0` | Service Worker caching, manifest generation, offline-first execution |
| **Linter** | Oxlint | `1.89.0` | Ultra-fast Rust-based static code analysis |

---

## 3. Architecture & Backend Topology

### 3.1 Local-First Client Architecture
- **Execution Model**: Single Page Application (SPA) deployed statically to Vercel's global edge network.
- **Data Persistence**: Local-first storage in browser IndexedDB via Dexie (`YashwanthHubDB`, schema version 6). All reads and writes function 100% offline without network round-trips.
- **Serverless API Layer**: Client-side services communicate directly with third-party APIs using authenticated bearer tokens:
  - Google Cloud REST APIs (Calendar v3, Gmail v1, Tasks v1, Drive v3, Photos v1, People v1).
  - NeoSapien MCP Server (SSE stream via `http://localhost:3001/sse` or user-defined secure endpoint).
  - Supabase PostgreSQL backend (`lib/supabase.ts`) with RLS enforcement.

### 3.2 Routing & Navigation Structure
- Controlled via central state in `src/App.tsx` and synchronized with URL hash / browser history.
- **17 Functional Views**:
  1. `dashboard`: Founder Command Center & real-time KPI overview
  2. `tasks`: Local-first Task Management with Priority, Area, and Plan filters
  3. `calendar`: Month/Week/Day Interactive Calendar with Google Calendar Sync
  4. `meetings`: Meeting Intelligence Hub, Pre-Meeting Briefs, Post-Meeting Action Items
  5. `notes`: Markdown Notes, Pinned Directives, Tag Search
  6. `expenses`: Financial Tracking with Zero Auto-Logging enforcement and Quarantine Inspector
  7. `travel`: Field Engineering Trip Logistics & Itineraries
  8. `people`: Stakeholder Directory (Advisors, Vendors, Engineers)
  9. `docs`: Document & Blueprint Library
  10. `files-photos`: Google Drive & Google Photos Workspace Assets
  11. `gmail`: Gmail Intelligence, Follow-up Drafts, Thread Search
  12. `projects`: High-level Project Tracking & Milestone Management
  13. `wind-plan`: 90-Day Pawan Shakti Wind Turbine Execution Engine
  14. `ai`: Multi-Model AI Assistant with local IndexedDB grounding
  15. `neo-center`: NeoSapien Second Brain Memory Center & Action Items
  16. `health-sync`: Central Sync Engine & Integration Diagnostics
  17. `settings`: Google OAuth Config, Backup & Restore, Privacy Controls

---

## 4. Database Schema Audit

### 4.1 Dexie IndexedDB (`YashwanthHubDB` - Schema v6)
Total Tables: **28**

| Table | Primary Key | Key Indexes | Description |
| :--- | :--- | :--- | :--- |
| `tasks` | `id` | `text, area, priority, due_date, starred, done, created_at` | Founder tasks |
| `events` | `id` | `title, date, kind, area, created_at` | Calendar events & deadlines |
| `meetings` | `id` | `title, date, area, status, created_at` | Meeting intelligence records |
| `travel` | `id` | `destination, start_date, end_date, area, status, created_at` | Trip logistics |
| `notes` | `id` | `title, pinned, area, created_at` | Directives & technical notes |
| `expenses` | `id` | `amount, category, area, date, created_at` | Financial records (manually entered only) |
| `contacts` | `id` | `name, company, area, created_at` | Network & supplier directory |
| `documents` | `id` | `title, file_name, area, created_at` | Stored specifications & files |
| `areas` | `id` | `name, created_at` | Workspaces (PAWAN SHAKTI, IvLabs, etc.) |
| `settings` | `key` | `updated_at` | Local configuration key-values |
| `sync_queue` | `id` | `table_name, record_id, created_at` | Offline sync backlog |
| `projects` | `id` | `title, area, status, priority, target_date, created_at` | Multi-week engineering projects |
| `notifications` | `id` | `type, priority, read, created_at` | Real-time alerts & reminders |
| `ai_logs` | `id` | `provider, modelId, timestamp` | AI inference telemetry |
| `gmail_messages` | `id` | `threadId, from, subject, date, status` | Gmail synchronized messages |
| `photos_media` | `id` | `mediaItemId, filename, mimeType, project_id, selectedAt` | Google Photos synchronized media |
| `sync_history` | `id` | `service, status, timestamp` | Service synchronization logs |
| `device_sessions` | `id` | `deviceName, platform, isCurrent, lastActive` | Device security session tracking |
| `google_tasks` | `id` | `title, status, due, listId, hubTaskId, updated` | Two-way synced Google Tasks |
| `neo_memories` | `id` | `originalNeoId, title, source, platform, capturedAt, ...` | NeoSapien captured memories |
| `neo_sync_audit` | `id` | `timestamp, method, status` | Neo sync audit records |
| `hub_integrations` | `id` | `provider, status, auth_type, updated_at` | Integration state |
| `connected_devices`| `id` | `device_type, connection_state, listening_state, ...` | Telemetry for Neo 1 & companion devices |
| `device_status_history`| `id` | `device_id, recorded_at` | Telemetry time series |
| `meeting_summaries`| `id` | `meeting_id, source_memory_id, created_at` | Pre/Post meeting AI summaries |
| `sync_jobs` | `id` | `service, status, started_at` | Background sync jobs |
| `integration_events`| `id`| `integration_id, event_type, status, created_at` | Webhook / event intake |
| `quarantine` | `id` | `entity_type, original_id, source, quarantined_at` | Excluded unverified records |
| `data_audit_logs` | `id` | `timestamp, action, entity_type, record_id` | Audit trails for all data mutations |

### 4.2 Supabase PostgreSQL Cloud Schema
Defined in `supabase/migrations/20261104_neo1_realtime_os.sql`:
- 10 Tables: `integrations`, `connected_devices`, `device_status_history`, `memories`, `meeting_summaries`, `sync_jobs`, `integration_events`, `tasks`, `events`, `expenses`.
- Security: Row Level Security (RLS) active on 100% of tables with `auth.uid() = user_id` isolation.
- Realtime: Publications configured on `connected_devices`, `memories`, `meeting_summaries`, and `tasks` for instant cross-device updates.

---

## 5. Authentication & Security Audit
1. **Google OAuth 2.0**:
   - Provider: Google Identity Services (GIS) Web Client Token Model (`google.accounts.oauth2.initTokenClient`).
   - Active Client ID: `236257519636-q6kb0ika36uqleovphts0s526er75ms6.apps.googleusercontent.com`.
   - Authorized Origins: `https://yashwanth-hub.vercel.app`, `http://localhost:5173`.
   - Security Model: Scopes requested dynamically with user consent; tokens held in memory/session and refreshed client-side. Secrets never embedded in client bundles.
2. **Supabase Authentication**:
   - JWT tokens verified against Supabase RLS.
3. **Data Integrity Protocol v2 Enforced**:
   - Zero fabrication rule active.
   - Zero auto-logging of expenses enforced.
   - Provenance tracking active.

---

## 6. Deployment & CI/CD Pipeline
- **GitHub Repository**: `koyaneni-yaswanth/yashwanth-hub` (`main` branch).
- **Vercel Project**: `yashwanth-hub` (Production URL: `https://yashwanth-hub.vercel.app`).
- **Configuration**:
  - `vercel.json` enforces SPA fallback (`"source": "/(.*)", "destination": "/index.html"`).
  - Clean TypeScript compilation (`tsc -b && vite build` in ~300ms).
  - Zero build warnings or bundle regressions.

---

## 7. Audit Findings & Critical Observations
1. **Physical vs. Cloud Separation**: The architecture already cleanly separates physical hardware telemetry (`NeoDeviceStatusManager` via Web Bluetooth / Android companion) from cloud account memory sync (`NeoSapienMemoryService` via MCP / SSE).
2. **Data Cleanliness**: Fake seed expenses have been successfully quarantined. Other modules (tasks, events, meetings, notes) contain prototype seed data that will be cleansed in Phase 1 upon founder authorization.
3. **Hardware Telemetry Readiness**: GATT battery and device information services are declared and ready for real device pairing.
