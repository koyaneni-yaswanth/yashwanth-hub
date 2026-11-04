# KNOWN ARCHITECTURAL LIMITATIONS & MITIGATION PROTOCOL
## Yashwanth Hub — Constraints, Operational Boundaries & Mitigations

---

## 1. Overview & Transparency Baseline

In strict accordance with the **Data Integrity Protocol v2**, all technical limitations, browser boundary conditions, and hardware constraints are documented transparently without obscuring or minimizing their operational impact.

---

## 2. Technical Limitations & Mitigation Matrix

### 1. Google Identity Services (GIS) Access Token Expiration
- **Constraint**: Google OAuth 2.0 access tokens generated via GIS client-side token flow (`initTokenClient`) have a strict 3,600-second (1 hour) lifespan.
- **Impact**: After 1 hour of continuous background operation without user interaction, direct calls to Google Calendar and Google Tasks APIs fail with HTTP 401 Unauthorized.
- **Mitigation**:
  - `GoogleAuthService` tracks token issuance time.
  - When expired, the service automatically initiates a silent background token refresh (`prompt: 'none'`) if the Google session cookie remains active.
  - If user re-authentication is required, a discrete banner appears: "Google session expired — tap to re-authenticate". Local IndexedDB and Supabase sync remain completely unaffected.

### 2. Browser Storage Eviction Policies
- **Constraint**: Under extreme storage pressure, mobile operating systems (especially WebKit/Safari and aggressive Android OEM cleaners) may evict IndexedDB origins that have not been granted persistent storage status.
- **Impact**: Risk of losing unsynced local mutations if a device remains offline for weeks with critical storage depletion.
- **Mitigation**:
  - `src/App.tsx` immediately invokes `navigator.storage.persist()` on startup.
  - Chrome, Edge, and Android PWA installations automatically grant persistent storage status once installed to the home screen or desktop.
  - The offline sync queue (`sync_queue`) is prioritized for immediate flushing as soon as an internet connection is detected.

### 3. Web Bluetooth (BLE) Availability Across Browsers
- **Constraint**: The Web Bluetooth GATT API used for direct hardware inspection of the Neo 1 wearable is supported in Google Chrome, Microsoft Edge, and Opera on Windows, macOS, and Android. It is **not supported** in Mozilla Firefox or iOS Safari.
- **Impact**: On unsupported browsers, direct GATT battery/RSSI polling is disabled.
- **Mitigation**:
  - The primary synchronization path for Neo 1 is routed via the **NeoSapien Cloud / MCP server**, which works identically on every browser.
  - Direct BLE GATT polling is treated strictly as an optional Tier 2 diagnostic enhancement.

### 4. Audio Raw Bytes vs Storage Quotas
- **Constraint**: High-fidelity meeting audio (44.1 kHz 16-bit PCM or Opus) consumes ~30 MB per hour. Storing hundreds of hours of raw audio inside IndexedDB would rapidly trigger browser storage quota warnings.
- **Impact**: Raw audio recordings are not stored locally in Dexie.
- **Mitigation**:
  - The NeoSapien mobile app and cloud handle audio storage and transcription.
  - Yashwanth Hub ingests structured text transcripts, summaries, speaker diarization, decisions, and action items, keeping the total hub footprint under 40 MB.

### 5. Supabase Free Tier Realtime Limits
- **Constraint**: The Supabase free tier enforces a ceiling of 200 concurrent Realtime WebSocket connections and 2 million messages/month.
- **Impact**: Non-issue for a personal operating system.
- **Mitigation**:
  - Yashwanth Hub's device fleet consists of 4 to 10 personal devices.
  - Heartbeats are throttled to 45 seconds and Realtime channels are shared across entities.

### 6. Strict Zero Expense Auto-Logging
- **Constraint**: The AI operating system is prohibited from automatically generating expenses from email invoices or notes.
- **Impact**: Founder must manually review and confirm all expenditures.
- **Mitigation**:
  - Yashwanth Hub displays "Suggested Expense" alerts with an **Add** button. Zero phantom records are written to the database until explicitly confirmed by the founder.
