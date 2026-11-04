# PAWAN SHAKTI ARCHITECTURAL & STRATEGIC DECISION LOG
**Project:** Pawan Shakti 1.0  
**Authority:** Founder / Chief Engineer Decision Register

---

## Decision Record Schema
- **Decision ID:** `DEC-xxx`
- **Date:** YYYY-MM-DD
- **Decision Owner:** Founder / Specific Pod Lead
- **Status:** `PROPOSED` | `UNDER EVALUATION` | `APPROVED` | `REJECTED` | `SUPERSEDED`
- **Context & Problem Statement:** Why this decision is necessary.
- **Options Evaluated:** Pros and cons of each alternative.
- **Final Decision & Rationale:** The path taken and the data-driven reason.
- **Impact & Downstream Constraints:** What changes across WBS, BOM, or schedule.

---

## Active & Historical Decisions

### DEC-001: Strict Adoption of Standard TRL 1–9 Framework
- **Date:** 2026-11-04
- **Decision Owner:** Founder (Yashwanth)
- **Status:** `APPROVED`
- **Context:** Previous informal references mentioned "TRL 10". Standard NASA, DoE, and European TRL frameworks strictly terminate at TRL 9.
- **Decision:** Pawan Shakti targets an evidence-based TRL 5 (laboratory-validated integrated system) with a stretch goal of TRL 6 (relevant-environment outdoor prototype). TRL 7+ requires multi-season commercial field operation, and IEC 61400-2 certification is a multi-month post-sprint effort. Never claim unverified TRL levels.

### DEC-002: Decommissioning Wooden Structural Frames
- **Date:** 2026-11-04
- **Decision Owner:** Founder & MME Lead
- **Status:** `APPROVED`
- **Context:** Plywood/timber frames warp 0.5–2.0 mm under humidity shifts, misaligning bearing centerlines and risking gear stripping or magnetic air-gap rub.
- **Decision:** Mandate complete transition to 3030 T-slot aluminum extrusions and CNC laser-cut 6061-T6 aluminum bearing bulkheads starting Day 16. No further mechanical performance claims will be accepted from wooden rigs after Day 15.

### DEC-003: Selection of Passive Furling Yaw over Active Servos
- **Date:** 2026-11-04
- **Decision Owner:** Founder & EE Backbone Lead
- **Status:** `APPROVED`
- **Context:** An active yaw servo motor and sensor draw 5W–15W continuously. On a 100W–250W micro-turbine in 4–5 m/s winds, active yaw consumes 25% to 50% of generated electrical power.
- **Decision:** Adopt a purely passive aerodynamic tail vane with a 5° mechanical furling hinge and counter-weight/spring damper, mounted on a central CG double-row angular contact bearing with a 3-wire 30A capsule slip ring.

### DEC-004: Two-Pod Parallel R&D and Day 45 Freeze Gate
- **Date:** 2026-11-04
- **Decision Owner:** Founder
- **Status:** `APPROVED`
- **Context:** Pod A (Coaxial Magnetic Gear + HAWT) and Pod B (Archimedes Spiral + Planetary Gear) offer distinct advantages in low-wind startup vs. high-speed efficiency.
- **Decision:** Fund and build both pods through Day 44. Execute head-to-head shootout under identical conditions. On Day 45, freeze ONE winning architecture (or justified hybrid) based strictly on measured data. Terminate the losing track; do not keep both due to sunk-cost bias.

### DEC-005: 5-Stage Turbine Control & Charging Architecture (TCCB)
- **Date:** 2026-11-04
- **Decision Owner:** Founder & Power Backbone Lead
- **Status:** `APPROVED`
- **Context:** Unregulated generator connections risk runaway during battery disconnect or full charge; standard solar MPPT algorithms stall the rotor; instant dead shorting risks gear shear.
- **Decision:** Implement 5-stage architecture: 1) Slip ring interface; 2) Manual E-stop dynamic brake contactor (switching into 500W resistor bank); 3) Low-loss Schottky rectification; 4) Automated 500W PWM dump load at 28.8V or 650 RPM; 5) Wind-specific cubic-curve MPPT controller charging a 24V LiFePO4 battery pack.
