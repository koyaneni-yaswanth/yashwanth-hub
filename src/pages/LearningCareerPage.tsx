import React, { useEffect, useState } from 'react';
import {
  GraduationCap,
  BookOpen,
  FileText,
  Award,
  Plus,
  CheckCircle2,
  Cpu,
  Copy,
  Check,
  Compass,
  Bot,
  ListPlus,
  Trash2,
} from 'lucide-react';
import { db } from '../db';
import { generateId } from '../lib/utils';
import { openUniverseStation } from '../lib/universeConfig';
import { TaskService } from '../services/sync/taskService';
import type { NavigationTab } from '../types';

interface SkillItem {
  id: string;
  category: 'Robotics & Control' | 'Deep-Tech Hardware' | 'AI & ML Systems' | 'Full-Stack Software';
  name: string;
  level: 'Expert' | 'Advanced' | 'Intermediate';
  evidence: string;
}

interface ResearchPaper {
  id: string;
  title: string;
  venue: string;
  status: 'Read' | 'In Progress' | 'To Read';
  relevance: string;
  keyTakeaways?: string;
}

interface LearningGoal {
  id: string;
  title: string;
  quarter: string;
  progress: number;
  status: 'in_progress' | 'completed' | 'planned';
}

interface OpportunityItem {
  id: string;
  title: string;
  organization: string;
  kind: 'Grant' | 'Fellowship' | 'Pilot';
  status: 'Explore' | 'Drafting' | 'Submitted';
  fitSummary: string;
  nextStep: string;
}

const OPPORTUNITIES_STORAGE_KEY = 'yash_opportunities_v1';

const DEFAULT_OPPORTUNITIES: OpportunityItem[] = [
  {
    id: 'opp-anrf-prayas',
    title: 'ANRF / DST NIDHI-PRAYAS Deep-Tech Prototype Grant',
    organization: 'DST / TBI Network India',
    kind: 'Grant',
    status: 'Drafting',
    fitSummary: 'Aligns directly with PAWAN SHAKTI TRL 4->5 compact helical turbine hardware validation & tooling.',
    nextStep: 'Compile instrumented 1 Hz P-v dyno test evidence & BOM cost table.',
  },
  {
    id: 'opp-ros2-fellowship',
    title: 'Robotics & Embodied Autonomy Research Collaboration',
    organization: 'IvLabs / Open Robotics Ecosystem',
    kind: 'Fellowship',
    status: 'Explore',
    fitSummary: 'Showcases AgileX PiPER 6-DOF SocketCAN teleoperation + 3-UAV PX4 + TI AWR2944 radar stack.',
    nextStep: 'Record deterministic URDF workspace trace & publish reproducible ROS 2 launch bundle.',
  },
  {
    id: 'opp-microgrid-pilot',
    title: 'Distributed Hybrid Wind-Solar Campus Pilot',
    organization: 'Industrial & Municipal Microgrids',
    kind: 'Pilot',
    status: 'Explore',
    fitSummary: 'Target low cut-in distributed wind generation paired with existing 48V LiFePO4 storage nodes.',
    nextStep: 'Finalize mounting clearance & mast load calculations in PAWAN SHAKTI CAD viewer.',
  },
];

interface LearningCareerPageProps {
  onNavigate?: (tab: NavigationTab) => void;
}

