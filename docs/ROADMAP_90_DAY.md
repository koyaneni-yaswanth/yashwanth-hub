# 90-DAY MASTER EXECUTION ROADMAP & CRITICAL PATH
**Project:** Pawan Shakti 1.0  
**Methodology:** 3-Track Concurrent Hardware Sprint with Day 45 Architecture Freeze Gate  
**Buffer Allocation:** 15–20% built-in schedule buffer (14 days contingency across phases)

---

## 1. Top-Level Timeline Overview

```
Days 1-7: BASELINE AUDIT & LOGGER v1 (Gate 1: Baseline Verified, TRL Audited)
  │
Days 8-14: TEST STANDARDIZATION & BENCHMARKING (Gate 2: Repeatable Baseline Test)
  │
Days 15-30: PARALLEL POD A & POD B FABRICATION (Gate 3: Both Drivetrains Spinning on Dyno)
  │
Days 31-44: HEAD-TO-HEAD SHOOTOUT UNDER IDENTICAL AIRFLOW
  │
DAY 45: CRITICAL ARCHITECTURE FREEZE GATE (Founder Locks Single Winning Drivetrain)
  │
Days 46-60: FULL SYSTEM INTEGRATION & HARDENING (Gate 5: Integrated Unit Safe & Failsafe Verified)
  │
Days 61-80: 30-DAY CONTINUOUS FIELD VALIDATION & ENDURANCE (Outdoor Telemetry Dataset)
  │
Days 81-90: PILOT HANDOVER, GRANT DOSSIER & RETROSPECTIVE (TRL 5/6 Validated System)
```

---

## 2. Phase-by-Phase Execution Schedule (3 Tracks)

### Phase 1: Baseline, Standardization & Parallel Subsystems (Days 1–30)

| Day Window | Track 1: Engineering & R&D | Track 2: Business & Grants | Track 3: Team Ops & Founder | Deliverable & Gate |
| :--- | :--- | :--- | :--- | :--- |
| **Days 1–7** | Audit physical prototype assets. Measure rotor diameter, blade chord/twist, and generator shaft dimensions with calipers. Wire 1 Hz ESP32 logger v1. | Formulate initial beachhead customer hypothesis (Off-grid IoT / Telecom / Campus). Compile list of 15 cold outreach targets. | Assign junior pod roles. Set up asynchronous dashboard ticket queue. Founder locks Day 45 scoring weights. | **GATE 1:** Baseline audit documented; Logger v1 operational. |
| **Days 8–14** | Calibrate anemometer, RPM sensor, and INA226 current shunts. Run baseline tests on existing wooden planetary rig using calibrated resistive loads. | Draft 1-page technical spec sheet (every field tagged). Write customer discovery interview script. | Sunday Sync #1. Audit daily CSV logs. Enforce zero mid-week meetings. | **GATE 2:** Calibrated baseline power curve recorded. |
| **Days 15–22** | MME: Decommission wooden frame; assemble 3030 aluminum chassis and laser-cut 6061 plates. Pod A: Simulate magnetic gear pole pairs; order N52 magnets. Pod B: CAD Archimedes spiral rotor; inspect planetary gears. | Initiate outreach to 15 regional pilot prospects. Audit ANRF and Venture Vault grant requirements. | MME submits BOM for aluminum extrusion, plates, and ASA/PETG-CF filament. Founder approves CapEx batch #1. | Chassis CAD frozen; materials ordered. |
| **Days 23–30** | Pod A: 3D print magnet hubs in PETG-CF; bond N52 magnets; assemble flux modulator cage. Pod B: Print Archimedes spiral in ASA; apply epoxy smoothing resin; fit hybrid ceramic bearings. Backbone: Wire 3-phase Schottky bridge and 500W dump load. | Conduct 5 customer discovery calls with telecom/agri-station managers to validate ₹35k–₹50k pricing. | Sunday Sync #2. Day 30 Subsystem Check: Verify both Pod A and Pod B spin freely on bench lathe. | **GATE 3:** Both drivetrains spinning; customer feedback logged. |

---

### Phase 2: Head-to-Head Shootout & Single Product Freeze (Days 31–60)

