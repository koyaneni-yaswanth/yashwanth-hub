# TWO-POD R&D STRATEGY & DAY 45 FREEZE GATE
**Project:** Pawan Shakti 1.0 (Days 1 to 45 Shootout Phase)  
**Strategy:** Run two controlled parallel R&D tracks, measure everything under identical conditions, score on data, and freeze ONE winning architecture on Day 45.

---

## 1. Locked Technical Tracks

### Pod A: Coaxial Magnetic Gear + Conventional HAWT Blades
- **Core Concept:** Non-contact torque transmission using magnetic field modulation between high-speed inner rotor and low-speed outer rotor.
- **Rotor Blades:** 3-blade HAWT optimized for low-Reynolds performance (SG6043 airfoil). High Tip Speed Ratio ($\lambda \approx 5.0 - 6.5$).
- **Gearbox Configuration:** Coaxial magnetic gear (1:5.5 to 1:10 ratio) using N52 NdFeB magnets and laminated M19 ferromagnetic steel flux pole modulators.
- **Hypothesis:** Eliminates mechanical tooth friction, provides zero-wear lifetime, and slips harmlessly under storm gust over-torque.
- **Specific Risks:** Tight air-gap tolerances ($1.5\text{ mm}$ radial runout $\le 0.1\text{ mm}$), eddy current losses in flux modulators, high BOM cost of N52 magnets.

### Pod B: Archimedes Spiral Blades + Patented Planetary Gearbox
- **Core Concept:** Helical screw rotor providing high drag-based starting torque combined with lift-based acceleration, driving an optimized planetary speed increaser.
- **Rotor Blades:** Archimedes spiral rotor ($60^\circ / 50^\circ / 25^\circ$ multi-angle pitch). Lower Tip Speed Ratio ($\lambda \approx 1.8 - 2.8$), but massive starting torque.
- **Gearbox Configuration:** Patented 3-setup or 4-setup compact planetary gear design upgraded with CNC Delrin POM-C gears, Si3N4 ceramic hybrid bearings, and synthetic PTFE grease.
- **Hypothesis:** Spins in low cut-in breezes ($<2.0\text{ m/s}$) due to high starting aerodynamic torque; leverages published patent for commercial defense.
- **Specific Risks:** Mechanical gear friction, backlash, acoustic noise at high RPM, tooth wear under particulate/dust exposure.

---

## 2. Pod Resource Allocation (Approx. 4–6 Juniors, 2–3 h/day each)
| Pod / Role | Primary Responsibilities | Daily Hours Cap |
| :--- | :--- | :--- |
| **1 MME Junior (Materials & Structures Lead)** | Rigid 3030 aluminum frame conversion; CNC 6061 bearing plates; ASA/PETG-CF printing; blade epoxy-primer and wet-sanding; CG yaw bearing. | 2.5 – 3.0 h/day |
| **2 EE Juniors (Pod A Leads)** | Coaxial magnetic gear pole-pair optimization; flux modulator alignment; N52 pole bonding; air-gap dial check; magnetic bench dyno tests. | 2.5 – 3.0 h/day |
| **1 EE Junior (Pod B Lead)** | Archimedes rotor CAD/print; planetary gear ratio optimization; ceramic bearing fitment; PTFE lubrication friction tests. | 2.5 – 3.0 h/day |
| **2 EE Juniors (Shared Power & Telemetry)** | 3-phase Schottky rectification; dynamic E-stop brake; 500W automated dump load; buck-boost MPPT charger; 1 Hz ESP32 automated telemetry logger. | 2.5 – 3.0 h/day |

---

## 3. Shootout Test Protocol (Days 39–44)
Both assemblies must be tested on the same benchtop lathe/motor test rig and inside the same airflow duct with identical instruments.

### Required Measurable Metrics:
1. **Breakaway Starting Torque ($T_{\text{start}}$ in $\text{N}\cdot\text{m}$):** Measured using calibrated torque wrench / lever arm and force gauge.
2. **Cut-in Wind Speed ($v_{\text{cut-in}}$ in $\text{m/s}$):** Unobstructed wind speed at which rotor sustains continuous rotation under minimum electrical sensing load.
3. **Mechanical Drivetrain Efficiency ($\eta_{\text{mech}}$):**
   $$\eta_{\text{mech}} = \frac{T_{\text{out}} \times \omega_{\text{out}}}{T_{\text{in}} \times \omega_{\text{in}}}$$
   Measured across 60, 120, 180, and 250 input RPM.
4. **Total System Power Coefficient ($C_p$):**
   $$C_p = \frac{V \times I}{\frac{1}{2}\rho A v^3}$$
   Measured at 5.0 m/s and 8.0 m/s wind speed into a calibrated load.
5. **Acoustic Noise (dBA):** Sound pressure level at 1 m, 3 m, and 5 m at rated RPM.
6. **BOM Landed Cost (INR):** Direct procurement cost of materials to build the complete drivetrain.
7. **Overload / Slip Behavior:** Response during simulated storm gust or emergency stop stall.

---

## 4. Day 45 Freeze Gate Decision Matrix
Founder approval is REQUIRED before freezing the architecture. The winner (or justified hybrid) becomes the single commercial product. The losing track is stopped or parked.

| Evaluation Metric | Weight (Set at Day 7) | Target / Threshold | Pod A: Magnetic + HAWT (Target) | Pod B: Archimedes + Planetary (Target) |
| :--- | :---: | :--- | :---: | :---: |
| **Cut-In Wind Speed** | 15% | $\le 2.2\text{ m/s}$ | $2.2\text{ m/s}$ | $1.8\text{ m/s}$ |
| **Power Output at 5 m/s** | 15% | $\ge 20\text{ W}$ | $22\text{ W}$ | $21\text{ W}$ |
| **Power Output at 8 m/s** | 15% | $\ge 95\text{ W}$ | $105\text{ W}$ | $96\text{ W}$ |
| **Total System $C_p$** | 15% | $\ge 0.28$ | $0.31$ | $0.27$ |
| **Starting / Cogging Torque** | 10% | $\le 0.05\text{ N}\cdot\text{m}$ | $0.02\text{ N}\cdot\text{m}$ | $0.06\text{ N}\cdot\text{m}$ |
| **Landed BOM Cost** | 10% | $\le ₹12,000$ (drivetrain) | $₹9,500$ | $₹6,500$ |
| **5-Year Reliability & Wear** | 10% | Zero mechanical fatigue | High (no contact) | Moderate (gear tooth wear) |
| **Manufacturability / Tolerance** | 10% | Repeatable in batch | Critical ($1.5\text{ mm}$ gap) | Standard CNC Delrin |
| **TOTAL SCORE** | **100%** | **Data Driven** | **Scored on Day 44** | **Scored on Day 44** |

*Rule:* If the magnetic gear fails on measured efficiency or cost, it will be dropped without hesitation. Sunk cost is not an engineering argument.
