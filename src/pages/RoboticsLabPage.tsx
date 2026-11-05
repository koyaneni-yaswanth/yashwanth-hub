import React, { useState } from 'react';
import {
  Bot,
  Cpu,
  Layers,
  Radio,
  Activity,
  Terminal,
  FileCode,
  HardDrive,
  CheckCircle2,
  AlertCircle,
  Plus,
  Play,
  Share2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import type { RoboticsProjectRecord } from '../types';

const INITIAL_ROBOTICS_PROJECTS: RoboticsProjectRecord[] = [
  // AgileX PiPER / JARVIS
  {
    id: 'rob-piper-1',
    project: 'AgileX PiPER',
    title: 'ROS 2 Humble CAN Bus Driver & Joint Trajectory Controller',
    category: 'Software',
    status: 'active',
    description: 'SocketCAN interface running on Ubuntu 22.04 with ros2_control for 6-DOF arm and parallel gripper.',
    parameters: {
      framework: 'ROS 2 Humble',
      interface: 'SocketCAN (can0 @ 1 Mbps)',
      control_frequency: '500 Hz',
      gripper_force_limit: '15 N',
    },
    tags: ['ROS 2', 'CAN', 'PiPER', 'C++'],
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-05T14:30:00Z',
  },
  {
    id: 'rob-piper-2',
    project: 'AgileX PiPER',
    title: 'MuJoCo & NVIDIA Isaac Sim Physics Digital Twin',
    category: 'Simulation',
    status: 'active',
    description: 'URDF with accurate inertial tensors and mesh collisions imported into Isaac Sim 4.0 for synthetic camera domain randomization.',
    parameters: {
      physics_engine: 'PhysX 5 / MuJoCo 3.1',
      domain_randomization: 'Lighting, textures, table friction',
      synthetic_camera: 'RGB-D 1280x720 @ 60 FPS',
    },
    tags: ['Isaac Sim', 'MuJoCo', 'URDF', 'Synthetic Data'],
    created_at: '2026-11-02T11:00:00Z',
    updated_at: '2026-11-05T16:00:00Z',
  },
  {
    id: 'rob-piper-3',
    project: 'AgileX PiPER',
    title: 'Pika Vision-Language-Action (VLA) Model Policy Integration',
    category: 'Hardware',
    status: 'testing',
    description: 'Fine-tuned open-source VLA model mapping user language instruction to end-effector 6D pose targets.',
    parameters: {
      inference_hardware: 'NVIDIA RTX 4090 / Jetson AGX Orin',
      latency: '42 ms',
      success_rate: '86% on pick-and-place',
    },
    tags: ['VLA', 'Pika', 'AI Agent', 'Inference'],
    created_at: '2026-11-03T09:00:00Z',
    updated_at: '2026-11-05T18:00:00Z',
  },

  // 3-Drone Swarm
  {
    id: 'rob-drone-1',
    project: '3-Drone Swarm',
    title: 'Mesh Network & SIYI HM30 Ground Station Telemetry',
    category: 'Hardware',
    status: 'active',
    description: 'Triple companion Jetson Orin Nano nodes communicating over ad-hoc WiFi 6 mesh with SIYI HM30 30km dual-link telemetry.',
    parameters: {
      drones_count: 3,
      telemetry_link: 'SIYI HM30 (5.8 GHz & 2.4 GHz)',
      companion_pc: 'Jetson Orin Nano 8GB',
      flight_controller: 'Pixhawk 6X / PX4 v1.14',
    },
    tags: ['Drones', 'Swarm', 'SIYI HM30', 'PX4'],
    created_at: '2026-11-01T14:00:00Z',
    updated_at: '2026-11-04T12:00:00Z',
  },
  {
    id: 'rob-drone-2',
    project: '3-Drone Swarm',
    title: 'Gazebo Garden multi-UAV SITL Simulation Benchmark',
    category: 'Simulation',
    status: 'active',
    description: 'Software-In-The-Loop (SITL) simulating leader-follower triangle formation flight with collision avoidance.',
    parameters: {
      simulator: 'Gazebo Garden + PX4 SITL',
      formation: 'Dynamic Triangle / V-Formation',
      spacing: '2.5 meters',
    },
    tags: ['SITL', 'Gazebo', 'PX4', 'ROS 2'],
    created_at: '2026-11-02T16:00:00Z',
    updated_at: '2026-11-05T11:00:00Z',
  },

  // AWR2944 mmWave Tracking
  {
    id: 'rob-radar-1',
    project: 'AWR2944 mmWave',
    title: 'TI mmWave SDK 4.x Firmware & Chirp Configuration',
    category: 'Software',
    status: 'active',
    description: '77 GHz FMCW radar EVM configured with 4 TX and 4 RX antennas for 3D elevation and azimuth point clouds.',
    parameters: {
      sdk_version: 'TI MMWAVE-L-SDK v4.4.1',
      frequency_band: '76-81 GHz (FMCW)',
      max_range: '50 meters',
      range_resolution: '0.14 meters',
    },
    tags: ['mmWave', 'AWR2944', 'TI SDK', 'Radar'],
    created_at: '2026-11-03T13:00:00Z',
    updated_at: '2026-11-05T17:00:00Z',
  },
  {
    id: 'rob-radar-2',
    project: 'AWR2944 mmWave',
    title: 'UART Raw Point Cloud Streamer & Extended Kalman Filter (EKF)',
    category: 'Telemetry',
    status: 'testing',
    description: 'High-speed UART streamer into ROS 2 node publishing sensor_msgs/PointCloud2 with cluster tracking.',
    parameters: {
      uart_baudrate: '921600 bps',
      publish_rate: '20 Hz',
      cluster_algorithm: 'DBSCAN + GNN Tracker',
    },
    tags: ['UART', 'EKF', 'Point Cloud', 'Clustering'],
    created_at: '2026-11-04T15:00:00Z',
    updated_at: '2026-11-05T19:30:00Z',
  },
];

export const RoboticsLabPage: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<'All' | 'AgileX PiPER' | '3-Drone Swarm' | 'AWR2944 mmWave'>('All');
  const [records, setRecords] = useState<RoboticsProjectRecord[]>(INITIAL_ROBOTICS_PROJECTS);
  const [expandedId, setExpandedId] = useState<string | null>('rob-piper-1');

  const filtered = selectedProject === 'All'
    ? records
    : records.filter((r) => r.project === selectedProject);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="teal" dot>Advanced Autonomous Systems</Badge>
              <Badge variant="blue">ROS 2 Humble / Isaac Sim</Badge>
              <Badge variant="purple">VLA Multimodal AI</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-[var(--hub-ink)] tracking-tight">
              Robotics Lab & Embedded Systems Hub
            </h1>
            <p className="text-sm text-[var(--hub-muted)] max-w-3xl leading-relaxed">
              Unified engineering workspace managing Yaswanth's robotics initiatives: AgileX PiPER robotic arm manipulation, 3-Drone autonomous mesh swarm, and TI AWR2944 77GHz mmWave radar perception.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <button
              onClick={() => {}}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Experiment</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="AgileX PiPER 6-DOF"
          value="500 Hz CAN"
          subtext="Isaac Sim + VLA Policy"
          icon={<Bot className="w-5 h-5 text-indigo-600" />}
        />
        <StatCard
          label="Drone Swarm Mesh"
          value="3 Nodes"
          subtext="SIYI HM30 30km Link"
          icon={<Radio className="w-5 h-5 text-teal-600" />}
        />
        <StatCard
          label="mmWave Radar"
          value="77 GHz FMCW"
          subtext="0.14m Range Resolution"
          icon={<Activity className="w-5 h-5 text-purple-600" />}
        />
        <StatCard
          label="Active Experiments"
          value={records.filter((r) => r.status === 'active' || r.status === 'testing').length}
          subtext="Documented and verified"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        />
      </div>

      {/* Project Selector Pills */}
      <div className="flex items-center gap-2 border-b border-[var(--hub-line)] pb-2 overflow-x-auto">
        {[
          { id: 'All', label: 'All Projects', icon: Layers },
          { id: 'AgileX PiPER', label: 'AgileX PiPER Arm (JARVIS)', icon: Bot },
          { id: '3-Drone Swarm', label: '3-Drone Autonomous Swarm', icon: Radio },
          { id: 'AWR2944 mmWave', label: 'AWR2944 mmWave Radar', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = selectedProject === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedProject(tab.id as any)}
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

      {/* Records & Subsystems List */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const isExpanded = expandedId === item.id;
          return (
            <div
              key={item.id}
              className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl overflow-hidden shadow-xs hover:border-[var(--hub-accent)] transition-all"
            >
              <div
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
              >
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.project === 'AgileX PiPER' ? 'blue' : item.project === '3-Drone Swarm' ? 'teal' : 'purple'}>
                      {item.project}
                    </Badge>
                    <Badge variant="gray">{item.category}</Badge>
                    <Badge variant={item.status === 'active' ? 'emerald' : item.status === 'testing' ? 'amber' : 'gray'} dot>
                      {item.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-bold text-[var(--hub-ink)]">{item.title}</h3>
                  <p className="text-xs text-[var(--hub-muted)] line-clamp-1">{item.description}</p>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-[var(--hub-muted)]">
                  <span>Updated {item.updated_at.slice(0, 10)}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="p-4 bg-[var(--hub-bg)]/40 border-t border-[var(--hub-line)] text-xs space-y-3">
                  <p className="text-[var(--hub-ink)] leading-relaxed">{item.description}</p>

                  {item.parameters && (
                    <div className="p-3 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] space-y-1.5">
                      <span className="font-bold text-[var(--hub-ink)] block text-xs uppercase tracking-wider">
                        Hardware & Software Telemetry Configuration:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                        {Object.entries(item.parameters).map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between p-1.5 rounded bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                            <span className="text-[var(--hub-muted)] capitalize">{k.replace(/_/g, ' ')}:</span>
                            <span className="text-[var(--hub-ink)] font-semibold">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.tags && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {item.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-md bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[10px] text-[var(--hub-muted)] font-mono">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
