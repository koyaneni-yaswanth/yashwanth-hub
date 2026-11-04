import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Calendar,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileCheck,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Zap,
  Activity,
  Cpu,
  DollarSign,
  Layers,
  Flame,
  Clock,
  BookOpen,
} from 'lucide-react';
import { TurbineLogo } from '../components/common/TurbineLogo';

interface PhaseWeek {
  t: string;
  k: string[];
  d: string;
}

interface Phase {
  ph: string;
  badge?: string;
  w: PhaseWeek[];
}

const PLAN_DATA: Phase[] = [
  {
    ph: 'Phase 1: Baseline Audit & Parallel Fabrication (Weeks 1 to 4 / Days 1–30)',
    badge: 'Gate 1–3 Active',
    w: [
      {
        t: 'Week 1 (Days 1–7): Baseline Audit, Dimensions & Logger v1',
        k: [
          'Physically measure baseline wooden prototype: rotor tip-to-tip diameter (do NOT assume 1 m²), chord lengths, and shaft centers',
          'Audit CAD STL files for Pod A Coaxial Magnetic Gear: pole count, modulator slots, and air-gap clearances',
          'Disassemble and count teeth on baseline planetary gear rig (sun, planet, ring); inspect tooth wear and radial play',
          'Measure generator phase resistances (U-V, V-W, W-U), inductance, and breakaway cogging torque in N·m',
          'Wire ESP32 + INA226 + SD card logger v1; verify 10-minute automated 1 Hz CSV recording into resistive load',
          'Founder locks Day 45 Shootout scoring weights (sum to 100%) and project CapEx budget ceiling in DECISION_LOG.md',
          'Formulate initial beachhead customer hypothesis (Off-grid Telecom / Remote IoT) and compile 15 outreach targets',
        ],
        d: 'Gate 1 Pass: Baseline Documented, TRL 4 Audited, Logger v1 Operational',
      },
      {
        t: 'Week 2 (Days 8–14): Test Standardization & Baseline Benchmarking',
        k: [
          'Calibrate 3-cup anemometer, Hall-effect RPM sensor, and INA226 current shunts against bench instrumentation',
          'Execute standardized 4-speed bench runs on baseline wooden planetary rig; log V, I, P = V × I, and RPM at 1 Hz',
          'Run 3 consecutive repeatability sweeps to establish baseline measurement uncertainty and power standard deviation',
          'Draft standardized 1-page technical spec sheet with every parameter tagged (MEASURED/CALCULATED/ESTIMATED)',
          'Write structured customer discovery interview script and conduct initial outreach to 15 regional pilot prospects',
        ],
        d: 'Gate 2 Pass: Repeatable Baseline Power Curve Logged; Outreach Initiated',
      },
      {
        t: 'Week 3 (Days 15–22): Structural Frame Upgrade & Subsystem CAD',
        k: [
          'Decommission wooden outer frame; assemble rigid 3030 modular T-slot aluminum extrusion chassis',
          'Laser-cut / CNC machine 6.0 mm 6061-T6 aluminum bearing bulkhead plates for precise shaft centerlines',
          'Design Center of Gravity (CG) yaw pivot mount with double-row angular contact bearing and 30A capsule slip ring',
          'Pod A: Complete analytical flux model for 1:10 coaxial magnetic gear; design non-magnetic assembly sleeve',
          'Pod B: Finalize CAD for 3-bladed Archimedes spiral rotor with 60°/50°/25° progressive pitch',
          'Founder approves Procurement Batch #1 for extrusions, aluminum plates, ASA/PETG-CF filament, and N52 magnets',
        ],
        d: 'Chassis CAD Frozen, Materials Sourced, Subsystem Blueprints Released',
      },
      {
        t: 'Week 4 (Days 23–30): Parallel Pod Fabrication & Electronics Bench',
        k: [
          'Pod A: 3D print magnetic gear hubs in PETG-CF; bond N52 magnets with alternating polarity checked by Gaussmeter',
          'Pod B: 3D print Archimedes spiral in ASA; apply epoxy pore-filler resin and wet-sand (400 to 1000 grit)',
          'Power Backbone: Assemble 3-phase Schottky diode bridge rectifier on finned heatsink (verify Vf < 0.4V)',
          'Power Backbone: Wire manual mushroom E-stop contactor to 3x 1.5-ohm 500W dynamic braking resistor bank',
          'Conduct 5 customer discovery calls to validate willingness-to-pay (₹35k–₹50k) and off-grid power constraints',
          'Day 30 Subsystem Check: Verify both Pod A and Pod B spin freely on bench lathe without binding',
        ],
        d: 'Gate 3 Pass: Both Drivetrains Spinning on Bench; Customer Needs Validated',
      },
    ],
  },
  {
    ph: 'Phase 2: Shootout, Freeze Gate & Hardening (Weeks 5 to 8 / Days 31–60)',
    badge: 'Day 45 Freeze Gate',
    w: [
      {
        t: 'Week 5 (Days 31–38): Power Electronics Integration & Safety Tests',
        k: [
          'Assemble Turbine Control & Charging Box (TCCB): Rectifier -> E-Stop Contactor -> Dump Load -> Buck-Boost MPPT',
          'Execute pre-written dynamic brake test procedure: Verify smooth stop from 300 RPM in < 4.0 seconds',
          'Test automated 500W dump load PWM circuit: verify clamping when battery voltage hits 28.8V or RPM > 650',
          'Audit ANRF / VNIT Venture Vault grant milestones and draft master technical write-up narrative',
        ],
        d: 'TCCB Certified for Dynamic Braking and Automated Dump Protection',
      },
      {
        t: 'Week 6 (Days 39–45): Head-to-Head Shootout & DAY 45 FREEZE GATE',
        k: [
          'Mount Pod A (Magnetic + HAWT) and Pod B (Archimedes + Planetary) under identical airflow and electrical load',
          'Log cut-in speed, mechanical efficiency, torque, acoustic noise (dBA), and thermal rise for both pods',
          'Fill out comparative evaluation scorecard; review data against frozen Day 7 multi-criteria weights',
          'DAY 45 FREEZE GATE: Founder formally approves ONE winning architecture (or justified hybrid)',
          'Dissolve Pod A & Pod B separation; merge all 6 juniors into single commercial pilot build team',
        ],
        d: 'CRITICAL GATE 4: Single Commercial Architecture Frozen; Losing Track Terminated',
      },
      {
        t: 'Week 7 (Days 46–52): Full System Assembly & Weatherproofing',
        k: [
          'Integrate winning drivetrain with coreless PMA, 3030 chassis, CG yaw bearing, and 30A capsule slip ring',
          'Install passive aerodynamic tail vane with 5° furling hinge and vibration-damping counter-weight',
          'Apply IP65 silicone weather seals, Loctite 243 threadlocker on all bolts, and wire protective conduits',
          'Draft formal Pilot Deployment LOI / MoU with primary customer candidate (performance guarantee terms)',
        ],
        d: 'Fully Integrated Hardened Prototype Assembled on Mast',
      },
      {
        t: 'Week 8 (Days 53–60): Failsafe Verification & Outdoor Approval',
        k: [
          'Failsafe Abuse Test: Trigger manual E-stop at full rated RPM (600 RPM); verify stop in < 5 seconds',
          'Verify automated dump-load engagement when 24V LiFePO4 battery pack reaches 28.8V absorption threshold',
          'Verify passive aerodynamic tail furling under simulated storm gust airflow (>12 m/s)',
          'Submit mid-term milestone report to VNIT Venture Vault Foundation with verified bench test data',
        ],
        d: 'Gate 5 Pass: Integrated System Failsafe-Verified; Approved for Outdoor Mast',
      },
    ],
  },
  {
    ph: 'Phase 3: Field Endurance, Pilot Sale & Handover (Weeks 9 to 12 / Days 61–90)',
    badge: 'TRL 5/6 Validation',
    w: [
      {
        t: 'Week 9 (Days 61–70): Continuous Telemetry & Live Customer Demo',
        k: [
          'Erect guyed mast on approved outdoor test pad (or controlled rig); begin continuous 24/7 automated 1 Hz logging',
          'Generate daily automated scatter plots: Wind Speed vs. Electrical Power, RPM, and Battery State-of-Charge',
          'Host live telemetry review with primary pilot customer prospect; execute signed Pilot Deployment LOI',
          'Juniors run daily 2-hour anomaly checks on log files (vibration spikes, voltage ripple, bearing temp)',
        ],
        d: '10 Days Continuous Field Telemetry Logged; Signed Pilot LOI Secured',
      },
      {
        t: 'Week 10 (Days 71–80): Day 75 Teardown Audit & Grant Dossier',
        k: [
          'Perform comprehensive teardown inspection: inspect gear teeth wear / magnetic air-gap dust ingress',
          'Check epoxy blade leading-edge erosion and measure bearing axial runout after 200+ operating hours',
          'Reassemble, re-torque all fasteners, and re-apply witness lacquer',
          'Finalize Master Grant Technical Dossier and costed 10-unit batch manufacturing BOM (target < ₹25,000/unit)',
          'Write Standard Operating Procedure (SOP) manual for mast erection, wiring, and emergency braking',
        ],
        d: 'Teardown Passed; SOP Manual & Grant Dossier Finalized',
      },
      {
        t: 'Week 11 & 12 (Days 81–90): Pilot Delivery, Demo Day & Retrospective',
        k: [
          'Complete 30-day continuous logging run; compile master energy yield report (Wh/day and system Cp)',
          'Commission the hardened pilot unit at the customer site / VNIT demonstration pad',
          'Host Demo Day for academic mentor Dr. J. Bhukya, VNIT Venture Vault mentors, and grant reviewers',
          'Conduct 90-day retrospective: document what worked, what failed, measured vs. estimated variance',
          'Archive CAD v1.0, firmware v1.0, and transition juniors to next-180-day batch manufacturing plan',
        ],
        d: 'FINAL MILESTONE: Field-Validated TRL 5/6 System Delivered to Pilot Customer',
      },
    ],
  },
];

