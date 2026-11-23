# Yashwanth Hub — System Audit for Jarvis OS v3.0

_Audit date: 23 Nov 2026 · Code at `v3-preview` (`cdb4bbc`) + this audit's fixes · Live: yashwanth-hub.vercel.app_

## How this was checked (and its limits)

- Read the code directly: API routes (`api/`), server libs (`api/_lib/`), frontend pages, sync layer, Supabase migrations (`supabase/migrations/`), Vercel config and production env-var names.
- Verified two production failures earlier from Vercel runtime logs and environment settings.
- **Not verified:** the live Supabase database itself (only the migrations in the repo were read), live AI calls (no API key used), and Google/NeoSapien OAuth flows end to end.

## Fixed during this audit

| Issue | Cause | Fix |
|---|---|---|
| Overdue tasks shown as "due today" on Home | The header counted overdue + due-today together as "N tasks due today" | Header now says e.g. "1 overdue • 3 due today • 0 upcoming" |
| Tasks due today missing / dates compared wrongly | The browser Google Tasks import stored raw timestamps (`2026-11-04T00:00:00.000Z`), so plain string comparisons failed | New `toDueKey` / `dueStatus` in `src/lib/utils.ts`; every task write is normalised in `TaskService`; one-time start-up repair rewrites stored timestamps (synced) |
| Undated Google tasks became "due today" | Import used `gt.due || getTodayISO()` | Undated tasks stay undated. Past imports given today's date can't be told apart and were left |
| Fabricated verification | "Upload Proof & Metric" said "Photo/CSV verified" with no upload | Now says honestly that nothing was uploaded or verified |

## Working (verified in code and/or browser)

- Local-first task engine: IndexedDB (Dexie) + sync queue with idempotency keys and conflict handling; one shared `TaskService` write path.
- Daily Compass (Top 3, time budget, rescue mode, wrap-up), Deep Work (sessions, focus field, history), Goals & Habits, Memory Vault journal, Momentum (score, next action, forecasts, constellation, tour, time machine), Analytics ranges + heatmap.
- AI action safety: the AI tool layer **only proposes** writes (`propose_create_task`, `propose_schedule_event`, `propose_create_note_or_decision`, `propose_automation_trigger`); no direct inserts in `api/_lib/aiTools.ts`.
- Supabase migrations: 20 tables, **RLS enabled on all 20**, no `using (true)` policies, no destructive statements.
- Accessibility: 0 axe WCAG 2.2 AA violations across the pages checked this week.

## Broken (production)

1. **Automations** — `/api/automations/dispatch` fails: no `SUPABASE_SERVICE_ROLE_KEY` in Vercel, so the server falls back to the anon key and RLS blocks `automation_runs` inserts. _Fix: add the key in Vercel (owner action)._
2. **Google sign-in token exchange** — `invalid_client`: `GOOGLE_CLIENT_SECRET` in Vercel doesn't match the OAuth client. _Fix: replace the secret (owner action)._
3. **AI model selection is likely broken** — `api/ai/chat.ts:626` maps `gemini-3.8-flash` / `gemini-2.5-flash` to **`gemini-1.5-pro`**, and `src/services/ai/aiModels.ts` defaults to it. Gemini 1.5 models have been retired, so these calls probably fail and fall back to the local deterministic engine. Six different model ids appear in code (`1.5-flash`, `1.5-pro`, `2.0-flash`, `2.5-flash`, `2.5-pro`, `3.8-flash`). _Needs a live test with the key._

## Partial

- **Cloud sync coverage:** goals, goal milestones, habits, habit logs, daily plans and focus sessions were local-only. _Phase 2: synced via `src/services/sync/lifeSync.ts` once `supabase/migrations/20261124_phase2_goals_habits_focus_sync.sql` is applied (owner action)._
- **Schema drift:** the repo defines 20 tables; the owner believes production has 27. Any tables created in the Supabase dashboard aren't in migrations, so they can't be reviewed or recreated. The app also relies on `tasks`, `events`, `meetings`, `notes`, `projects`, `expenses`, `notifications` and `neo_memories`, none of which has a migration. _Run `supabase/schema-drift-check.sql` (read-only) to capture them._
- **Documents:** some files are local-only ("File content is not available locally").
- **Blocking `alert()` dialogs** in 14 places (Settings, Meetings, Gmail, Neo Memory, Documents, Wind Plan) instead of accessible inline/toast messages.

## Duplicates

- Two routes each for **Pawan Shakti** (`startup-command`, `wind-plan`), **Memory Vault** (`knowledge-memory`, `neo-memory`), **Files & Docs** (`documents`, `files`) and **Finance** (`finance`, `expenses`).
- Notes vs Memory Vault journal vs Neo Memory overlap as "knowledge".

## Security

| Severity | Finding |
|---|---|
| Medium | `api/auth/google/token.ts:303` logs the full Google client error, which includes the OAuth `code` and PKCE `code_verifier` (client secret is redacted). Log only the error code/message. |
| Medium | `Access-Control-Allow-Origin: *` on 9 authenticated API routes. Bearer auth limits the risk, but restrict to the app's origins. |
| Low | `api/neosapien/connect.ts` / `callback.ts` have no Supabase-user check; relies on OAuth `state` — confirm the state is bound to the signed-in user. |
| OK | No `VITE_`-prefixed secrets in the client; service-role key only referenced server-side. |

## Missing (requested in the v3.0 brief)

Customisable/persisted dashboard widgets; daily AI briefing with evidence links; task subtasks, recurrence, dependencies, kanban/timeline views, time tracking, attachments, comments, history; full calendar (day/week/month/agenda, drag-drop, recurring events, conflict detection); specialist agents with per-agent tools and permissions; streaming, token/cost tracking and rate limiting in the AI layer; robotics inventory and log analysis; Pawan Shakti BOM/inventory/suppliers/test reports; flashcards and revision schedules; rich-text notes with backlinks and version history; document versioning and Q&A; budgets and cash flow; a visual automation builder; semantic search; weekly report generation.

## Recommended order

1. **Stabilise (days):** owner adds the two Vercel keys; fix AI model ids with one configurable provider layer and a live test; stop logging OAuth secrets; restrict CORS; replace `alert()`s; merge duplicate routes.
2. **Data foundation:** sync goals/habits/plans/focus sessions to Supabase (new migrations + RLS); bring dashboard-created tables into migrations.
3. **Tasks & Calendar v3:** subtasks, recurrence, dependencies, kanban/list/calendar views; calendar views + conflict detection.
4. **Jarvis AI v3:** provider layer, streaming, evidence-linked daily briefing, specialist agents with explicit tool permissions and action logs.
5. **Workspaces:** Pawan Shakti (BOM, suppliers, tests, TRL evidence), Robotics Lab (inventory, log analysis), Learning (flashcards, revision).
6. **Knowledge, documents, automations, search:** storage-backed documents, backlinks, semantic search, backend automation builder.
