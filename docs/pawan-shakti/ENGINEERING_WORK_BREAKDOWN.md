# ENGINEERING WORK BREAKDOWN STRUCTURE (WBS)
**Project:** Pawan Shakti 1.0 (90-Day Sprint to TRL 6/7)  
**Methodology:** Concurrent 3-Track Agile Hardware Sprint with Asynchronous Daily Micro-Tasks

---

## 1. Top-Level Track Architecture

```
PAWAN SHAKTI 90-DAY PROGRAMME
│
├── TRACK 1: ENGINEERING & PRODUCT VALIDATION (Hardware, Physics, Firmware)
│   ├── Subsystem 1.1: Structural Chassis & Materials (MME Junior Lead)
│   ├── Subsystem 1.2: Pod A - Coaxial Magnetic Gear & HAWT Rotor (2 EE Juniors)
│   ├── Subsystem 1.3: Pod B - Archimedes Spiral & 1:10 Planetary Gearbox (1 EE Junior)
│   ├── Subsystem 1.4: Generator & Coreless PMA Integration (Shared EE)
│   ├── Subsystem 1.5: Power Electronics, Dump Load & MPPT Charging (2 EE Backbone)
│   └── Subsystem 1.6: Automated Telemetry & Test Rig Instrumentation (2 EE Backbone)
│
├── TRACK 2: BUSINESS, GRANTS & CUSTOMER DEVELOPMENT (Founder Lead)
│   ├── Track 2.1: Beachhead Customer Discovery (Off-Grid Telecom/IoT/Agri)
│   ├── Track 2.2: Unit Economics & 10-Unit Batch Manufacturing BOM
│   ├── Track 2.3: Government & Institutional Grant Dossier (ANRF, CBDE, BIRAC)
│   ├── Track 2.4: Pilot Deployment LOI / MoU & Legal Risk Framework
│   └── Track 2.5: Academic Mentor & Lab Resource Utilization
│
└── TRACK 3: TEAM & FOUNDER OPERATIONS (Founder Lead, Asynchronous Execution)
    ├── Track 3.1: 9:00 AM Daily Micro-Task Dispatch Engine (2.0–3.0 Hour Scope)
    ├── Track 3.2: 8:00 PM Daily Proof-of-Work Telemetry Audit (15 Min Review)
    ├── Track 3.3: Sunday 45-Minute Synchronous Weekly Review
    ├── Track 3.4: Day 45 Drivetrain Freeze Gate Management
    └── Track 3.5: Day 90 Pilot Commissioning & Retrospective
```

---

## 2. Detailed Work Breakdown — Track 1: Engineering Subsystems

### WBS 1.1: Structural Chassis, Yaw Mount & Materials
*Lead: 1 MME Junior (Shared across Pod A & B)*
- **1.1.1 Wooden Frame Decommissioning:** Disassemble prior wooden rig; catalogue reusable fasteners and shafts.
- **1.1.2 3030 T-Slot Chassis CAD & Assembly:** Build rigid cubic outer chassis using standard 3030 aluminum profile, drop-in T-nuts, and gusset brackets.
- **1.1.3 Bearing Retainer Plates:** CAD and laser-cut 6.0 mm 6061-T6 aluminum bearing bulkhead plates for low-speed and high-speed shafts.
- **1.1.4 Center of Gravity (CG) Yaw Mount:** Design bearing housing holding dual-row angular contact / tapered roller bearing directly under system center of mass.
- **1.1.5 Passive Aerodynamic Tail Vane:** Sizing and fabricating aluminum vane with 5° gravity/spring-opposed furling hinge for storm furling above 12 m/s.
- **1.1.6 Slip Ring Integration:** Enclose 3-wire 30A capsule slip ring inside the hollow yaw pivot shaft with strain relief and waterproof silicone O-rings.

### WBS 1.2: Pod A — Coaxial Magnetic Gear & HAWT Airfoil
*Allocation: 2 EE Juniors + 1 MME Junior (Shared)*
- **1.2.1 Magnetic Gear Ratio Calculation:** Calculate pole-pair combination for 1:5.5 and 1:10 speed increase:
  $$G_r = \frac{p_{\text{inner}} + p_{\text{outer}}}{p_{\text{inner}}} \quad \text{or} \quad \frac{n_{\text{modulator}}}{p_{\text{inner}}}$$
- **1.2.2 Flux Modulator Ring Design:** Design stationary cage holding insulated M19 / 1008 ferromagnetic steel pins (1.5 mm air gap to inner and outer rotors).
- **1.2.3 Magnet Bonding & Polarity Verification:** 3D print rotor hubs in PETG-CF; epoxy N52 neodymium arc/block magnets with alternating N-S polarity verified by Gaussmeter.
- **1.2.4 HAWT Blade Aerodynamics:** Model and 3D print 3-bladed rotor utilizing SG6043 low-Reynolds airfoil in ASA; post-process with epoxy filler and 1000-grit wet sanding.
- **1.2.5 Benchtop Dynamometer Shootout:** Mount magnetic gear on drill/lathe rig; measure breakaway torque, transmission efficiency ($\eta$), and maximum slip torque.

