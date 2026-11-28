import React, { Suspense, lazy, useState, useEffect } from 'react';
import {
  Wind,
  ShieldCheck,
  Calendar,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Layers,
  IndianRupee,
  Activity,
  CheckCircle2,
  Upload,
  Usb,
  Cpu,
  Download,
  Box,
  Compass,
} from 'lucide-react';
import type { NavigationTab, V3FAssessmentItem, V3FScore } from '../types';
import { openUniverseStation } from '../lib/universeConfig';

const EngineeringModelViewer = lazy(() =>
  import('../components/three/EngineeringModelViewer').then((m) => ({ default: m.EngineeringModelViewer }))
);
import { db } from '../db';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import {
  connectBenchWebSerial,
  isWebSerialSupported,
  parseTelemetryCsv,
  SYNTHETIC_DEMO_CSV,
  type PvCurveBin,
  type StoredPvTelemetrySummary,
} from '../lib/telemetryAnalyzer';
import { generateId } from '../lib/utils';
import { toast } from '../lib/toast';
import {
  EXTRA_CLOUD_UPDATE_EVENT,
  listenExtraBroadcasts,
  saveSyncedPreference,
} from '../services/sync/extraCloudSync';

const INITIAL_V3F_DATA: V3FAssessmentItem[] = [
  {
    id: 'v3f-1-1',
    category: 'Founders, Governance & Compliance',
    parameter: 'Founder Technical Alignment & Dedication',
    score: 2,
    evidence: 'Active VNIT engineering founder leading TRL 4 benchtop prototyping & automation workflows.',
    gap: 'Dedicated electrical/power electronics validation partner and formal advisory agreements.',
    owner: 'Yashwanth',
    next_action: 'Document formal technical advisory commitment before submission.',
    due_date: '2026-11-12',
    status: 'in_progress',
  },
  {
    id: 'v3f-1-2',
    category: 'Founders, Governance & Compliance',
    parameter: 'Corporate Structure & Cap Table Governance',
    score: 1,
    evidence: 'Draft readiness phase; entity incorporation details pending upload.',
    gap: 'Formal company registration documents and equity table verification.',
    owner: 'Yashwanth',
    next_action: 'Confirm entity registration status and upload governance documents.',
    due_date: '2026-11-14',
    status: 'pending',
  },
  {
    id: 'v3f-1-3',
    category: 'Founders, Governance & Compliance',
    parameter: 'Intellectual Property Protection',
    score: 2,
    evidence: 'Published Indian Patent: "Compact Wind Turbine with Planetary Gears" (verified baseline).',
    gap: 'Upload filing dossier & patent publication PDF to project documents.',
    owner: 'Yashwanth',
    next_action: 'Attach official Indian Patent publication reference.',
    due_date: '2026-11-10',
    status: 'verified',
  },
  {
    id: 'v3f-2-1',
    category: 'Customer & Market',
    parameter: 'Beachhead Market Validation & LOIs',
    score: 1,
    evidence: 'Target use-cases identified (rural micro-generation / off-grid sites); NO signed customer LOIs yet.',
    gap: 'Signed Letters of Intent or structured customer discovery transcripts.',
    owner: 'Yashwanth',
    next_action: 'Conduct and log verified customer discovery interviews.',
    due_date: '2026-11-11',
    status: 'pending',
  },
  {
    id: 'v3f-2-2',
    category: 'Customer & Market',
    parameter: 'Power Curve & Annual Energy Yield Evidence',
    score: 1,
    evidence: 'Low cut-in aerodynamic/gearbox concept targeted; ZERO continuous >= 1 Hz P-v curve CSV captured yet.',
    gap: 'Calibrated wind-speed vs electrical power curve measurements (>= 1 Hz CSV).',
    owner: 'Yashwanth',
    next_action: 'Record time-series tachometer + load voltage/current CSV on closed-loop bench.',
    due_date: '2026-11-13',
    status: 'pending',
  },
  {
    id: 'v3f-3-1',
    category: 'Product & Technology',
    parameter: 'Planetary Gearbox & Rotor Benchtop Baseline (TRL 4)',
    score: 1,
    evidence: 'TRL 4 separate benchtop components (wooden frame, PLA blades, planetary gearbox baseline).',
    gap: 'Integrated closed-loop shaft + generator bench test & structural upgrade from wood/PLA.',
    owner: 'Yashwanth',
    next_action: 'Execute integrated closed-loop bench test without premature structural failures.',
    due_date: '2026-11-12',
    status: 'in_progress',
  },
  {
    id: 'v3f-3-2',
    category: 'Product & Technology',
    parameter: 'TRL 4 to TRL 5 Validation Protocol',
    score: 1,
    evidence: '90-day TRL 5 target defined; closed-loop integration and instrumentation not yet completed.',
    gap: 'Repeatable integrated bench run CSV log and structural BOM transition.',
    owner: 'Yashwanth',
    next_action: 'Run integrated instrumentation protocol and archive raw CSV logs.',
    due_date: '2026-11-14',
    status: 'pending',
  },
  {
    id: 'v3f-3-3',
    category: 'Product & Technology',
    parameter: 'Safety & Overspeed Braking (IEC 61400-2)',
    score: 0,
    evidence: 'Safety requirements identified; braking mechanism & FMEA not yet experimentally verified.',
    gap: 'FMEA register, rotor dynamic balance check, and emergency braking test.',
    owner: 'Yashwanth',
    next_action: 'Draft and review IEC 61400-2 safety register prior to high-RPM spin tests.',
    due_date: '2026-11-13',
    status: 'pending',
  },
  {
    id: 'v3f-4-1',
    category: 'GTM & Brand',
    parameter: 'Pilot Deployment Strategy',
    score: 1,
    evidence: 'Pilot outreach scoped; no confirmed external deployment site agreement yet.',
    gap: 'TRL 5 bench validation prerequisite before formal pilot site commitments.',
    owner: 'Yashwanth',
    next_action: 'Hold commercial claims until closed-loop TRL 5 evidence is documented.',
    due_date: '2026-11-14',
    status: 'pending',
  },
  {
    id: 'v3f-5-1',
    category: 'Finance & Funding',
    parameter: 'Grant & Seed Capital Pipeline (Unverified)',
    score: 0,
    evidence: 'No verified grant sanction letter or treasury balance attached in Hub records yet.',
    gap: 'Upload confirmed sanction / bank balance documentation if/when received.',
    owner: 'Yashwanth',
    next_action: 'Prepare transparent R&D BOM & milestone budget aligned to TRL 5 tasks.',
    due_date: '2026-11-14',
    status: 'pending',
  },
  {
    id: 'v3f-5-2',
    category: 'Finance & Funding',
    parameter: 'Engineering Bill of Materials (BOM) Estimates',
    score: 1,
    evidence: 'Draft planning estimates prepared; formal vendor quotes for upgraded chassis & stator still pending.',
    gap: 'Verified supplier quotes & unit-cost confirmation.',
    owner: 'Yashwanth',
    next_action: 'Collect 3 verified supplier quotes for metal frame, blades, and coil winding.',
    due_date: '2026-11-11',
    status: 'in_progress',
  },
  {
    id: 'v3f-6-1',
    category: 'Traction & Execution',
    parameter: '90-Day TRL 5 Execution Discipline',
    score: 1,
    evidence: 'Project tracker initialized in Yashwanth Hub against verified TRL 4 baseline.',
    gap: 'Photo, CSV telemetry, and blocker closure evidence logged weekly.',
    owner: 'Yashwanth',
    next_action: 'Log every test run directly in Projects -> Pawan Shakti Workspace.',
    due_date: '2026-11-15',
    status: 'in_progress',
  },
];

