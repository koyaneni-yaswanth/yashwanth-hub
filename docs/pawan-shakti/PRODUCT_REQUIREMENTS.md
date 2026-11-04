# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Product Name:** Pawan Shakti 1.0 Commercial Pilot Micro Wind Turbine  
**Document Version:** 1.0 (Frozen for 90-Day Sprint)  
**Target TRL at Handover:** TRL 6/7 (Outdoor Validated Beta System with 60-Day Telemetry Dataset)

---

## 1. Product Vision & Commercial Beachhead Definition
Pawan Shakti is an ultra-low-cut-in, low-maintenance 1 m² micro wind turbine designed to provide continuous hybrid off-grid power for:
- Remote Telecom Repeaters (50W–200W continuous baseline load).
- Rural Agricultural IoT & Weather Monitoring Stations.
- Defense, Border Security, and Forestry Outposts.

**Core Value Proposition:**
> *"Solar generation drops by 70–100% during the 90-day Indian monsoon season and ceases completely between 6:00 PM and 6:00 AM—precisely when low-altitude monsoon winds peak. Pawan Shakti cuts battery storage bank requirements by 50% through continuous low-wind micro-generation using a zero-cogging axial flux generator and high-efficiency low-inertia drivetrain."*

---

## 2. Key Target Specifications & Engineering Boundaries

| Parameter | Value / Boundary | Engineering Rationale | Evidence Tag |
| :--- | :--- | :--- | :--- |
| **Rotor Swept Area ($A$)** | $1.0\text{ m}^2$ ($\pm 2\%$) | Optimum balance between urban/remote rooftop footprint, shipping logistics, and structural safety loads. | **[CALCULATED]** |
| **Rotor Radius ($R$)** | $0.564\text{ m}$ ($564\text{ mm}$) | $A = \pi R^2 \rightarrow R = \sqrt{1.0/\pi} \approx 0.564\text{ m}$. | **[CALCULATED]** |
| **Cut-In Wind Speed ($v_{\text{cut-in}}$)** | $\le 2.2\text{ m/s}$ | Enabled by coreless axial-flux PMA (zero hysteresis/cogging torque) and low-friction bearings. | **[ESTIMATED]** -> Target for Phase 1 |
| **Nominal Wind Speed ($v_{\text{nom}}$)** | $8.0\text{ m/s}$ | Standard reference wind speed for micro-turbines. | **[CALCULATED]** |
| **Rated Wind Speed ($v_{\text{rated}}$)** | $11.0\text{ m/s}$ | Peak continuous electrical generation without thermal saturation. | **[CALCULATED]** |
| **Cut-Out / Furling Speed ($v_{\text{cut-out}}$)** | $14.0\text{ m/s}$ | Passive tail-vane aerodynamic furling begins at 12 m/s; full furling + dump load at 14 m/s. | **[ESTIMATED]** |
| **Survival Wind Speed ($v_{\text{survival}}$)** | $\ge 25.0\text{ m/s}$ ($90\text{ km/h}$) | Structural integrity of 3030 aluminum frame, guyed mast, and furled rotor under monsoon gusts. | **[CALCULATED]** |
| **Rated Electrical Output** | $250\text{ W} - 300\text{ W}$ at $11\text{ m/s}$ | Measured into 24V LiFePO4 battery pack via buck-boost MPPT stage. | **[CALCULATED]** |
| **Nominal Electrical Output** | $95\text{ W} - 110\text{ W}$ at $8\text{ m/s}$ | Daily energy production target: $\sim 1.8\text{ kWh/day}$ in continuous 7–8 m/s wind. | **[CALCULATED]** |
| **Low-Wind Electrical Output** | $20\text{ W} - 25\text{ W}$ at $5\text{ m/s}$ | Critical baseline for IoT/telecom sensor continuous uptime. | **[CALCULATED]** |
| **Total System Mass** | $\le 16.5\text{ kg}$ (excluding mast) | Safe single-person rooftop installation and tower balance. | **[ESTIMATED]** |
| **Acoustic Noise Emission** | $\le 45\text{ dBA}$ at $5\text{ m}$ distance | Sub-audible operation in urban, campus, and wildlife telemetry deployments. | **[TARGET]** |
| **Design Lifetime** | $\ge 5\text{ Years}$ (Outdoor IP65) | Sealed bearings, UV-resistant ASA/PETG-CF blades, stainless 304 hardware, anodized 3030 chassis. | **[ESTIMATED]** |

