import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bot,
  Radio,
  Activity,
  CheckCircle2,
  Plus,
  Layers,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import { db } from '../db';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { generateId } from '../lib/utils';
import { SyncQueueService } from '../services/sync/syncQueueService';
import type { RoboticsProjectRecord } from '../types';

const INITIAL_ROBOTICS_BASELINES: RoboticsProjectRecord[] = [
  {
    id: 'rob-piper-1',
    project: 'AgileX PiPER',
    title: 'ROS 2 Humble SocketCAN Driver & Joint Trajectory Baseline Spec',
    category: 'Software',
    status: 'planning',
    description: 'Reference configuration for 6-DOF arm SocketCAN bring-up on Ubuntu 22.04 with ros2_control. Confirm local hardware bench runs via Log Experiment.',
    parameters: {
      framework: 'ROS 2 Humble (Target)',
      interface: 'SocketCAN can0 @ 1 Mbps (Target)',
      safety_note: 'Verify workspace e-stop before powering arm joints',
    },
    tags: ['ROS2', 'CAN', 'PiPER', 'Baseline-Spec'],
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-05T14:30:00Z',
  },
  {
    id: 'rob-drone-1',
    project: '3-Drone Swarm',
    title: 'Mesh Telemetry & PX4 Companion Architecture Reference',
    category: 'Hardware',
    status: 'planning',
    description: 'Target companion node stack (Jetson Orin Nano + Pixhawk/PX4 + SIYI HM30 link). Live field flight logs pending upload.',
    parameters: {
      nodes: '3 UAVs (Planned)',
      link: 'SIYI HM30 Dual Band (Hardware Spec)',
      telemetry_status: 'Unconnected in browser — log flight trials manually',
    },
    tags: ['Drones', 'Swarm', 'PX4', 'Baseline-Spec'],
    created_at: '2026-11-01T14:00:00Z',
    updated_at: '2026-11-04T12:00:00Z',
  },
  {
    id: 'rob-radar-1',
    project: 'AWR2944 mmWave',
    title: 'TI AWR2944 77 GHz FMCW Radar Perception Pipeline Spec',
    category: 'Software',
    status: 'planning',
    description: 'Range-Doppler / point-cloud extraction pipeline reference for AWR2944 evaluation module.',
    parameters: {
      band: '77 GHz FMCW (Hardware Spec)',
      capture_status: 'No captured radar frames attached to cloud DB yet',
    },
    tags: ['AWR2944', 'mmWave', 'Perception', 'Baseline-Spec'],
    created_at: '2026-11-02T10:00:00Z',
    updated_at: '2026-11-05T10:00:00Z',
  },
];

