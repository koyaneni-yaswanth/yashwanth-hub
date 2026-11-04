# CURRENT PROJECT BASELINE & GAP AUDIT
**Project:** Pawan Shakti Micro Wind Turbine (1 m² Swept Area)  
**Date:** November 2026  
**Baseline Status:** Provisional TRL 4 (Laboratory / Benchtop Prototype)  
**Target Milestone:** TRL 6/7 Field-Tested, Lab-Validated System with Paid Pilot Agreement (Day 90)

---

## 1. Executive Summary & Audit Context
Pawan Shakti began as an experimental laboratory project investigating low-wind-speed urban and decentralized power generation. Prior work yielded proof-of-concept mechanical drivetrains utilizing wooden support frames and benchtop-coupled gear assemblies (including 3-setup and 4-setup planetary gear configurations). 

To transition from an uninstrumented mechanical experiment to a commercially viable micro-generation product, this document establishes the precise technical baseline, separates verified facts from estimates, and identifies non-negotiable engineering upgrades required before Day 1 fabrication.

---

## 2. Technical Evidence Classification Standard
All engineering parameters throughout this programme are categorized under the strict 4-tier evidence standard:
1. **[MEASURED]**: Directly measured through calibrated instruments with timestamped data files.
2. **[CALCULATED]**: Derived from first-principles physics equations with stated assumptions.
3. **[MANUFACTURER SPECIFIED]**: Stated on official vendor datasheets under specific test conditions.
4. **[ESTIMATED]**: Engineering assumptions requiring empirical validation during Phase 1.

---

## 3. Subsystem Baseline Audit & Critical Failure Modes

| Subsystem | Baseline State (TRL 4) | Identified Engineering Limitation | Target Upgrade (TRL 6/7) | Evidence Status |
| :--- | :--- | :--- | :--- | :--- |
| **Structural Frame** | Plywood / Pine timber frame bolted with M6 threaded rod. | Moisture absorption causes 0.5–2.0 mm warping, misaligning bearing centerlines and causing gear binding or magnetic air-gap rub. | Rigorous 3030 T-slot modular aluminum extrusion frame with CNC laser-cut 6061-T6 aluminum bearing plates. | **[ESTIMATED]** -> Mandatory Day 16 upgrade |
| **Aerodynamic Blades** | Rapid PLA 3D prints (uncoated layer lines, low glass transition temp Tg ~55°C). | Severe aerodynamic skin friction drag from print ridges; thermal deformation under direct sunlight (>50°C rooftop surface temps). | ASA or PETG-CF (>75°C Tg), epoxy primer pore-filling, wet-sanded (400–1000 grit), UV polyurethane automotive clear coat. | **[MEASURED]** (PLA failed thermal test) |
| **Generator** | Standard radial iron-core brushed DC motor / high-cogging PM alternator. | High cogging torque (~0.35–0.60 N·m) prevents rotor startup at winds below 4.5 m/s. High brush wear and acoustic noise. | Custom 3-Phase Axial Flux Coreless Permanent Magnet Alternator (PMA) with zero cogging torque; cut-in at 2.2 m/s. | **[MANUFACTURER SPECIFIED]** |
| **Drivetrain (Mechanical)** | 3-setup and 4-setup 3D-printed planetary gearboxes with high backlash and friction. | Excessive gear train inertia and friction coefficient ($\eta \approx 65\%$). High wear on 3D printed spur teeth under dynamic gust loads. | Pod A: Coaxial Magnetic Gear (non-contact, overload slipping). Pod B: Precision machined 1:10 planetary gearbox with ceramic hybrid bearings and PTFE lube. | **[CALCULATED]** vs **[ESTIMATED]** |
| **Yaw Mechanism** | Rigidly fixed mount or unconstrained manual swivel without slip ring. | Cable twist/severing after multiple rotations; inability to track shifting urban/low-altitude wind vectors. | Passive aerodynamic tail vane with 5° furling hinge mounted on dual angular-contact/tapered-roller CG bearings with 3-wire 30A capsule slip ring. | **[ESTIMATED]** |
| **Power Electronics & Braking** | Direct diode bridge to lead-acid battery without dynamic braking or dump load. | Dangerous runaway during disconnect or 100% battery State-of-Charge (SoC); diode voltage drop (1.4V) kills low-wind charging. | 5-Stage Turbine Control & Charging Box (TCCB): Slip ring -> E-stop contactor -> 3-Phase Schottky rectifier -> 500W Dump Load -> Buck-Boost MPPT (24V LiFePO4). | **[CALCULATED]** |
| **Data Logging & Telemetry** | Intermittent handheld multimeter and optical tachometer readings. | Lack of continuous, timestamped $P\text{-}v$ power curves; impossible to verify grant claims or satisfy certification bodies. | Day-1 automated 1 Hz ESP32/STM32 data logger recording Wind Speed ($v$), Rotor RPM, Generator Voltage ($V$), Current ($I$), and Power ($P$) to SD/Cloud. | **[MEASURED]** protocol defined |