| Day Window | Track 1: Engineering & R&D | Track 2: Business & Grants | Track 3: Team Ops & Founder | Deliverable & Gate |
| :--- | :--- | :--- | :--- | :--- |
| **Days 31–38** | Bench-test full power electronics box (TCCB): Verify low-loss rectification, test dynamic brake contactor, test automated dump load PWM at 28.8V. | Draft Master Grant Technical Write-up narrative. Map ANRF / BIRAC milestone deliverables. | Safety audit of electrical enclosure (fuses, wire gauge, braking resistor thermal heatsinks). | TCCB bench certified for dynamic braking. |
| **Days 39–44** | **HEAD-TO-HEAD SHOOTOUT:** Mount Pod A and Pod B under identical airflow duct and electronic dyno load. Measure cut-in speed, mechanical efficiency ($\eta_{\text{mech}}$), torque, acoustic noise, and cost. | Narrow down 3 most responsive pilot prospects to 1 primary candidate site. Inspect physical mounting pad. | Compile shootout comparative evaluation scorecard. | Comparative shootout dataset complete. |
| **DAY 45** | **FREEZE GATE:** Founder and core team review measured shootout data against scoring matrix. | **FOUNDER DECISION:** Freeze ONE winning architecture (or justified hybrid) for commercial pilot build. | Merge Pods A & B into single unified production team. Terminate losing track. | **GATE 4 (CRITICAL):** Architecture frozen. |
| **Days 46–52** | Assemble winning drivetrain with coreless PMA, 3030 chassis, dual-row CG yaw bearing, 30A slip ring, and passive tail vane onto mounting mast. | Draft Pilot Deployment LOI / MoU with primary customer (performance guarantee terms). | Reassign all 6 juniors to single-product weatherproofing (IP65 silicone seals, Loctite 243, vibration dampers). | Fully integrated turbine assembled. |
| **Days 53–60** | **FAILSAFE & ABUSE TESTING:** Execute written test procedure: Trigger manual E-stop at rated RPM; verify dump load engagement at 28.8V battery SoC; test yaw furling in high gusts. | Submit mid-term milestone report to VNIT Venture Vault Foundation with verified bench test data. | Sunday Sync #4. Day 60 Milestone Review: System approved for outdoor mast deployment. | **GATE 5:** Integrated unit safe, stable, and failsafe verified. |

---

### Phase 3: 30-Day Field Validation, Grant Dossier & Pilot Delivery (Days 61–90)

| Day Window | Track 1: Engineering & R&D | Track 2: Business & Grants | Track 3: Team Ops & Founder | Deliverable & Gate |
| :--- | :--- | :--- | :--- | :--- |
| **Days 61–70** | Continuous outdoor data logging (target $\ge 30$ days outdoor if site risk assessment approved; otherwise controlled-rig logging). Automatically generate daily $P\text{-}v$ scatter plots. | Present live telemetry dashboard to primary pilot partner. Secure signed Pilot LOI / MoU. | Juniors conduct daily 2-hour anomaly checks on log files (vibration spikes, bearing thermal rise, voltage ripple). | 10 days continuous data; signed pilot LOI. |
| **Days 71–80** | **Day 75 Teardown Inspection:** Disassemble and inspect for gear tooth fatigue / magnetic air-gap dust ingress, blade erosion, and bearing axial play. Reassemble and torque seal. | Finalize Full Grant Technical Dossier, costed 10-unit batch manufacturing BOM, and pitch deck backed by real curves. | Write Standard Operating Procedure (SOP) manual for mast erection, wiring, and emergency braking. | Teardown audit passed; SOP manual complete. |
| **Days 81–90** | Final endurance run. Generate master 60-day cumulative energy yield report ($\text{Wh/day}$). Prepare unit for pilot customer installation. | Formal presentation to VNIT Venture Vault mentors, Dr. J. Bhukya, and prospective grant reviewers. | 90-day retrospective: document what worked, what failed, measured vs. estimated variance, and next-180-day batch plan. | **FINAL GATE:** Validated TRL 5/6 unit ready for pilot commissioning. |
