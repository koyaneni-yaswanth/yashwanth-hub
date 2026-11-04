# TEAM RESPONSIBILITY MATRIX (RACI) & JUNIOR PROTOCOL
**Project:** Pawan Shakti 1.0  
**Operating Rhythm:** Asynchronous Daily Micro-Tasks (2.0–3.0 Hours/Day) + Single Sunday Sync (45 Minutes)  
**Founder Time Protection:** Zero mid-week daily meetings. All daily reporting occurs via automated dashboard commits.

---

## 1. Team Structure & Default Pod Allocation (6 Juniors)

```
                            FOUNDER / CHIEF ENGINEER
                        (Accountable for All Gates & Approvals)
                                   │
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
[MME LEAD JUNIOR]         [POD A LEAD JUNIORS]        [POD B LEAD JUNIORS]
(Shared Materials)        (2 Electrical Juniors)      (1 Electrical Junior)
• Frame & Plates          • Magnetic Gear CAD/Sim     • Archimedes Rotor CAD/Print
• Blade Finishing         • N52 Magnet Placement      • 1:10 Planetary Optimization
• Bearings & Yaw          • Flux Modulator Ring       • Friction & PTFE Lubrication
       │                           │                           │
       └───────────────────────────┼───────────────────────────┘
                                   ▼
                  [POWER & TELEMETRY BACKBONE]
                     (2 Electrical Juniors)
                  • Low-Loss 3-Phase Rectifier
                  • Dynamic Brake & 500W Dump Load
                  • Wind-Specific Buck-Boost MPPT
                  • 1 Hz ESP32 Automated Telemetry
```

*Note on Team Sizing:* If only 4 juniors are available, Pod B EE merges with Power Backbone, and Pod A is led by 1 EE junior.

---

## 2. RACI Responsibility Assignment Matrix

**R** = Responsible (Does the physical/computational work)  
**A** = Accountable (Founder — approves, approves purchases, accepts deliverable)  
**C** = Consulted (Provides technical guidance or cross-pod data)  
**I** = Informed (Receives notification via dashboard)

| Deliverable / Workstream | Founder | MME Junior | EE Junior 1 (Pod A) | EE Junior 2 (Pod A) | EE Junior 3 (Pod B) | EE Junior 4 (Backbone) | EE Junior 5 (Backbone) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Project Baseline Audit (Gate 1)** | **A** | C | C | C | C | R | R |
| **3030 Aluminum Frame & Plates** | **A** | **R** | I | I | I | C | I |
| **Blade Surface Finish & Testing** | **A** | **R** | C | I | C | I | I |
| **Coaxial Magnetic Gear Drivetrain**| **A** | C | **R** | **R** | I | I | I |
| **Archimedes Rotor & Planetary Box**| **A** | C | I | I | **R** | I | I |
| **Low-Loss 3-Phase Rectifier** | **A** | I | I | I | I | **R** | C |
| **Dynamic Brake & 500W Dump Load** | **A** | I | C | C | C | **R** | **R** |
| **1 Hz ESP32 Telemetry Logger** | **A** | I | I | I | I | C | **R** |
| **Bench Shootout Testing (Days 39–44)**| **A** | C | **R** | **R** | **R** | **R** | **R** |
| **Day 45 Architecture Freeze** | **A (Decision)**| C | C | C | C | C | C |
| **Single Unit Integration (Phase 2)**| **A** | **R** | **R** | **R** | **R** | **R** | **R** |
| **Grant Technical Dossier** | **A** | C | C | C | C | C | C |
| **Customer Discovery Calls & LOI** | **A** | I | I | I | I | I | I |

---

## 3. Asynchronous Operating Rules (Strict 2.0–3.0 Hour Scope)
To ensure academic balance for the juniors and protect the Founder's bandwidth:
1. **Morning Automated Dispatch (9:00 AM):**
   - Each junior receives exactly ONE primary ticket scoped strictly to 2.0–3.0 hours.
   - The ticket must include an exact objective, required equipment, and a binary Definition of Done (DoD).
2. **Evening Proof-of-Work Submission (By 8:00 PM):**
   - Each junior submits a 4-line proof log:
     1. Artifact link (GitHub CAD commit, CSV log link, or photo).
     2. One quantitative metric measured today (e.g., *"Breakaway torque measured at 0.045 N·m"*).
     3. Plot or graph attached.
     4. Blocker for tomorrow (one sentence max).
3. **Founder Nightly Audit (8:00 PM – 8:15 PM):**
   - Founder conducts an asynchronous 15-minute review of proofs. If an artifact or metric is missing, the ticket is flagged as incomplete.
4. **Sunday Sync Meeting (11:00 AM – 11:45 AM):**
   - Exactly 45 minutes:
     - 15 mins: Review master power curve and cumulative telemetry hours.
     - 15 mins: Resolve cross-pod integration blockers and parts procurement.
     - 15 mins: Lock the next 7 days of micro-tasks.
