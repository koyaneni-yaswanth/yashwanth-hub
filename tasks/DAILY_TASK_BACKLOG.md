# DAILY MICRO-TASK BACKLOG — GATE 1 SPRINT (DAYS 1 TO 7)
**Project:** Pawan Shakti 1.0  
**Phase:** Phase 1 — Baseline Audit, Physical Measurement & Test Standardization  
**Gate Target:** Gate 1 Pass (Baseline Documented, TRL Audited, Logger v1 Operational, Scoring Weights Frozen)  
**Rule:** Only Days 1–7 task cards are active. Days 8–90 task cards are locked until Gate 1 is passed by Founder review.

---

## Daily Task Protocol
- **Morning Dispatch (9:00 AM):** Each junior receives exactly ONE primary ticket (2.0–3.0 hours max) with a binary Definition of Done (DoD).
- **Evening Proof-of-Work (8:00 PM):** Submit 4 lines: 1) Artifact link, 2) One quantitative metric, 3) Plot/graph or photo, 4) Tomorrow's blocker.
- **Evidence Rule:** A task is marked complete ONLY with attached photographic, CAD, or CSV evidence.

---

## DAY 1: WORKSPACE INVENTORY & DIMENSIONAL MEASUREMENT

### [TASK-D01-01] MME Junior | Physical Measurement of Baseline Wooden Prototype
- **Track / Pod:** Track 1 (Engineering) | Materials & Structures (Shared)
- **Owner:** MME Junior (Materials Lead)
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Physical access to existing wooden rig at VNIT lab
- **Objective:** Physically measure and record all dimensions of the existing wooden prototype rotor, hub, shafts, and frame.
- **Exact Steps:**
  1. Measure total rotor tip-to-tip diameter ($D$) with steel tape measure across 3 different rotational angles.
  2. Compute real swept area ($A = \pi R^2$). Do not assume $1.0\text{ m}^2$.
  3. Measure blade chord length at root, mid-span, and tip using digital vernier calipers.
  4. Measure blade twist angles with digital inclinometer.
  5. Measure low-speed and high-speed shaft diameters and center-to-center distances.
  6. Fill out `data/prototype_dimensions_baseline.csv` and photograph each measurement with scale visible.
- **Required Equipment:** Digital Vernier caliper (0.01 mm), 3 m steel tape measure, digital angle gauge/inclinometer.
- **Expected Output:** Dimensioned sketch or PDF sheet + 5 clear measurement photos.
- **Acceptance Criteria (DoD):** Exact measured values recorded with caliper precision; swept area calculated from measured radius.
- **Safety:** Ensure rig is mechanically locked so blades cannot spin during hand measurement.
- **Mandatory Evidence:** Photo of caliper showing rotor hub/shaft diameter + completed dimensions table.

### [TASK-D01-02] EE Junior 1 & 2 (Pod A) | Coaxial Magnetic Gear STL & Geometry Audit
- **Track / Pod:** Track 1 (Engineering) | Pod A (Coaxial Magnetic Gear)
- **Owner:** EE Junior 1 & EE Junior 2
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Downloaded STL files (`Inner rotor, AMG.stl`, `Outer rotor, AMG.stl`, etc.)
- **Objective:** Inspect existing 3D printed magnetic gear components and CAD files to quantify pole count, pole pitch, and radial air gap.
- **Exact Steps:**
  1. Open `Inner rotor, AMG.stl` and `Outer rotor, AMG.stl` in CAD/slicer.
  2. Count magnet pocket slots on inner rotor ($p_{\text{inner}}$) and outer rotor ($p_{\text{outer}}$).
  3. Count ferromagnetic pole piece slots on `ferromagnetic holder, AMG.stl` ($n_{\text{modulator}}$).
  4. Calculate theoretical speed ratio: $G_r = \frac{n_{\text{modulator}} - p_{\text{outer}}}{p_{\text{inner}}}$ or alternative pole ratio.
  5. Inspect existing printed parts with calipers to measure actual pocket dimensions vs. magnet size ($40\times 10\times 5\text{ mm}$ or arc blocks).
- **Required Equipment:** CAD software (Autodesk Fusion / FreeCAD) + digital vernier calipers + existing 3D prints.
- **Expected Output:** 1-page geometry memo detailing inner/outer pole counts, calculated gear ratio, and measured pocket clearance.
- **Acceptance Criteria (DoD):** Gear ratio verified mathematically with pole counts confirmed against CAD geometry.
- **Safety:** Keep strong N52 magnets separated from ferromagnetic tools; pinch hazard warning.
- **Mandatory Evidence:** Screenshot of CAD cross-section showing air gap and magnet pocket dimensions + pole count table.

