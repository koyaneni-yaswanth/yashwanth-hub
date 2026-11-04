# YASHWANTH HUB — EXISTING FEATURES INVENTORY
**Date**: November 5, 2026 | **Audit Scope**: Full Codebase Functional Inventory
**Version**: 2.1-OS

---

## 1. Page & View Inventory

| Page / Route | Component File | Current Status | Capabilities & Features |
| :--- | :--- | :--- | :--- |
| **Command Dashboard** | `src/pages/DashboardPage.tsx` | **Operational** | Founder greeting, 90-Day Wind Plan progress bar, 4 live KPI cards (Due & Overdue, Open Tasks, Spent This Month, Schedule 7 Days), Neo 1 Device Card, Quick Add Task box, Due Today list, Upcoming in 7 Days list, Pinned Notes. |
| **Tasks Hub** | `src/pages/TasksPage.tsx` | **Operational** | Local-first CRUD, Priority filters (Urgent/High/Med/Low), Area filter, Starred toggle, Plan tag indicator, Confetti celebration on completion, Search bar. |
| **Interactive Calendar** | `src/pages/CalendarPage.tsx` | **Operational** | Month, Week, and Day calendar views, Event modal editor, Date navigation, Google Calendar bi-directional synchronization. |
| **Meetings Hub** | `src/pages/MeetingsPage.tsx` | **Operational** | Scheduled & Past meetings tabs, Pre-Meeting Brief generator, Post-Meeting Follow-Up generator, Google Meet link launcher, Attendee tracking. |
| **Expenses & Financials** | `src/pages/ExpensesPage.tsx` | **Operational (Protocol v2 Compliant)** | Zero auto-logging enforced, Monthly cycle burn rate, Category breakdown, Average ticket calculation, Manual entry modal (amount, category, area, date, payment method, linked task, receipt doc), Collapsible Quarantine & Data Audit Log viewer. |
| **Notes & Directives** | `src/pages/NotesPage.tsx` | **Operational** | Markdown note editor, Pinned cards, Workspace area tags, Real-time search. |
| **Travel Logistics** | `src/pages/TravelPage.tsx` | **Operational** | Vendor evaluation trips, Booking reference, Itinerary notes, Estimated cost, Status tracking (planning/booked/completed). |
| **Contacts Directory** | `src/pages/ContactsPage.tsx` | **Operational** | Stakeholder management, Role & Company, Email & Phone click-to-contact, Area tags. |
| **Documents Library** | `src/pages/DocumentsPage.tsx` | **Operational** | File metadata, Category sorting, File size display, Blueprint notes. |
| **Files & Photos** | `src/pages/FilesAndPhotosPage.tsx` | **Operational** | Google Drive synchronized files, Google Photos media library, Project tagging, Fullscreen image modal. |
| **Gmail Intelligence** | `src/pages/GmailPage.tsx` | **Operational** | Read threads, Search emails, Follow-up status tracking, Action-item extraction, Follow-up email draft generator with user approval gate. |
| **Projects Center** | `src/pages/ProjectsPage.tsx` | **Operational** | Multi-week project tracking, Progress percentages, Milestones checklist, Priority badges, Target date countdowns. |
| **Pawan Shakti 90-Day** | `src/pages/WindPlanPage.tsx` | **Operational** | 6 Interactive Tabs: Executive Roadmap, Baseline Architecture (Physics calc: $P = \frac{1}{2}\rho A v^3$), Two-Pod R&D Shootout matrix, 90-Day Gantt Timeline, Micro-Task Execution Engine (Days 1–7 active, Days 8–90 locked), Grant & Testing Log downloaders. |
| **AI Personal Assistant** | `src/pages/AIAssistantPage.tsx` | **Operational** | Multi-model picker (Gemini 1.5, Claude 3.5, GPT-4o), Chat history, System prompt configuration, IndexedDB ground-truth RAG retrieval. |
| **Neo Memory Center** | `src/pages/NeoMemoryCenterPage.tsx` | **Operational** | Second Brain memory timeline, Semantic search, Detailed memory modal, Decisions & Action items reconciliation, JSON export, Live sync audit inspector. |
| **System Health & Sync** | `src/pages/SystemHealthSyncCenterPage.tsx` | **Operational** | Central Sync Diagnostics, Status cards for 6 services, Trigger Full Sync, Sync error log, Sync conflict resolution mode. |
| **Settings & Security** | `src/pages/SettingsPage.tsx` | **Operational** | Google OAuth Client ID setup, Local backup export/import, Reset options, Privacy directives. |

