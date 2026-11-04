# Google Cloud Architecture Setup Guide — Yashwanth Hub

This document defines the production cloud architecture for Yashwanth Hub. Per project instructions, deployment is **deferred** until explicit user approval.

---

## 1. Google Cloud Services Utilized

- **Google Cloud Run**: Serverless container hosting for the backend service (`cloud/server.ts`). Scales to zero when idle to prevent unnecessary costs.
- **Google Secret Manager**: Stores sensitive credentials:
  - `GOOGLE_CLIENT_SECRET`: OAuth 2.0 Web Client Secret
  - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`: Model provider keys
- **Cloud Scheduler**: Sends automated triggers every 15 minutes to `/api/cron/sync-calendars` for two-way Google Calendar synchronization.
- **Google Cloud Logging**: Captures diagnostics, API latencies, and sync errors without exposing user credentials.

---

## 2. Prerequisites & Credentials

1. A Google Cloud Project (e.g. `yashwanth-hub-prod`).
2. Google Cloud SDK (`gcloud`) authenticated in PowerShell.
3. Enabled APIs:
   - Google Calendar API
   - Google Drive API
   - Gmail API
   - Secret Manager API
   - Cloud Run API
   - Cloud Scheduler API

```powershell
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  calendar-json.googleapis.com \
  drive.googleapis.com \
  gmail.googleapis.com
```

---

## 3. Secret Manager Configuration

Store sensitive credentials securely:

```powershell
# Create secrets
echo -n "YOUR_GOOGLE_CLIENT_SECRET" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-
echo -n "YOUR_GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
echo -n "YOUR_ANTHROPIC_KEY" | gcloud secrets create ANTHROPIC_API_KEY --data-file=-
echo -n "YOUR_OPENAI_KEY" | gcloud secrets create OPENAI_API_KEY --data-file=-
```

---

## 4. Google Cloud Run Deployment (Deferred)

When authorized:

```powershell
# Deploy backend container to Cloud Run
gcloud run deploy yashwanth-hub-backend \
  --source ./cloud \
  --region asia-south1 \
  --allow-unauthenticated \
  --set-secrets="GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest"
```

---

## 5. Security & Zero-Leakage Guarantee

- **Never in Frontend**: Client secrets and master AI keys are stored exclusively in Google Secret Manager and consumed only by Cloud Run.
- **Local Persistence**: User workspace data stays in browser IndexedDB (Dexie) and user-authenticated Supabase PostgreSQL tables with Row Level Security (RLS).