### [TASK-D01-03] EE Junior 3 (Pod B) | Patented Planetary Gearbox Ratio & Condition Audit
- **Track / Pod:** Track 1 (Engineering) | Pod B (Archimedes Spiral + Planetary)
- **Owner:** EE Junior 3
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Physical 3-setup / 4-setup planetary hardware
- **Objective:** Disassemble and audit tooth count, backlash, and bearing condition of existing planetary gear rig.
- **Exact Steps:**
  1. Disassemble the wooden-mounted planetary gearbox housing.
  2. Count tooth numbers on sun gear ($Z_s$), planet gears ($Z_p$), and ring gear ($Z_r$) for each stage.
  3. Verify stage ratio: $R_{\text{stage}} = 1 + \frac{Z_r}{Z_s}$ (or carrier-driven configuration).
  4. Inspect teeth for wear, tooth stripping, or print layer delamination.
  5. Measure shaft radial play using dial indicator.
- **Required Equipment:** Screwdrivers, Allen keys, digital vernier caliper, dial test indicator with magnetic base.
- **Expected Output:** Complete tooth count table, calculated multi-stage speed ratio, and photo log of gear teeth surfaces.
- **Acceptance Criteria (DoD):** Planetary gear ratio confirmed by tooth formula and verified by manual 10-turn input rotation count.
- **Safety:** Wear safety glasses; beware of spring pins or sharp snap rings.
- **Mandatory Evidence:** Photo of disassembled planetary stage with tooth count labels + rotation verification video/GIF.

### [TASK-D01-04] EE Junior 4 & 5 (Backbone) | Generator Electrical & Cogging Characterization
- **Track / Pod:** Track 1 (Engineering) | Shared Power & Telemetry Backbone
- **Owner:** EE Junior 4 & EE Junior 5
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Existing generator removed from rig
- **Objective:** Catalog the existing generator model and measure its phase resistance, inductance, and breakaway cogging torque.
- **Exact Steps:**
  1. Record generator nameplate data: manufacturer, model number, serial number, voltage rating. (If unlabelled, document as "Unlabelled Generator #1").
  2. Measure phase-to-phase DC resistance across all 3 phases (U-V, V-W, W-U) using 4-wire milliohm meter or precision DMM.
  3. Measure phase inductance using LCR meter at 100 Hz and 1 kHz.
  4. Measure static breakaway torque ($T_{\text{start}}$) using a 100 mm torque lever arm and digital luggage/force gauge:
     $$T_{\text{start}} = F_{\text{breakaway}} \times 0.1\text{ m} \quad [\text{N}\cdot\text{m}]$$
  5. Check if rotor has noticeable magnetic detent "cogging" steps per revolution.
- **Required Equipment:** Precision digital multimeter / LCR meter, torque lever arm, digital force gauge (0.01 N resolution).
- **Expected Output:** Generator baseline datasheet card with measured $R_{\text{phase}}$, $L_{\text{phase}}$, and breakaway torque.
- **Acceptance Criteria (DoD):** All 3 phase resistances recorded within $\pm 2\%$ balance; breakaway torque quantified in N·m.
- **Safety:** Do not spin generator rapidly with open leads while touching terminals (electric shock risk).
- **Mandatory Evidence:** Photo of DMM measuring phase resistance + photo of torque arm breakaway measurement.

---

## DAY 2: TELEMETRY HARDWARE BENCH WIRING (LOGGER v1)

### [TASK-D02-01] EE Junior 5 (Backbone) | ESP32 + INA226 + SD Card Bench Wiring
- **Track / Pod:** Track 1 (Engineering) | Telemetry Lead
- **Owner:** EE Junior 5
- **Estimated Time:** 3.0 Hours
- **Dependencies:** ESP32 DevKit, INA226 breakout board, SPI micro-SD module, breadboard/perfboard
- **Objective:** Wire and flash baseline ESP32 firmware to sample voltage and current at 1 Hz and write to micro-SD card in CSV format.
- **Exact Steps:**
  1. Wire ESP32 I2C pins (GPIO 21 SDA, GPIO 22 SCL) to INA226 sensor module.
  2. Wire SPI pins (GPIO 23 MOSI, 19 MISO, 18 SCK, 5 CS) to micro-SD card module.
  3. Flash Arduino/ESP-IDF telemetry firmware v1.0.
  4. Connect a 12V DC power supply through INA226 shunt into a known $10\ \Omega$ 50W wirewound power resistor.
  5. Verify serial monitor and micro-SD log: confirm timestamp, $V = 12.0\text{V}$, $I = 1.20\text{A}$, $P = 14.4\text{W}$ logged at exactly 1 Hz.
