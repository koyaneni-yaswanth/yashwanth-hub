# GENERATOR COMPARISON & SELECTION DOSSIER
**Project:** Pawan Shakti 1.0  
**Status:** Evaluation Hypotheses & Test Protocols  
**Core Objective:** Select generator architecture delivering minimal starting resistance (cut-in $\le 2.2\text{ m/s}$) and $\ge 250\text{ W}$ electrical output at rated wind speed ($11\text{ m/s}$).

---

## 1. Candidate Generator Topologies

| Parameter | 3-Phase Axial Flux Coreless PMA [HYPOTHESIS] | Radial Flux Iron-Core PMSG | High-Torque BLDC Motor Conversion | Automotive Alternator (Claw-Pole) |
| :--- | :--- | :--- | :--- | :--- |
| **Cogging Torque** | **$0.00\text{ N}\cdot\text{m}$** (No iron core in stator; zero magnetic detent torque) | $0.25 - 0.55\text{ N}\cdot\text{m}$ (Strong slot-pole detent effect) | $0.10 - 0.25\text{ N}\cdot\text{m}$ (Moderate slot cogging) | $0.05\text{ N}\cdot\text{m}$ (before excitation); massive drag when excited |
| **Cut-In Wind Speed Impact** | **Enables cut-in at $1.8 - 2.2\text{ m/s}$**; spins freely in room draft | Delays cut-in to $3.8 - 5.0\text{ m/s}$ unless high rotor inertia overcomes detent | Delays cut-in to $3.0 - 4.2\text{ m/s}$ | Unusable (requires 10–30W external field excitation) |
| **Electrical Efficiency ($\eta_{\text{gen}}$)** | $88\% - 92\%$ at 300–600 RPM | $82\% - 87\%$ at 500–1000 RPM | $78\% - 84\%$ (requires high RPM) | $50\% - 65\%$ (high field losses) |
| **Nominal Operating Speed** | $300 - 600\text{ RPM}$ | $500 - 1000\text{ RPM}$ | $1000 - 3000\text{ RPM}$ | $2000 - 5000\text{ RPM}$ |
| **Hysteresis & Eddy Losses** | Zero stator iron losses; purely copper ($I^2R$) losses | Substantial iron core losses at elevated speeds | Iron losses in stator laminations | High eddy and hysteresis losses |
| **Cost Range (INR)** | $₹12,000 - ₹18,000$ | $₹7,000 - ₹11,000$ | $₹4,500 - ₹8,000$ | $₹3,000 - ₹5,000$ |
| **Procurement Feasibility** | Custom winding or specialty micro-wind suppliers | Widely available commercial wind generator | Off-the-shelf industrial / e-bike motor | Common automotive salvage |

---

## 2. Generator Load Test Protocol (Standardized for All Candidates)
Before any generator is approved for prototype integration, it must undergo this standardized benchtop dyno test:

1. **Phase Resistance ($R_{\text{phase}}$):** Measure terminal-to-terminal DC resistance with Kelvin 4-wire milliohm meter.
2. **Phase Inductance ($L_{\text{phase}}$):** Measure with LCR meter at 100 Hz and 1 kHz.
3. **No-Load Back-EMF Constant ($K_e$):** Drive generator at 100, 200, 300, 400, 500, 600 RPM using a variable-speed lathe motor. Record line-to-line RMS AC voltage with calibrated oscilloscope.
   $$K_e = \frac{V_{\text{LL, RMS}}}{\text{RPM}} \quad [\text{V/RPM}]$$
4. **Breakaway Starting Torque ($T_{\text{start}}$):** Measure breakaway torque with torque lever arm and digital force gauge (zero electrical load).
5. **Full-Load Power & Thermal Sweep:** Connect generator through a 3-phase Schottky diode bridge into a programmable DC electronic load (or calibrated power resistor bank). Step RPM from 100 to 600 RPM under 12V, 24V, and 48V bus targets.
   - Measure: $V_{\text{load}}$, $I_{\text{load}}$, $P_{\text{elec}} = V \times I$, Stator surface temperature ($T_{\text{stator}}$) over 60 minutes.
   - Compute generator efficiency:
     $$\eta_{\text{gen}} = \frac{P_{\text{elec}}}{T_{\text{shaft}} \times \omega}$$

---

## 3. Immediate Action Items
- [ ] Catalog exact make and model of the generator currently mounted on the wooden frame rig.
- [ ] Measure its baseline phase resistance, cogging torque, and open-circuit voltage at 300 RPM.
- [ ] Source datasheets and pricing for 300W–500W Coreless Axial Flux Alternators (12-coil, dual-rotor N52).
