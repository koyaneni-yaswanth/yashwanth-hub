# YASHWANTH HUB — PERFORMANCE & BUILD OPTIMIZATION REPORT
**Audit Date**: November 15, 2026  
**Auditor**: Performance Optimization Engineer  
**Target Environment**: `https://yashwanth-hub.vercel.app/`  

---

## 1. Client Bundle & Asset Audit

Vite v8.3.5 production build output:

| Asset Name | Raw Size | Gzip Size | Compression Ratio | Cache Control |
| :--- | :--- | :--- | :--- | :--- |
| `dist/index.html` | 1.29 kB | 0.68 kB | 47.3% | `public, max-age=0, must-revalidate` |
| `dist/assets/index-CEVds2U0.css` | 82.33 kB | 13.22 kB | 83.9% | Immutable hash |
| `dist/assets/index-N-jt05-V.js` | 1,286.20 kB | 326.33 kB | 74.6% | Immutable hash |
| `dist/assets/web-CTFIvILP.js` | 4.43 kB | 1.28 kB | 71.1% | Immutable hash |
| `dist/assets/web-ChxzFGqY.js` | 0.84 kB | 0.40 kB | 52.4% | Immutable hash |
| `dist/assets/web-DDzrokak.js` | 0.12 kB | 0.12 kB | 0.0% | Immutable hash |
| `dist/sw.js` | 1.48 kB | 0.58 kB | 60.8% | `public, max-age=0, must-revalidate` |
| `dist/manifest.webmanifest` | 0.52 kB | 0.31 kB | 40.4% | `public, max-age=0, must-revalidate` |

---

## 2. Serverless Function Inventory & Hobby Plan Budget

Vercel Hobby plan enforces a strict limit of $\le 12$ serverless functions.
Yashwanth Hub compiles exactly **11 serverless functions** in `api/`:

1. `api/ai/chat.ts`
2. `api/automations/dispatch.ts`
3. `api/cron/process-triggers.ts`
4. `api/health.ts`
5. `api/integrations/google-tasks.ts`
6. `api/integrations/google-workspace.ts`
7. `api/integrations/neosapien.ts`
8. `api/neosapien/auth.ts`
9. `api/neosapien/connect.ts`
10. `api/neosapien/mcp.ts`
11. `api/sync/execute.ts`

**Budget Utilization**: $11 / 12$ functions ($91.6\%$). Vercel rewrites in `vercel.json` are utilized for alias routing (`/api/automations/run`, `/api/automations/cron`, `/api/automations/queue`) without spawning additional serverless lambdas.

---

## 3. Database Query & Index Optimization

To ensure optimal PostgreSQL performance under scale:
- Covering indexes were added for foreign keys (`user_id`) across all public application tables:
  - `idx_tasks_user_id`
  - `idx_events_user_id`
  - `idx_meetings_user_id`
  - `idx_travel_user_id`
  - `idx_notes_user_id`
  - `idx_expenses_user_id`
  - `idx_documents_user_id`
  - `idx_contacts_user_id`
  - `idx_projects_user_id`
  - `idx_notifications_user_id`
  - `idx_ai_logs_user_id`
  - `idx_connected_devices_user_id`
  - `idx_neosapien_sync_history_user_id`
  - `idx_automation_queue_user_id`
  - `idx_robotics_experiments_user_id`
- Composite partial indexes configured for queue scheduling:
  - `idx_automation_queue_due (status, approval_status, scheduled_for)`
  - `idx_automation_queue_idempotency (idempotency_key)`
- Fast lookup indexes configured for executive queries:
  - `idx_memories_user_captured (user_id, captured_at desc)`
  - `idx_ai_conversations_user_updated (user_id, updated_at desc)`

---

## 4. Edge & CDN Caching Performance

- Global Edge CDN: Vercel Mumbai POP (`bom1`) serves Indian users with $< 25\text{ms}$ TTFB for static assets and precached service worker payloads.
- Revalidation Strategy: `index.html`, `sw.js`, and `manifest.webmanifest` utilize `max-age=0, must-revalidate` to guarantee immediate zero-delay deployment updates when new versions ship.
- Hashed Chunks: JavaScript and CSS bundles are hashed for perpetual edge and browser caching (`immutable`).