- **Required Equipment:** ESP32, INA226, micro-SD card + reader, DC bench power supply, $10\ \Omega$ power resistor.
- **Expected Output:** Working benchtop logger hardware + `test_log_bench_v1.csv` on SD card.
- **Acceptance Criteria (DoD):** Continuous 10-minute automated CSV log without dropped packets; $V$ and $I$ within 1% of calibrated bench DMM.
- **Safety:** Resistor gets hot during 15W test; do not place on combustible surfaces.
- **Mandatory Evidence:** Photo of wired breadboard logger + 20-row CSV excerpt uploaded to workspace.

### [TASK-D02-02] EE Junior 4 (Backbone) | RPM Sensor & Calibrated Anemometer Bench Test
- **Track / Pod:** Track 1 (Engineering) | Power & Telemetry Backbone
- **Owner:** EE Junior 4
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Hall-effect sensor + magnet, optical tachometer, 3-cup anemometer
- **Objective:** Configure and test hardware interrupt pulse counting for RPM and wind speed inputs on ESP32.
- **Exact Steps:**
  1. Mount magnet to drill chuck; position Hall-effect sensor on GPIO 27 with pull-up resistor.
  2. Run drill at 300, 600, 1000 RPM; compare ESP32 pulse-calculated RPM against handheld optical tachometer.
  3. Connect anemometer pulse signal to GPIO 14. Spin cups by hand and hairdryer to verify frequency-to-m/s calibration curve.
  4. Integrate RPM and wind speed calculations into unified 1 Hz logger string.
- **Required Equipment:** Cordless drill, handheld optical tachometer, Hall sensor, 3-cup anemometer, ESP32 logger.
- **Expected Output:** Integrated firmware reading $V$, $I$, $P$, RPM, and wind speed simultaneously.
- **Acceptance Criteria (DoD):** ESP32 RPM reading matches optical tachometer within $\pm 1\%$ across 100–1000 RPM range.
- **Safety:** Wear safety glasses when operating rotating drill chuck.
- **Mandatory Evidence:** Side-by-side photo showing ESP32 serial monitor RPM matching optical tachometer display.

### [TASK-D02-03] MME Junior | 3030 Aluminum Frame CAD & Bill of Materials Sourcing
- **Track / Pod:** Track 1 (Engineering) | Materials Lead
- **Owner:** MME Junior
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Measured shaft centerlines from Day 1
- **Objective:** Design the modular 3030 aluminum extrusion nacelle chassis in CAD and compile exact cut list and local sourcing vendor links.
- **Exact Steps:**
  1. Create 3D CAD assembly of 3030 T-slot aluminum frame housing both Pod A (Magnetic) and Pod B (Planetary) interchangeable footprints.
  2. Ensure chassis accommodates a center-of-gravity yaw pivot bearing mount directly beneath center of mass.
  3. Generate 2D drawings with dimensions for the 6.0 mm 6061-T6 aluminum bearing bulkhead plates.
  4. Compile exact extrusion lengths, corner brackets, drop-in T-nuts, and M6 bolts into `data/bom_and_procurement.csv`.
- **Required Equipment:** CAD software (Fusion / SolidWorks), vendor catalogs (MakerBazar, local Nagpur aluminum vendors).
- **Expected Output:** 3030 Chassis CAD file + 2D drawing of bearing plate + updated BOM rows.
- **Acceptance Criteria (DoD):** Frame FEA deflection $< 0.1\text{ mm}$ under $150\text{ N}$ aerodynamic thrust load; BOM fully costed with vendor lead times.
- **Safety:** Verify structural clearance around spinning rotor hub ($>30\text{ mm}$ clearance).
- **Mandatory Evidence:** Rendered isometric view of 3030 aluminum chassis with dimensional labels.

### [TASK-D02-04] Founder | Day 45 Shootout Scoring Weights & Budget Ceiling Lock
- **Track / Pod:** Track 2 & 3 | Commercial Strategy & Founder Ops
- **Owner:** Founder (Yashwanth)
- **Estimated Time:** 2.0 Hours
- **Dependencies:** `docs/TWO_POD_RND_PLAN.md` draft
- **Objective:** Lock the multi-criteria evaluation weights for the Day 45 Freeze Gate and establish project CapEx expenditure limit.
- **Exact Steps:**
  1. Review proposed criteria: cut-in speed, power at 5 and 8 m/s, mechanical efficiency, system $C_p$, starting torque, BOM cost, reliability, manufacturability.
  2. Assign percentage weights totaling exactly 100%.
  3. Define project CapEx budget ceiling (e.g. ₹40,000 max for prototype batch).
  4. Record approvals in `docs/DECISION_LOG.md`.