export const LearningCareerPage: React.FC<LearningCareerPageProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'skills' | 'papers' | 'cv' | 'goals' | 'opportunities'>('skills');
  const [copiedCv, setCopiedCv] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>(DEFAULT_OPPORTUNITIES);
  const [newOppTitle, setNewOppTitle] = useState('');
  const [newOppOrg, setNewOppOrg] = useState('');
  const [newOppKind, setNewOppKind] = useState<OpportunityItem['kind']>('Grant');
  const [newOppFit, setNewOppFit] = useState('');
  const [oppToast, setOppToast] = useState<string | null>(null);

  useEffect(() => {
    void db.settings
      .get(OPPORTUNITIES_STORAGE_KEY)
      .then((row) => {
        if (Array.isArray(row?.value?.items)) {
          setOpportunities(row.value.items as OpportunityItem[]);
        }
      })
      .catch(() => {});
  }, []);

  const persistOpportunities = async (next: OpportunityItem[]) => {
    setOpportunities(next);
    try {
      await db.settings.put({
        key: OPPORTUNITIES_STORAGE_KEY,
        value: { items: next },
        updated_at: new Date().toISOString(),
      });
    } catch {
      /* ignore IndexedDB write fallback */
    }
  };

  const handleAddOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newOppTitle.trim();
    if (!title) return;
    const item: OpportunityItem = {
      id: generateId(),
      title,
      organization: newOppOrg.trim() || 'Target Partner / Jury',
      kind: newOppKind,
      status: 'Explore',
      fitSummary: newOppFit.trim() || 'Custom tracked engineering, grant, or pilot opportunity.',
      nextStep: 'Review eligibility requirements and assign next concrete milestone.',
    };
    await persistOpportunities([item, ...opportunities]);
    setNewOppTitle('');
    setNewOppOrg('');
    setNewOppFit('');
    setOppToast(`Added "${item.title}" to Opportunities Radar.`);
    window.setTimeout(() => setOppToast(null), 3000);
  };

  const handleConvertOpportunityToTask = async (opp: OpportunityItem) => {
    await TaskService.create({
      text: `[${opp.kind}] ${opp.title} — ${opp.nextStep}`,
      notes: `${opp.organization}\n${opp.fitSummary}`,
      area: opp.kind === 'Grant' || opp.kind === 'Pilot' ? 'PAWAN SHAKTI' : 'Career',
      priority: 'high',
      starred: true,
      done: false,
    });
    setOppToast(`Task created for "${opp.title}".`);
    window.setTimeout(() => setOppToast(null), 3000);
  };

  const handleDraftOpportunityWithJarvis = (opp: OpportunityItem) => {
    localStorage.setItem(
      'yash_ai_prefill_prompt',
      `Help me structure an executive proposal / action plan for:\nOpportunity: ${opp.title} (${opp.organization}, ${opp.kind})\nFit: ${opp.fitSummary}\nNext Step: ${opp.nextStep}`
    );
    onNavigate?.('buddy');
  };

  // Skills Matrix
  const [skills] = useState<SkillItem[]>([
    {
      id: 's1',
      category: 'Robotics & Control',
      name: 'ROS 2 (Humble / Iron) & CAN Bus Communication',
      level: 'Expert',
      evidence: 'AgileX PiPER 6-DOF robotic arm integration with custom CAN FD packet protocol.',
    },
    {
      id: 's2',
      category: 'Robotics & Control',
      name: 'Inverse Kinematics & Physics Simulation (MuJoCo / Isaac Sim)',
      level: 'Advanced',
      evidence: 'Digital twin simulation for trajectory planning and collision avoidance.',
    },
    {
      id: 's3',
      category: 'Deep-Tech Hardware',
      name: 'Wind Turbine Aerodynamics & Planetary Gear Train Design',
      level: 'Expert',
      evidence: 'Pawan Shakti V3F: Dual-stage planetary gearbox and custom low-RPM axial flux generator.',
    },
    {
      id: 's4',
      category: 'Deep-Tech Hardware',
      name: 'Power Electronics & Maximum Power Point Tracking (MPPT)',
      level: 'Advanced',
      evidence: 'Designed 48V LiFePO4 battery charging circuit with active rectifier for wind energy.',
    },
    {
      id: 's5',
      category: 'AI & ML Systems',
      name: 'Multi-Model Agent Orchestration & MCP Gateways',
      level: 'Expert',
      evidence: 'Yashwanth Hub AI OS integrating NeoSapien MCP JSON-RPC 2.0 with Gemini, Claude, and GPT-4o.',
    },
    {
      id: 's6',
      category: 'AI & ML Systems',
      name: 'Radar Signal Processing (TI AWR2944 mmWave)',
      level: 'Intermediate',
      evidence: 'Point cloud clustering and velocity extraction for autonomous obstacle avoidance.',
    },
    {
      id: 's7',
      category: 'Full-Stack Software',
      name: 'React 19, TypeScript, Dexie IndexedDB & Supabase RLS',
      level: 'Expert',
      evidence: 'Architected local-first, offline-resilient Yashwanth Hub with bidirectional cloud sync.',
    },
  ]);

  // Research Papers
  const [papers] = useState<ResearchPaper[]>([
    {
      id: 'p1',
      title: 'Aerodynamic Performance and Wake Characteristics of Small-Scale Vertical and Horizontal Axis Wind Turbines',
      venue: 'Renewable Energy Journal (Elsevier)',
      status: 'Read',
      relevance: 'Directly applicable to Pawan Shakti blade tip speed ratio (TSR) and cut-in wind optimization.',
      keyTakeaways: 'Dual-stage planetary gears mitigate cut-in inertia by 23% under turbulent urban wind regimes.',
    },
    {
      id: 'p2',
      title: 'Real-Time Trajectory Generation for 6-DOF Robotic Manipulators in Dynamic Environments',
      venue: 'IEEE Transactions on Robotics (T-RO)',
      status: 'In Progress',
      relevance: 'JARVIS-PiPER pick-and-place precision under non-zero payload tolerances.',
      keyTakeaways: 'Quintic polynomial spline interpolation ensures smooth jerk-free joint acceleration.',
    },
    {
      id: 'p3',
      title: 'Mesh Network Telemetry and Consensus for Decentralized Multi-UAV Swarms',
      venue: 'AIAA Journal of Aerospace Information Systems',
      status: 'To Read',
      relevance: '3-Drone Swarm communication via SIYI HM30 dual-link radio mesh.',
      keyTakeaways: '',
    },
  ]);

  // Learning Goals
  const [goals] = useState<LearningGoal[]>([
    {
      id: 'g1',
      title: 'Finalize Pawan Shakti V3F prototype test protocols for ANRF ₹25L grant readiness',
      quarter: 'Q4 2026',
      progress: 90,
      status: 'in_progress',
    },
    {
      id: 'g2',
      title: 'Deploy hardware safety interlock and ROS 2 CAN bridge for AgileX PiPER in lab',
      quarter: 'Q4 2026',
      progress: 85,
      status: 'in_progress',
    },
    {
      id: 'g3',
      title: 'Master FEA thermal dissipation modeling for custom axial flux stator windings',
      quarter: 'Q1 2027',
      progress: 40,
      status: 'planned',
    },
  ]);

  const handleCopyCv = (version: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedCv(version);
    setTimeout(() => setCopiedCv(null), 2500);
  };

  const cvProfiles = [
    {
      id: 'founder',
      title: 'Deep-Tech Hardware Founder & Systems Engineer',
      badge: 'Venture & Grants',
      summary:
        'Yashwanth Koyaneni — Founder of Pawan Shakti. VNIT Nagpur graduate. Deep-tech innovator specializing in distributed micro-wind generation, high-efficiency planetary transmissions, and autonomous robotics systems. Experienced in product design from CAD/FEA through prototyping and field commissioning.',
      highlights: [
        'Founder of Pawan Shakti: Designed dual-planetary micro-wind turbine V3F with 2.2 m/s cut-in speed.',
        'Robotics Lead at IvLabs: Built autonomous UAV swarms and 6-DOF manipulator teleoperation pipelines.',
        'Commissioning Engineer at MG Automation: Automated industrial PLC controls and drive systems.',
      ],
    },
    {
      id: 'robotics',
      title: 'Robotics & Control Systems Specialist',
      badge: 'Academic & Fellowships',
      summary:
        'Robotics systems engineer with deep expertise in ROS 2, CAN bus protocols, real-time inverse kinematics, and multi-sensor fusion (77GHz mmWave radar + vision). Lead developer of JARVIS-PiPER autonomous manipulator and 3-UAV mesh swarm.',
      highlights: [
        'Engineered CAN FD packet protocol for AgileX PiPER 6-DOF robotic arm with sub-5ms latency.',
        'Designed decentralized mesh telemetry protocol for 3-drone swarm using SIYI HM30 transceivers.',
        'Authored digital twin simulation environment in MuJoCo and NVIDIA Isaac Sim.',
      ],
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fade-in">
      {/* Top Banner Header */}
      <div className="rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-[var(--hub-card)] to-[var(--hub-card-hover)] border border-[var(--hub-line)] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--hub-accent)]">
              <GraduationCap className="w-4 h-4 text-teal-700 dark:text-teal-300" />
              <span>Professional Growth & Mastery</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--hub-ink)] font-heading mt-1">
              Learning & Career Command Hub
            </h1>
            <p className="text-xs sm:text-sm text-[var(--hub-muted)] mt-1">
              Manage technical skill competencies, academic research literature, CV profiles, and learning goals.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-teal-700 dark:text-teal-300">
              VNIT Nagpur Alumni • Deep-Tech Founder
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-2 mt-6 pt-4 border-t border-[var(--hub-line)] overflow-x-auto">
          <button
            onClick={() => setActiveTab('skills')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              activeTab === 'skills'
                ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Technical Skills Matrix</span>
          </button>
          <button
            onClick={() => setActiveTab('papers')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              activeTab === 'papers'
                ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Research Papers & Literature</span>
          </button>
          <button
            onClick={() => setActiveTab('cv')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              activeTab === 'cv'
                ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>CV & Founder Profiles</span>
          </button>
          <button
            onClick={() => setActiveTab('goals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              activeTab === 'goals'
                ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Quarterly Learning Goals</span>
          </button>
          <button
            onClick={() => setActiveTab('opportunities')}
            data-testid="tab-opportunities"
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              activeTab === 'opportunities'
                ? 'bg-[var(--hub-accent)] text-[var(--hub-accent-ink)]'
                : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Opportunities & Grants</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Skills Matrix */}
      {activeTab === 'skills' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--hub-ink)] font-heading">
              Technical Competencies & Verified Experience
            </h3>
            <span className="text-xs text-[var(--hub-muted)]">{skills.length} verified skills</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="p-5 rounded-2xl bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] text-teal-700 dark:text-teal-300">
                      {skill.category}
                    </span>
                    <h4 className="text-sm font-bold text-[var(--hub-ink)] mt-2">
                      {skill.name}
                    </h4>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      skill.level === 'Expert'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                        : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20'
                    }`}
                  >
                    {skill.level}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-muted)] leading-relaxed">
                  <span className="font-semibold text-[var(--hub-ink)]">Proof of Work: </span>
                  {skill.evidence}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Research Papers */}
      {activeTab === 'papers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--hub-ink)] font-heading">
              Deep-Tech Research & Literature Vault
            </h3>
            <span className="text-xs text-[var(--hub-muted)]">{papers.length} publications tracked</span>
          </div>

          <div className="space-y-3">
            {papers.map((paper) => (
              <div
                key={paper.id}
                className="p-5 rounded-2xl bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          paper.status === 'Read'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : paper.status === 'In Progress'
                            ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
                            : 'bg-[var(--hub-bg)] text-[var(--hub-muted)]'
                        }`}
                      >
                        {paper.status}
                      </span>
                      <span className="text-xs text-[var(--hub-muted)]">{paper.venue}</span>
                    </div>
                    <h4 className="text-sm font-bold text-[var(--hub-ink)] mt-2">
                      {paper.title}
                    </h4>
                    <p className="text-xs text-[var(--hub-muted)] mt-1">
                      <span className="font-semibold text-[var(--hub-ink)]">Relevance: </span>
                      {paper.relevance}
                    </p>
                  </div>
                </div>

                {paper.keyTakeaways && (
                  <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-teal-300">
                    <span className="font-bold text-[var(--hub-ink)]">Core Engineering Takeaway: </span>
                    {paper.keyTakeaways}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: CV Profiles */}
      {activeTab === 'cv' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--hub-ink)] font-heading">
              Tailored Executive CV & Founder Briefs
            </h3>
            <span className="text-xs text-[var(--hub-muted)]">Instant copy for pitch decks and grants</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cvProfiles.map((cv) => (
              <div
                key={cv.id}
                className="p-6 rounded-2xl bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] text-teal-700 dark:text-teal-300">
                      {cv.badge}
                    </span>
                    <button
                      onClick={() =>
                        handleCopyCv(
                          cv.id,
                          `${cv.title}\n\n${cv.summary}\n\nHighlights:\n${cv.highlights
                            .map((h) => `- ${h}`)
                            .join('\n')}`
                        )
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] hover:border-[var(--hub-accent)] transition-colors cursor-pointer"
                    >
                      {copiedCv === cv.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-300" />
                          <span className="text-emerald-700 dark:text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Markdown</span>
                        </>
                      )}
                    </button>
                  </div>

                  <h4 className="text-base font-bold text-[var(--hub-ink)] font-heading">
                    {cv.title}
                  </h4>

                  <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                    {cv.summary}
                  </p>

                  <div className="space-y-1.5 pt-2">
                    <div className="text-[11px] font-bold text-[var(--hub-ink)]">Key Highlights:</div>
                    {cv.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-[var(--hub-muted)]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-300 shrink-0 mt-0.5" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Quarterly Learning Goals */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[var(--hub-ink)] font-heading">
              Founder Sprint & Learning Milestones
            </h3>
            <span className="text-xs text-[var(--hub-muted)]">Continuous technical acceleration</span>
          </div>

          <div className="space-y-3">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="p-5 rounded-2xl bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[10px] font-mono font-bold text-teal-700 dark:text-teal-300">
                      {goal.quarter}
                    </span>
                    <h4 className="text-sm font-bold text-[var(--hub-ink)]">
                      {goal.title}
                    </h4>
                  </div>
                  <span className="text-xs font-mono font-bold text-[var(--hub-ink)]">
                    {goal.progress}%
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-[var(--hub-accent)] rounded-full transition-all duration-500"
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Opportunities & Grants Radar */}
      {activeTab === 'opportunities' && (
        <div className="space-y-4" data-testid="opportunities-radar-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[var(--hub-ink)] font-heading">
                Opportunities, Grants & Collaboration Radar
              </h3>
              <p className="text-xs text-[var(--hub-muted)]">
                Track grants, hardware pilots & fellowships locally and convert any next step into an actionable task or JARVIS proposal draft.
              </p>
            </div>
            <span className="text-xs font-mono text-[var(--hub-muted)]">{opportunities.length} tracked</span>
          </div>

          {oppToast && (
            <div className="px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              {oppToast}
            </div>
          )}

          <form
            onSubmit={(e) => void handleAddOpportunity(e)}
            className="p-4 rounded-2xl bg-[var(--hub-card)] border border-[var(--hub-line)] grid grid-cols-1 sm:grid-cols-12 gap-2.5"
          >
            <input
              type="text"
              value={newOppTitle}
              onChange={(e) => setNewOppTitle(e.target.value)}
              placeholder="Opportunity, grant, or RFP title..."
              className="sm:col-span-4 px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]"
            />
            <input
              type="text"
              value={newOppOrg}
              onChange={(e) => setNewOppOrg(e.target.value)}
              placeholder="Organization / program..."
              className="sm:col-span-3 px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]"
            />
            <select
              value={newOppKind}
              onChange={(e) => setNewOppKind(e.target.value as OpportunityItem['kind'])}
              aria-label="Opportunity category"
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]"
            >
              <option value="Grant">Grant</option>
              <option value="Fellowship">Fellowship</option>
              <option value="Pilot">Pilot</option>
            </select>
            <input
              type="text"
              value={newOppFit}
              onChange={(e) => setNewOppFit(e.target.value)}
              placeholder="Strategic fit / note..."
              className="sm:col-span-2 px-3 py-2 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]"
            />
            <button
              type="submit"
              disabled={!newOppTitle.trim()}
              className="sm:col-span-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-bold cursor-pointer disabled:opacity-45"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </form>

          <div className="space-y-3">
            {opportunities.map((opp) => (
              <div
                key={opp.id}
                className="p-5 rounded-2xl bg-[var(--hub-card)] border border-[var(--hub-line)] shadow-sm space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] text-teal-700 dark:text-teal-300">
                        {opp.kind}
                      </span>
                      <span className="text-xs text-[var(--hub-muted)]">{opp.organization}</span>
                    </div>
                    <h4 className="text-sm font-bold text-[var(--hub-ink)]">{opp.title}</h4>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={opp.status}
                      aria-label={`Status for ${opp.title}`}
                      onChange={(e) =>
                        void persistOpportunities(
                          opportunities.map((item) =>
                            item.id === opp.id
                              ? { ...item, status: e.target.value as OpportunityItem['status'] }
                              : item
                          )
                        )
                      }
                      className="px-2.5 py-1 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[11px] font-semibold text-[var(--hub-ink)]"
                    >
                      <option value="Explore">Explore</option>
                      <option value="Drafting">Drafting</option>
                      <option value="Submitted">Submitted</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        void persistOpportunities(opportunities.filter((item) => item.id !== opp.id))
                      }
                      aria-label={`Remove ${opp.title}`}
                      className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-rose-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[var(--hub-muted)] leading-relaxed">{opp.fitSummary}</p>
                <div className="p-3 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]">
                  <span className="font-semibold">Next Action: </span>
                  {opp.nextStep}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleConvertOpportunityToTask(opp)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-xs font-bold cursor-pointer"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    <span>Create Action Task</span>
                  </button>
                  {onNavigate && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDraftOpportunityWithJarvis(opp)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] hover:border-[var(--hub-accent)] text-xs font-semibold text-[var(--hub-ink)] cursor-pointer"
                      >
                        <Bot className="w-3.5 h-3.5 text-teal-600 dark:text-teal-300" />
                        <span>Draft with JARVIS</span>
                      </button>
                      <button
                        type="button"
                        data-testid="opportunity-open-3d-btn"
                        onClick={() => {
                          const target = /wind|pawan|cleantech|nidhi|seed/i.test(`${opp.title} ${opp.fitSummary}`)
                            ? 'energy'
                            : /robot|piper|drone|swarm|radar/i.test(`${opp.title} ${opp.fitSummary}`)
                            ? 'robotics'
                            : 'projects';
                          openUniverseStation(target, onNavigate);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#C6A46B]/40 bg-[#C6A46B]/10 text-[#C6A46B] hover:bg-[#C6A46B]/20 text-xs font-semibold cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>Open 3D Demo</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
