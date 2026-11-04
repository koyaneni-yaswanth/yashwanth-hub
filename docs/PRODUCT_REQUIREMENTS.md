# PRODUCT REQUIREMENTS DOCUMENT (PRD) — PAWAN SHAKTI 1.0
**Project:** Pawan Shakti 1.0 Micro Wind Turbine  
**Document Status:** Working Baseline v1.0  
**Target Milestone:** TRL 5 Lab-Validated System / TRL 6 Relevant-Environment Outdoor Prototype  
**Incubated At:** VNIT Venture Vault Foundation | **Academic Mentor:** Dr. J. Bhukya

---

## 1. Commercial Beachhead Hypothesis
- **Hypothesis Definition:** Off-Grid Remote Monitoring & Telecom Repeater Stations (50W–200W continuous baseline load).
- **Value Claim [HYPOTHESIS]:** Complements solar PV at night and during the 90-day Indian monsoon when solar generation collapses by 70–90%, reducing required battery bank capacity by up to 50%.
- *Validation Rule:* This value claim is an initial hypothesis and must not be used in external grant submissions or sales agreements until validated by field solar/wind irradiance correlation data.

---

## 2. Engineering Boundaries & Physical Constraints

| Parameter | Specification | Status Tag | Verification Method |
| :--- | :--- | :--- | :--- |
| **Rotor Swept Area ($A$)** | Target $\approx 1.0\text{ m}^2$ (Exact dimensions to be verified on Day 1) | **[ESTIMATED]** | Caliper & tape measurement of physical blades |
| **Cut-In Wind Speed ($v_{\text{cut-in}}$)** | $\le 2.2\text{ m/s}$ | **[HYPOTHESIS]** | Instrumented low-speed airflow test rig |
| **Nominal Wind Speed ($v_{\text{nom}}$)** | $8.0\text{ m/s}$ | **[CALCULATED]** | Baseline aerodynamic power curve |
| **Rated Wind Speed ($v_{\text{rated}}$)** | $11.0\text{ m/s}$ | **[CALCULATED]** | Full load dynamometer & airflow run |
| **Cut-Out / Braking Speed ($v_{\text{cut-out}}$)** | $14.0\text{ m/s}$ | **[ESTIMATED]** | Passive furling hinge + automated dump load |
| **Survival Wind Speed ($v_{\text{survival}}$)** | $\ge 25.0\text{ m/s}$ ($90\text{ km/h}$) | **[CALCULATED]** | Structural FEA & mast guy-wire analysis |
| **Electrical Output at 5 m/s** | $20\text{ W} - 25\text{ W}$ (into 24V battery) | **[CALCULATED]** | Measured $V \times I$ under electronic load |
| **Electrical Output at 8 m/s** | $95\text{ W} - 110\text{ W}$ (into 24V battery) | **[CALCULATED]** | Measured $V \times I$ under electronic load |
| **Electrical Output at 11 m/s** | $250\text{ W} - 300\text{ W}$ (rated into 24V battery)| **[CALCULATED]** | Measured $V \times I$ under electronic load |
| **Acoustic Noise Limit** | $\le 45\text{ dBA}$ at $5\text{ m}$ distance | **[TARGET]** | Calibrated sound level meter (dBA) |
| **Overall System Weight** | $\le 16.5\text{ kg}$ (nacelle + rotor) | **[ESTIMATED]** | Digital crane scale measurement |

---

## 3. Subsystem Architecture Requirements

### 3.1 Aerodynamic Rotor
- Sweep area calculation: $A = \pi R^2$ for HAWT, or $A = D \times H$ for cross-flow/hybrid.
- Tip Speed Ratio: $\lambda = \frac{\omega R}{v}$. HAWT target $\lambda \approx 5.0 - 6.5$; Archimedes target $\lambda \approx 1.8 - 2.8$.
- Material [HYPOTHESIS]: ASA or PETG-CF filaments replacing PLA. Surface finishing (epoxy primer + 1000 grit wet sanding) tested as a controlled variable against raw print finish.

### 3.2 Drivetrain Architecture
- **Pod A:** Coaxial Magnetic Gear (Target ratio 1:5.5 to 1:10) with N52 neodymium magnets and M19 silicon steel flux modulators.
- **Pod B:** Multi-stage Planetary Gearbox (Patented baseline design) utilizing Delrin/POM-C gears, hybrid ceramic bearings, and synthetic PTFE grease.
- **Freeze Gate:** On Day 45, Pods are scored on measured data. Winner becomes the single commercial product.

### 3.3 Generator Architecture [HYPOTHESIS]
- Primary Candidate: 3-Phase Coreless Axial Flux Permanent Magnet Alternator (PMA), rated 300W–500W, 24V/48V, zero cogging torque.
- Verification Requirement: Direct back-to-back load test against standard radial iron-core PMSG to quantify starting torque reduction and cut-in wind speed.

### 3.4 Power Electronics & Protection (TCCB)
- **Rectification:** 3-Phase low-loss Schottky diode bridge ($<0.4\text{V}$ drop per leg) or active MOSFET synchronous rectifier.
- **Charge Management:** Buck-boost MPPT controller with custom power-speed curve:
  $$P_{\text{opt}} = k \cdot \omega^3$$
  charging a 24V LiFePO4 battery pack (absorption at 28.8V, float at 27.2V).
- **Safety Braking (Dual Stage):**
  1. *Dynamic Emergency Stop:* Manual mushroom E-stop contactor shorting 3-phase AC into 500W thermally rated power resistors. (Never direct short without rated resistors).
  2. *Automated Dump Load:* Solid-state switch dumping excess power into 500W aluminum-housed resistor when $V_{\text{batt}} \ge 28.8\text{V}$ or $\text{RPM} \ge 650$.

### 3.5 Yaw & Cabling
- Passive aerodynamic tail vane with $5^\circ$ furling hinge.
- Central double-row angular contact bearing at Center of Gravity (CG).
- 3-wire 30A capsule slip ring preventing cable twist during continuous rotations.