- **Required Equipment:** Decision register, spreadsheet.
- **Expected Output:** Updated `docs/TWO_POD_RND_PLAN.md` with frozen weights + approved budget limit in `docs/DECISION_LOG.md`.
- **Acceptance Criteria (DoD):** Weights sum to 100%; budget limit locked; documented in decision log.
- **Safety:** N/A.
- **Mandatory Evidence:** Commit of signed decision record in repository.

---

## DAY 3: BASELINE WOODEN RIG LOAD TEST (STANDARDIZED PROTOCOL)

### [TASK-D03-01] EE Juniors 4 & 5 (Backbone) + MME Junior | Instrumented Bench Run of Wooden Planetary Rig
- **Track / Pod:** Track 1 (Engineering) | All Pods
- **Owner:** EE Junior 4 (Operator) + MME Junior (Vibration)
- **Estimated Time:** 3.0 Hours
- **Dependencies:** Logger v1 operational, wooden planetary rig assembled
- **Objective:** Execute first automated 1 Hz load test on the baseline wooden planetary rig driven by bench motor/drill across 4 speed steps.
- **Exact Steps:**
  1. Couple variable-speed drill/motor to input shaft of wooden planetary rig.
  2. Wire generator output through 3-phase diode bridge into a $10\ \Omega$ 100W power resistor.
  3. Connect Logger v1 to measure $V$, $I$, $P$, input RPM, and generator RPM.
  4. Run motor at 60, 120, 180, and 240 input RPM for 120 seconds per step.
  5. Log continuous data to SD card.
  6. Measure temperature of wooden bearing blocks and gear teeth with infrared thermometer.
- **Required Equipment:** Logger v1, bench drive motor, $10\ \Omega$ load resistor, IR thermometer, safety enclosure.
- **Expected Output:** `data/baseline_wooden_planetary_run_01.csv` containing $\ge 480$ timestamped rows.
- **Acceptance Criteria (DoD):** Complete dataset logged with no sensor dropouts; $P = V \times I$ recorded at each speed step.
- **Safety:** Polycarbonate shield in place; eye protection mandatory; operator at 1.5 m distance.
- **Mandatory Evidence:** CSV file uploaded to workspace + photo of setup during live run with tachometer visible.

### [TASK-D03-02] EE Junior 1 & 2 (Pod A) | Coaxial Magnetic Gear Analytical Torque & Loss Model
- **Track / Pod:** Track 1 (Engineering) | Pod A Lead
- **Owner:** EE Junior 1 & 2
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Pole counts from Day 1 audit
- **Objective:** Model pull-out torque and calculate eddy current losses in stationary modulator pins.
- **Exact Steps:**
  1. Calculate peak torque capability:
     $$T_{\text{max}} = \frac{2 \pi}{\mu_0} \cdot B_{\text{inner}} \cdot B_{\text{outer}} \cdot r_{\text{gap}}^2 \cdot L_{\text{stack}}$$
  2. Estimate eddy current losses in solid steel vs. laminated M19 silicon steel pins at 600 RPM.
  3. Determine required magnet grade (N42 vs N52) and cost trade-off.
  4. Submit technical note comparing laminated vs solid modulator pins.
- **Required Equipment:** Python / MATLAB or analytical spreadsheet.
- **Expected Output:** 2-page calculation memo with plot of torque vs. air-gap thickness ($1.0\text{ mm}$ to $2.5\text{ mm}$).
- **Acceptance Criteria (DoD):** Minimum calculated pull-out torque $\ge 4.5\text{ N}\cdot\text{m}$; air gap selected at $1.5\text{ mm}$.
- **Safety:** N/A.
- **Mandatory Evidence:** Jupyter notebook or Python script + plot of Torque vs. Air Gap.

