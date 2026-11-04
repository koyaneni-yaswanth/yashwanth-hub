# Yashwanth Hub — Personal Founder Command Center

A high-performance, **local-first** personal command center built specifically for founder execution, hardware prototyping, research coordination, and venture scaling.

![Local First](https://img.shields.io/badge/Architecture-Local--First-teal)
![Storage](https://img.shields.io/badge/Database-IndexedDB%20(Dexie)-0b6e6e)
![PWA](https://img.shields.io/badge/PWA-Offline%20Ready-green)
![Status](https://img.shields.io/badge/Status-Production%20Ready-blue)

---

## 🌪️ Executive Summary

**Yashwanth Hub** transforms disconnected spreadsheets, local notes, and fragmented trackers into an integrated, lightning-fast founder dashboard. It runs **100% offline and locally** out of the box using IndexedDB, ensuring zero vendor lock-in, zero cloud latency, and complete data sovereignty.

### Core Modules:
1. **Command Dashboard**: Real-time KPI cards, overdue warnings, quick-add task box, upcoming 7-day schedule, and pinned directives.
2. **Tasks Management**: Area workspaces, priority tagging (`Urgent`, `High`, `Medium`, `Low`), due dates, star filters, and instant status updates.
3. **Calendar**: Month, week, and day grid views for field trips, lab reviews, deadlines, and milestone tracking.
4. **Meetings**: Check-in coordination, video call quick launches, attendee logs, discussion agenda, and action items tracking.
5. **Travel**: Site visits, flights, trains, bookings, PNR references, cost tracking in ₹ INR, and itineraries.
6. **Notes & Directives**: Markdown-friendly note cards, searchable tags, and pin-to-dashboard capabilities.
7. **Documents Vault**: Local file repository storing PDFs, CAD drawings, specifications, and test sheets directly in browser memory (IndexedDB Blobs) with preview and download support.
8. **Expenses**: Financial burn tracking in Indian Rupees (₹), monthly category breakdowns, visual progress bars, and area distribution.
9. **Contacts & Rolodex**: Direct call (`tel:`) and email (`mailto:`) shortcuts for advisors, professors, component suppliers, and collaborators.
10. **Wind Plan (90-Day TRL Roadmap)**: Preserves the authentic **PAWAN SHAKTI** 90-day execution framework (TRL 4 to tested TRL 6 prototype). The animated wind turbine dynamically spins faster as deliverables are checked off.
11. **AI Assistant**: Executive Copilot with instant heuristic data synthesis (Daily Plan, Task Prioritization, Meeting Prep, Burn Rate, and TRL Audit) and configurable external LLM endpoints (OpenAI, Gemini, Claude, Ollama).
12. **Analytics**: Real-time completion velocity, area workspace balance, priority distribution, and financial burn trends.
13. **Settings & Disaster Recovery**: Theme toggles (Light, Dark, System), area management with custom hex colors, one-click full JSON backup export & restore, Supabase cloud configuration, and storage diagnostics.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, TypeScript
- **Bundler & Tooling**: Vite 8, `@tailwindcss/vite`, Tailwind CSS v4
- **Local Database**: IndexedDB powered by `dexie` and reactive `dexie-react-hooks`
- **Icons & Motion**: Lucide React, dynamic CSS turbine rotor animations, Canvas Confetti
- **Offline & PWA**: `vite-plugin-pwa` with automatic service worker registration and asset precaching
- **Cloud Prep**: Supabase client (`@supabase/supabase-js`) ready for staged cloud rollout

---

## 🚀 Quickstart & Local Run (Windows PowerShell)

Ensure Node.js (v18+) is installed.

```powershell
# 1. Navigate to the project directory
cd C:\Users\recvn\Desktop\yashwanth-hub

# 2. Run the development server
npm.cmd run dev

# 3. Open your browser
# Navigate to: http://localhost:5173
```

To create an optimized production build:

```powershell
npm.cmd run build
npm.cmd run preview
```

---

## 🏢 Workspace Areas

Pre-configured with founder workspaces:
- **PAWAN SHAKTI** (`#0b6e6e` - Teal): Small wind turbine innovation & TRL development
- **MG Automation** (`#2563eb` - Blue): Industrial automation & motion engineering
- **IvLabs** (`#7c3aed` - Purple): Robotics & autonomous systems research
- **Waffle Whizz** (`#d97706` - Amber): Retail food enterprise operations
- **Personal** (`#059669` - Emerald): Health, personal development & finances

You can add custom areas and adjust colors directly in **Settings → Personal Workspaces**.

---

## 💾 Backup & Disaster Recovery

Data is stored persistently in your local browser's IndexedDB.

1. **Export Backup**:
   - Go to **Settings → Local Data Backup**.
   - Click **Export Complete JSON Backup** to download a timestamped `.json` file containing all tasks, events, meetings, travel, notes, expenses, contacts, and settings.
   - Or click **Copy Backup Text** to paste into notes or external vaults.

2. **Restore Backup**:
   - Paste any previously exported backup JSON (including legacy `yash-hub-v1` format).
   - Click **Validate & Restore Data**.

---

## ☁️ Future Cloud Integration (Supabase Staged Rollout)

The application adheres strictly to the rule: **Never pretend cloud synchronization is active when it is not.**

When you decide to deploy to production and enable multi-device sync:
1. Create a project at [supabase.com](https://supabase.com).
2. Go to **Settings → View Production SQL Schema** in Yashwanth Hub.
3. Copy the SQL script and run it in the Supabase SQL Editor. It automatically sets up Row Level Security (RLS) so each authenticated user can only access their own records.
4. Input your `Project URL` and `Anon Public Key` in **Settings → Future Cloud Sync**.
5. Click **Test Connection**. Once verified, multi-device cloud synchronization is enabled.

---

## 📋 Comprehensive Testing Checklist

- [x] Application compiles cleanly with zero TypeScript errors.
- [x] PWA service worker and Web App Manifest generate on build.
- [x] Dashboard loads with founder greeting, live KPI cards, and turbine rotation.
- [x] Real-time Dexie queries react instantly to data changes without page reloads.
- [x] Tasks CRUD: creation, area tagging, priority flags, due dates, star toggling, and completion.
- [x] Calendar month/week/day views render events and meetings with category color tags.
- [x] Meetings module tracks attendees, agenda, action items, and video call links.
- [x] Travel module tracks flights, trains, cabs, PNR references, and INR cost estimates.
- [x] Notes module supports tags and dashboard pinning.
- [x] Documents vault accepts file uploads, stores Blobs in IndexedDB, and enables direct downloads.
- [x] Expenses calculate accurate monthly totals, category breakdowns, and INR formatting.
- [x] Contacts directory enables one-click `tel:` calling and `mailto:` email drafting.
- [x] 90-Day Wind Plan calculates current day/week and synchronizes milestones with Tasks.
- [x] AI Assistant provides local heuristic synthesis across all local tables.
- [x] Dark, Light, and System themes switch instantly with accessible contrast.
- [x] Offline operations: fully functional with network disconnected.
