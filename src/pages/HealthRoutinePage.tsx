import React, { useState } from 'react';
import {
  Moon,
  Sun,
  Activity,
  Heart,
  Clock,
  CheckCircle2,
  Calendar,
  Flame,
  BatteryCharging,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { formatShortDate, getTodayISO } from '../lib/utils';
import type { HealthRoutineRecord } from '../types';

const INITIAL_ROUTINE_CHECKS = [
  { id: 'r1', time: '06:30', title: 'Wake up & 500ml water hydration', category: 'Morning', done: true },
  { id: 'r2', time: '07:00', title: 'Physical conditioning & mobility / run', category: 'Health', done: true },
  { id: 'r3', time: '08:30', title: 'Deep Work Block 1: Pawan Shakti Planetary Gearbox CAD', category: 'Engineering', done: true },
  { id: 'r4', time: '11:30', title: 'Deep Work Block 2: ROS 2 Humble CAN driver test run', category: 'Robotics', done: false },
  { id: 'r5', time: '14:30', title: 'Startup execution & V3F evidence review sprint', category: 'Startup', done: false },
  { id: 'r6', time: '17:30', title: 'Daily synthesis & team/advisory follow-ups', category: 'Comms', done: false },
  { id: 'r7', time: '22:00', title: 'Screens off & evening circadian wind-down', category: 'Evening', done: false },
];

export const HealthRoutinePage: React.FC = () => {
  const today = getTodayISO();
  const [routines, setRoutines] = useState(INITIAL_ROUTINE_CHECKS);
  const [sleepHours, setSleepHours] = useState<number>(7.2);
  const [energyLevel, setEnergyLevel] = useState<number>(8); // 1-10
  const [deepWorkHours, setDeepWorkHours] = useState<number>(4.5);

  const completedCount = routines.filter((r) => r.done).length;
  const routinePercentage = Math.round((completedCount / routines.length) * 100);

  const toggleRoutine = (id: string) => {
    setRoutines((prev) =>
      prev.map((r) => (r.id === id ? { ...r, done: !r.done } : r))
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="teal" dot>Circadian & Performance Hub</Badge>
              <Badge variant="emerald">Recovery: Optimal</Badge>
              <Badge variant="blue">Deep Work: 4.5 hrs</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-[var(--hub-ink)] tracking-tight">
              Health, Sleep & Founder Routine Assistant
            </h1>
            <p className="text-sm text-[var(--hub-muted)] max-w-3xl leading-relaxed">
              Personal circadian rhythm manager, cognitive deep work timer, sleep recovery analytics, and high-performance daily routine tracking for engineering leadership.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[var(--hub-bg)] p-3 rounded-xl border border-[var(--hub-line)]">
            <BatteryCharging className="w-6 h-6 text-emerald-500" />
            <div>
              <span className="text-[10px] text-[var(--hub-muted)] uppercase tracking-wider block font-bold">
                Energy Status
              </span>
              <span className="text-sm font-bold text-[var(--hub-ink)]">
                {energyLevel} / 10 Peak State
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Last Night Sleep"
          value={`${sleepHours} Hours`}
          subtext="Bedtime: 23:15 • Wake: 06:30"
          icon={<Moon className="w-5 h-5 text-indigo-500" />}
        />
        <StatCard
          label="Deep Engineering Work"
          value={`${deepWorkHours} Hours`}
          subtext="Target: 5.0 hrs / day"
          icon={<Flame className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          label="Routine Completion"
          value={`${routinePercentage}%`}
          subtext={`${completedCount} of ${routines.length} completed`}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
        />
        <StatCard
          label="Circadian Alignment"
          value="Synchronized"
          subtext="Morning sunlight achieved"
          icon={<Sun className="w-5 h-5 text-yellow-500" />}
        />
      </div>

      {/* Daily Routine Checklist */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-600" />
            <span>Today's Founder Operating Schedule</span>
          </h3>
          <span className="text-xs font-semibold text-[var(--hub-muted)]">{today}</span>
        </div>

        <div className="space-y-2.5">
          {routines.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleRoutine(item.id)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                item.done
                  ? 'bg-emerald-500/5 border-emerald-500/25 opacity-80'
                  : 'bg-[var(--hub-bg)]/40 border-[var(--hub-line)] hover:border-[var(--hub-accent)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={item.done}
                  onChange={() => toggleRoutine(item.id)}
                  className="w-4 h-4 rounded text-teal-600 cursor-pointer flex-none"
                  onClick={(e) => e.stopPropagation()}
                />
                <div>
                  <span className={`text-xs font-bold block ${item.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>
                    {item.title}
                  </span>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--hub-muted)] mt-0.5">
                    <span className="font-mono">{item.time}</span>
                    <span>•</span>
                    <Badge variant="gray">{item.category}</Badge>
                  </div>
                </div>
              </div>

              <Badge variant={item.done ? 'emerald' : 'gray'}>
                {item.done ? 'Completed' : 'Pending'}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