const BOM_DATA = [
  { item: 'Planetary Gearbox Assembly (Estimated target)', prototype: 38000, vol50: 18500, vol500: 9800, source: 'Planning Estimate (Quote Pending)' },
  { item: 'Axial Flux PM Generator Assembly (Estimated target)', prototype: 28000, vol50: 15200, vol500: 9200, source: 'Planning Estimate (Quote Pending)' },
  { item: 'Composite / Structural Blades (Upgrading from PLA)', prototype: 19500, vol50: 10400, vol500: 5900, source: 'Target Upgrade Material (Unquoted)' },
  { item: 'Metal Structural Frame (Upgrading from Wood)', prototype: 14000, vol50: 8200, vol500: 4800, source: 'Target Upgrade Material (Unquoted)' },
  { item: 'DAQ & Power Electronics (Tachometer + Load Logger)', prototype: 11000, vol50: 6500, vol500: 4500, source: 'Instrumentation Estimate' },
  { item: 'Bearings & Mechanical Hardware', prototype: 10000, vol50: 5400, vol500: 4200, source: 'Standard Component Estimate' },
];

export const StartupCommandPage: React.FC<{ onNavigate?: (tab: NavigationTab) => void }> = ({
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'v3f' | 'viewer' | 'telemetry' | 'plan15' | 'bom' | 'risks' | 'roadmap'>('v3f');
  const [assessmentItems, setAssessmentItems] = useState<V3FAssessmentItem[]>(INITIAL_V3F_DATA);
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [csvInput, setCsvInput] = useState<string>('');
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [rotorRadiusM, setRotorRadiusM] = useState<number>(0.45);
  const [storedPv, setStoredPv] = useState<StoredPvTelemetrySummary | null>(null);
  const [hoveredBin, setHoveredBin] = useState<PvCurveBin | null>(null);
  const [serialActive, setSerialActive] = useState(false);
  const [serialError, setSerialError] = useState<string | null>(null);
  const serialDisconnectRef = React.useRef<(() => Promise<void>) | null>(null);
  const [mountNow] = useState(() => Date.now());

  useEffect(() => {
    const loadSavedState = async () => {
      const [savedV3f, savedPv] = await Promise.all([
        db.settings.get('v3f_assessment_v2'),
        db.settings.get('pawan_pv_telemetry_v1'),
      ]);
      if (savedV3f?.value && Array.isArray(savedV3f.value) && savedV3f.value.length > 0) {
        setAssessmentItems(savedV3f.value as V3FAssessmentItem[]);
      }
      if (savedPv?.value && typeof savedPv.value === 'object') {
        setStoredPv(savedPv.value as StoredPvTelemetrySummary);
      }
    };
    void loadSavedState();

    const onCloudUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ kind?: string }>)?.detail;
      if (!detail?.kind || detail.kind === 'user_preferences') void loadSavedState();
    };
    window.addEventListener(EXTRA_CLOUD_UPDATE_EVENT, onCloudUpdate);
    const unsubBroadcast = listenExtraBroadcasts((d) => {
      if (d.kind === 'user_preferences') void loadSavedState();
    });
    return () => {
      window.removeEventListener(EXTRA_CLOUD_UPDATE_EVENT, onCloudUpdate);
      unsubBroadcast();
      void serialDisconnectRef.current?.();
    };
  }, []);

  const parsedTelemetry = React.useMemo(
    () => (csvInput.trim() ? parseTelemetryCsv(csvInput, { rotorRadiusM }) : null),
    [csvInput, rotorRadiusM]
  );

  const handleCsvFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvFileName(file.name);
    setCsvInput(text);
  };

  const handleToggleSerialStream = async () => {
    if (serialActive && serialDisconnectRef.current) {
      await serialDisconnectRef.current();
      serialDisconnectRef.current = null;
      setSerialActive(false);
      return;
    }
    setSerialError(null);
    if (!csvInput.trim()) {
      setCsvFileName('live-usb-webserial.csv');
      setCsvInput('time_s,wind_speed_ms,voltage_v,current_a,rpm');
    }
    try {
      const conn = await connectBenchWebSerial({
        baudRate: 115200,
        onLine: (line) => {
          setCsvInput((prev) => `${prev ? `${prev}\n` : 'time_s,wind_speed_ms,voltage_v,current_a,rpm\n'}${line}`);
        },
        onError: (err) => {
          setSerialError(err.message);
          setSerialActive(false);
        },
      });
      serialDisconnectRef.current = conn.disconnect;
      setSerialActive(true);
    } catch (err: any) {
      setSerialError(err?.message || 'Unable to connect WebSerial DAQ.');
    }
  };

  const handleSaveTelemetryEvidence = async () => {
    if (!parsedTelemetry || parsedTelemetry.sampleCount === 0) return;
    const summary: StoredPvTelemetrySummary = {
      capturedAt: new Date().toISOString(),
      fileName: csvFileName || 'bench-daq-run.csv',
      sampleCount: parsedTelemetry.sampleCount,
      durationSec: parsedTelemetry.durationSec,
      sampleRateHz: parsedTelemetry.sampleRateHz,
      meetsV3f1HzRequirement: parsedTelemetry.meetsV3f1HzRequirement,
      cutInWindSpeedMs: parsedTelemetry.cutInWindSpeedMs,
      peakPowerW: parsedTelemetry.peakPowerW,
      peakPowerWindMs: parsedTelemetry.peakPowerWindMs,
      tipSpeedRatioAtPeak: parsedTelemetry.tipSpeedRatioAtPeak,
      pvCurveBins: parsedTelemetry.pvCurveBins,
    };

    await saveSyncedPreference('pawan_pv_telemetry_v1', summary, summary.capturedAt);
    setStoredPv(summary);

    const evidenceSummary = `Captured ${summary.sampleCount} samples (${summary.durationSec}s @ ${summary.sampleRateHz ?? 'unknown'} Hz, file ${summary.fileName}). Peak ${summary.peakPowerW} W at ${summary.peakPowerWindMs ?? '—'} m/s; cut-in ${summary.cutInWindSpeedMs ?? '—'} m/s.`;
    const nextAssessment = assessmentItems.map((item) =>
      item.id === 'v3f-2-2'
        ? {
            ...item,
            score: (summary.meetsV3f1HzRequirement ? 3 : 2) as V3FScore,
            status: (summary.meetsV3f1HzRequirement ? 'verified' : 'in_progress') as V3FAssessmentItem['status'],
            evidence: evidenceSummary,
          }
        : item
    );
    setAssessmentItems(nextAssessment);
    await saveSyncedPreference('v3f_assessment_v2', nextAssessment, summary.capturedAt);

    const expId = generateId();
    const record = {
      id: expId,
      project: 'AgileX PiPER' as const,
      title: `PAWAN SHAKTI Bench P-v Curve (${summary.fileName})`,
      category: 'Test Run' as const,
      status: (summary.meetsV3f1HzRequirement ? 'completed' : 'testing') as 'completed' | 'testing',
      description: evidenceSummary,
      parameters: {
        sample_count: summary.sampleCount,
        sample_rate_hz: summary.sampleRateHz ?? 'unverified',
        peak_power_w: summary.peakPowerW,
        cut_in_wind_ms: summary.cutInWindSpeedMs ?? 'n/a',
        tip_speed_ratio: summary.tipSpeedRatioAtPeak ?? 'n/a',
      },
      tags: ['PAWAN_SHAKTI', 'P-v-Curve', 'DAQ'],
      created_at: summary.capturedAt,
      updated_at: summary.capturedAt,
    };
    await db.robotics_records.put(record);
    // `installWorkspaceSyncHooks()` automatically queues normalized UUID row to `robotics_experiments`
    toast('Saved P-v telemetry run to V3F evidence & synced across devices', 'success');
  };

  const handleDownloadTelemetryReport = () => {
    if (!parsedTelemetry || parsedTelemetry.sampleCount === 0) return;
    const report = {
      exportedAt: new Date().toISOString(),
      project: 'PAWAN SHAKTI',
      fileName: csvFileName || 'bench-daq-run.csv',
      rotorRadiusM,
      analysis: parsedTelemetry,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pawan_shakti_pv_report_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const numericItems = assessmentItems.filter((i) => typeof i.score === 'number');
  const totalScore = numericItems.reduce((sum, item) => sum + (item.score as number), 0);
  const maxPossibleScore = Math.max(1, numericItems.length * 3);
  const scorePercentage = Math.round((totalScore / maxPossibleScore) * 100);

  const handleScoreChange = async (id: string, newScore: V3FScore) => {
    const next = assessmentItems.map((item) =>
      item.id === id
        ? {
            ...item,
            score: newScore,
            status: (newScore === 3 ? 'verified' : newScore === 0 ? 'pending' : 'in_progress') as V3FAssessmentItem['status'],
          }
        : item
    );
    setAssessmentItems(next);
    await saveSyncedPreference('v3f_assessment_v2', next);
  };

  const filteredItems = filterCategory === 'All'
    ? assessmentItems
    : assessmentItems.filter((i) => i.category === filterCategory);

  const categories = Array.from(new Set(assessmentItems.map((i) => i.category)));

  // 90-day TRL 5 Gate (started 6 Nov 2026 -> target 4 Feb 2027)
  const trl5GateDate = new Date('2027-02-04T23:59:59+05:30').getTime();
  const diffDays = Math.max(0, Math.ceil((trl5GateDate - mountNow) / (1000 * 60 * 60 * 24)));

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Grounded Strategic Overview */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="teal" dot>PAWAN SHAKTI Baseline</Badge>
              <Badge variant="amber">Current: TRL 4 Benchtop (Wood/PLA)</Badge>
              <Badge variant="blue">Indian Patent Published</Badge>
              <Badge variant="gray">Funding: Unverified / Draft</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-[var(--hub-ink)] tracking-tight">
              Startup Command Center & V3F Readiness Hub
            </h1>
            <p className="text-sm text-[var(--hub-muted)] max-w-3xl leading-relaxed">
              Verified baseline tracker for PAWAN SHAKTI ("Compact Wind Turbine with Planetary Gears"). Scores below persist locally to Dexie and strictly distinguish verified facts from targets & missing evidence.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-[var(--hub-bg)] p-4 rounded-xl border border-[var(--hub-line)] flex-none">
            <div className="text-center">
              <span className="text-xs text-[var(--hub-muted)] uppercase tracking-wider block font-bold">
                90-Day TRL 5 Gate
              </span>
              <span className="text-2xl font-bold font-heading text-teal-700 dark:text-teal-300">
                04 Feb 2027
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
              <span className="text-2xl font-bold font-heading text-teal-700 dark:text-teal-400">
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
          label="Verified Current TRL"
          value="TRL 4 Only"
          subtext="Target TRL 5 in 90 days"
          icon={<Wind className="w-5 h-5 text-teal-700 dark:text-teal-300" />}
        />
        <StatCard
          label="P-v Telemetry Status"
          value={storedPv ? `${storedPv.peakPowerW} W Peak` : 'Not Captured'}
          subtext={
            storedPv
              ? `${storedPv.sampleCount} samples · ${storedPv.sampleRateHz ?? '?'} Hz (${storedPv.meetsV3f1HzRequirement ? '>=1 Hz OK' : 'needs >=1 Hz'})`
              : 'Need >= 1 Hz closed-loop CSV'
          }
          icon={<Layers className="w-5 h-5 text-blue-700 dark:text-blue-300" />}
        />
        <StatCard
          label="Est. Prototype BOM"
          value="Estimate Only"
          subtext="Supplier quotes pending"
          icon={<IndianRupee className="w-5 h-5 text-amber-800 dark:text-amber-300" />}
        />
        <StatCard
          label="V3F Items Verified (Score 3)"
          value={`${assessmentItems.filter((i) => i.score === 3).length} / ${assessmentItems.length}`}
          subtext="Persisted across sessions"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />}
        />
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center flex-wrap gap-1.5 border-b border-[var(--hub-line)] pb-2.5">
        {[
          { id: 'v3f', label: 'V3F Rubric (12)', icon: ShieldCheck },
          { id: 'viewer', label: '3D Turbine CAD', icon: Box },
          { id: 'telemetry', label: 'Bench P-v Telemetry & Serial DAQ', icon: Activity },
          { id: 'plan15', label: 'Submission Plan', icon: Calendar },
          { id: 'bom', label: 'BOM Economics', icon: IndianRupee },
          { id: 'risks', label: 'Risks & TRL 4', icon: AlertTriangle },
          { id: 'roadmap', label: '90-Day Roadmap', icon: Cpu },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] shadow-xs'
                  : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
          <button
            type="button"
            data-testid="startup-open-universe-btn"
            onClick={() => openUniverseStation('energy', onNavigate)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#C6A46B]/40 bg-[#C6A46B]/10 text-xs font-semibold text-[#C6A46B] hover:bg-[#C6A46B]/20 whitespace-nowrap transition-all cursor-pointer"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Open 3D Studio Bench</span>
          </button>
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
                aria-label="Filter category"
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
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details: ${item.parameter}`}
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
                          <span className="font-bold text-red-700 dark:text-red-400 block mb-1">
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

      {/* TAB 2: BENCH TELEMETRY & WEBSERIAL DAQ ANALYZER */}
      {activeTab === 'telemetry' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--hub-accent)]" />
                  <span>PAWAN SHAKTI Power Curve (P–v) Telemetry &amp; WebSerial DAQ</span>
                </h3>
                <p className="text-xs text-[var(--hub-muted)] mt-1">
                  Upload closed-loop DAQ CSV logs or stream live USB serial packets (<code className="font-mono">time_s,wind_speed_ms,voltage_v,current_a,rpm</code>) to validate V3F item <code className="font-mono">v3f-2-2</code> (&gt;= 1 Hz).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import CSV</span>
                  <input type="file" accept=".csv,.txt" onChange={handleCsvFileUpload} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={handleToggleSerialStream}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer ${
                    serialActive
                      ? 'bg-red-500/15 border-red-500/40 text-red-400'
                      : 'border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] hover:border-[var(--hub-accent)]'
                  }`}
                >
                  <Usb className="w-3.5 h-3.5" />
                  <span>{serialActive ? 'Stop USB Serial' : 'Connect USB Serial DAQ'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvFileName('demo-synthetic-format-template.csv');
                    setCsvInput(SYNTHETIC_DEMO_CSV);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-xs text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                >
                  Load Synthetic Format Sample
                </button>
              </div>
            </div>

            {!isWebSerialSupported() && (
              <p className="text-[11px] text-[var(--hub-muted)]">
                USB WebSerial requires Desktop Chrome or Edge over HTTPS/localhost. CSV upload &amp; paste work on every browser and mobile device.
              </p>
            )}

            {serialError && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-500">
                {serialError}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[var(--hub-ink)]">
                    Raw Bench CSV ({csvFileName || 'paste or upload CSV'})
                  </span>
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--hub-muted)]">
                    <span>Rotor Radius (m):</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="5"
                      value={rotorRadiusM}
                      onChange={(e) => setRotorRadiusM(Number(e.target.value) || 0.45)}
                      className="w-16 px-2 py-0.5 rounded border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] font-mono"
                    />
                  </label>
                </div>
                <textarea
                  rows={8}
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                  placeholder={'time_s,wind_speed_ms,voltage_v,current_a,rpm\n0.0,2.4,2.1,0.3,72\n1.0,3.2,5.8,0.9,138'}
                  className="w-full p-3 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-mono text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
                />
              </div>

              <div className="lg:col-span-7 space-y-3">
                {parsedTelemetry && parsedTelemetry.sampleCount > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                        <div className="text-[10px] text-[var(--hub-muted)] uppercase">Sample Rate</div>
                        <div className="font-mono font-bold text-[var(--hub-ink)]">
                          {parsedTelemetry.sampleRateHz ?? '—'} Hz
                        </div>
                        <Badge variant={parsedTelemetry.meetsV3f1HzRequirement ? 'emerald' : 'amber'}>
                          {parsedTelemetry.meetsV3f1HzRequirement ? '>= 1 Hz Verified' : 'Below V3F Gate'}
                        </Badge>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                        <div className="text-[10px] text-[var(--hub-muted)] uppercase">Peak Power</div>
                        <div className="font-mono font-bold text-[var(--hub-ink)]">{parsedTelemetry.peakPowerW} W</div>
                        <div className="text-[10px] text-[var(--hub-muted)]">@ {parsedTelemetry.peakPowerWindMs ?? '—'} m/s</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                        <div className="text-[10px] text-[var(--hub-muted)] uppercase">Cut-In Speed</div>
                        <div className="font-mono font-bold text-[var(--hub-ink)]">
                          {parsedTelemetry.cutInWindSpeedMs !== null ? `${parsedTelemetry.cutInWindSpeedMs} m/s` : '—'}
                        </div>
                        <div className="text-[10px] text-[var(--hub-muted)]">P &gt;= 0.5 W</div>
                      </div>
                      <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                        <div className="text-[10px] text-[var(--hub-muted)] uppercase">TSR (Peak)</div>
                        <div className="font-mono font-bold text-[var(--hub-ink)]">
                          {parsedTelemetry.tipSpeedRatioAtPeak ?? '—'}
                        </div>
                        <div className="text-[10px] text-[var(--hub-muted)]">
                          Max {parsedTelemetry.maxRpm ?? '—'} RPM
                        </div>
                      </div>
                    </div>

                    {parsedTelemetry.pvCurveBins.length > 0 && (() => {
                      const bins = parsedTelemetry.pvCurveBins;
                      const maxW = Math.max(10, ...bins.map((b) => b.avgPowerW));
                      const minWind = bins[0].windBinMs;
                      const maxWind = Math.max(minWind + 1, bins[bins.length - 1].windBinMs);
                      const pts = bins
                        .map((b) => {
                          const x = 35 + ((b.windBinMs - minWind) / (maxWind - minWind)) * 380;
                          const y = 145 - (b.avgPowerW / maxW) * 120;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        })
                        .join(' ');
                      return (
                        <div className="rounded-xl bg-[#05070D] border border-white/10 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                            <span className="text-white/75">
                              Empirical Power Curve — Wind Speed (m/s) vs Electrical Power (W)
                            </span>
                            {hoveredBin ? (
                              <span className="text-[#3BE8FF]">
                                {hoveredBin.windBinMs} m/s · Avg {hoveredBin.avgPowerW}W · Peak {hoveredBin.peakPowerW}W (n={hoveredBin.samples})
                              </span>
                            ) : (
                              <span className="text-white/45">Hover points to inspect bins</span>
                            )}
                          </div>
                          <svg viewBox="0 0 440 170" className="w-full h-40" role="img" aria-label="Power vs Wind Speed curve">
                            <line x1="35" y1="145" x2="420" y2="145" stroke="#475569" strokeWidth="1" />
                            <line x1="35" y1="20" x2="35" y2="145" stroke="#475569" strokeWidth="1" />
                            <polyline fill="none" stroke="#3BE8FF" strokeWidth="2.5" points={pts} />
                            {bins.map((b) => {
                              const x = 35 + ((b.windBinMs - minWind) / (maxWind - minWind)) * 380;
                              const y = 145 - (b.avgPowerW / maxW) * 120;
                              const active = hoveredBin?.windBinMs === b.windBinMs;
                              return (
                                <g
                                  key={b.windBinMs}
                                  className="cursor-pointer"
                                  onMouseEnter={() => setHoveredBin(b)}
                                  onMouseLeave={() => setHoveredBin(null)}
                                >
                                  <circle cx={x} cy={y} r={active ? 6 : 4} fill={active ? '#3BE8FF' : '#10b981'} />
                                  <text x={x} y="160" textAnchor="middle" fill="#94a3b8" fontSize="9">
                                    {b.windBinMs}
                                  </text>
                                </g>
                              );
                            })}
                            <text x="12" y="30" fill="#94a3b8" fontSize="9">{Math.round(maxW)}W</text>
                          </svg>
                        </div>
                      );
                    })()}

                    {parsedTelemetry.warnings.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-500 space-y-0.5">
                        {parsedTelemetry.warnings.map((w, i) => (
                          <div key={i}>• {w}</div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {csvFileName.includes('demo-synthetic') && (
                        <span className="text-[11px] font-mono text-amber-500 mr-auto">
                          DEMO TEMPLATE — replace with actual DAQ capture before V3F submission
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleDownloadTelemetryReport}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Report JSON</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveTelemetryEvidence}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Attach to V3F Evidence &amp; Save Run</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="h-full min-h-[200px] flex items-center justify-center rounded-xl border border-dashed border-[var(--hub-line)] p-6 text-center text-xs text-[var(--hub-muted)]">
                    Import a bench CSV file or connect a USB WebSerial Arduino/STM32 logger to analyze real power output, RPM, cut-in wind speed, and P–v curve binning.
                  </div>
                )}
              </div>
            </div>
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
                    className="mt-0.5 w-4 h-4 rounded text-teal-700 dark:text-teal-300 cursor-pointer"
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
                      <td className="py-3 px-3 font-mono text-teal-700 dark:text-teal-400">₹{row.vol50.toLocaleString()}</td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">₹{row.vol500.toLocaleString()}</td>
                      <td className="py-3 px-3 text-[var(--hub-muted)]">{row.source}</td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--hub-bg)] font-bold border-t-2 border-[var(--hub-line)] text-sm">
                    <td className="py-3 px-3 text-[var(--hub-ink)]">Total Unit CapEx</td>
                    <td className="py-3 px-3 font-mono text-[var(--hub-ink)]">₹1,20,500</td>
                    <td className="py-3 px-3 font-mono text-teal-700 dark:text-teal-300">₹64,200 (-47%)</td>
                    <td className="py-3 px-3 font-mono text-emerald-700 dark:text-emerald-300">₹38,400 (-68%)</td>
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

      {/* TAB: INTERACTIVE 3D TURBINE CAD & SUB-ASSEMBLY VIEWER */}
      {activeTab === 'viewer' && (
        <div className="space-y-4">
          <Suspense
            fallback={
              <div className="h-[360px] rounded-2xl border border-[var(--hub-line)] bg-[#06080E] flex items-center justify-center text-xs text-slate-400">
                Loading Three.js Wind Turbine CAD Viewer...
              </div>
            }
          >
            <EngineeringModelViewer preset="pawan-turbine" />
          </Suspense>
        </div>
      )}
    </div>
  );
};