export const RoboticsLabPage: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<'All' | 'AgileX PiPER' | '3-Drone Swarm' | 'AWR2944 mmWave'>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);

  // Log Experiment Form
  const [formProject, setFormProject] = useState<RoboticsProjectRecord['project']>('AgileX PiPER');
  const [formCategory, setFormCategory] = useState<RoboticsProjectRecord['category']>('Test Run');
  const [formStatus, setFormStatus] = useState<RoboticsProjectRecord['status']>('active');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formParametersRaw, setFormParametersRaw] = useState('');
  const [formTagsRaw, setFormTagsRaw] = useState('');
  const [eStopVerified, setEStopVerified] = useState(false);

  const records = useLiveQuery(
    () => db.robotics_records.orderBy('created_at').reverse().toArray(),
    []
  ) || [];

  // Initialize non-destructive baseline specs once if robotics_records is empty
  useEffect(() => {
    db.settings.get('robotics_baselines_seeded_v2').then(async (flag) => {
      if (!flag) {
        const count = await db.robotics_records.count();
        if (count === 0) {
          await db.robotics_records.bulkPut(INITIAL_ROBOTICS_BASELINES);
        }
        await db.settings.put({
          key: 'robotics_baselines_seeded_v2',
          value: true,
          updated_at: new Date().toISOString(),
        });
      }
    });
  }, []);

  const filtered = selectedProject === 'All'
    ? records
    : records.filter((r) => r.project === selectedProject);

  const handleSaveExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDescription.trim()) return;

    const parsedParams: Record<string, any> = {
      safety_checklist_confirmed: eStopVerified ? 'Verified before test' : 'Not marked (software/spec entry)',
    };

    for (const line of formParametersRaw.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const k = line.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_');
        const v = line.slice(idx + 1).trim();
        if (k && v) parsedParams[k] = v;
      }
    }

    const now = new Date().toISOString();
    const record: RoboticsProjectRecord = {
      id: generateId(),
      project: formProject,
      title: formTitle.trim(),
      category: formCategory,
      description: formDescription.trim(),
      status: formStatus,
      parameters: parsedParams,
      tags: formTagsRaw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      created_at: now,
      updated_at: now,
    };

    await db.robotics_records.add(record);
    SyncQueueService.enqueueChange('robotics_experiments', record.id, 'INSERT', record).catch(() => {});

    setIsLogOpen(false);
    setFormTitle('');
    setFormDescription('');
    setFormParametersRaw('');
    setFormTagsRaw('');
    setEStopVerified(false);
  };

  const handleStatusChange = async (id: string, nextStatus: RoboticsProjectRecord['status']) => {
    const now = new Date().toISOString();
    await db.robotics_records.update(id, { status: nextStatus, updated_at: now });
    const updated = await db.robotics_records.get(id);
    if (updated) {
      SyncQueueService.enqueueChange('robotics_experiments', id, 'UPDATE', updated).catch(() => {});
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="teal" dot>Persistent Robotics Logbook</Badge>
              <Badge variant="blue">AgileX PiPER • 3-Drone Swarm • AWR2944</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-[var(--hub-ink)] tracking-tight">
              Robotics Lab & Experiments Log
            </h1>
            <p className="text-sm text-[var(--hub-muted)] max-w-3xl leading-relaxed">
              Persistent hardware & software experiment logbook for PiPER manipulation, 3-drone swarm coordination, and TI AWR2944 mmWave perception.
            </p>
          </div>

          <button
            onClick={() => setIsLogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start lg:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Experiment</span>
          </button>
        </div>
      </div>

      {/* Honest Telemetry Boundary Notice */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Measured vs Baseline Spec Notice: </span>
          Live ROS 2 / SocketCAN / PX4 / mmWave hardware streams are not connected to this browser session. Reference specs are labeled{' '}
          <code className="font-mono">Baseline-Spec</code>; log real bench measurements explicitly via <strong>Log Experiment</strong>.
        </div>
      </div>

      {/* KPI Stats (Computed strictly from persisted records) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="AgileX PiPER Records"
          value={records.filter((r) => r.project === 'AgileX PiPER').length}
          subtext="Persisted entries"
          icon={<Bot className="w-5 h-5 text-indigo-600" />}
        />
        <StatCard
          label="3-Drone Swarm Records"
          value={records.filter((r) => r.project === '3-Drone Swarm').length}
          subtext="Persisted entries"
          icon={<Radio className="w-5 h-5 text-teal-600" />}
        />
        <StatCard
          label="AWR2944 mmWave Records"
          value={records.filter((r) => r.project === 'AWR2944 mmWave').length}
          subtext="Persisted entries"
          icon={<Activity className="w-5 h-5 text-purple-600" />}
        />
        <StatCard
          label="Verified / Completed"
          value={records.filter((r) => r.status === 'completed' || r.status === 'testing').length}
          subtext={`Out of ${records.length} total logs`}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
        />
      </div>

      {/* Project Filter Pills */}
      <div className="flex items-center gap-2 border-b border-[var(--hub-line)] pb-2 overflow-x-auto">
        {[
          { id: 'All', label: 'All Projects', icon: Layers },
          { id: 'AgileX PiPER', label: 'AgileX PiPER', icon: Bot },
          { id: '3-Drone Swarm', label: '3-Drone Swarm', icon: Radio },
          { id: 'AWR2944 mmWave', label: 'AWR2944 mmWave', icon: Activity },
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

      {/* Persisted Experiment Cards */}
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
                    <Badge
                      variant={
                        item.status === 'completed' || item.status === 'active'
                          ? 'emerald'
                          : item.status === 'testing'
                          ? 'amber'
                          : item.status === 'blocked'
                          ? 'red'
                          : 'gray'
                      }
                      dot
                    >
                      {item.status.toUpperCase()}
                    </Badge>
                  </div>
                  <h3 className="text-sm font-bold text-[var(--hub-ink)]">{item.title}</h3>
                  <p className="text-xs text-[var(--hub-muted)] line-clamp-1">{item.description}</p>
                </div>

                <div className="text-xs font-medium text-[var(--hub-muted)]">
                  Updated {item.updated_at.slice(0, 10)}
                </div>
              </div>

              {isExpanded && (
                <div className="p-4 bg-[var(--hub-bg)]/40 border-t border-[var(--hub-line)] text-xs space-y-3">
                  <p className="text-[var(--hub-ink)] leading-relaxed">{item.description}</p>

                  {item.parameters && Object.keys(item.parameters).length > 0 && (
                    <div className="p-3 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] space-y-1.5">
                      <span className="font-bold text-[var(--hub-ink)] block text-xs uppercase tracking-wider">
                        Logged Parameters & Bench Configuration:
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

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(item.tags || []).map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-md bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[10px] text-[var(--hub-muted)] font-mono">
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['active', 'testing', 'completed', 'blocked'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => handleStatusChange(item.id, st)}
                          className={`px-2 py-1 rounded border text-[10px] font-semibold cursor-pointer ${
                            item.status === st
                              ? 'bg-[var(--hub-accent)] text-white border-[var(--hub-accent)]'
                              : 'border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Log Experiment Modal */}
      <Modal isOpen={isLogOpen} onClose={() => setIsLogOpen(false)} title="Log Robotics Experiment / Decision">
        <form onSubmit={handleSaveExperiment} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-[var(--hub-ink)] mb-1">System / Project</label>
              <select
                value={formProject}
                onChange={(e) => setFormProject(e.target.value as RoboticsProjectRecord['project'])}
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              >
                <option value="AgileX PiPER">AgileX PiPER</option>
                <option value="3-Drone Swarm">3-Drone Swarm</option>
                <option value="AWR2944 mmWave">AWR2944 mmWave</option>
                <option value="General">General</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-[var(--hub-ink)] mb-1">Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as RoboticsProjectRecord['category'])}
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              >
                <option value="Test Run">Test Run</option>
                <option value="Hardware">Hardware</option>
                <option value="Software">Software</option>
                <option value="Simulation">Simulation</option>
                <option value="Telemetry">Telemetry</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-[var(--hub-ink)] mb-1">Status</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as RoboticsProjectRecord['status'])}
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="testing">Testing</option>
                <option value="completed">Completed</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Experiment / Run Title *</label>
            <input
              type="text"
              required
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. PiPER Joint 1-6 Zero-Gravity Compensation Bring-Up"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Measured Observations / Outcome *</label>
            <textarea
              rows={3}
              required
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Record observed behavior, pass/fail outcomes, errors, or architecture decisions..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Measured Parameters (Key: Value per line)</label>
            <textarea
              rows={3}
              value={formParametersRaw}
              onChange={(e) => setFormParametersRaw(e.target.value)}
              placeholder={"can_bitrate: 1 Mbps\nmax_joint_error_deg: 0.4"}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] font-mono text-[var(--hub-ink)]"
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Tags (comma separated)</label>
            <input
              type="text"
              value={formTagsRaw}
              onChange={(e) => setFormTagsRaw(e.target.value)}
              placeholder="PiPER, CAN, Measured"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>

          <label className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 cursor-pointer">
            <input
              type="checkbox"
              checked={eStopVerified}
              onChange={(e) => setEStopVerified(e.target.checked)}
            />
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-[var(--hub-ink)] font-medium">
              Hardware Safety Gate Confirmed (E-stop / prop guard / safe envelope checked before physical power-on)
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsLogOpen(false)}
              className="px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer"
            >
              Save Experiment Log
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