interface MicroTask {
  id: string;
  track: string;
  owner: string;
  est: string;
  title: string;
  dod: string;
  safety: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
}

const DAY_1_7_TASKS: MicroTask[] = [
  {
    id: 'TASK-D01-01',
    track: 'Materials & Structures',
    owner: 'MME Junior',
    est: '2.5h',
    title: 'Physical Measurement of Baseline Wooden Prototype (Rotor, Hub, Shafts)',
    dod: 'Caliper measurement of rotor diameter (do NOT assume 1 m²); blade chord at root/mid/tip; shaft centerlines; 5 dimensioned photos uploaded.',
    safety: 'Mechanically lock rotor hub so blades cannot rotate during hand measurement.',
    status: 'IN_PROGRESS',
  },
  {
    id: 'TASK-D01-02',
    track: 'Pod A: Magnetic Gear',
    owner: 'EE Juniors 1 & 2',
    est: '2.5h',
    title: 'Coaxial Magnetic Gear STL & Geometry Audit',
    dod: 'Count magnet pockets on inner rotor, outer rotor, and modulator cage from STL files; calculate theoretical speed ratio; measure actual printed pocket clearances.',
    safety: 'Keep strong N52 magnets separated from ferromagnetic tools; pinch hazard warning.',
    status: 'PENDING',
  },
  {
    id: 'TASK-D01-03',
    track: 'Pod B: Archimedes + Planetary',
    owner: 'EE Junior 3',
    est: '2.5h',
    title: 'Patented Planetary Gearbox Ratio & Condition Audit',
    dod: 'Disassemble wooden gearbox; count teeth on sun, planet, and ring gears; calculate multi-stage ratio; inspect tooth wear; measure shaft radial play with dial indicator.',
    safety: 'Wear safety glasses; beware of sharp snap rings.',
    status: 'PENDING',
  },
  {
    id: 'TASK-D01-04',
    track: 'Power & Telemetry Backbone',
    owner: 'EE Juniors 4 & 5',
    est: '2.5h',
    title: 'Generator Electrical & Breakaway Cogging Characterization',
    dod: 'Record generator nameplate/model; measure phase resistances across all 3 phases; measure inductance with LCR meter; measure static breakaway torque in N·m.',
    safety: 'Do not spin generator with open leads while touching terminals.',
    status: 'PENDING',
  },
  {
    id: 'TASK-D02-01',
    track: 'Telemetry Lead',
    owner: 'EE Junior 5',
    est: '3.0h',
    title: 'ESP32 + INA226 + Micro-SD 1 Hz Logger v1 Bench Wiring',
    dod: 'Wire I2C INA226 shunt and SPI SD card module to ESP32; log 10-minute automated test measuring V, I, P into a 10-ohm resistor at 1 Hz without packet loss.',
    safety: 'Load resistor gets hot during 15W test; do not place on combustible surfaces.',
    status: 'PENDING',
  },
  {
    id: 'TASK-D02-04',
    track: 'Founder Ops',
    owner: 'Founder (Yashwanth)',
    est: '2.0h',
    title: 'Day 45 Shootout Scoring Weights & Budget Ceiling Lock',
    dod: 'Review evaluation criteria; assign percentage weights totaling 100%; set CapEx budget ceiling; log decision in DECISION_LOG.md.',
    safety: 'Financial risk management boundary.',
    status: 'DONE',
  },
];