---

## 3. Physical Subsystem Requirements

### 3.1 Rotor & Blade Aerodynamics
- **Configuration Under Evaluation (Days 1–45):**
  - *Pod A:* 3-Bladed Horizontal Axis Wind Turbine (HAWT) utilizing low-Reynolds optimized airfoils (SG6043 or SD7062) for high Tip Speed Ratio ($\lambda = 5.0 - 6.5$).
  - *Pod B:* Helical Archimedes Spiral Rotor with progressive multi-angle pitch ($60^\circ$ at root, $50^\circ$ mid-span, $25^\circ$ tip) for high initial starting torque ($\lambda = 1.8 - 2.8$).
- **Material & Manufacturing:**
  - Mandatory transition from brittle PLA to **ASA** or **PETG-CF** (glass transition temperature $T_g \ge 78^\circ\text{C}$).
  - Surface roughness post-processing: Epoxy filler resin + 400 to 1000 grit wet sanding + 2-pack automotive polyurethane clear coat to ensure boundary-layer laminar attachment.

### 3.2 Drivetrain & Speed Multiplier
- **Speed Multiplier Ratio:** Minimum $1:5.5$, target $1:10$ gear ratio to accelerate rotor speed (60–120 RPM) to generator optimal zone (300–600 RPM).
- **Architecture Freeze Gate (Day 45):**
  - *Pod A:* Coaxial Magnetic Gear using alternating N52 neodymium arc/block magnets and stationary ferromagnetic flux-modulating pole pieces (M19 silicon steel). Non-contact, zero mechanical friction, inherent overload slip protection.
  - *Pod B:* Precision CNC-machined 1:10 Planetary Gearbox utilizing POM-C/Delrin planetary gears, hybrid ceramic deep groove ball bearings, and synthetic PTFE gear grease.
- **Runout & Tolerances:** Radial and axial runout $\le 0.15\text{ mm}$ across all bearing housings.

### 3.3 Generator Architecture
- **Type:** 3-Phase Coreless Axial Flux Permanent Magnet Alternator (PMA).
- **Rated Capacity:** 300W–500W rated power, dual-rotor single-stator (Toroo / AFIR topology).
- **Voltage Output:** 24V to 48V DC (post-rectification).
- **Cogging Torque:** $0.00\text{ N}\cdot\text{m}$ (no iron core in stator coils $\rightarrow$ zero hysteresis drag $\rightarrow$ immediate self-start).
- **Winding Configuration:** Star (Y) connected copper coils vacuum-impregnated in high-temperature epoxy resin ($180^\circ\text{C}$ Class H).

### 3.4 Yawing & Cable Management
- **Yaw Mechanism:** Passive aerodynamic tail vane with $5^\circ$ mechanical furling hinge and counter-balancing gravity/spring damper.
- **Active Servos Strictly Forbidden:** Active yaw servo motors and wind vane sensors consume 5–15W continuously—wasting up to 50% of generated power in low winds (4–5 m/s).
- **Bearing & Slip Ring:** Double-row angular contact bearing mounted at system Center of Gravity (CG), paired with an internal 3-wire 30A capsule slip ring to allow infinite $360^\circ$ rotation without cable twist.

### 3.5 Turbine Control & Charging Box (TCCB)
1. **Rectification:** 3-Phase low-drop Schottky bridge (50A, 100V) or active MOSFET ideal diode rectifier to prevent 1.4V silicon diode drop at low RPM.
2. **Dynamic Emergency Brake:** Mushroom E-stop button switching 3-phase AC into low-ohm power resistors for instant electromagnetic stall.
3. **Automated Dump Load:** Solid State Relay (SSR) / MOSFET switching a 500W aluminum housed braking resistor triggered if battery voltage $> 28.8\text{V}$ (100% SoC) OR rotor speed $> 650\text{ RPM}$.
4. **Battery Management:** Buck-Boost MPPT charge controller programmed with $P_{\text{opt}} = k \cdot \omega^3$ power-tracking curve charging a 24V 50Ah LiFePO4 battery pack.

---

## 4. Financial & Bill of Materials (BOM) Target
- **Target Prototype Unit Cost:** ₹29,000 – ₹42,500.
- **Target 10-Unit Batch Manufacturing Cost:** ₹21,500 – ₹26,000.
- **Pilot Customer Selling Price (Bundle with Mast & Battery):** ₹38,000 – ₹52,000.
