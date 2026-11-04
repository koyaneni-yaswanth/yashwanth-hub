# SAFETY PROTOCOLS & HAZARD RISK REGISTER (FMEA)
**Project:** Pawan Shakti 1.0  
**Safety Officer:** Founder & Lead Electrical Junior  
**Compliance Standard:** Internal Alignment with IEC 61400-2 (Small Wind Turbines) Safety Principles

---

## 1. Non-Negotiable Safety Cardinal Rules
1. **Physical Guards on All Rotating Machinery:** No test rig may be energized or operated without clear polycarbonate or metal mesh safety guards enclosing shafts, gears, magnets, and couplers. Loose clothing, ties, and untied hair are strictly forbidden.
2. **Zero Uncontrolled Overspeed Runs:** Free-wheeling tests are strictly prohibited. The turbine rotor must be electrically or aerodynamically loaded at all times.
3. **Regulated Battery Charging Only:** Never connect raw rectified generator output directly to any lithium battery cell. All battery charging must pass through current-limited, voltage-regulated MPPT electronics with hardware BMS.
4. **Zero Live Electrical Modifications:** Disconnect battery fuses and isolate the turbine AC input before touching terminal blocks, soldering, or rerouting telemetry wires.
5. **Pre-Written Test Procedures Required:** No braking, over-speed, or high-wind test may be executed without a pre-approved step-by-step test procedure reviewed by the Founder.

---

## 2. Failure Mode and Effects Analysis (FMEA) Risk Register

| Hazard ID | Subsystem | Failure Mode / Root Cause | Severity (1–5) | Prob. (1–5) | Detection | Engineering Mitigation Strategy | Verification / Action |
| :--- | :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| **RSK-01** | Rotor / Blades | High-wind overspeed runaway caused by loss of electrical load or battery BMS disconnect. | **5 (Catastrophic)** | 3 | Real-time RPM sensor alarm ($>650\text{ RPM}$) | Triple redundancy: 1) Passive aerodynamic tail furling at 12 m/s; 2) Automated 500W dump-load switch; 3) Manual mushroom E-stop contactor. | Benchtop test of dump load and manual E-stop before any outdoor run. |
| **RSK-02** | Drivetrain (Pod A) | High-speed magnetic pole slippage or N52 magnet dislodgement from centrifugal force. | **4 (Critical)** | 2 | Dial indicator runout check; vibration sensor | Dual-rotor hubs machined with mechanical retaining lips (magnets recessed into pockets, not surface bonded alone); high-temp structural epoxy (Loctite 330). | Spin test at 1.5x rated RPM inside shielded chamber. |
| **RSK-03** | Drivetrain (Pod B) | Planetary gear tooth stripping / seizure under sudden dynamic braking torque. | **4 (Critical)** | 2 | Acoustic monitoring; torque spike | Sizing gear modules with safety factor $\ge 2.5$; dynamic brake uses soft-stop current-limiting resistors rather than dead short. | Step-wise lathe brake engagement from 200 to 600 RPM. |
| **RSK-04** | Frame / Tower | Fatigue fracture or bolt loosening due to cyclical aerodynamic turbulence vibration. | **4 (Critical)** | 3 | Visual pre-flight inspection; torque witness marks | Anodized 3030 aluminum profile with 6061-T6 plates; Loctite 243 on all threads; nylon insert locknuts; torque-seal inspection lacquer. | 100-hour continuous shaker / bench run inspection. |
| **RSK-05** | Yaw Axis | Cable twisting and shear caused by continuous unidirectional wind yawing. | **3 (Major)** | 4 | Yaw revolution counter | 30A 3-wire capsule slip ring integrated inside hollow pivot shaft; mechanical yaw stop bumper if non-slip ring tested. | 500-revolution benchtop slip-ring rotation test under 10A current. |
| **RSK-06** | Electrical | Dump load resistor thermal runaway and fire hazard during sustained high-wind dump. | **4 (Critical)** | 2 | Resistor surface thermocouple | 500W aluminum-housed resistors mounted to external finned heatsink outside the plastic enclosure; thermal fuse cutoff at $120^\circ\text{C}$. | 30-minute full 400W electrical soak test with FLIR thermal camera. |
| **RSK-07** | Battery Storage | Lithium battery over-voltage or thermal runaway during full SoC condition. | **5 (Catastrophic)** | 2 | INA226 voltage telemetry; BMS fault relay | LiFePO4 chemistry (inherently thermally stable); hardware BMS with independent low/high cutoff; MPPT firmware clamping at 28.8V. | Benchtop over-voltage injection test verifying BMS disconnect. |

---

## 3. IEC 61400-2 Reality Check
- **Standard Scope:** IEC 61400-2 governs the design, safety, and certification of small wind turbines (rotor swept area $< 200\text{ m}^2$).
- **Certification Reality:** Full IEC 61400-2 certification requires at least 6 months of continuous outdoor testing in certified wind conditions, accredited laboratory acoustic testing, and destructive blade fatigue tests costing ₹10L–₹25L.
- **90-Day Programme Boundary:** Pawan Shakti will adopt the **safety and load calculation principles** of IEC 61400-2 (safety factors, furling design, simplified load equations), but will **NEVER** claim official IEC certification in grants, pitch decks, or marketing without a formal third-party certificate.
