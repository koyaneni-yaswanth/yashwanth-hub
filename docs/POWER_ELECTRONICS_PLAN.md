# POWER ELECTRONICS, CHARGING & FAILSAFE BRAKING PLAN
**Project:** Pawan Shakti 1.0  
**Leads:** Electrical Engineering (Power Backbone) Juniors  
**Subsystem:** Turbine Control & Charging Box (TCCB)

---

## 1. Top-Level Schematic Architecture

```
3-Phase AC from Coreless PMA (via 30A Capsule Slip Ring)
                      │
                      ▼
         [E-STOP BRAKING CONTACTOR] ◄─── (Manual Mushroom Push-Button)
         │ (Normally Closed to Rectifier; Energized/Pushed switches to Dynamic Brake Resistors)
         │
         ├───► [DYNAMIC BRAKE RESISTORS] (3x 1.5 Ω 500W Aluminum-Housed Resistor Bank)
         │
         ▼
[3-PHASE LOW-LOSS SCHOTTKY RECTIFIER] (50A, 100V Low Vf < 0.4V per diode)
         │
         ▼ (Filtered DC Bus: 0 - 60V DC)
         │
         ├───► [AUTOMATED DUMP LOAD PWM SWITCH] (MOSFET / SSR driven by MCU)
         │          │
         │          └───► [500W FINNED DUMP LOAD RESISTOR] (Diverts over-voltage / over-speed)
         │
         ▼
[WIND-SPECIFIC BUCK-BOOST MPPT CONTROLLER] 
(Programmed with P = k·ω³ lookup table; prevents stalling the rotor in light winds)
         │
         ▼
[MAIN DC DISCONNECT SWITCH & 30A CERAMIC FUSE]
         │
         ▼
[24V 50Ah LiFePO4 BATTERY BANK WITH BMS]
(Absorb: 28.8V, Float: 27.2V, Low Voltage Disconnect: 21.0V)
```

---

## 2. Detailed Stage Engineering

### 2.1 Low-Loss 3-Phase Rectifier
- Standard silicon diode bridges exhibit a forward voltage drop of $V_f \approx 0.7\text{V} - 1.0\text{V}$ per diode. For a full bridge (2 diodes conducting in series), this wastes $1.4\text{V} - 2.0\text{V}$. In light winds ($3 - 4\text{ m/s}$), where generator phase voltage is only $8 - 14\text{V}$, standard silicon diodes waste up to $20\%$ of generated power as heat.
- **Specification:** 3-Phase Schottky Barrier Diode Bridge (e.g., Vishay / STMicroelectronics 50A 100V) with forward voltage drop $V_f \le 0.38\text{V}$ per diode at 5A load, mounted to an extruded aluminum finned heatsink.

### 2.2 MPPT Compatibility Reality Check: Why Solar MPPT Fails on Wind
- **Critical Warning:** Standard solar MPPT charge controllers **CANNOT** be used directly on wind turbines without modification.
- **Why Solar MPPT Fails:**
  - Solar panels have a fixed I-V curve with an open-circuit voltage that changes slowly with sunlight.
  - Wind turbines have mechanical inertia. If a solar MPPT attempts its standard "Perturb & Observe" algorithm and rapidly draws current, the electrical torque instantly exceeds aerodynamic torque, collapsing the rotor RPM to zero (stall).
- **Required Solution:** Wind-specific buck-boost MPPT controller utilizing a **Cubic Power-Speed Curve Lookup Table**:
  $$P_{\text{target}} = k \cdot \omega^3$$
  Where $k$ is calibrated to the specific turbine rotor $C_{p,\text{max}}$ operating point.

### 2.3 Dynamic Braking & Emergency Stop (E-Stop)
- **Direct Phase Short Warning:** A direct, instantaneous dead short of a permanent magnet generator at full rated RPM ($600\text{ RPM}$) generates massive instantaneous deceleration torque ($>5\times$ rated torque). This shock can strip planetary gear teeth, shear keyways, or overheat stator copper windings.
- **Dynamic Braking Resistor Bank:** The E-Stop contactor switches the 3 AC phases into a star-connected bank of three $1.5\ \Omega$, 500W finned aluminum-housed wirewound braking resistors. This applies controlled, maximum electromagnetic counter-torque, bringing the rotor to a complete stop smoothly within 3 to 5 seconds.

### 2.4 Automated Over-Voltage & Over-Speed Dump Load
- **Trigger Conditions:**
  1. Battery Voltage ($V_{\text{batt}}$) reaches $28.8\text{V}$ ($100\%$ SoC).
  2. Rotor Speed reaches $650\text{ RPM}$ (wind gust $>13\text{ m/s}$).
  3. Battery disconnect / BMS trip.
- **Circuit:** High-speed Solid State Relay (SSR) or low $R_{\text{DS(on)}}$ power MOSFET switching the DC bus across a dedicated 500W aluminum heatsinked resistor. PWM duty cycle modulates smoothly from 0% to 100% to clamp DC bus voltage at $29.0\text{V}$.

---

## 3. Safety Test Procedure: Dynamic Brake Verification (Mandatory Before Outdoor Deployment)
*No overspeed or braking test may be performed without this approved written procedure.*

1. **Pre-Test Inspection:**
   - Verify all 3 braking resistors are securely bolted to heat sink with thermal paste applied.
   - Verify all power wiring is minimum 12 AWG high-temperature silicone wire with crimped ring terminals.
   - Ensure safety guard is securely bolted over spinning shafts and gears.
   - Clear all personnel to minimum 2 m safety radius; operator wears safety goggles.
2. **Step 1 — Low-Speed Engagement (200 RPM):**
   - Drive generator at 200 RPM on bench lathe.
   - Press the manual E-stop button.
   - Record with oscilloscope: deceleration time ($t_{\text{stop}}$), peak phase current, resistor surface temperature rise ($\Delta T$).
3. **Step 2 — Medium-Speed Engagement (400 RPM):**
   - Repeat at 400 RPM. Verify no mechanical slippage or excessive thermal spike ($T_{\text{resistor}} < 80^\circ\text{C}$).
4. **Step 3 — Full Rated Speed Engagement (600 RPM):**
   - Bring to 600 RPM. Engage E-stop. Verify complete stop in $<5$ seconds. Inspect gear teeth and magnetic rotor for any displacement.
   - Founder sign-off required to mark test complete.
