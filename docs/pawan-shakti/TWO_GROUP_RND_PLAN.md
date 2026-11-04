# TWO-GROUP R&D STRATEGY & DAY 45 FREEZE GATE
**Programme:** Pawan Shakti 1.0 (Days 1 to 45 Shootout Phase)  
**Objective:** Compete two parallel drivetrain & rotor architectures under identical airflow boundaries, then freeze ONE winning commercial pilot architecture on Day 45.

---

## 1. Rationale for Parallel R&D Tracks
Developing a small-scale wind turbine for low-wind environments presents two fundamental trade-offs:
1. **Starting Torque vs. High-Speed Aerodynamic Efficiency:**
   - Conventional HAWT airfoils have high aerodynamic efficiency ($C_p \approx 0.38 - 0.45$) at high Tip Speed Ratios ($\lambda = 5 - 7$), but very low starting torque at $v < 3\text{ m/s}$.
   - Archimedes spiral rotors generate exceptional drag-and-lift starting torque ($C_m \ge 0.28$) at low wind speeds ($\lambda = 1.5 - 2.5$), but peak $C_p$ tops out at $0.26 - 0.32$.
2. **Mechanical Gear Friction vs. Magnetic Gear Complexity:**
   - Multi-stage mechanical planetary gearboxes are compact and deliver known speed ratios (1:10), but mechanical gear friction, seal drag, and backlash impede starting in light breezes and wear over time.
   - Coaxial magnetic gears eliminate physical contact, provide zero friction/lubrication requirements, and slip harmlessly under sudden storm gusts, but require tight magnetic air gaps ($1.5\text{ mm}$) and precision non-magnetic concentric assemblies.

By funding and building both prototypes up to Day 45, Pawan Shakti derisks the entire technical roadmap and gathers empirical proof rather than relying on theoretical assumptions.

---

## 2. Pod Breakdown & Scope of Work

```
                                  FOUNDER / CHIEF ENGINEER
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
         POD A: MAGNETIC GEAR + HAWT                     POD B: ARCHIMEDES + PLANETARY
   ┌─────────────────────────────────────┐         ┌─────────────────────────────────────┐
   │ • 1 MME Junior (Shared)             │         │ • 1 MME Junior (Shared)             │
   │ • 2 EE Juniors                      │         │ • 1 EE Junior                       │
   │                                     │         │                                     │
   │ Subsystems:                         │         │ Subsystems:                         │
   │ • 1:5.5 / 1:10 Coaxial Magnetic Gear│         │ • Archimedes Spiral (60°/50°/25°)   │
   │ • High-TSR HAWT Airfoil Rotor       │         │ • 1:10 Delrin Planetary Gearbox     │
   │ • N52 Pole Placement / Modulator    │         │ • Hybrid Ceramic Low-Drag Bearings  │
   │ • Dial-Indicator Air Gap Check      │         │ • Synthetic PTFE Gear Lubricant     │
   └─────────────────────────────────────┘         └─────────────────────────────────────┘
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                             SHARED POWER & TELEMETRY BACKBONE
                      ┌───────────────────────────────────────────────┐
                      │ • 2 EE Juniors                                │
                      │ • 3-Phase Schottky Rectification              │
                      │ • Dynamic E-Stop Brake & 500W Dump Load       │
                      │ • Buck-Boost MPPT (24V LiFePO4)               │
                      │ • 1 Hz Automated ESP32 Telemetry Logging      │
                      └───────────────────────────────────────────────┘
```

---

## 3. Detailed Technical Configurations

### Pod A: Coaxial Magnetic Gear + HAWT Airfoil
- **Rotor:** 3-Blade Horizontal Axis Wind Turbine (HAWT). Airfoil: SG6043 / SD7062 low-Reynolds profiles. 3D-printed in ASA, reinforced with carbon-fiber spars, epoxy smoothed, wet sanded.
- **Rotor Tip Speed Ratio ($\lambda$):** Designed for $\lambda = 5.0 - 6.5$.
- **Magnetic Gearbox Architecture:**
  - High-Speed Inner Rotor: 4 pole pairs (8 N52 neodymium arc magnets).
  - Stationary Flux Modulator Ring: 22 ferromagnetic pole pieces (M19 laminated silicon steel / AISI 1008 low carbon steel).
  - Low-Speed Outer Rotor: 18 pole pairs (36 N52 neodymium block magnets).
  - Calculated Gear Ratio:
    $$G_r = \frac{n_{\text{modulator}} - p_{\text{outer}}}{p_{\text{inner}}} = \frac{22 - 18}{4} = 1:1 \quad \text{(or alternative configuration:)} \quad G_r = \frac{p_{\text{outer}}}{p_{\text{inner}}} = \frac{18}{4} = 1:4.5 \text{ to } 1:10$$
  - Critical Air Gap: $1.5\text{ mm} \pm 0.1\text{ mm}$ radial clearance maintained by CNC 6061 aluminum endbells.
- **Key Advantages:** Zero mechanical wear, zero gear lubrication, acoustic silence, intrinsic overload slip protection during storm gusts.
- **Risks:** Eddy current heating in modulator pins, magnet demagnetization risk at elevated temperatures ($>80^\circ\text{C}$), assembly difficulty with strong N52 attractive forces.