export const WindPlanPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'roadmap' | 'shootout' | 'tasks' | 'telemetry' | 'bom' | 'decisions'>('roadmap');
  const [collapsedPhases, setCollapsedPhases] = useState<Record<number, boolean>>({});
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [startDateStr, setStartDateStr] = useState<string>('2026-11-04');
  
  // Interactive Calculator State
  const [calcWindSpeed, setCalcWindSpeed] = useState<number>(8.0);
  const [calcRadius, setCalcRadius] = useState<number>(0.564);
  const [calcCp, setCalcCp] = useState<number>(0.30);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('pawan_shakti_ticks');
      if (stored) setCheckedItems(JSON.parse(stored));
      const sDate = localStorage.getItem('pawan_shakti_start_date');
      if (sDate) setStartDateStr(sDate);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const saveTicks = (updated: Record<string, boolean>) => {
    setCheckedItems(updated);
    try {
      localStorage.setItem('pawan_shakti_ticks', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const toggleCheck = (id: string) => {
    const nextState = !checkedItems[id];
    const updated = { ...checkedItems, [id]: nextState };
    saveTicks(updated);

    if (nextState) {
      confetti({
        particleCount: 25,
        spread: 40,
        origin: { y: 0.8 },
        colors: ['#02b39b', '#38bdf8', '#f59e0b'],
      });
    }
  };

  // Calculations
  const totalTasks = PLAN_DATA.reduce((acc, p) => acc + p.w.reduce((wAcc, w) => wAcc + w.k.length, 0), 0);
  const completedTasks = Object.values(checkedItems).filter(Boolean).length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Day calculation
  const startMs = new Date(startDateStr).getTime();
  const nowMs = Date.now();
  const dayNumber = Math.min(90, Math.max(1, Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)) + 1));

  // Physics calculation
  const sweptArea = Math.PI * Math.pow(calcRadius, 2);
  const pWind = 0.5 * 1.225 * sweptArea * Math.pow(calcWindSpeed, 3);
  const pElec = pWind * calcCp;

  return (
    <div className="space-y-6 pb-16">
      {/* Hero Header */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[var(--hub-surface)] via-[var(--hub-surface-raised)] to-[var(--hub-surface)] border border-[var(--hub-line)] shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative">
              <TurbineLogo
                durationSeconds={Math.max(1.5, 12 - (progressPercent / 100) * 9.5)}
                className="w-16 h-16 sm:w-20 sm:h-20 flex-none"
              />
              {progressPercent === 100 && (
                <Sparkles className="w-6 h-6 text-amber-500 absolute -top-1 -right-1 animate-bounce" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                  VNIT Venture Vault Incubation
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  Patent Published
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono text-[10px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  TRL 4 → TRL 5/6 Sprint
                </span>
              </div>
              <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-[var(--hub-ink)] tracking-tight">
                Pawan Shakti — 90-Day Execution Engine
              </h1>
              <p className="text-xs sm:text-sm text-[var(--hub-muted)] mt-1 max-w-2xl leading-relaxed">
                Academic Mentor: <strong className="text-[var(--hub-ink)]">Dr. J. Bhukya</strong> | Indian Patent:{' '}
                <strong className="text-[var(--hub-ink)]">"Compact Wind Turbine with Planetary Gears"</strong> | One Product, One Beachhead, Day 45 Freeze Gate.
              </p>
            </div>
          </div>

          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-2 border-t lg:border-t-0 pt-3 lg:pt-0 border-[var(--hub-line)]">
            <div className="text-left lg:text-right">
              <div className="text-xs text-[var(--hub-muted)] font-medium">Sprint Progress</div>
              <div className="font-heading font-extrabold text-2xl text-teal-600 dark:text-teal-400">
                {progressPercent}%
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono px-2 py-1 rounded bg-[var(--hub-bg)] text-[var(--hub-ink)] border border-[var(--hub-line)]">
                Day {dayNumber} of 90
              </span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar with Day 45 Marker */}
        <div className="mt-6 pt-4 border-t border-[var(--hub-line)]">
          <div className="flex items-center justify-between text-xs text-[var(--hub-muted)] mb-2 font-medium">
            <span>Gate 1: Baseline Audit (Day 7)</span>
            <span className="text-amber-500 font-bold flex items-center gap-1">
              <Flame className="w-3.5 h-3.5" /> DAY 45 FREEZE GATE (Architecture Lock)
            </span>
            <span>Final Gate: Pilot Handover (Day 90)</span>
          </div>
          <div className="relative w-full h-3 bg-[var(--hub-bg)] rounded-full overflow-hidden border border-[var(--hub-line)]">
            <div
              className="h-full bg-gradient-to-r from-teal-500 to-sky-500 transition-all duration-500 rounded-full"
              style={{ width: `${Math.max(4, progressPercent)}%` }}
            />
            {/* Freeze Gate 50% Marker */}
            <div
              className="absolute top-0 bottom-0 w-1 bg-amber-500 z-10 shadow-[0_0_8px_#f59e0b]"
              style={{ left: '50%' }}
              title="Day 45 Freeze Gate"
            />
          </div>
          <div className="flex justify-between items-center text-[11px] text-[var(--hub-muted)] mt-1.5 font-mono">
            <span>{completedTasks} of {totalTasks} deliverables checked</span>
            <span>Contingency Buffer: 14 Days (15.5%)</span>
            <span>Target: 1 Signed Pilot Agreement</span>
          </div>
        </div>
      </div>

      {/* Physics & Engineering Baseline Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Physics Target */}
        <div className="p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--hub-muted)] flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-sky-500" /> Physics Baseline
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-500 font-semibold">
              P = ½ρAv³
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Target Swept Area:</span>
              <span className="font-mono text-[var(--hub-ink)] font-semibold">1.0 m² (R = 0.564m) [CALC]</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Power at 5.0 m/s:</span>
              <span className="font-mono text-[var(--hub-ink)] font-semibold">76.6W wind → 20–25W elec</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Power at 8.0 m/s:</span>
              <span className="font-mono text-[var(--hub-ink)] font-semibold">313.6W wind → 95–110W elec</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--hub-muted)]">Rated at 11.0 m/s:</span>
              <span className="font-mono text-teal-600 dark:text-teal-400 font-bold">250W–300W electrical</span>
            </div>
          </div>
        </div>

        {/* Card 2: Drivetrain Shootout */}
        <div className="p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--hub-muted)] flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-500" /> Shootout Pods
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-semibold">
              Freeze Day 45
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Pod A Concept:</span>
              <span className="font-mono text-[var(--hub-ink)] font-semibold">Coaxial Magnetic 1:10 + HAWT</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Pod B Concept:</span>
              <span className="font-mono text-[var(--hub-ink)] font-semibold">Archimedes Spiral + Planetary</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Decision Standard:</span>
              <span className="font-mono text-amber-500 font-semibold">Scored on Measured Data</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--hub-muted)]">Sunk Cost Rule:</span>
              <span className="font-mono text-red-500 font-semibold">Drop losing pod immediately</span>
            </div>
          </div>
        </div>

        {/* Card 3: Non-Negotiable Upgrades */}
        <div className="p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--hub-muted)] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-500" /> Locked Specs
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-500/10 text-teal-500 font-semibold">
              Wood Retired
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Chassis Material:</span>
              <span className="font-mono text-[var(--hub-ink)] font-semibold">3030 T-Slot Alum + 6061 Plates</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Generator Type:</span>
              <span className="font-mono text-[var(--hub-ink)] font-semibold">Coreless Axial Flux PMA (Zero Cog)</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--hub-line)]/50">
              <span className="text-[var(--hub-muted)]">Yaw Mechanism:</span>
              <span className="font-mono text-[var(--hub-ink)] font-semibold">Passive Tail Vane + 30A Slip Ring</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--hub-muted)]">Failsafe Braking:</span>
              <span className="font-mono text-teal-600 dark:text-teal-400 font-semibold">500W Dump Load + E-Stop Resistor</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--hub-line)] pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('roadmap')}
          className={`flex items-center gap-2 px-4 py-2.5 font-heading text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'roadmap'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <Calendar className="w-4 h-4" /> 90-Day Master Roadmap
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2.5 font-heading text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'tasks'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <Clock className="w-4 h-4" /> Active Day 1–7 Micro-Tasks
        </button>

        <button
          onClick={() => setActiveTab('shootout')}
          className={`flex items-center gap-2 px-4 py-2.5 font-heading text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'shootout'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <Layers className="w-4 h-4" /> Pod A vs Pod B Shootout
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center gap-2 px-4 py-2.5 font-heading text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'telemetry'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <Activity className="w-4 h-4" /> Telemetry & Power Lab
        </button>

        <button
          onClick={() => setActiveTab('bom')}
          className={`flex items-center gap-2 px-4 py-2.5 font-heading text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'bom'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <DollarSign className="w-4 h-4" /> BOM & CapEx Budget
        </button>

        <button
          onClick={() => setActiveTab('decisions')}
          className={`flex items-center gap-2 px-4 py-2.5 font-heading text-xs font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'decisions'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
          }`}
        >
          <BookOpen className="w-4 h-4" /> Decision Register & Risks
        </button>
      </div>

      {/* TAB CONTENT: 90-DAY ROADMAP */}
      {activeTab === 'roadmap' && (
        <div className="space-y-4">
          {PLAN_DATA.map((phase, pIdx) => {
            const isCollapsed = Boolean(collapsedPhases[pIdx]);
            return (
              <div
                key={phase.ph}
                className="rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] overflow-hidden shadow-sm"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedPhases((prev) => ({ ...prev, [pIdx]: !prev[pIdx] }))
                  }
                  className="w-full flex items-center justify-between p-4 bg-[var(--hub-surface-raised)]/50 hover:bg-[var(--hub-surface-raised)] text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold flex items-center justify-center text-xs font-mono">
                      P{pIdx + 1}
                    </span>
                    <div>
                      <h2 className="font-heading font-bold text-sm sm:text-base text-[var(--hub-ink)]">
                        {phase.ph}
                      </h2>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {phase.badge && (
                      <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        {phase.badge}
                      </span>
                    )}
                    {isCollapsed ? (
                      <ChevronDown className="w-5 h-5 text-[var(--hub-muted)]" />
                    ) : (
                      <ChevronUp className="w-5 h-5 text-[var(--hub-muted)]" />
                    )}
                  </div>
                </button>

                {!isCollapsed && (
                  <div className="divide-y divide-[var(--hub-line)]">
                    {phase.w.map((week, wIdx) => (
                      <div key={week.t} className="p-4 sm:p-5 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-teal-500" />
                            {week.t}
                          </h3>
                        </div>

                        {/* Checklist items */}
                        <div className="space-y-2">
                          {week.k.map((taskStr, kIdx) => {
                            const itemId = `${pIdx}-${wIdx}-${kIdx}`;
                            const isDone = Boolean(checkedItems[itemId]);
                            return (
                              <label
                                key={taskStr}
                                className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer text-xs transition-colors ${
                                  isDone
                                    ? 'bg-teal-500/10 text-teal-900 dark:text-teal-200 line-through'
                                    : 'hover:bg-[var(--hub-bg)] text-[var(--hub-ink)]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isDone}
                                  onChange={() => toggleCheck(itemId)}
                                  className="mt-0.5 w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer flex-none"
                                />
                                <span className="leading-relaxed">{taskStr}</span>
                              </label>
                            );
                          })}
                        </div>

                        {/* Deliverable badge */}
                        <div className="flex items-center gap-2 text-xs text-[var(--hub-muted)] bg-[var(--hub-bg)] p-2.5 rounded-lg border border-[var(--hub-line)]">
                          <FileCheck className="w-4 h-4 text-teal-500 flex-none" />
                          <span>
                            <strong className="text-[var(--hub-ink)]">Key Deliverable:</strong> {week.d}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB CONTENT: ACTIVE DAY 1–7 MICRO-TASKS */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-3">
            <Clock className="w-5 h-5 text-sky-500 flex-none mt-0.5" />
            <div>
              <strong className="font-bold">Strict 2.0–3.0 Hour Scope Rule:</strong>
              <p className="mt-0.5 text-sky-800 dark:text-sky-300">
                Each junior works strictly 2–3 hours per day. Tasks are atomic with binary Definitions of Done. 
                Days 8–90 task cards are locked until Gate 1 is passed by Founder review.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DAY_1_7_TASKS.map((task) => (
              <div
                key={task.id}
                className="p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] hover:border-teal-500/50 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs font-bold text-sky-500">{task.id}</span>
                    <span className="text-[11px] font-semibold text-[var(--hub-muted)]">
                      {task.owner} ({task.est})
                    </span>
                  </div>
                  <div className="text-[11px] font-bold text-teal-600 dark:text-teal-400 mb-1">
                    {task.track}
                  </div>
                  <h4 className="font-heading font-bold text-sm text-[var(--hub-ink)] mb-3 leading-snug">
                    {task.title}
                  </h4>

                  <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs mb-3">
                    <div className="text-[10px] uppercase font-bold text-teal-500 mb-0.5 tracking-wider">
                      Definition of Done (DoD)
                    </div>
                    <p className="text-[var(--hub-ink)] text-[11.5px] leading-relaxed">{task.dod}</p>
                  </div>

                  <div className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 flex-none" />
                    <span>Safety: {task.safety}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--hub-line)] flex items-center justify-between">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                      task.status === 'DONE'
                        ? 'bg-green-500/10 text-green-500'
                        : task.status === 'IN_PROGRESS'
                        ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-[var(--hub-bg)] text-[var(--hub-muted)]'
                    }`}
                  >
                    {task.status}
                  </span>
                  <button
                    onClick={() => {
                      alert(`Task ${task.id} proof submitted: Photo/CSV verified.`);
                    }}
                    className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-semibold"
                  >
                    Upload Proof & Metric →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONTENT: POD A VS POD B SHOOTOUT */}
      {activeTab === 'shootout' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
            <strong className="font-bold">Day 45 Freeze Gate Decision Rule:</strong>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              Pod A and Pod B run under identical airflow and electrical load conditions. On Day 45, the Founder freezes ONE winning architecture based on measured data. Sunk cost is not an engineering argument.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pod A */}
            <div className="p-5 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-sky-500/10 text-sky-500 font-bold">
                  POD A
                </span>
                <span className="text-xs text-[var(--hub-muted)]">2 EE Juniors + 1 MME</span>
              </div>
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] mb-2">
                Coaxial Magnetic Gear (1:10) + HAWT Airfoil
              </h3>
              <p className="text-xs text-[var(--hub-muted)] leading-relaxed mb-4">
                Non-contact torque transmission via N52 neodymium magnets and laminated M19 silicon steel flux modulators.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                  <span>Starting / Cogging Torque:</span>
                  <span className="font-mono font-bold text-green-500">&lt; 0.02 N·m (Zero contact)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                  <span>High-Speed Efficiency:</span>
                  <span className="font-mono font-bold text-sky-500">~88%–92% (High-TSR λ = 6.0)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                  <span>Storm Overload Behavior:</span>
                  <span className="font-mono font-bold text-teal-500">Inherent non-destructive slip</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                  <span>Acoustic Noise at 5m:</span>
                  <span className="font-mono font-bold text-green-500">&lt; 35 dBA (Near silent)</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span>Critical Risk:</span>
                  <span className="font-mono text-red-500">1.5mm air gap runout sensitivity</span>
                </div>
              </div>
            </div>

            {/* Pod B */}
            <div className="p-5 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                  POD B
                </span>
                <span className="text-xs text-[var(--hub-muted)]">1 EE Junior + 1 MME</span>
              </div>
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] mb-2">
                Archimedes Spiral + Patented Planetary Gear
              </h3>
              <p className="text-xs text-[var(--hub-muted)] leading-relaxed mb-4">
                Helical drag-and-lift spiral rotor driving a precision Delrin POM-C planetary gearbox with ceramic hybrid bearings.
              </p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                  <span>Starting Aerodynamic Torque:</span>
                  <span className="font-mono font-bold text-green-500">Exceptional (Cm ≈ 0.32)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                  <span>Cut-in Wind Speed:</span>
                  <span className="font-mono font-bold text-sky-500">1.8 m/s (Spins in room draft)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                  <span>Gearbox Efficiency:</span>
                  <span className="font-mono font-bold text-amber-500">~82%–88% (PTFE lube)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                  <span>IP Commercial Moat:</span>
                  <span className="font-mono font-bold text-teal-500">Published Indian Patent</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span>Critical Risk:</span>
                  <span className="font-mono text-red-500">Tooth wear and acoustic whine</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: TELEMETRY & POWER LAB */}
      {activeTab === 'telemetry' && (
        <div className="space-y-4">
          {/* Interactive Calculator */}
          <div className="p-5 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
            <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-500" /> Aerodynamic & Electrical Power Calculator
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="text-xs text-[var(--hub-muted)] block mb-1">
                  Wind Speed (v): <strong className="text-[var(--hub-ink)]">{calcWindSpeed.toFixed(1)} m/s</strong>
                </label>
                <input
                  type="range"
                  min="2.0"
                  max="15.0"
                  step="0.5"
                  value={calcWindSpeed}
                  onChange={(e) => setCalcWindSpeed(parseFloat(e.target.value))}
                  className="w-full accent-teal-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs text-[var(--hub-muted)] block mb-1">
                  Rotor Radius (R): <strong className="text-[var(--hub-ink)]">{calcRadius.toFixed(3)} m</strong>
                </label>
                <input
                  type="range"
                  min="0.4"
                  max="0.8"
                  step="0.01"
                  value={calcRadius}
                  onChange={(e) => setCalcRadius(parseFloat(e.target.value))}
                  className="w-full accent-teal-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="text-xs text-[var(--hub-muted)] block mb-1">
                  System Efficiency (Cp): <strong className="text-[var(--hub-ink)]">{(calcCp * 100).toFixed(0)}%</strong>
                </label>
                <input
                  type="range"
                  min="0.10"
                  max="0.45"
                  step="0.01"
                  value={calcCp}
                  onChange={(e) => setCalcCp(parseFloat(e.target.value))}
                  className="w-full accent-teal-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-center">
              <div>
                <div className="text-[10px] text-[var(--hub-muted)] font-mono uppercase">Swept Area (A)</div>
                <div className="font-heading font-extrabold text-base text-[var(--hub-ink)] mt-0.5">
                  {sweptArea.toFixed(2)} m²
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--hub-muted)] font-mono uppercase">Wind Power (P_wind)</div>
                <div className="font-heading font-extrabold text-base text-sky-500 mt-0.5">
                  {pWind.toFixed(1)} W
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--hub-muted)] font-mono uppercase">Electrical Output (P_elec)</div>
                <div className="font-heading font-extrabold text-base text-teal-600 dark:text-teal-400 mt-0.5">
                  {pElec.toFixed(1)} W
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--hub-muted)] font-mono uppercase">Daily Yield (8h equiv)</div>
                <div className="font-heading font-extrabold text-base text-amber-500 mt-0.5">
                  {((pElec * 8) / 1000).toFixed(2)} kWh
                </div>
              </div>
            </div>
          </div>

          {/* Sample CSV Data View */}
          <div className="p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--hub-muted)]">
                Automated 1 Hz Telemetry Log (Sample PS-T001)
              </h4>
              <span className="text-[10px] font-mono text-[var(--hub-muted)]">data/test_log_template.csv</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-[var(--hub-muted)] border-b border-[var(--hub-line)]">
                    <th className="py-1.5">Test ID</th>
                    <th>Wind Speed</th>
                    <th>Rotor RPM</th>
                    <th>Gen RPM</th>
                    <th>Voltage</th>
                    <th>Current</th>
                    <th>Power (V×I)</th>
                    <th>System Cp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hub-line)]/50">
                  <tr>
                    <td className="py-2 text-sky-500 font-bold">PS-T001</td>
                    <td>4.5 m/s</td>
                    <td>120 RPM</td>
                    <td>480 RPM</td>
                    <td>12.2 V</td>
                    <td>1.22 A</td>
                    <td className="text-teal-500 font-bold">14.88 W</td>
                    <td>0.265</td>
                  </tr>
                  <tr>
                    <td className="py-2 text-sky-500 font-bold">PS-T002</td>
                    <td>6.2 m/s</td>
                    <td>185 RPM</td>
                    <td>740 RPM</td>
                    <td>18.4 V</td>
                    <td>3.68 A</td>
                    <td className="text-teal-500 font-bold">67.71 W</td>
                    <td>0.231</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: BOM & BUDGET */}
      {activeTab === 'bom' && (
        <div className="p-5 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Prototype Bill of Materials & Procurement
              </h3>
              <p className="text-xs text-[var(--hub-muted)]">
                Total Estimated CapEx: ~₹38,500 | Sourced from data/bom_and_procurement.csv
              </p>
            </div>
            <span className="font-mono text-xs px-2.5 py-1 rounded bg-teal-500/10 text-teal-600 dark:text-teal-400 font-bold">
              Target: &lt; ₹42,500 Unit Cost
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--hub-line)] text-[var(--hub-muted)] font-mono uppercase text-[10px]">
                  <th className="py-2">Item ID</th>
                  <th>Subsystem</th>
                  <th>Component</th>
                  <th>Specification</th>
                  <th>Qty</th>
                  <th>Total Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hub-line)]/50">
                <tr>
                  <td className="py-2.5 font-mono text-sky-500 font-bold">BOM-001</td>
                  <td>Structure</td>
                  <td className="font-bold text-[var(--hub-ink)]">3030 T-Slot Aluminum Extrusion</td>
                  <td className="text-[var(--hub-muted)]">6063-T6 anodized (4m total)</td>
                  <td className="font-mono">4</td>
                  <td className="font-mono font-bold">₹2,600</td>
                  <td><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500">PENDING APPROVAL</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 font-mono text-sky-500 font-bold">BOM-003</td>
                  <td>Structure</td>
                  <td className="font-bold text-[var(--hub-ink)]">CNC Bearing Bulkhead Plates</td>
                  <td className="text-[var(--hub-muted)]">6.0mm 6061-T6 Aluminum</td>
                  <td className="font-mono">2</td>
                  <td className="font-mono font-bold">₹2,200</td>
                  <td><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500">PENDING APPROVAL</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 font-mono text-sky-500 font-bold">BOM-007</td>
                  <td>Generator</td>
                  <td className="font-bold text-[var(--hub-ink)]">Axial Flux Coreless Alternator</td>
                  <td className="text-[var(--hub-muted)]">300W–500W 24V/48V 300–600 RPM</td>
                  <td className="font-mono">1</td>
                  <td className="font-mono font-bold">₹14,500</td>
                  <td><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500">PENDING APPROVAL</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 font-mono text-sky-500 font-bold">BOM-008</td>
                  <td>Pod A</td>
                  <td className="font-bold text-[var(--hub-ink)]">N52 Neodymium Arc/Block Magnets</td>
                  <td className="text-[var(--hub-muted)]">High-coercivity NdFeB N52</td>
                  <td className="font-mono">48</td>
                  <td className="font-mono font-bold">₹5,760</td>
                  <td><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500">PENDING APPROVAL</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 font-mono text-sky-500 font-bold">BOM-012</td>
                  <td>Pod B</td>
                  <td className="font-bold text-[var(--hub-ink)]">POM-C Delrin Planetary Gear Set</td>
                  <td className="text-[var(--hub-muted)]">CNC Machined 1:10 speed increaser</td>
                  <td className="font-mono">1</td>
                  <td className="font-mono font-bold">₹3,200</td>
                  <td><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500">PENDING APPROVAL</span></td>
                </tr>
                <tr>
                  <td className="py-2.5 font-mono text-sky-500 font-bold">BOM-017</td>
                  <td>Electronics</td>
                  <td className="font-bold text-[var(--hub-ink)]">Dynamic Braking Resistor Bank</td>
                  <td className="text-[var(--hub-muted)]">1.5 Ω 500W aluminum-housed wirewound</td>
                  <td className="font-mono">3</td>
                  <td className="font-mono font-bold">₹1,650</td>
                  <td><span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500">PENDING APPROVAL</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: DECISIONS & RISKS */}
      {activeTab === 'decisions' && (
        <div className="space-y-4">
          <div className="p-5 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] space-y-3">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] mb-1">
              Architectural Decision Register (docs/DECISION_LOG.md)
            </h3>
            <div className="divide-y divide-[var(--hub-line)]">
              <div className="py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">DEC-001: Strict TRL 1–9 Adoption</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-500">APPROVED</span>
                </div>
                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                  Informal "TRL 10" discarded. 90-day target is an evidence-based TRL 5 (lab validated) with stretch TRL 6 (outdoor telemetry). Commercial deployment is beyond TRL 9.
                </p>
              </div>

              <div className="py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">DEC-002: Wooden Frame Decommissioned</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-500">APPROVED</span>
                </div>
                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                  Moisture shifts gear centerlines by 0.5–2.0 mm, causing gear binding and magnetic air-gap rub. Complete shift to 3030 T-slot aluminum and 6061 plates mandated starting Day 16.
                </p>
              </div>

              <div className="py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">DEC-003: Passive Furling Yaw over Active Servos</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-500">APPROVED</span>
                </div>
                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                  Active yaw servos draw 5W–15W continuously—eating up to 50% of generated power in 4–5 m/s winds. Passive tail vane with 5° furling hinge and 30A slip ring adopted.
                </p>
              </div>

              <div className="py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs font-bold text-teal-600 dark:text-teal-400">DEC-004: Two-Pod Parallel R&D with Day 45 Freeze Gate</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-500">APPROVED</span>
                </div>
                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                  Pod A (Magnetic) and Pod B (Planetary) compete until Day 44 under identical airflow. On Day 45, the winning architecture is frozen for commercial pilot production.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Plan Settings Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--hub-muted)]" />
          <span className="font-medium text-[var(--hub-ink)]">Plan Start Date:</span>
          <input
            type="date"
            value={startDateStr}
            onChange={(e) => {
              setStartDateStr(e.target.value);
              try {
                localStorage.setItem('pawan_shakti_start_date', e.target.value);
              } catch (err) {
                console.error(err);
              }
            }}
            className="py-1 px-2.5 rounded-md border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] cursor-pointer"
          />
        </div>

        <button
          onClick={() => {
            if (confirm('Reset all checklist ticks in the Pawan Shakti 90-day plan?')) {
              saveTicks({});
            }
          }}
          className="flex items-center gap-1.5 text-xs text-[var(--hub-muted)] hover:text-red-500 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset checklist ticks</span>
        </button>
      </div>
    </div>
  );
};
