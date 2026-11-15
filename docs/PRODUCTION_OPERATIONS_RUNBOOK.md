# Yashwanth Hub — Production Operations Runbook & Maintenance Guide

**Application:** Yashwanth Hub  
**Date:** November 15, 2026  
**Document Target:** `docs/PRODUCTION_OPERATIONS_RUNBOOK.md`  

---

## 1. System Topology & Operational Health Checks

Yashwanth Hub operates across three interconnected tiers:
1. **Frontend Tier (Vercel Edge):** Serves the PWA client shell, static assets, and service worker from `https://yashwanth-hub.vercel.app/`.
2. **Serverless Tier (Vercel Functions):** Executes `/api/ai/chat`, `/api/cron/process-triggers`, `/api/automations/dispatch`, `/api/auth/google/*`, and `/api/neosapien/mcp`.
3. **Persistence Tier (Supabase PostgreSQL):** Hosted at `https://xjhkxnfahkkgwbbtmhtk.supabase.co` in Tokyo (`ap-northeast-1`).

### Quick Health Verification Checklist
```bash
# 1. Verify live edge deployment
curl -s -I https://yashwanth-hub.vercel.app/ | grep -E "HTTP/2|x-vercel-id"

# 2. Verify AI tool catalog endpoint
curl -s "https://yashwanth-hub.vercel.app/api/ai/chat?action=tools" | grep "hub_add_task"

# 3. Verify PWA service worker registration
curl -s -I https://yashwanth-hub.vercel.app/sw.js | grep "200"

# 4. Verify PWA manifest
curl -s -I https://yashwanth-hub.vercel.app/manifest.webmanifest | grep "200"
```

---

## 2. Founder Daily Operating Rhythm

### 07:00 IST — Morning Command & Daily Planning
1. Open Yashwanth Hub on mobile or desktop: `https://yashwanth-hub.vercel.app/`.
2. Click **"Plan My Day"** in the Dashboard header.
3. Review the **Overdue Triage** card: reschedule stale tasks to today or mark completed.
4. Review the **Top Focus** priorities: star up to 3 high-conviction targets.
5. Inspect **Today's Agenda**: check scheduled meetings and calendar events.
6. Click **"Lock Daily Plan"** to anchor your focus.

### Mid-Day Execution & Focus Mode
1. Click **"Focus"** on the Dashboard recommendation card to enter the Distraction-Free Workspace.
2. The Pomodoro timer (25 minutes) runs with one-click completion.
3. Use Quick Capture (`Ctrl+K` or microphone button) to log spontaneous thoughts with `#area` tags.

### 21:00 IST (Sundays) — Weekly Strategic Retrospective
1. Click **"Weekly Review"** in the Dashboard header.
2. Inspect **Execution Wins**: celebrate completed items from the past 7 days.
3. Review **Active Projects**: verify milestone progress on Pawan Shakti and Robotics Lab.
4. Triage open blockers.
5. Click **"Log Retrospective & Finish"** to generate a timestamped retrospective note.

---

## 3. Standard Troubleshooting Runbooks

### Runbook A: Resolving Google OAuth 401 invalid_client
1. **Symptom:** Server-side Google sync reports `401 invalid_client`.
2. **Diagnosis:** `GOOGLE_CLIENT_SECRET` is missing in Vercel environment variables.
3. **Action:**
   - Retrieve Client Secret from Google Cloud Console under OAuth 2.0 Web Client `236257519636-...`.
   - Add to Vercel: `npx vercel env add GOOGLE_CLIENT_SECRET production`.
   - Redeploy or promote: `npx vercel deploy --prod --yes`.
   - *Temporary Workaround:* Use client-side GIS sync via the Integrations page.

### Runbook B: Cron Trigger Skipped Diagnostic
1. **Symptom:** `/api/cron/process-triggers` returns status `"skipped"`.
2. **Diagnosis:** `SUPABASE_SERVICE_ROLE_KEY` is not set in Vercel environment variables.
3. **Action:**
   - Unattended cron ticks require a service role key to query across all users' queues without an active browser session.
   - User-initiated automations continue to function using PostgreSQL RLS!
   - To enable unattended background cron: `npx vercel env add SUPABASE_SERVICE_ROLE_KEY production`.

### Runbook C: Offline Recovery & Synchronization
1. **Symptom:** User loses internet connectivity during fieldwork or travel.
2. **Behavior:** Dexie IndexedDB stores all changes locally.
3. **Action:** When connectivity resumes, the Service Worker reconnects and pushes queued mutations to Supabase via `IntegrationVaultService.triggerSyncNow()`.

---

## 4. Emergency Contacts & Infrastructure Escalation

- **Product Owner:** Yaswanth Koyaneni
- **Hosting Platform:** Vercel Pro (Project: `yashwanth-hub`)
- **Database Platform:** Supabase Cloud (Project Ref: `xjhkxnfahkkgwbbtmhtk`)
- **Git Repository:** `koyaneni-yaswanth/yashwanth-hub` (Branch: `feat/v2-real-ai-os`)
