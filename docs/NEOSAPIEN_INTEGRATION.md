# NeoSapien MCP & Neo 1 Wearable Integration Blueprint

## 1. Executive Overview
The **NeoSapien Integration** bridges Yashwanth's physical world and ambient conversations captured via the **Neo 1 Wearable** with the **Yashwanth Hub AI Personal Operating System**.

Integration is achieved through the official Model Context Protocol (MCP) server located at:
`https://api.neosapien.xyz/mcp`

---

## 2. System Architecture

```
+------------------------------------+
|          Neo 1 Wearable            |
| - Always-on audio capture          |
| - BLE / Wi-Fi telemetry sync       |
+------------------------------------+
                  |
                  v
+------------------------------------+
|        NeoSapien Cloud API         |
|  - Real-time transcription         |
|  - Ambient speaker diarization     |
+------------------------------------+
                  |
                  v
+------------------------------------+
|    NeoSapien MCP Server Gateway    |
|    https://api.neosapien.xyz/mcp   |
+------------------------------------+
                  |
                  v
+------------------------------------+
|   Yashwanth Hub Integration Engine |
| - /api/neosapien/mcp Proxy         |
| - Dexie neo_memories (Local Cache) |
| - Supabase integration_tokens      |
+------------------------------------+
```

---

## 3. MCP Protocol Tools & Schema

### 3.1 `query_memories`
- **Purpose**: Semantic vector search across recorded meetings, founder brainstorms, and ambient voice notes.
- **Arguments**:
  - `query` (string): Natural language search terms (e.g., *"planetary gearbox cut-in torque"*).
  - `limit` (integer): Maximum number of records (default: 10).
  - `timeframe` (string): `today | week | month | all`.

### 3.2 `extract_action_items`
- **Purpose**: Parse raw conversation transcripts to produce structured task proposals with assignees and due dates.
- **Output Schema**:
  ```json
  [
    {
      "title": "Order high-tensile 40CrNiMo planetary pinions",
      "context": "Discussed in manufacturing lab review",
      "urgency": "high",
      "suggested_area": "PAWAN SHAKTI"
    }
  ]
  ```

### 3.3 `sync_device_state`
- **Purpose**: Monitor Neo 1 hardware vitals including battery level (e.g., 88%), firmware version, Bluetooth Low Energy link quality, and storage capacity.

---

## 4. Local Persistence & Memory Hub
Ambient memories retrieved via MCP are persisted in Dexie table `neo_memories`:
- `id`: Unique memory UUID
- `timestamp`: ISO timestamp of conversation
- `title`: AI-generated topic summary
- `summary`: Structured key takeaways
- `action_items`: Extracted action arrays
- `source_device`: `"Neo 1 Wearable"`
- `sentiment`: Confidence score

Within Yashwanth Hub, these memories are browsable in **Hub 9: Knowledge & Memory Hub** and referenced dynamically by **Hub 2: Jarvis AI Assistant**.