### [TASK-D03-03] EE Junior 3 (Pod B) | Archimedes Spiral Helical Blade CAD (60°/50°/25°)
- **Track / Pod:** Track 1 (Engineering) | Pod B Lead
- **Owner:** EE Junior 3
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Swept area target ($A \approx 1.0\text{ m}^2 \rightarrow R \approx 0.564\text{ m}$)
- **Objective:** Model 3-bladed Archimedes spiral rotor with progressive helical pitch in CAD and split into printable sections.
- **Exact Steps:**
  1. Generate helical guide curve with $60^\circ$ pitch at base, $50^\circ$ at mid-body, $25^\circ$ at tip.
  2. Sweep conical airfoil profile along the helix to form a single blade.
  3. Pattern 3 blades symmetrically around central $25\text{ mm}$ aluminum shaft core.
  4. Cut single blade into 3 interlocking segments to fit standard 3D printer volume ($220\times 220\times 250\text{ mm}$).
  5. Export STL files for segment 1.
- **Required Equipment:** CAD software (Fusion / SolidWorks).
- **Expected Output:** STL files for 3 blade segments with alignment dowel pin holes.
- **Acceptance Criteria (DoD):** Swept radius matches target within $\pm 2\text{ mm}$; segments printable without excessive overhangs ($<50^\circ$).
- **Safety:** N/A.
- **Mandatory Evidence:** CAD screenshot showing full 3-blade Archimedes spiral assembly with dimensioned radius callout.

---

## DAY 4: BASELINE DATA ANALYSIS & CUSTOMER INTERVIEW PREPARATION

### [TASK-D04-01] EE Junior 5 (Backbone) | Baseline Power Curve Python Script & Cp Computation
- **Track / Pod:** Track 1 (Engineering) | Telemetry Lead
- **Owner:** EE Junior 5
- **Estimated Time:** 2.5 Hours
- **Dependencies:** CSV from Task D03-01
- **Objective:** Write automated script to parse raw CSV, calculate $P = V \times I$, compute drivetrain efficiency ($\eta$), and generate publication-quality scatter plots.
- **Exact Steps:**
  1. Write Python script `scripts/plot_power_curve.py` using pandas and matplotlib.
  2. Load `data/baseline_wooden_planetary_run_01.csv`.
  3. Compute actual gear ratio: $\text{Ratio} = \frac{\text{RPM}_{\text{gen}}}{\text{RPM}_{\text{rotor}}}$.
  4. Plot Input RPM vs. Electrical Power ($P_{\text{elec}}$).
  5. Calculate mechanical power input (if torque measured) or generator electrical efficiency.
  6. Output PNG plot and markdown statistics summary.
- **Required Equipment:** Python 3 (pandas, matplotlib, numpy).
- **Expected Output:** Script committed to repository + high-resolution plot `baseline_power_curve_v1.png`.
- **Acceptance Criteria (DoD):** Script runs without errors; all axes clearly labeled with units; data points display sample counts $N$.
- **Safety:** N/A.
- **Mandatory Evidence:** Generated plot file committed to repository.

### [TASK-D04-02] Founder | Draft Beachhead Customer Outreach Script & Compile 15 Targets
- **Track / Pod:** Track 2 | Business & Grants Lead
- **Owner:** Founder (Yashwanth)
- **Estimated Time:** 2.0 Hours
- **Dependencies:** `docs/CUSTOMER_DISCOVERY_PLAN.md`
- **Objective:** Finalize cold outreach script and compile a targeted list of 15 regional telecom, agricultural IoT, and campus facility prospects.
- **Exact Steps:**
  1. Adapt customer discovery interview questions into a concise 100-word email/LinkedIn message.
  2. Identify 5 telecom tower infrastructure managers in Maharashtra / central India.
  3. Identify 5 agri-tech / automated weather station operators.
  4. Identify 5 campus microgrid / facilities managers (including VNIT).
  5. Populate `data/customer_pipeline.csv` with contact names, organizations, roles, and status.
- **Required Equipment:** LinkedIn, web browser, spreadsheet.
- **Expected Output:** Completed outreach script + `data/customer_pipeline.csv` containing 15 qualified leads.
- **Acceptance Criteria (DoD):** 15 verified leads with real names and verifiable contact points.
- **Safety:** N/A.
- **Mandatory Evidence:** Customer pipeline table updated in repository.

### [TASK-D04-03] MME Junior | Blade Finishing Experiment: Test Couplets (Raw vs. Epoxied)
- **Track / Pod:** Track 1 (Engineering) | Materials Lead
- **Owner:** MME Junior
- **Estimated Time:** 2.5 Hours
- **Dependencies:** 3D printer with ASA / PETG-CF filament, epoxy resin, sandpaper
- **Objective:** 3D print two identical small airfoil test coupons; leave one raw and finish one with epoxy pore-filler and 1000-grit wet sanding.
- **Exact Steps:**
  1. 3D print two $100\times 50\text{ mm}$ airfoil section coupons in ASA or PETG-CF at $0.2\text{ mm}$ layer height.
  2. Label Coupon A: "RAW 3D PRINT".
  3. Label Coupon B: "EPOXY + WET SANDED".
  4. Apply thin coat of low-viscosity epoxy resin to Coupon B; allow cure.
  5. Wet-sand Coupon B with 400 $\rightarrow$ 600 $\rightarrow$ 1000 grit wet-or-dry sandpaper.
  6. Measure surface roughness or perform tactile/magnification comparison.
