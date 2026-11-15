# Yashwanth Hub — Personal Second Brain & Universal Search Validation

**Application:** Yashwanth Hub  
**Date:** November 15, 2026  
**Document Target:** `docs/SECOND_BRAIN_VALIDATION.md`  

---

## 1. Architectural Overview

Yashwanth Hub functions as an integrated Second Brain, consolidating founder knowledge, decisions, research notes, meeting action items, and technical documents across workspaces.

```
                  [ Natural Language / Voice Capture ]
                                   │
                                   ▼
                      [ parseQuickCaptureInput ]
                        ├── Type detection (task / event / note / expense)
                        ├── Workspace inference (#pawan, #robotics, #finance)
                        └── Date & deadline extraction ("by Thursday", "at 4pm")
                                   │
                                   ▼
             [ Universal Cross-Entity Index (Dexie & Supabase) ]
    Tasks │ Projects │ Decisions │ Blockers │ Notes │ Documents │ Neo Memories
                                   │
                                   ▼
                     [ rankUniversalSearchCorpus ]
                        ├── Tokenized frequency matching
                        ├── Entity-type weight boosting
                        └── Privacy gating (allowAiUsage flag)
```

---

## 2. Universal Capture Engine (`src/services/voiceCaptureParser.ts`)

The capture parser transforms unstructured natural language and voice transcriptions into structured entities:

1. **Entity Type Resolution:**
   - Tasks: Triggered by action verbs ("order", "wire", "test", "buy", "fix", "call").
   - Expenses: Triggered by monetary units ("₹", "rs", "inr", "spent", "paid").
   - Events & Meetings: Triggered by temporal and relational keywords ("meeting with", "flight to", "sync at").
   - Notes: Default fallback for observations, directives, and technical ideas.
2. **Hashtag & Workspace Area Mapping:**
   - `#pawan` / `#wind` $\to$ `PAWAN SHAKTI`
   - `#robotics` / `#piper` $\to$ `ROBOTICS`
   - `#academic` / `#college` $\to$ `COLLEGE`
   - `#finance` / `#money` $\to$ `PERSONAL FINANCE`
3. **Temporal Deadlines:**
   - Relative tokens ("today", "tomorrow", "next Monday", "in 3 days") are normalized to ISO dates (`YYYY-MM-DD`) based on the user's local timezone.

---

## 3. Cross-Entity Search & Ranking (`src/services/searchRanking.ts`)

The universal search index queries 10 database tables simultaneously:
1. `tasks`: Searches `text`, `description`, `notes`, `area`.
2. `projects`: Searches `title`, `description`, `area`, `tags`.
3. `decisions`: Searches `title`, `decision`, `rationale`, parent project.
4. `risks`: Searches `title`, `mitigation`, severity, parent project.
5. `blockers`: Searches `title`, `impact`, status, parent project.
6. `notes`: Searches `title`, `body`, `area`.
7. `documents`: Searches `title`, `file_name`, `notes`, `body`, `description`, `area`.
8. `neo_memories`: Searches `title`, `summary`, `transcript`, `tags`.
9. `robotics_records`: Searches `title`, `description`, `category`, `status`.
10. `meetings`: Searches `title`, `attendees`, `agenda_and_notes`, `action_items`.

### Privacy Gating
Any record in `neo_memories` marked `privacy: 'private'` or `allowAiUsage: false` is excluded from search results, ensuring confidential voice captures are never surfaced in query indexes.

---

## 4. Test Verification Evidence

- **Scenario A (Universal Capture & Search):** Verified in `tests/real_world_scenarios.test.mjs`. Ingested "Need to order 3mm carbon fiber rods for the robotic hand tendon guides by Thursday #robotics" $\to$ successfully parsed title, inferred `ROBOTICS` area, resolved Thursday date, and ranked matching tasks and blockers at the top of the search index.
- **Privacy Enforcement:** Verified in `tests/v2_ai_and_nlp.test.mjs`. Private audio notes return zero matches when queried by universal search.
