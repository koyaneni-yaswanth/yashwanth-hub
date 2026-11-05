# NEOSAPIEN ECOSYSTEM & NEO 1 HARDWARE INTEGRATION
## Yashwanth Hub — Official Wearable Memory, MCP Architecture & Cloud Synchronization Specification

---

## 1. System Topology & Separation of Concerns

The integration between **Yashwanth Hub** and the **Neo 1 wearable ecosystem** enforces a strict architectural boundary between physical Bluetooth LE hardware connection and cloud-level synchronization:

```mermaid
graph TD
    subgraph Wearable Capture
        Neo1[Neo 1 Wearable Pendant] -->|Proprietary BLE Audio Stream| NeoApp[Official NeoSapien Mobile App (Android Phone)]
    end

    subgraph NeoSapien Cloud Tier
        NeoApp -->|Encrypted Cloud Upload| NeoCloud[NeoSapien Cloud (app.neosapien.ai)]
        NeoCloud -->|Authorized MCP Server / REST| HubAdapter[Yashwanth Hub NeoSapien Service]
    end

    subgraph Yashwanth Hub Multi-Device Tier
        HubAdapter -->|Idempotent Upsert| Supabase[(Supabase memories)]
        Supabase -->|Realtime WebSocket| Devices[Desktop, Laptop, Phone, Tablet]
        Devices -->|Offline-First Cache| Dexie[(Dexie neo_memories)]
        Devices -->|Reconcile Spoken Commitments| HubTasks[Hub Tasks & Google Tasks]
    end
```

### Core Architecture Rules
1. **The Phone is the Wearable Hub**: The Neo 1 wearable connects to the founder's Android phone via Bluetooth. Yashwanth Hub does not require the physical hardware to connect to the laptop or desktop directly.
2. **Authorized Cloud Interfaces Only**: Information captured by Neo 1 and synchronized to the official NeoSapien mobile app reaches Yashwanth Hub via authorized Model Context Protocol (MCP) endpoints (`/sse` / JSON-RPC) or authorized web memory export.
3. **Strict Separation of Physical vs Cloud Telemetry**:
   - Cloud integration displays: Connection Status, Authorization, Last Cloud Sync, Latest Memory, and Pending Imports.
   - Physical device displays: Bluetooth connection state, Battery percentage, and Firmware when paired via Web Bluetooth.
   - When Web BLE telemetry is not active, the system mandates the display of this exact notice:
     > *"Neo 1 physical device status is available in the official NeoSapien mobile application. Live wearable telemetry is not exposed through the connected integration."*
   - Fabricating or simulating live wearable states is strictly prohibited.

---

## 2. Ingested Data Models & Retention

NeoSapien records are imported idempotently into local Dexie store `neo_memories` and replicated to Supabase `public.memories`:

```typescript
export interface NeoMemory {
  id: string;                      // RFC-4122 v4 UUID
  originalNeoId: string;           // Upstream NeoSapien unique memory ID
  title: string;                   // Derived or user-defined title
  source: NeoMemorySource;         // 'neo_1_device' | 'neosapien_app' | 'desktop_meeting' | 'web_import'
  platform?: NeoMeetingPlatform;   // 'in_person' | 'google_meet' | 'zoom' | 'teams' | 'phone_call'
  capturedAt: string;              // ISO 8601 UTC timestamp of original capture
  durationMinutes: number;         // Session length in minutes
  summary: string;                 // Executive synopsis
  transcript?: string;             // Ambient speech transcript (redacted as per privacy settings)
  speakers: string[];              // Identified participants
  decisions: string[];             // Extracted formal decisions
  actionItems: NeoActionItem[];    // Extracted commitments and deliverables
  commitments: string[];           // Explicit promises made by the founder
  followUps: string[];             // Required follow-up questions
  reminders: string[];             // Time-sensitive reminders
  peopleMentioned: string[];       // Referenced contacts and stakeholders
  associatedProjectId?: string;    // Linked to Pawan Shakti, IvLabs, etc.
  associatedArea: string;          // Operational area (PAWAN SHAKTI, IvLabs, Personal, MG Automation)
  associatedGoogleEventId?: string;// Linked Google Calendar event ID
  tags: string[];                  // Category tags
  importedAt: string;              // Timestamp of hub ingestion
  syncMethod: 'mcp' | 'cloud_sync' | 'manual_import';
}
```

---

## 3. Commitment Auto-Reconciliation Engine

When conversations are captured by Neo 1, the founder often makes verbal commitments ("I will review the stator lamination quotes by Friday").

The reconciliation engine (`NeoSapienMemoryService.reconcileActionItemsWithTasks`):
1. **Compares Spoken Deliverables**: Cross-references `NeoActionItem.text` against all active tasks in `db.tasks`.
2. **Assigns Match Status**:
   - `matched_existing`: Spoken commitment matches an existing task in progress; links `hubTaskId`.
   - `new_commitment`: No corresponding task found; flagged with a high-priority star for founder review.
3. **Founder Approval Gate**: Action items remain in `pending_approval` until the founder clicks **Approve & Add to Tasks**. Zero phantom tasks are auto-committed without human consent.

---

## 4. Delayed Synchronization & Offline Recovery

When Neo 1 records conversations in field environments (e.g., wind testing at VNIT or travel without mobile internet):
1. Neo 1 buffers audio locally on device flash memory.
2. Once the mobile phone reconnects to Neo 1 via BLE, the NeoSapien Android app uploads the audio to NeoSapien Cloud.
3. Yashwanth Hub imports the newly processed records during its next MCP sync cycle or manual sync.
4. The system preserves the original `capturedAt` timestamp rather than the delayed import timestamp, ensuring that timeline views and calendar correlations remain historically accurate.
5. Delayed synchronization is not treated as data loss.

---

## 5. UI Controls in Connection Center (`src/pages/IntegrationsPage.tsx`)

On the **Connection & Synchronization Center** page, the NeoSapien integration provides:
- **Official MCP Server**: Target endpoint configured to `https://api.neosapien.xyz/mcp`.
- **Connect NeoSapien (OAuth PKCE)**: One-click authorization through `https://api.neosapien.xyz/mcp/authorize` using Dynamic Client Registration (`/register`) and PKCE `S256`.
- **API Key / Token Authentication**: Multi-tab modal allowing authentication via NeoCore API Key (`/auth/access-token`) or direct Bearer JWT validation.
- **Discover MCP Tools**: Real-time inspection modal reflecting tools directly from `tools/list` (`list_memories`, `get_memory`, `get_transcript`, `search_memories`, `get_user_stats`, `get_device_status`).
- **Manual Sync Now**: Immediate trigger calling `NeoSapienMCPService.syncMemories()` via `/api/neosapien/mcp?action=sync`.
- **Import JSON Export**: One-click file picker supporting official `app.neosapien.ai` exports.
- **Disconnect**: Safely revokes local credentials and clears stored session tokens.
- **Hardware Telemetry Card**: Displays live BLE battery percentage when paired, or the mandated official notice when monitoring through the mobile companion app:
  > *"Neo 1 physical device status is available in the official NeoSapien mobile application. Live wearable telemetry is not exposed through the connected integration."*