- **Required Equipment:** 3D printer, epoxy resin, 400/600/1000 grit sandpaper, water tray, digital scale.
- **Expected Output:** Two prepared coupons + side-by-side macro photo showing surface texture difference.
- **Acceptance Criteria (DoD):** Coupon B displays mirror-smooth boundary layer with no visible layer ridges; weight increase $< 5\%$.
- **Safety:** Wear nitrile gloves and work in ventilated area during epoxy handling.
- **Mandatory Evidence:** Side-by-side macro photograph showing surface reflection on Coupon B vs. layer lines on Coupon A.

---

## DAY 5: POWER ELECTRONICS BENCH TESTING (RECTIFIER & DUMP LOAD)

### [TASK-D05-01] EE Junior 4 (Backbone) | 3-Phase Schottky Rectifier Voltage Drop Characterization
- **Track / Pod:** Track 1 (Engineering) | Power Backbone Lead
- **Owner:** EE Junior 4
- **Estimated Time:** 2.5 Hours
- **Dependencies:** 3-Phase Schottky bridge module (50A 100V), standard silicon bridge (KBPC5010), AC variable transformer / generator
- **Objective:** Measure and compare forward voltage drop and power loss between standard silicon diode bridge and Schottky bridge under load.
- **Exact Steps:**
  1. Connect 3-phase AC source to standard silicon bridge; draw 2A, 5A, 10A into resistive load.
  2. Measure forward voltage drop ($V_f$) across diodes using calibrated DMM.
  3. Repeat test with 3-Phase Schottky barrier bridge module.
  4. Calculate wasted power ($P_{\text{loss}} = 2 \times V_f \times I_{\text{load}}$).
  5. Compute percentage efficiency gain at low wind generation levels ($10\text{W} - 30\text{W}$).
- **Required Equipment:** 3-phase AC source, Schottky bridge, silicon bridge, electronic DC load, DMM, heatsink.
- **Expected Output:** Comparative test report and graph of $V_f$ vs. Current.
- **Acceptance Criteria (DoD):** Schottky bridge exhibits $V_f \le 0.40\text{V}$ at 5A vs. silicon $V_f \ge 0.90\text{V}$; efficiency gain quantified.
- **Safety:** Heatsink may become warm; ensure AC connections are insulated.
- **Mandatory Evidence:** Photo of test bench with DMM showing $V_f$ readings + comparative data table.

### [TASK-D05-02] EE Junior 5 (Backbone) | Dynamic Brake E-Stop Contactor Wiring & Dynamic Stalling Test
- **Track / Pod:** Track 1 (Engineering) | Power Backbone Lead
- **Owner:** EE Junior 5
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Pre-written safety test procedure approved by Founder, mushroom E-stop button, 3x $1.5\ \Omega$ 500W braking resistors, bench motor
- **Objective:** Wire and bench-test the manual emergency stop dynamic brake contactor, measuring time-to-stop and braking current.
- **Exact Steps:**
  1. Follow test procedure in `docs/POWER_ELECTRONICS_PLAN.md`.
  2. Wire 3-pole heavy duty contactor: Normally Closed poles connect generator AC to rectifier; E-stop depression switches AC to 3x $1.5\ \Omega$ star-connected braking resistors.
  3. Spin generator at 300 RPM on lathe motor.
  4. Press the E-stop button.
  5. Measure time to complete rotor stop ($t_{\text{stop}}$) with stopwatch / oscilloscope.
  6. Measure peak AC braking current with clamp meter.
- **Required Equipment:** 3-pole E-stop switch, 3x $1.5\ \Omega$ 500W resistors, digital storage oscilloscope / clamp meter, bench lathe.
- **Expected Output:** Test record showing $t_{\text{stop}} < 4.0\text{ seconds}$ from 300 RPM.
- **Acceptance Criteria (DoD):** Smooth deceleration without gear tooth stripping or electrical arcing; resistor temperature rise $< 25^\circ\text{C}$.
- **Safety:** Physical guard over spinning coupling mandatory; do not bypass current-limiting resistors.
- **Mandatory Evidence:** Video or oscilloscope capture showing phase voltage collapsing to zero upon E-stop hit.