---

## 2. Reusable Component Inventory

- `src/components/common/Badge.tsx`: Color-coded area and priority badges (teal, purple, amber, red, blue, green).
- `src/components/common/CommandPalette.tsx`: Global search and quick-navigation modal (triggered via `Cmd/Ctrl + K` or search buttons).
- `src/components/common/ConfirmDialog.tsx`: Modal confirmation before destructive actions.
- `src/components/common/Modal.tsx`: Accessible, animated dialog wrapper.
- `src/components/common/StatCard.tsx`: Standardized KPI card with icon, title, value, subtext, and click handlers.
- `src/components/common/TurbineLogo.tsx`: SVG animated wind turbine logo with dynamic rotational speed tied to progress.
- `src/components/layout/Header.tsx`: Area workspace switcher, global search, notifications indicator, theme toggle.
- `src/components/layout/Sidebar.tsx`: Desktop navigation with icon badges and active indicators.
- `src/components/layout/MobileNav.tsx`: Responsive mobile bottom bar and drawer.
- `src/components/neo/Neo1DeviceCard.tsx`: 4-pillar device card showing Physical Device status, NeoSapien Account status, Memories Synced count, and Device Telemetry.

---

## 3. Services & Integration Modules

### 3.1 Google Workspace Services (`src/services/google/`)
- `googleAuthService.ts`: GIS token client, standardized redirect URI (`window.location.origin`), client ID validation and fallback resolution.
- `googleCalendarService.ts`: Fetch primary calendar events, two-way sync, idempotent add/update.
- `gmailService.ts`: Fetch user messages, thread viewer, draft creator.
- `googleTasksService.ts`: Sync task lists, bidirectional task completion sync.
- `googleDriveService.ts`: File search, document links.
- `googlePhotosService.ts`: Media item listing, image caching.
- `googleContactsService.ts`: People API connections import.

### 3.2 NeoSapien Integration Engine (`src/integrations/neosapien/`)
- `client.ts`: MCP SSE stream client with retry logic.
- `authentication.ts`: Bearer token handling and authorization headers.
- `connection.ts`: Health check and status monitoring.
- `memory-service.ts`: Retrieval of memories, decisions, and action items.
- `search-service.ts`: Semantic and keyword memory search.
- `transcript-service.ts`: Conversation transcript retrieval.
- `reminder-service.ts`: Extracted reminder retrieval.
- `sync-service.ts`: Incremental synchronization and cursor management.
- `normalization.ts`: Data normalization into canonical formats.
- `deduplication.ts`: Deterministic hashing and duplicate prevention.
- `error-handler.ts`: Safe error parsing and user-friendly error messages.
- `device-status.ts`: Web Bluetooth GATT connection (`0x180F` Battery, `0x180A` Device Info) and Android companion telemetry intake.

### 3.3 Core Application Services
- `meetingIntelligenceService.ts`: Pre-meeting prep briefs, post-meeting summaries, action item extraction, calendar rescheduling.
- `aiGateway.ts`: Multi-model orchestration, context compilation from Dexie IndexedDB, mode-specific prompt routing (`engineering`, `startup`, `meeting`, `general`).
- `unifiedSyncEngine.ts` & `syncEngine.ts`: Cross-service synchronization coordinator with audit logging.
- `reminderEngine.ts`: Proactive local notification generator for overdue tasks and upcoming meetings.
