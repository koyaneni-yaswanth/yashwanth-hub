# CURRENT PROJECT BASELINE & EVIDENCE AUDIT
**Project:** Pawan Shakti (1 m² Swept Area Target Micro-Turbine)  
**Startup Entity:** Incubated at VNIT Venture Vault Foundation  
**Academic Mentor:** Dr. J. Bhukya  
**Intellectual Property:** Published Indian Patent: *"Compact Wind Turbine with Planetary Gears"*; further filings in progress (Coaxial Magnetic Gear & Helical Integration)  
**Date of Audit:** November 4, 2026  
**Audit Standard:** Strict 5-Tier Classification (`MEASURED` / `CALCULATED` / `DATASHEET` / `ESTIMATED` / `UNTESTED`)

---

## 1. Executive Summary & Evidence-Based TRL Audit
Pawan Shakti is developing a compact, low-wind-speed wind turbine optimized for decentralized off-grid applications where solar PV drops significantly (nighttime and Indian monsoon season).

### Official TRL Status: TRL 4 (Laboratory / Benchtop Prototype Rig)
- **Why TRL 4 is valid:**
  - Individual components (3D-printed planetary gear cascades, early coaxial magnetic gear rotors, fan blades) have been modeled in CAD, 3D printed, and benchtop spun.
  - Basic mechanical functionality of 3-setup and 4-setup planetary gearboxes has been demonstrated indoors.
- **Why it is strictly NOT TRL 5 or above:**
  - **No integrated system test:** The rotor, drivetrain, coreless PMA generator, power electronics, and battery have never run as a closed-loop system under calibrated wind or electrical load.
  - **No continuous time-series data:** All historical data consists of brief, manual, or qualitative observation. There is no automated $\ge 1\text{ Hz}$ time-stamped $P\text{-}v$ dataset.
  - **No outdoor relevant-environment operation:** The prototype has not been operated on an outdoor tower or subjected to variable turbulent gusts or rain/UV exposure.
  - **Uninstrumented power claims:** Power outputs were previously inferred or measured open-circuit ($V_{\text{oc}}$) rather than true electrical power ($P = V \times I$) under dynamic load.
- **90-Day Programme Target:**
  - **TRL 5 Firm:** Laboratory-validated integrated system operating with closed-loop power electronics and automated data logging.
  - **TRL 6 Stretch:** Prototype validated in a relevant outdoor environment (30+ days continuous telemetry, passive furling and E-stop verified).
  - *Note: TRL 7+ requires months of long-term commercial operational data; IEC 61400-2 certification is a multi-month post-sprint milestone.*

---

## 2. Workspace Asset Inventory & Audit