### [TASK-D05-03] EE Junior 1 & 2 (Pod A) | Coaxial Magnetic Gear Concentricity & Air Gap Tooling Design
- **Track / Pod:** Track 1 (Engineering) | Pod A Lead
- **Owner:** EE Junior 1 & 2
- **Estimated Time:** 2.5 Hours
- **Dependencies:** CAD model of magnetic gear
- **Objective:** Design the precision assembly jig and bearing endbells to maintain a uniform $1.5\text{ mm} \pm 0.1\text{ mm}$ air gap without magnetic pull deflection.
- **Exact Steps:**
  1. Model 6061-T6 aluminum front and rear endbell bearing retainers.
  2. Calculate radial magnetic attractive force between inner and outer rotors if eccentricity of $0.2\text{ mm}$ occurs:
     $$F_{\text{unbalanced}} \approx \frac{B^2 A_{\text{pole}}}{2 \mu_0} \cdot \left(\frac{e}{\delta}\right)$$
  3. Ensure bearing stiffness is sufficient to prevent radial runout collapse.
  4. Design non-magnetic assembly sleeve to safely slide inner rotor into modulator ring without finger pinch hazard.
- **Required Equipment:** CAD software (Fusion), FEA tool or analytical formula.
- **Expected Output:** Assembly tooling CAD drawings + non-magnetic assembly sleeve STL.
- **Acceptance Criteria (DoD):** Structural deflection under unbalanced magnetic pull $< 0.05\text{ mm}$.
- **Safety:** Strong magnetic pinch hazard; assembly tool must prevent snapping.
- **Mandatory Evidence:** CAD assembly drawing showing assembly jig and bearing alignment shoulders.

---

## DAY 6: PROCUREMENT BATCH #1 APPROVAL & REPEATABILITY TESTS

### [TASK-D06-01] MME Junior + Founder | Finalize Procurement Batch #1 for Phase 1 Fabrication
- **Track / Pod:** Track 1 & 3 | Procurement & Founder Operations
- **Owner:** MME Junior (Submit) & Founder (Approve)
- **Estimated Time:** 2.0 Hours
- **Dependencies:** Costed rows in `data/bom_and_procurement.csv`
- **Objective:** Review vendor quotes for 3030 aluminum extrusions, 6061 plates, ASA filament, hybrid ceramic bearings, and N52 magnets; approve purchase batch within budget ceiling.
- **Exact Steps:**
  1. Collect 2 competing quotes for 3030 aluminum profile and cutting service.
  2. Verify magnet vendor specs: Grade N52 NdFeB, nickel-coated, exact dimensions.
  3. Check total Batch #1 CapEx against the approved budget ceiling in `docs/DECISION_LOG.md`.
  4. Founder signs approval in procurement log.
  5. Place orders with documented tracking numbers and delivery dates.
- **Required Equipment:** Vendor quotation sheets, procurement CSV.
- **Expected Output:** Approved procurement requisition with order confirmation numbers.
- **Acceptance Criteria (DoD):** Total spend $\le ₹15,000$ (Phase 1 allocation); all long-lead items ($>5$ days) ordered.
- **Safety:** N/A.
- **Mandatory Evidence:** Purchase receipt / order confirmation screenshot uploaded to workspace.

### [TASK-D06-02] EE Junior 4 & 5 (Backbone) | Multi-Point Repeatability Test on Baseline Planetary Rig
- **Track / Pod:** Track 1 (Engineering) | Power Backbone
- **Owner:** EE Junior 4 & 5
- **Estimated Time:** 3.0 Hours
- **Dependencies:** Logger v1, wooden planetary rig
- **Objective:** Perform 3 consecutive load sweeps on the baseline planetary rig to establish measurement uncertainty and repeatability bounds.
- **Exact Steps:**
  1. Run Sweep 1 (60 to 240 RPM, 4 steps, 120s each). Cool down for 15 minutes.
  2. Run Sweep 2 identically. Cool down for 15 minutes.
  3. Run Sweep 3 identically.
  4. Calculate mean electrical power and standard deviation ($\sigma$) at each speed point:
     $$\sigma = \sqrt{\frac{1}{N-1} \sum (P_i - \bar{P})^2}$$
  5. Check if variance is $< 5\%$ across runs.