### WBS 1.3: Pod B — Archimedes Spiral & 1:10 Planetary Gearbox
*Allocation: 1 EE Junior + 1 MME Junior (Shared)*
- **1.3.1 Archimedes Rotor CAD & Pitch Optimization:** Model 3-bladed helical spiral with progressive pitch ($60^\circ$ root, $50^\circ$ mid, $25^\circ$ tip) with swept radius $R = 0.564\text{ m}$.
- **1.3.2 Blade Printing & Surface Smoothing:** Print spiral sections in ASA filament; assemble with internal carbon-fiber rod spars; apply epoxy pore-filler, wet sand, and polyurethane topcoat.
- **1.3.3 1:10 Planetary Gearbox Redesign:** Optimize sun, planet (3 or 4), and ring gear tooth profiles using Delrin/POM-C gears and hybrid ceramic 608/6201 bearings.
- **1.3.4 Lubrication & Friction Minimization:** Formulate low-viscosity synthetic PTFE grease compound; measure breakaway torque vs. conventional petroleum grease.
- **1.3.5 Benchtop Shootout Preparation:** Measure input-to-output mechanical efficiency ($\eta_{\text{mech}}$) across 60–250 RPM range under varying mechanical loads.

### WBS 1.4: Generator & Coreless PMA Integration
*Lead: Shared EE Juniors*
- **1.4.1 Coreless Axial Flux Alternator Procurement/Fabrication:** Inspect 300W–500W dual-rotor single-stator axial flux alternator (12 coils, 16/24 N52 magnets).
- **1.4.2 Open-Circuit & Short-Circuit Characterization:** Measure phase-to-phase internal resistance ($R_{\text{phase}}$), inductance ($L_{\text{phase}}$), and back-EMF constant ($K_e$ in V/RPM).
- **1.4.3 Mechanical Coupler & Shaft Alignment:** Mount alternator to high-speed shaft via zero-backlash spider jaw flexible coupler; dial-indicate radial runout $\le 0.1\text{ mm}$.

### WBS 1.5: Power Electronics, Dump Load & MPPT Charging (TCCB)
*Allocation: 2 EE Juniors (Power Backbone)*
- **1.5.1 Low-Loss 3-Phase Rectifier:** Assemble 50A Schottky barrier diode bridge (or active MOSFET synchronous rectifier) with heatsinking to keep forward drop $< 0.4\text{V}$ per diode.
- **1.5.2 Dynamic Emergency Brake Switch:** Install 3-pole heavy-duty mushroom E-stop contactor shorting generator phases across low-ohm 500W wirewound resistors.
- **1.5.3 Automated Dump Load Circuit:** Design MCU-controlled PWM MOSFET / Solid State Relay (SSR) circuit driving 500W finned aluminum dump load resistor triggered at $V_{\text{batt}} \ge 28.8\text{V}$ or $\text{RPM} \ge 650$.
- **1.5.4 Buck-Boost MPPT Controller:** Program DC-DC stage with cubic power curve lookup:
  $$P_{\text{opt}} = k \cdot \omega^3$$
  to prevent generator stalling at sub-4 m/s winds.
- **1.5.5 LiFePO4 Battery Integration:** Wire 24V 50Ah LiFePO4 battery pack with internal BMS (over-voltage, under-voltage, over-temperature protection).

### WBS 1.6: Automated Telemetry & Test Rig Instrumentation
*Allocation: 2 EE Juniors (Power Backbone)*
- **1.6.1 Sensor Subsystem:**
  - Anemometer: Calibrated 3-cup digital anemometer (pulses/s or 0–5V analog) mounted 1.5 m upstream.
  - RPM Sensor: Non-contact optical / Hall-effect sensor on low-speed and high-speed shafts.
  - Voltage & Current: INA226 / INA3221 high-precision $I^2C$ bi-directional current/voltage sensors (16-bit resolution).
- **1.6.2 Telemetry Firmware (ESP32/STM32):**
  - Continuous 1 Hz sampling loop recording: Timestamp, $v_{\text{wind}}$ (m/s), $\text{RPM}_{\text{rotor}}$, $\text{RPM}_{\text{gen}}$, $V_{\text{dc}}$ (V), $I_{\text{dc}}$ (A), $P_{\text{elec}}$ (W), $C_p$, Ambient Temp (°C).
  - Local logging to micro-SD card (CSV format) + Wi-Fi MQTT/HTTP push to Yashwanth Hub cloud endpoint.
- **1.6.3 Automated Analytics & Plotting:** Daily Python script automatically generating timestamped scatter plots of $P_{\text{actual}}$ vs. $v_{\text{wind}}$ and $C_p$ vs. $\text{TSR}$.