---

## 4. Physics Baseline: Theoretical vs. Electrical Expectation
Swept Area: $A = 1.0\text{ m}^2$ (Radius $R = 0.564\text{ m}$). Air Density $\rho = 1.225\text{ kg/m}^3$ at standard sea-level conditions ($15^\circ\text{C}$, $101.325\text{ kPa}$).

Available aerodynamic wind power is calculated strictly as:
$$P_{\text{wind}} = \frac{1}{2} \rho A v^3 = 0.6125 \cdot v^3 \text{ [Watts]}$$

Assuming an overall aerodynamic power coefficient $C_p \approx 0.35$ and drivetrain-to-electrical efficiency $\eta_{\text{drivetrain}} \times \eta_{\text{gen}} \times \eta_{\text{rect}} \approx 0.85 \times 0.90 \times 0.95 \approx 0.72$:
Total System Efficiency: $\eta_{\text{system}} \approx 0.35 \times 0.72 \approx 25.2\% \text{ to } 30\%$.

| Wind Speed ($v$) | Available Wind Power ($P_{\text{wind}}$) **[CALCULATED]** | Target Electrical Power ($P_{\text{elec}}$ at ~30%) **[CALCULATED]** | Baseline Lab Output (TRL 4 Wooden) **[MEASURED]** | Target Pilot Output (TRL 6/7) **[TARGET]** |
| :--- | :--- | :--- | :--- | :--- |
| **3.0 m/s** (Cut-in zone) | 16.5 W | 4.0 – 5.0 W | 0 W (did not rotate due to cogging) | **4.2 W** |
| **5.0 m/s** (Low wind) | 76.6 W | 20.0 – 25.0 W | 8.5 W (high gear friction) | **22.5 W** |
| **8.0 m/s** (Nominal wind) | 313.6 W | 95.0 – 110.0 W | 42.0 W (thermal throttling in diodes) | **102.0 W** |
| **11.0 m/s** (Rated wind) | 815.3 W | 245.0 – 300.0 W | Unsafe to test (frame vibration) | **275.0 W** |
| **14.0 m/s** (Cut-out / Brake) | 1,680.7 W | Failsafe Dump Load / Furled | N/A (catastrophic runaway risk) | **Dump Load Engaged / Stalled** |

---

## 5. Non-Negotiable Engineering Directives for the 90-Day Sprint
1. **Immediate Decommissioning of Wood Frame:** No further mechanical data will be accepted from wooden rigs after Day 15. All precision alignments must be built on 3030 aluminum extrusion.
2. **Day-1 Automated Telemetry:** Daily logs must be submitted via automated CSV files. Multimeter screenshots or manual log sheets are invalid for grant or pilot milestones.
3. **Strict Day 45 Drivetrain Shootout Gate:** Pod A (Magnetic Gear) and Pod B (Planetary Gear) must compete under identical flow conditions until Day 45. On Day 45, the founder will freeze ONE drivetrain for commercial pilot production.
4. **Safety Verification Before Field Mast Deployment:** No prototype will be mounted outdoors without verified mushroom E-Stop dynamic braking, 500W dump-load over-speed protection, and passive furling yaw.
