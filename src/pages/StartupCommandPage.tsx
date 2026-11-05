import React, { useState } from 'react';
import {
  Wind,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  FileCheck,
  ChevronDown,
  ChevronUp,
  Award,
  Layers,
  IndianRupee,
  Activity,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import type { V3FAssessmentItem, V3FScore } from '../types';

const INITIAL_V3F_DATA: V3FAssessmentItem[] = [
  // 1. Founders, Governance & Compliance
  {
    id: 'v3f-1-1',
    category: 'Founders, Governance & Compliance',
    parameter: 'Founder Technical Alignment & Dedication',
    score: 3,
    evidence: 'VNIT Metallurgical & Materials background, deep robotics/prototyping hands-on execution, full-time founder commitment.',
    gap: 'Need dedicated electrical & power electronics co-lead for high-efficiency grid tie-in.',
    owner: 'Yaswanth',
    next_action: 'Finalize advisory terms for Senior Power Electronics Mentor by Nov 12.',
    due_date: '2026-11-12',
    status: 'verified',
  },
  {
    id: 'v3f-1-2',
    category: 'Founders, Governance & Compliance',
    parameter: 'Corporate Structure & Cap Table Governance',
    score: 1,
    evidence: 'Early pre-incubation enrollment draft; founder equity distribution model drafted.',
    gap: 'Formal Private Limited incorporation and founder SHA pending institutional incubation sign-off.',
    owner: 'Yaswanth',
    next_action: 'Complete SPICe+ MCA filing draft with company secretary.',
    due_date: '2026-11-14',
    status: 'in_progress',
  },
  {
    id: 'v3f-1-3',
    category: 'Founders, Governance & Compliance',
    parameter: 'Intellectual Property Protection (Patent 2025/399)',
    score: 2,
    evidence: 'Patent application 2025/399 for low-wind speed planetary gearbox mechanism filed; official filing receipt documented.',
    gap: 'Formal response to first examination report (FER) and PCT international filing roadmap.',
    owner: 'Yaswanth',
    next_action: 'Conduct prior art boundary review with patent attorney prior to V3F submission.',
    due_date: '2026-11-10',
    status: 'verified',
  },

  // 2. Customer & Market
  {
    id: 'v3f-2-1',
    category: 'Customer & Market',
    parameter: 'Beachhead Market Validation & Pain Points',
    score: 2,
    evidence: 'Identified off-grid telecom cell tower power backup and decentralized agricultural solar-wind hybrid microgrids.',
    gap: 'Direct signed Letters of Intent (LOIs) from telecom tower infrastructure providers (TowerCo).',
    owner: 'Yaswanth',
    next_action: 'Conduct 5 structured interviews with telecom site maintenance managers.',
    due_date: '2026-11-11',
    status: 'in_progress',
  },
  {
    id: 'v3f-2-2',
    category: 'Customer & Market',
    parameter: 'Competitive Advantage & Levelized Cost of Energy (LCOE)',
    score: 2,
    evidence: 'Calculated cut-in at 2.0 m/s vs commercial standard 3.5 m/s. ~40% higher annual energy yield in low-wind corridors.',
    gap: 'Third-party wind tunnel validation data curves across 2-8 m/s speed sweeps.',
    owner: 'Yaswanth',
    next_action: 'Book calibration run at regional wind tunnel facility.',
    due_date: '2026-11-13',
    status: 'in_progress',
  },

  // 3. Product & Technology
  {
    id: 'v3f-3-1',
    category: 'Product & Technology',
    parameter: 'High-Torque Planetary Gearbox Subsystem (1:10 Ratio)',
    score: 2,
    evidence: 'Evaluated 3-planet and 4-planet arrangements; physical prototype machined and bench tested for torque transmission.',
    gap: 'Vibration damping and thermal dissipation during 100-hour continuous run bench test.',
    owner: 'Yaswanth',
    next_action: 'Mount digital tachometer + vibration sensor logger for 24-hour endurance test.',
    due_date: '2026-11-09',
    status: 'in_progress',
  },
  {
    id: 'v3f-3-2',
    category: 'Product & Technology',
    parameter: 'TRL 4 to TRL 5 De-risking & Validation Protocol',
    score: 2,
    evidence: 'Test protocols drafted covering cut-in velocity, RPM vs power curve, and braking mechanism.',
    gap: 'Full physical test matrix log verifying repeatable power output into calibrated load cell.',
    owner: 'Yaswanth',
    next_action: 'Complete 4-speed bench calibration protocol and compile CSV logs.',
    due_date: '2026-11-08',
    status: 'in_progress',
  },
  {
    id: 'v3f-3-3',
    category: 'Product & Technology',
    parameter: 'Safety & Overspeed Braking (IEC 61400-2 Compliance)',
    score: 1,
    evidence: 'Conceptual design for aerodynamic tip-stall and mechanical disc caliper brake.',
    gap: 'Detailed failure modes and effects analysis (FMEA) and physical fail-safe test.',
    owner: 'Yaswanth',
    next_action: 'Finalize IEC 61400-2 safety risk register sheet with engineering sign-off.',
    due_date: '2026-11-10',
    status: 'pending',
  },

  // 4. GTM & Brand
  {
    id: 'v3f-4-1',
    category: 'GTM & Brand',
    parameter: 'Pilot Deployment Strategy & Channel Partnerships',
    score: 1,
    evidence: 'Outreach target list compiled; pre-incubation pilot demo sites scoped.',
    gap: 'Formal field test agreement for first live commercial site installation.',
    owner: 'Yaswanth',
    next_action: 'Finalize 1-page pilot partnership proposal sheet.',
    due_date: '2026-11-12',
    status: 'in_progress',
  },

  // 5. Finance & Funding
  {
    id: 'v3f-5-1',
    category: 'Finance & Funding',
    parameter: 'Grant Capital Sourcing (ANRF Secured)',
    score: 3,
    evidence: 'Secured ANRF R&D grant support (₹25L) with sanctioned milestones; BIRAC BIG / DST application pipelines prepared.',
    gap: 'Tranche disbursement release documentation and dedicated project account.',
    owner: 'Yaswanth',
    next_action: 'Submit ANRF milestone report for Q1 tranche release.',
    due_date: '2026-11-14',
    status: 'verified',
  },
  {
    id: 'v3f-5-2',
    category: 'Finance & Funding',
    parameter: 'Bill of Materials (BOM) & Volume Cost Projections',
    score: 2,
    evidence: 'Detailed BOM for prototype (₹1,20,500) with volume projections at 50 units (₹64,200) and 500 units (₹38,400).',
    gap: 'Vendor quotation freeze for mass-produced planetary gear sets and custom stator coils.',
    owner: 'Yaswanth',
    next_action: 'Obtain 3 formal supplier quotes for CNC gear batches.',
    due_date: '2026-11-11',
    status: 'in_progress',
  },

  // 6. Traction & Execution
  {
    id: 'v3f-6-1',
    category: 'Traction & Execution',
    parameter: '90-Day Execution Discipline & Gate Reviews',
    score: 2,
    evidence: 'Active 90-day TRL milestone plan with weekly checkpoints and gate review criteria.',
    gap: 'Full photographic and telemetry evidence repository indexed for assessor review.',
    owner: 'Yaswanth',
    next_action: 'Upload high-resolution test photos and raw sensor CSVs to V3F submission drive.',
    due_date: '2026-11-13',
    status: 'in_progress',
  },
];

const BOM_DATA = [
  { item: 'Planetary Gearbox Assembly (1:10 ratio, 3-planet)', prototype: 38000, vol50: 18500, vol500: 9800, source: 'Custom CNC / Gear Grinding' },
  { item: 'Axial Flux PM Generator (Stator + N52 Neodymium Rotors)', prototype: 28000, vol50: 15200, vol500: 9200, source: 'In-house Winding + Sintered NdFeB' },
  { item: 'Aerodynamic Spiral / Pitch Blades (~1 m² profile)', prototype: 19500, vol50: 10400, vol500: 5900, source: 'PETG-CF / Molded Resin Core' },
  { item: 'Chassis & Nacelle Structure (Modular 3030 Extrusions & Plates)', prototype: 14000, vol50: 8200, vol500: 4800, source: '6061-T6 Aluminum Laser Cut' },
  { item: 'Power Electronics (Synchronous Rectifier + MPPT Boost + Logger)', prototype: 11000, vol50: 6500, vol500: 4500, source: 'Custom SMD PCB + INA226/ESP32' },
  { item: 'Bearings, Slip Ring & Hardware (Double-row Angular Contact)', prototype: 10000, vol50: 5400, vol500: 4200, source: 'SKF / Industrial Capsule Slip Ring' },
];

export const StartupCommandPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'v3f' | 'plan15' | 'bom' | 'risks' | 'roadmap'>('v3f');
  const [assessmentItems, setAssessmentItems] = useState<V3FAssessmentItem[]>(INITIAL_V3F_DATA);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // V3F Scoring Metrics
  const numericItems = assessmentItems.filter((i) => typeof i.score === 'number');
  const totalScore = numericItems.reduce((sum, item) => sum + (item.score as number), 0);
  const maxPossibleScore = numericItems.length * 3;
  const scorePercentage = Math.round((totalScore / maxPossibleScore) * 100);

  const handleScoreChange = (id: string, newScore: V3FScore) => {
    setAssessmentItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, score: newScore } : item))
    );
  };

  const filteredItems = filterCategory === 'All'
    ? assessmentItems
    : assessmentItems.filter((i) => i.category === filterCategory);

  const categories = Array.from(new Set(assessmentItems.map((i) => i.category)));

  // Countdown to 15 November 2026
  const targetDate = new Date('2026-11-15T23:59:59+05:30').getTime();
  const now = Date.now();
  const diffDays = Math.max(0, Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24)));

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Strategic Overview */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="teal" dot>Pawan Shakti Low-Wind Systems</Badge>
              <Badge variant="amber">TRL 4 Prototype Validation</Badge>
              <Badge variant="blue">Patent App 2025/399</Badge>
              <Badge variant="emerald">ANRF R&D Grant Secured (₹25L)</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-[var(--hub-ink)] tracking-tight">
              Startup Command Center & V3F Readiness Hub
            </h1>
            <p className="text-sm text-[var(--hub-muted)] max-w-3xl leading-relaxed">
              Institutional deep-tech startup command center managing Pawan Shakti's low cut-in wind turbine development, high-torque planetary gearbox engineering, and V3F incubation readiness submission.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-[var(--hub-bg)] p-4 rounded-xl border border-[var(--hub-line)] flex-none">
            <div className="text-center">
              <span className="text-xs text-[var(--hub-muted)] uppercase tracking-wider block font-bold">
                Submission Deadline
              </span>
              <span className="text-2xl font-bold font-heading text-red-600 dark:text-red-400">
                15 Nov 2026
              </span>
              <span className="text-xs font-semibold text-[var(--hub-ink)] block mt-0.5">
                {diffDays} Days Remaining
              </span>
            </div>
            <div className="h-10 w-px bg-[var(--hub-line)]" />
            <div className="text-center">
              <span className="text-xs text-[var(--hub-muted)] uppercase tracking-wider block font-bold">
                V3F Audit Score
              </span>
              <span className="text-2xl font-bold font-heading text-teal-600 dark:text-teal-400">
                {scorePercentage}%
              </span>
              <span className="text-xs text-[var(--hub-muted)] block mt-0.5">
                {totalScore} / {maxPossibleScore} Points
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Core Differentiator"
          value="2.0 m/s Cut-In"
          subtext="vs 3.5 m/s standard turbines"
          icon={<Wind className="w-5 h-5 text-teal-600" />}
        />
        <StatCard
          label="Gearbox Ratio"
          value="1:10 Planetary"
          subtext="3-planet & 4-planet evaluated"
          icon={<Layers className="w-5 h-5 text-blue-600" />}
        />
        <StatCard
          label="Prototype Unit Cost"
          value="₹1,20,500"
          subtext="Target ₹38,400 at 500 units"
          icon={<IndianRupee className="w-5 h-5 text-amber-600" />}
        />
        <StatCard
          label="V3F Evidence Verified"
          value={`${assessmentItems.filter((i) => i.score === 3).length} / ${assessmentItems.length}`}
          subtext="Validated & actively used items"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        />
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--hub-line)] pb-2 overflow-x-auto">
        {[
          { id: 'v3f', label: 'V3F 6-Category Assessment (0-3 Rubric)', icon: ShieldCheck },
          { id: 'plan15', label: '15 Nov Submission Checklist', icon: Calendar },
          { id: 'bom', label: 'Bill of Materials (BOM) Economics', icon: IndianRupee },
          { id: 'risks', label: 'Risk Register & TRL 4 Protocol', icon: AlertTriangle },
          { id: 'roadmap', label: '90-Day Engineering Roadmap', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--hub-accent)] text-white shadow-xs'
                  : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: V3F 6-CATEGORY ASSESSMENT */}
      {activeTab === 'v3f' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-[var(--hub-ink)]">Filter Category:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="py-1 px-2.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)] font-medium cursor-pointer"
              >
                <option value="All">All Categories ({assessmentItems.length})</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--hub-muted)]">
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" /> 0 = Not started
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> 1 = Draft
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> 2 = Documented
              </span>
              <span className="flex items-center gap-1 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> 3 = Validated
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {filteredItems.map((item) => {
              const isExpanded = expandedItem === item.id;
              return (
                <div
                  key={item.id}
                  className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl overflow-hidden shadow-xs hover:border-[var(--hub-accent)] transition-all"
                >
                  <div
                    onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="teal">{item.category}</Badge>
                        <Badge variant={item.status === 'verified' ? 'emerald' : 'amber'} dot>
                          {item.status.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-[var(--hub-muted)]">Owner: {item.owner}</span>
                        <span className="text-xs text-[var(--hub-muted)]">Due: {item.due_date}</span>
                      </div>
                      <h3 className="text-sm font-bold text-[var(--hub-ink)]">{item.parameter}</h3>
                    </div>

                    <div className="flex items-center gap-4 flex-none" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 bg-[var(--hub-bg)] p-1 rounded-lg border border-[var(--hub-line)]">
                        {[0, 1, 2, 3].map((val) => (
                          <button
                            key={val}
                            onClick={() => handleScoreChange(item.id, val as V3FScore)}
                            className={`w-7 h-7 rounded text-xs font-bold transition-all cursor-pointer ${
                              item.score === val
                                ? val === 3
                                  ? 'bg-emerald-600 text-white'
                                  : val === 2
                                  ? 'bg-blue-600 text-white'
                                  : val === 1
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-red-600 text-white'
                                : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        className="p-1.5 text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 bg-[var(--hub-bg)]/40 border-t border-[var(--hub-line)] text-xs space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)]">
                          <span className="font-bold text-[var(--hub-ink)] block mb-1">
                            Documented Evidence:
                          </span>
                          <p className="text-[var(--hub-muted)] leading-relaxed">{item.evidence}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)]">
                          <span className="font-bold text-red-600 dark:text-red-400 block mb-1">
                            Identified Gap:
                          </span>
                          <p className="text-[var(--hub-muted)] leading-relaxed">{item.gap}</p>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-teal-500/10 border border-teal-500/20">
                        <div>
                          <span className="font-bold text-teal-900 dark:text-teal-200 block">
                            Next Action to Resolve Gap:
                          </span>
                          <p className="text-teal-800 dark:text-teal-300 mt-0.5">{item.next_action}</p>
                        </div>
                        <span className="font-mono text-teal-700 dark:text-teal-400 font-bold whitespace-nowrap">
                          Deadline: {item.due_date}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: 15 NOV SUBMISSION CHECKLIST */}
      {activeTab === 'plan15' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              Daily Submission Sprint Plan (6–15 November 2026)
            </h3>
            <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
              Step-by-step roadmap to finalize documentation, evidentiary exhibits, and review with Shashikant Chaudhary for submission to Abhijeet by 15 November 2026.
            </p>

            <div className="space-y-2 pt-2">
              {[
                { day: '6 Nov (Today)', task: 'Lock V3F scoring baseline and initialize evidence folder structure in cloud repository.', done: true },
                { day: '7–8 Nov', task: 'Execute 4-speed bench calibration sweeps on planetary gearbox; log V, I, P = V × I, and RPM at 1 Hz.', done: false },
                { day: '9 Nov', task: 'Draft standardized 1-page technical spec sheet with all parameters tagged (MEASURED/CALCULATED/ESTIMATED).', done: false },
                { day: '10 Nov', task: 'Conduct prior art boundary review for Patent 2025/399 with IP counsel and finalize safety risk register.', done: false },
                { day: '11 Nov', task: 'Freeze Prototype Bill of Materials (BOM) with 50-unit and 500-unit supplier quotations.', done: false },
                { day: '12 Nov', task: 'Conduct beachhead customer outreach interviews (5 telecom microgrid operators).', done: false },
                { day: '13 Nov', task: 'Compile high-resolution prototype photo gallery and raw telemetry CSVs into assessor evidence vault.', done: false },
                { day: '14 Nov', task: 'Internal dry-run review of complete submission packet with Shashikant Chaudhary.', done: false },
                { day: '15 Nov', task: 'Final formal submission of V3F Startup Readiness & Gap Assessment to Abhijeet before 23:59 IST.', done: false },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                    step.done
                      ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
                      : 'bg-[var(--hub-bg)]/40 border-[var(--hub-line)] text-[var(--hub-ink)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={step.done}
                    readOnly
                    className="mt-0.5 w-4 h-4 rounded text-teal-600 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs mr-2">{step.day}:</span>
                    <span className="text-xs">{step.task}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BILL OF MATERIALS (BOM) */}
      {activeTab === 'bom' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                  Prototype Unit Cost Breakdown & Volume Projections
                </h3>
                <p className="text-xs text-[var(--hub-muted)]">
                  Economies of scale roadmap demonstrating path from single prototype to 50 and 500 units.
                </p>
              </div>
              <Badge variant="emerald">Unit Margin Target: 52%</Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-muted)] font-bold">
                    <th className="py-2.5 px-3">Subsystem / Component</th>
                    <th className="py-2.5 px-3">Prototype Unit (₹)</th>
                    <th className="py-2.5 px-3">At 50 Units (₹)</th>
                    <th className="py-2.5 px-3">At 500 Units (₹)</th>
                    <th className="py-2.5 px-3">Sourcing Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--hub-line)]">
                  {BOM_DATA.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[var(--hub-bg)]/50 transition-colors">
                      <td className="py-3 px-3 font-semibold text-[var(--hub-ink)]">{row.item}</td>
                      <td className="py-3 px-3 font-mono text-[var(--hub-ink)]">₹{row.prototype.toLocaleString()}</td>
                      <td className="py-3 px-3 font-mono text-teal-600 dark:text-teal-400">₹{row.vol50.toLocaleString()}</td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">₹{row.vol500.toLocaleString()}</td>
                      <td className="py-3 px-3 text-[var(--hub-muted)]">{row.source}</td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--hub-bg)] font-bold border-t-2 border-[var(--hub-line)] text-sm">
                    <td className="py-3 px-3 text-[var(--hub-ink)]">Total Unit CapEx</td>
                    <td className="py-3 px-3 font-mono text-[var(--hub-ink)]">₹1,20,500</td>
                    <td className="py-3 px-3 font-mono text-teal-600">₹64,200 (-47%)</td>
                    <td className="py-3 px-3 font-mono text-emerald-600">₹38,400 (-68%)</td>
                    <td className="py-3 px-3 text-xs text-[var(--hub-muted)]">Scale Optimization</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RISK REGISTER & PROTOCOL */}
      {activeTab === 'risks' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              Top 5 Technical & Operational Risks (Risk Register)
            </h3>
            <div className="space-y-3">
              {[
                {
                  risk: 'Planetary Gearbox Radial Play & Gear Tooth Fatigue',
                  severity: 'High',
                  mitigation: 'Implement case-hardened 20MnCr5 steel planets, precision needle bearings, and dynamic backlash shimming under 0.05 mm.',
                },
                {
                  risk: 'Low Cut-in Cogging Torque Preventing Blade Startup under 2.5 m/s',
                  severity: 'High',
                  mitigation: 'Coreless axial flux stator design with zero magnetic iron cogging and Archimedes progressive helical blade curvature.',
                },
                {
                  risk: 'Thermal Dissipation in Enclosed Weatherproof Nacelle',
                  severity: 'Medium',
                  mitigation: 'Aluminum bulkhead heat-pipe coupling to outer nacelle finned chassis for passive heat dissipation.',
                },
                {
                  risk: 'Turbulence and Gust Overspeed Rotor Damage',
                  severity: 'High',
                  mitigation: 'Dual redundant aerodynamic pitch twist and fail-safe electromagnetic shorting brake triggered by ESP32 RPM governor.',
                },
                {
                  risk: 'Vendor Lead Time Delay for Custom Sintered Magnets',
                  severity: 'Medium',
                  mitigation: 'Dual-source agreements with two domestic magnetic distributors and standard modular pole arc geometry.',
                },
              ].map((r, idx) => (
                <div key={idx} className="p-3.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)]/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[var(--hub-ink)]">{r.risk}</h4>
                    <Badge variant={r.severity === 'High' ? 'red' : 'amber'}>{r.severity} Severity</Badge>
                  </div>
                  <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                    <strong className="text-[var(--hub-ink)]">Mitigation: </strong>{r.mitigation}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: 90-DAY ENGINEERING ROADMAP */}
      {activeTab === 'roadmap' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              90-Day TRL Progression Gates
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-2">
                <Badge variant="teal">Days 1–30</Badge>
                <h4 className="text-sm font-bold text-[var(--hub-ink)]">Phase 1: Baseline Audit & Rig Rigidity</h4>
                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                  Transition from wooden frame to 3030 aluminum chassis, wire ESP32/INA226 logger v1, and establish baseline power curve data.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-2">
                <Badge variant="blue">Days 31–60</Badge>
                <h4 className="text-sm font-bold text-[var(--hub-ink)]">Phase 2: Pod Shootout & Field Validation</h4>
                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                  Parallel shootout between Pod A (Magnetic Gearbox) and Pod B (Planetary Gearbox); freeze winning architecture at Day 45.
                </p>
              </div>
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                <Badge variant="emerald">Days 61–90</Badge>
                <h4 className="text-sm font-bold text-[var(--hub-ink)]">Phase 3: Integrated TRL 5 Demonstration</h4>
                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                  Full rooftop outdoor continuous run (100 hours), customer pilot demonstration, and investor-ready technical dossier.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
