# MATERIAL SELECTION & STRUCTURAL SPECIFICATION
**Project:** Pawan Shakti 1.0  
**Lead:** Metallurgical & Materials Engineering (MME) Junior  
**Mandate:** Transition structure and components from laboratory experimental materials to durable, weatherproof, low-friction engineering materials.

---

## 1. Frame & Chassis: Obsolescence of Wooden Frame
Prior benchtop rigs used plywood/timber frames. This material is strictly retired for all future testing:

### Why Wood Fails in Drivetrain Applications:
1. **Hygroscopic Swelling:** Plywood and solid wood absorb ambient moisture, expanding by $0.5\text{ mm} - 2.0\text{ mm}$ across the grain under humidity variations (30% to 90% RH in Indian monsoons).
2. **Loss of Center Distance:** A shift of just $0.3\text{ mm}$ in gear center-to-center distance causes either severe gear tooth binding (stripping teeth) or excessive backlash.
3. **Air-Gap Rub in Magnetic Gears:** The coaxial magnetic gear relies on a uniform $1.5\text{ mm}$ air gap. Frame deflection or moisture twist causes catastrophic rotor-stator rubbing.

### Upgraded Structural Solution:
- **Main Chassis:** Standard 3030 T-slot modular aluminum extrusion (6063-T6 alloy, anodized for corrosion resistance).
- **Bearing Bulkhead Plates:** CNC laser-cut / milled 6.0 mm 6061-T6 aluminum alloy plates. Yield strength $\sigma_y = 276\text{ MPa}$; maintains shaft concentricity $\le 0.05\text{ mm}$.
- **Fasteners:** Grade 304 stainless steel M6 socket head cap screws with drop-in roll-in T-nuts and medium-strength threadlocker (Loctite 243) on all rotating joints.

---

## 2. Rotor Blade Materials: PLA vs. ASA vs. PETG-CF

| Property | Standard PLA (Retired) | ASA (Acrylonitrile Styrene Acrylate) | PETG-CF (Carbon Fiber Reinforced PETG) |
| :--- | :--- | :--- | :--- |
| **Glass Transition Temp ($T_g$)** | **$55^\circ - 60^\circ\text{C}$ (Fails)** | **$95^\circ - 105^\circ\text{C}$ (Pass)** | **$80^\circ - 85^\circ\text{C}$ (Pass)** |
| **UV Resistance** | Degrades & embrittles in 30 days sunlight | **Superior UV stability** (outdoor automotive grade) | High UV resistance; CF shielding |
| **Tensile Modulus** | $3.5\text{ GPa}$ (brittle failure) | $2.3\text{ GPa}$ (ductile yielding) | **$5.8\text{ GPa}$ (High rigidity under gust bending)** |
| **Moisture Absorption** | Moderate | **Low ($<0.3\%$)** | Low ($<0.2\%$) |
| **Printability & Layer Adhesion** | Excellent | Requires heated enclosure ($90^\circ\text{C}$ bed) | High dimensional accuracy, minimal warping |
| **Surface Finish Post-Processing**| Sands poorly; gums up | **Acetone vapor smoothable; sands easily** | Sands with wet paper; tough resin bond |

**MME Recommendation:**
- **Archimedes Spiral Rotor:** 3D print in **ASA** for lightweight impact toughness and UV stability.
- **HAWT Airfoil Blades:** 3D print in **PETG-CF** for superior flexural modulus to prevent blade flutter at rated RPM.

---

## 3. Blade Surface Finishing Protocol (Controlled Variable)
Aerodynamic drag is dominated by boundary-layer skin friction caused by 3D printer layer striations ($0.2\text{ mm}$ step ridges). To test surface finishing as a controlled variable:

1. **Test Group 1 (Baseline):** Raw 3D printed ASA/PETG-CF blades (as printed).
2. **Test Group 2 (Finished):**
   - Step 1: Wipe with isopropanol to degrease.
   - Step 2: Apply 2 coats of low-viscosity epoxy primer / micro-balloon slurry to fill print valleys.
   - Step 3: Progressive wet sanding with silicon carbide sandpaper: 400 grit $\rightarrow$ 600 grit $\rightarrow$ 1000 grit until surface roughness $R_a \le 0.8\ \mu\text{m}$.
   - Step 4: Spray 2 coats of 2-pack automotive polyurethane clear coat with UV blockers.
3. **Verification:** Back-to-back wind tunnel run measuring cut-in speed and power output at 5 m/s.

---

## 4. Bearings & Lubrication Specification

| Subsystem | Bearing Specification | Rationale | Lubricant / Maintenance |
| :--- | :--- | :--- | :--- |
| **High-Speed Generator Shaft** | Hybrid Ceramic 608 / 6201 (Silicon Nitride $\text{Si}_3\text{N}_4$ balls, stainless races) | Extremely low rolling resistance; prevents electrical pitting from stray shaft currents | Run dry or with 1 drop micro-viscosity synthetic fluorinated oil |
| **Main Rotor Shaft** | Double-sealed deep groove ball bearings (2RS 6004/6204 stainless steel) | High dynamic radial and thrust load capacity from wind gust force | Sealed-for-life with low-temperature synthetic polyurea grease |
| **Yaw Axis Pivot** | Double-row Angular Contact / Tapered Roller Bearing (30206) | Supports nacelle moment arm, vertical gravity weight, and horizontal aerodynamic thrust | High-pressure calcium sulfonate grease |
| **Planetary Gear Teeth** | Precision Delrin POM-C mating with hardened 4140 steel pins | Low friction coefficient ($\mu \approx 0.15$); high wear resistance | Synthetic PTFE fluoropolymer paste grease |
