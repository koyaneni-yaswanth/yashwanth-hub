import React, { useState } from 'react';
import {
  GraduationCap,
  BookOpen,
  FileText,
  Award,
  ExternalLink,
  Plus,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Layers,
  Sparkles,
  ChevronRight,
  Copy,
  Check,
} from 'lucide-react';

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

export const LearningCareerPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'skills' | 'papers' | 'cv' | 'goals'>('skills');
  const [copiedCv, setCopiedCv] = useState<string | null>(null);

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
              <GraduationCap className="w-4 h-4 text-teal-400" />
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
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-teal-400">
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
                ? 'bg-[var(--hub-accent)] text-white'
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
                ? 'bg-[var(--hub-accent)] text-white'
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
                ? 'bg-[var(--hub-accent)] text-white'
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
                ? 'bg-[var(--hub-accent)] text-white'
                : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Quarterly Learning Goals</span>
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
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] text-teal-400">
                      {skill.category}
                    </span>
                    <h4 className="text-sm font-bold text-[var(--hub-ink)] mt-2">
                      {skill.name}
                    </h4>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      skill.level === 'Expert'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
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
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : paper.status === 'In Progress'
                            ? 'bg-amber-500/10 text-amber-400'
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
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] text-teal-400">
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
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
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
                        <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
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
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[10px] font-mono font-bold text-teal-400">
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
    </div>
  );
};