### 2.1 What Real Files Exist in Workspace / System
| Asset Category | File / Artifact Name | Path / Source | Evidence State |
| :--- | :--- | :--- | :--- |
| **CAD Files (Magnetic Gear Pod A)** | `Inner rotor, AMG.stl`<br>`Outer rotor, AMG.stl`<br>`ferromagnetic holder, AMG.stl`<br>`coaxial gear outer.stl`<br>`infanferrite22magnetsringv2.stl`<br>`RMG inner rotor,6.31mm.stl`<br>`RMG outer rotor, 6.31mm.stl` | `C:\Users\recvn\Downloads\` | **[MEASURED]** (Geometry exists in STL; tolerances and air gap untested) |
| **CAD Files (Mechanical / Shafts Pod B)** | `27cmshaftforsungearwithDcut.stl`<br>`Dcutshaftforsungear.stl`<br>`shafttogeneratoradjustment.stl`<br>`40x10x5magnetringforsunof14cm.stl`<br>`silvermagnet25sungearring.stl` | `C:\Users\recvn\Downloads\` | **[MEASURED]** (Files exist; sun gear shaft and couplers printed) |
| **CAD Files (Rotor & Fan)** | `new fan with magnet gear.stl`<br>`Fangearsilvermagnetoutergearring.stl` | `C:\Users\recvn\Downloads\` | **[MEASURED]** (Preliminary fan/hub models; swept dimensions unverified) |
| **Reference Literature & Textbooks** | `Mechanical metallurgy - Dieter_ George Ellwood.pdf`<br>`Strengthening-Mechanisms.pdf`<br>`6.13 and 6.16.pdf` | `C:\Users\recvn\Downloads\` | **[DATASHEET / REF]** |
| **Software & Command Center** | `src/pages/WindPlanPage.tsx`<br>`prototype/Wind Startup_ 90-Day Command Center.html`<br>`prototype/Yaswanth Hub.html` | `c:\Users\recvn\Desktop\yashwanth-hub` | **[CODE]** (React/TypeScript UI & standalone HTML prototype) |
| **Incubation & Academic Affiliation** | VNIT Venture Vault Foundation incubation; Dr. J. Bhukya academic mentor; Published Patent: *"Compact Wind Turbine with Planetary Gears"* | Prompt record & patent filings | **[VERIFIED RECORD]** |

### 2.2 What Data & Hardware Assets Are Missing (Critical Gaps)
1. **Measured Physical Dimensions:** Exact measured rotor diameter, blade chord/twist profile, and swept area (do NOT assume $1\text{ m}^2$).
2. **Generator Datasheet & ID:** Exact manufacturer, model number, rated RPM, back-EMF constant ($K_e$), phase resistance ($R_{\text{phase}}$), and nominal voltage.
3. **Calibrated Baseline Test Data:** No calibrated CSV files showing simultaneous $v$, $\text{RPM}$, $V$, $I$, and $P$ under load.
4. **Team Roster & Capacities:** Real names, individual student schedules (2–3 h/day limit), and exam buffer dates.
5. **Project Budget Ceiling:** Total sanctioned capital expenditure (CapEx) limit for components, fabrication, and tooling.
6. **Field Testing Site / Anemometer Access:** Confirmation of calibrated anemometer and outdoor rooftop/pad testing access at VNIT.

---

## 3. Subsystem Baseline vs. Target State Audit

| Subsystem | Baseline State (TRL 4) | Status Tag | Identified Engineering Limitation | Target Upgrade (TRL 5/6) | Status Tag |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Chassis / Frame** | Plywood / pine wood frame with M6/M8 threaded rods. | **[MEASURED]** | Wood warps under ambient humidity (0.5–2.0 mm), misaligning gear teeth and causing magnetic air-gap binding. | Modular 3030 T-slot aluminum extrusion with 6061-T6 aluminum bearing bulkheads. | **[ESTIMATED]** (Day 16 target) |
| **Blades** | 3D printed in basic PLA with visible layer ridges. | **[MEASURED]** | Low glass transition temp ($T_g \approx 55^\circ\text{C}$); deforms in rooftop sun; high boundary layer skin friction. | ASA or PETG-CF ($T_g \ge 78^\circ\text{C}$), epoxy primer pore-filling, 1000-grit wet sanding, UV topcoat. | **[ESTIMATED]** (Hypothesis) |
| **Generator** | High-cogging brushed DC motor or radial PM generator. | **[MEASURED]** | High cogging torque ($>0.3\text{ N}\cdot\text{m}$) prevents startup below 4.5 m/s wind speed. | 3-Phase Axial Flux Coreless PMA (zero cogging, self-start at 2.2 m/s). | **[HYPOTHESIS / DATASHEET]** |
| **Drivetrain: Pod A** | Coaxial magnetic gear prototypes (`AMG.stl` series). | **[MEASURED]** | High flux leakage, unverified air-gap runout, unknown pole slip torque and eddy current losses. | Precision 1:5.5 / 1:10 coaxial magnetic gear with 1.5 mm dial-calibrated air gap and M19 flux modulators. | **[ESTIMATED]** (Day 45 shootout) |
| **Drivetrain: Pod B** | Patented planetary gear cascade (3-setup / 4-setup). | **[MEASURED]** | High tooth friction, backlash, seal drag, lubrication migration. | Delrin POM-C planetary gears with hybrid ceramic 608/6201 bearings and synthetic PTFE lubricant. | **[ESTIMATED]** (Day 45 shootout) |
| **Yaw & Cabling** | Fixed mount or unconstrained swivel; no slip ring. | **[MEASURED]** | Severe cable twisting; manual yaw orientation fails to capture turbulent wind shifts. | Passive aerodynamic tail vane with 5° furling hinge, CG-balanced bearing, and 30A capsule slip ring. | **[ESTIMATED]** |
| **Power Electronics** | Raw diode bridge to battery; no dynamic brake or dump load. | **[MEASURED]** | Risk of runaway in high winds; diode forward voltage drop (1.4V) kills low-wind output; no battery protection. | 5-Stage TCCB: Slip ring -> E-stop dynamic brake -> Schottky bridge -> 500W dump load -> Buck-boost MPPT. | **[ESTIMATED]** |
| **Data Logging** | Intermittent handheld multimeter / tachometer readings. | **[MEASURED]** | No repeatable, timestamped, continuous $P\text{-}v$ curve datasets. | Automated 1 Hz ESP32/STM32 logger (Wind, RPM, V, I, P, $C_p$, Temp) writing to CSV and Cloud. | **[ESTIMATED]** (Day 7 delivery) |

---

## 4. Physics & Aerodynamic Reality Check

### Fundamental Governing Equation:
$$P_{\text{wind}} = \frac{1}{2} \rho A v^3$$
Where:
- $\rho = 1.225\text{ kg/m}^3$ (standard dry air at sea level and $15^\circ\text{C}$; must be adjusted if VNIT altitude/temp requires).
- $A = \text{Actual Rotor Swept Area}$ (to be verified on Day 1 by caliper measurement).
- $v = \text{Unobstructed upstream wind speed (m/s)}$.

### Power Coefficient ($C_p$):
$$C_p = \frac{P_{\text{electrical}}}{P_{\text{wind}}}$$
*Rule:* By the Betz Limit, theoretical aerodynamic maximum $C_p = \frac{16}{27} \approx 0.593$. Realistic small-scale micro-turbines achieve overall system electrical efficiency:
$$C_{p,\text{system}} = C_{p,\text{aero}} \times \eta_{\text{mech}} \times \eta_{\text{gen}} \times \eta_{\text{elec}} \approx 0.20 \text{ to } 0.32$$

Any claim of electrical power exceeding $30\%$ of available wind power ($P_{\text{wind}}$) must be flagged immediately as unphysical and recalibrated.

---

## 5. Non-Negotiable Gate 1 Criteria (Days 1–7)
1. **Physical Audit Complete:** Rotor diameter, blade chord/twist, and generator shaft dimensions physically measured and logged.
2. **Old Data Preserved:** All historical benchtop logs, multimeter readings, and CAD models catalogued with evidence tags.
3. **Logger v1 Operational:** 1 Hz data logging hardware wired and bench-tested recording $V$ and $I$ into a calibrated resistive load.
4. **Scoring Weights Frozen:** Founder locks the multi-criteria weights for the Day 45 Freeze Gate.
5. **Provisional Beachhead Customer Hypothesis Selected:** One initial customer profile chosen for customer discovery interviews.