- **Required Equipment:** Logger v1, bench drive, load resistor, IR thermometer.
- **Expected Output:** `data/baseline_repeatability_3sweeps.csv` with 3 labeled test runs.
- **Acceptance Criteria (DoD):** Repeatability verified with quantified uncertainty ($\pm \text{W}$) stated for baseline power curve.
- **Safety:** Monitor gear teeth temperature; stop immediately if gear smoke or tooth skipping occurs.
- **Mandatory Evidence:** Overlay scatter plot showing all 3 sweeps with error bars.

### [TASK-D06-03] EE Junior 3 (Pod B) | 1:10 Planetary Gear Tooth Profile Optimization & Slicing
- **Track / Pod:** Track 1 (Engineering) | Pod B Lead
- **Owner:** EE Junior 3
- **Estimated Time:** 2.5 Hours
- **Dependencies:** Disassembly audit from Day 1
- **Objective:** Optimize gear module, tooth profile, and pressure angle for Delrin / POM-C CNC machining to minimize friction.
- **Exact Steps:**
  1. Review current tooth profile ($m = 1.5\text{ mm}$ or $m = 2.0\text{ mm}$, $20^\circ$ pressure angle).
  2. Evaluate $14.5^\circ$ vs $20^\circ$ pressure angle for tooth sliding friction reduction.
  3. Calculate tooth contact ratio ($\epsilon \ge 1.4$).
  4. Model optimized 2-stage planetary gearset (1:3.16 per stage $\rightarrow$ 1:10 total ratio).
  5. Export DXF/STEP files for gear hobbing / CNC routing quote.
- **Required Equipment:** CAD software (Fusion / Gear generator plugin).
- **Expected Output:** STEP CAD file of 2-stage planetary gearset + 2D drawing with tooth tolerances.
- **Acceptance Criteria (DoD):** Contact ratio $\ge 1.45$; gear meshing interference check passed in CAD simulation.
- **Safety:** N/A.
- **Mandatory Evidence:** CAD screenshot of gear tooth mesh simulation showing contact line and clearance.

---

## DAY 7: GATE 1 MILESTONE REVIEW & SUNDAY SYNC #1

### [TASK-D07-01] Founder + All Juniors | Gate 1 Formal Milestone Audit & Baseline Freeze
- **Track / Pod:** All Tracks | Programme Milestone
- **Owner:** Founder (Yashwanth) & All Juniors
- **Estimated Time:** 2.5 Hours
- **Dependencies:** All Day 1–6 deliverables submitted with proof
- **Objective:** Conduct formal Gate 1 review to audit baseline documentation, verify TRL 4 status, confirm Logger v1 operational, and approve transition to Phase 1 fabrication.
- **Exact Steps:**
  1. Verify physical measurements of baseline prototype recorded in `docs/CURRENT_PROJECT_BASELINE.md`.
  2. Verify Logger v1 operational and repeatable baseline power curve logged.
  3. Verify Day 45 Freeze Gate scoring weights locked.
  4. Verify initial beachhead customer hypothesis selected and 15 outreach targets compiled.
  5. Verify Procurement Batch #1 placed.
  6. Sign off Gate 1 Audit in `docs/DECISION_LOG.md`.
  7. *Founder Authorization:* Unlock Day 8–14 micro-task cards.
- **Required Equipment:** Video call / lab meeting room, workspace docs, live demo of Logger v1.
- **Expected Output:** Completed Gate 1 audit checklist signed by Founder.
- **Acceptance Criteria (DoD):** All 5 Gate 1 criteria fully satisfied with physical evidence.
- **Safety:** N/A.
- **Mandatory Evidence:** Signed Gate 1 milestone audit record in `docs/DECISION_LOG.md`.

### [TASK-D07-02] Founder | Conduct Sunday Sync #1 (45 Minutes)
- **Track / Pod:** Track 3 | Founder Operations
- **Owner:** Founder (Yashwanth)
- **Estimated Time:** 45 Minutes
- **Dependencies:** Gate 1 Audit completed
- **Objective:** Run synchronous Sunday sync to align team, resolve cross-pod blockers, and lock the next 7 days of micro-tasks.
- **Agenda (Strict 45 Minutes):**
  - **15 Mins:** Review baseline repeatability curves and logger validation data.
  - **15 Mins:** Resolve material delivery dates and VNIT workshop machine tool access.
  - **15 Mins:** Lock Day 8–14 task assignments.
- **Required Equipment:** Slide deck / markdown brief.
- **Expected Output:** Meeting brief committed to `tasks/WEEKLY_REVIEW_TEMPLATE.md`.
- **Acceptance Criteria (DoD):** Meeting terminates at 45 minutes; zero mid-week meetings scheduled.
- **Safety:** N/A.
- **Mandatory Evidence:** Action item commit in workspace.
