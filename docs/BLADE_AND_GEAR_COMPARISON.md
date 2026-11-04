# BLADE AERODYNAMICS & GEAR TRANSMISSION COMPARISON
**Project:** Pawan Shakti 1.0  
**Authors:** Pod A & Pod B R&D Leads  
**Purpose:** Technical trade-off analysis between Aerodynamic Blade Geometries and Gearbox Architectures.

---

## 1. Aerodynamic Blade Physics: HAWT Airfoil vs. Archimedes Spiral

### 1.1 Fundamental Governing Principles
The performance of any wind rotor is characterized by its Tip Speed Ratio ($\lambda$) and Power Coefficient ($C_p$):
$$\lambda = \frac{\omega \cdot R}{v_{\text{wind}}}$$
$$C_p = \frac{P_{\text{aerodynamic}}}{\frac{1}{2} \rho A v_{\text{wind}}^3}$$

| Parameter | Conventional 3-Blade HAWT (Pod A) | Helical Archimedes Spiral (Pod B) |
| :--- | :--- | :--- |
| **Primary Aerodynamic Mechanism** | Pure Lift (airfoil circulation via low-Reynolds profiles e.g. SG6043 / SD7062) | Hybrid Drag + Lift (screw surface generates static pressure difference + circulation) |
| **Optimum Tip Speed Ratio ($\lambda_{\text{opt}}$)** | **$5.0 - 6.5$** (Rotor spins 5 to 6.5x faster than wind) | **$1.8 - 2.8$** (Rotor spins 1.8 to 2.8x wind speed) |
| **Peak Aerodynamic Efficiency ($C_{p,\text{max}}$)** | **$0.38 - 0.44$** (High aerodynamic conversion at design $\lambda$) | **$0.26 - 0.32$** (Moderate aerodynamic conversion; limited by drag profile) |
| **Static Starting Torque Coefficient ($C_m$)** | Very Low ($C_m \approx 0.04 - 0.08$); struggles at $v < 3\text{ m/s}$ | **Very High ($C_m \approx 0.28 - 0.38$)**; self-starts in light drafts ($<1.8\text{ m/s}$) |
| **Rotor Speed at $8\text{ m/s}$ ($R = 0.564\text{ m}$)** | $\omega = \frac{6.0 \times 8.0}{0.564} \approx 85.1\text{ rad/s} \rightarrow \mathbf{812\text{ RPM}}$ | $\omega = \frac{2.2 \times 8.0}{0.564} \approx 31.2\text{ rad/s} \rightarrow \mathbf{298\text{ RPM}}$ |
| **Gear Ratio Needed for 600 RPM Gen** | Direct Drive or Low Ratio ($1:1$ to $1:2$) | Speed Increaser Required (**$1:5.5$ to $1:10$**) |
| **Structural Complexity** | High aspect ratio blades; root bending moment critical | Helical conical geometry; distributes wind thrust along center shaft |
| **Manufacturing Method** | ASA 3D print in 2 segments with internal CF spar | ASA 3D print in 3 spiral segments joined on central aluminum hub |

---

## 2. Gear Transmission: Coaxial Magnetic Gear vs. Planetary Gearbox

### 2.1 Physics & Performance Trade-offs

| Parameter | Coaxial Magnetic Gear (Pod A) [HYPOTHESIS] | Patented Planetary Gearbox (Pod B) |
| :--- | :--- | :--- |
| **Transmission Mechanism** | Modulated magnetic flux via stationary ferromagnetic pole pieces | Mechanical spur / helical gear tooth meshing |
| **Gear Ratio Range** | $1:5.5 \text{ to } 1:10$ ($G_r = \frac{p_{\text{outer}}}{p_{\text{inner}}}$ or $\frac{n_{\text{mod}}}{p_{\text{inner}}}$) | $1:5.5 \text{ to } 1:10$ (3-setup or 4-setup planetary cascade) |
| **Mechanical Friction & Seal Drag** | **Zero contact friction** (bearings only; zero tooth drag) | Contact tooth friction, seal drag, grease shear resistance |
| **Breakaway Starting Torque** | **$< 0.02\text{ N}\cdot\text{m}$** (virtually frictionless start) | $0.06 - 0.14\text{ N}\cdot\text{m}$ (higher breakaway resistance) |
| **Transmission Efficiency ($\eta_{\text{mech}}$)** | $88\% - 94\%$ (eddy current losses in modulators at high RPM) | $82\% - 91\%$ (tooth friction, bearing friction, oil churning) |
| **Overload / Storm Protection** | **Inherent magnetic slip:** poles slip harmlessly above pull-out torque without mechanical damage | **Risk of tooth stripping / shear** unless protected by dynamic brake |
| **Acoustic Noise** | **Near Silent** ($<30\text{ dBA}$ gear noise) | Acoustic gear whine ($45 - 55\text{ dBA}$ at 600 RPM) |
| **Assembly Tolerances** | **Critical:** requires $1.5\text{ mm} \pm 0.1\text{ mm}$ concentric air gap | Standard precision machining tolerances ($\pm 0.05\text{ mm}$) |
| **Cost & BOM Impact** | High ($₹8,000 - ₹12,000$ for N52 magnets & silicon steel) | Moderate ($₹4,500 - ₹7,000$ for CNC Delrin & ceramic bearings) |

---

## 3. Systematic Convergence Strategy
The two R&D pods evaluate these exact combinations:
- **Pod A:** Lift-based HAWT + Coaxial Magnetic Gear. High efficiency at high wind speeds, frictionless transmission.
- **Pod B:** Torque-based Archimedes + Patented Planetary Gear. Unmatched low-wind startup, protected by patent claims.

**Day 45 Decision Rule:**
If the Archimedes rotor provides superior low-wind startup ($v < 2.0\text{ m/s}$) AND the Magnetic Gear delivers frictionless storm-safe transmission, the data may justify a **Hybrid Architecture** (Archimedes Rotor + Magnetic Gear + Coreless PMA). If one drivetrain conclusively underperforms on measured efficiency and BOM cost, it will be retired immediately.