### Pod B: Archimedes Spiral + 1:10 Planetary Gearbox
- **Rotor:** 3-Bladed Helical Archimedes Spiral. Swept diameter: $1.128\text{ m}$ ($A = 1.0\text{ m}^2$). Progressive helix angle: $60^\circ$ at base, $50^\circ$ at mid-blade, $25^\circ$ at exit tip.
- **Rotor Tip Speed Ratio ($\lambda$):** Designed for $\lambda = 1.8 - 2.8$. High starting torque from drag component, converting to lift along the helical screw.
- **Planetary Gearbox Architecture:**
  - Multi-stage 1:10 planetary gearbox (Stage 1 = 1:3.16, Stage 2 = 1:3.16; or single-stage compound planetary).
  - Gear Material: CNC-machined POM-C (Polyacetal / Delrin) gears paired with 4140 steel carrier pins.
  - Bearings: Hybrid ceramic deep groove ball bearings (Si3N4 balls with stainless races) to minimize dry rolling friction.
  - Lubrication: Non-migrating synthetic fluorinated grease with PTFE micro-particles.
- **Key Advantages:** Massive starting torque (spins in ambient room draft), high mechanical stiffness, known tooth kinematic transmission.
- **Risks:** Backlash, acoustic gear whine at 600 RPM, friction seal drag, long-term tooth wear under sand/dust ingress.

---

## 4. Head-to-Head Shootout Protocol (Days 39 to 44)
Both assemblies will be mounted successively on the calibrated laboratory airflow and dynamometer test rig under identical test conditions.

### Test 1: Breakaway & Cut-in Wind Speed Evaluation
- **Procedure:** Position turbine in uniform $1\text{ m}^2$ airflow duct. Gradually increase wind speed from $0.5\text{ m/s}$ in increments of $0.2\text{ m/s}$ every 60 seconds.
- **Measurement:** Record the exact wind speed $v$ at which rotor sustains continuous rotation $> 30\text{ RPM}$.
- **Pass Threshold:** $v_{\text{cut-in}} \le 2.2\text{ m/s}$.

### Test 2: Mechanical Transmission Efficiency Under Load
- **Procedure:** Couple high-speed output shaft to the Axial Flux Coreless PMA connected to a programmable DC electronic load. Drive input shaft with variable speed lathe motor from 60 to 300 RPM.
- **Measurement:** Measure mechanical input torque ($T_{\text{in}}$) and speed ($\omega_{\text{in}}$) vs. electrical power output ($P_{\text{elec}}$) and generator efficiency.
- **Calculated:**
  $$\eta_{\text{drivetrain}} = \frac{T_{\text{out}} \cdot \omega_{\text{out}}}{T_{\text{in}} \cdot \omega_{\text{in}}}$$

### Test 3: Overload & Dynamic Braking Response
- **Procedure:** Bring unit to rated speed ($v = 11\text{ m/s}$ equivalent). Engage the manual emergency stop contactor (shorting generator phases through braking resistors).
- **Measurement:** Time to zero RPM ($t_{\text{stop}}$), peak deceleration torque, and inspect for gear tooth stripping (Pod B) or magnetic pole slippage/recovery (Pod A).

### Test 4: Acoustic Noise & Thermal Rise
- **Procedure:** Run continuously for 120 minutes at rated power ($250\text{ W}$ electrical).
- **Measurement:** Sound pressure level in dBA measured at 1 m, 3 m, and 5 m distance. Thermal imaging of gear housing / magnet hub using FLIR infrared thermometer.

---

## 5. Day 45 Freeze Gate Decision Matrix
On Day 45, the Founder and core team evaluate both pods against this weighted multi-criteria matrix. The winning architecture is immediately frozen for the single commercial pilot build.

| Criteria | Weight | Scoring Metric (1–10) | Pod A: Magnetic + HAWT Target | Pod B: Archimedes + Planetary Target |
| :--- | :---: | :--- | :---: | :---: |
| **Cut-In Wind Speed ($v_{\text{cut-in}}$)** | 20% | 10: $<2.0\text{ m/s}$, 8: $2.0–2.5$, 4: $>3.0$ | 8.5 ($2.2\text{ m/s}$) | 9.5 ($1.8\text{ m/s}$) |
| **Full-Speed Efficiency ($C_p \cdot \eta$)** | 20% | 10: $>32\%$, 8: $28–32\%$, 5: $<24\%$ | 9.0 ($31.5\%$) | 7.5 ($26.0\%$) |
| **Acoustic Noise (<45 dBA at 5m)** | 15% | 10: $<38\text{ dBA}$, 8: $38–44$, 3: $>50$ | 10.0 (near-silent) | 7.0 (gear meshing whine) |
| **5-Year Reliability & Wear** | 15% | 10: Zero wear/seals, 6: Grease service, 2: Tooth wear | 9.5 (no contact) | 6.5 (gear tooth fatigue) |
| **BOM Unit Cost (Target <₹42.5k)** | 15% | 10: $<₹30\text{k}$, 8: $₹30–38\text{k}$, 5: $>₹42\text{k}$ | 7.0 (N52 magnet cost) | 8.5 (Delrin/aluminum gears) |
| **Manufacturing Tolerances** | 15% | 10: Easy assembly, 5: Tight tolerances ($\pm 0.1\text{mm}$) | 6.0 ($1.5\text{ mm}$ air gap critical) | 8.0 (standard CNC gears) |
| **TOTAL WEIGHTED SCORE** | **100%** | **Formula: $\sum (\text{Weight} \times \text{Score})$** | **8.35 / 10** | **7.90 / 10** |

*Note: Hybrid combinations (e.g. Archimedes Rotor driving the Coaxial Magnetic Gear) are explicitly permissible if supported by the shootout data!*

---

## 6. Day 46 Unified Team Merger
Upon freezing the winning drivetrain on Day 45:
1. Pod A and Pod B dissolved into a single unified product execution pod.
2. All 6 juniors transition to hardening, sealing, IP65 weatherproofing, field mast integration, and preparing the single commercial pilot unit for delivery on Day 90.
