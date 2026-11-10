import React, { useState, useEffect } from 'react';
import {
  Moon,
  Sun,
  Clock,
  CheckCircle2,
  Flame,
  BatteryCharging,
} from 'lucide-react';
import { db } from '../db';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { getTodayISO } from '../lib/utils';

const INITIAL_ROUTINE_CHECKS = [
  { id: 'r1', time: '06:30', title: 'Wake up & hydration', category: 'Morning', done: false },
  { id: 'r2', time: '07:00', title: 'Physical conditioning & mobility', category: 'Health', done: false },
  { id: 'r3', time: '08:30', title: 'Deep Work Block 1: Pawan Shakti Engineering', category: 'Engineering', done: false },
  { id: 'r4', time: '11:30', title: 'Deep Work Block 2: Robotics Lab / Software', category: 'Robotics', done: false },
  { id: 'r5', time: '14:30', title: 'Startup execution & blocker closure', category: 'Startup', done: false },
  { id: 'r6', time: '17:30', title: 'Daily review & sync check', category: 'Comms', done: false },
  { id: 'r7', time: '22:00', title: 'Screens off & sleep recovery window', category: 'Evening', done: false },
];

export const HealthRoutinePage: React.FC = () => {
  const today = getTodayISO();
  const storageKey = `routine_checkin_${today}`;

  const [routines, setRoutines] = useState(INITIAL_ROUTINE_CHECKS);
  const [sleepHours, setSleepHours] = useState<number>(7.0);
  const [energyLevel, setEnergyLevel] = useState<number>(7);
  const [deepWorkHours, setDeepWorkHours] = useState<number>(0);

  useEffect(() => {
    db.settings.get(storageKey).then((row) => {
      if (row?.value) {
        const val = row.value as any;
        if (Array.isArray(val.routines)) setRoutines(val.routines);
        if (typeof val.sleepHours === 'number') setSleepHours(val.sleepHours);
        if (typeof val.energyLevel === 'number') setEnergyLevel(val.energyLevel);
        if (typeof val.deepWorkHours === 'number') setDeepWorkHours(val.deepWorkHours);
      }
    });
  }, [storageKey]);

  const persistState = async (
    nextRoutines: typeof INITIAL_ROUTINE_CHECKS,
    nextSleep: number,
    nextEnergy: number,
    nextDeepWork: number
  ) => {
    await db.settings.put({
      key: storageKey,
      value: {
        routines: nextRoutines,
        sleepHours: nextSleep,
        energyLevel: nextEnergy,
        deepWorkHours: nextDeepWork,
      },
      updated_at: new Date().toISOString(),
    });
  };

  const completedCount = routines.filter((r) => r.done).length;
  const routinePercentage = Math.round((completedCount / routines.length) * 100);

  const toggleRoutine = (id: string) => {
    const next = routines.map((r) => (r.id === id ? { ...r, done: !r.done } : r));
    setRoutines(next);
    persistState(next, sleepHours, energyLevel, deepWorkHours);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="teal" dot>Daily Check-In ({today})</Badge>
              <Badge variant="blue">Persisted to Local Hub DB</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-[var(--hub-ink)] tracking-tight">
              Health, Sleep & Founder Routine Assistant
            </h1>
            <p className="text-sm text-[var(--hub-muted)] max-w-3xl leading-relaxed">
              Log today's sleep, energy rating, deep work hours, and routine execution checkpoints. All check-ins persist across refreshes.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-[var(--hub-bg)] p-3 rounded-xl border border-[var(--hub-line)]">
            <BatteryCharging className="w-6 h-6 text-emerald-500" />
            <div>
              <span className="text-[10px] text-[var(--hub-muted)] uppercase tracking-wider block font-bold">
                Self-Rated Energy
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={energyLevel}
                  onChange={(e) => {
                    const v = Math.min(10, Math.max(1, Number(e.target.value) || 1));
                    setEnergyLevel(v);
                    persistState(routines, sleepHours, v, deepWorkHours);
                  }}
                  aria-label="Self-rated energy level"
                  className="w-12 px-1.5 py-0.5 rounded border border-[var(--hub-line)] bg-[var(--hub-surface)] text-sm font-bold text-[var(--hub-ink)]"
                />
                <span className="text-xs font-bold text-[var(--hub-muted)]">/ 10</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Check-In KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Logged Sleep"
          value={`${sleepHours} hrs`}
          subtext="Daily self-logged check-in"
          icon={<Moon className="w-5 h-5 text-indigo-500" />}
        />
        <StatCard
          label="Deep Work"
          value={`${deepWorkHours} hrs`}
          subtext="Target: 4.0-5.0 hrs / day"
          icon={<Flame className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          label="Routine Completion"
          value={`${routinePercentage}%`}
          subtext={`${completedCount} of ${routines.length} completed`}
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
        />
        <StatCard
          label="Check-In Date"
          value={today}
          subtext="Saved automatically per date"
          icon={<Sun className="w-5 h-5 text-yellow-500" />}
        />
      </div>

      {/* Persisted Check-in Sliders / Inputs */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <label className="flex items-center justify-between gap-3">
          <span className="font-bold text-[var(--hub-ink)]">Adjust Logged Sleep (hrs)</span>
          <input
            type="number"
            step={0.5}
            min={0}
            max={16}
            value={sleepHours}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              setSleepHours(v);
              persistState(routines, v, energyLevel, deepWorkHours);
            }}
            className="w-24 px-2.5 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] font-mono font-bold"
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="font-bold text-[var(--hub-ink)]">Adjust Deep Work (hrs)</span>
          <input
            type="number"
            step={0.5}
            min={0}
            max={16}
            value={deepWorkHours}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              setDeepWorkHours(v);
              persistState(routines, sleepHours, energyLevel, v);
            }}
            className="w-24 px-2.5 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] font-mono font-bold"
          />
        </label>
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
