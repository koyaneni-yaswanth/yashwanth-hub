import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import confetti from 'canvas-confetti';
import {
  Wind,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileCheck,
  RotateCcw,
} from 'lucide-react';
import { db } from '../db';
import type { Task } from '../types';
import { formatShortDate, generateId } from '../lib/utils';
import { TurbineLogo } from '../components/common/TurbineLogo';
import { Badge } from '../components/common/Badge';

interface PhaseWeek {
  t: string;
  k: string[];
  d: string;
}

interface Phase {
  ph: string;
  w: PhaseWeek[];
}

const PLAN_DATA: Phase[] = [
  {
    ph: 'Phase 1: Know exactly what you are building (Weeks 1 to 4)',
    w: [
      {
        t: 'Product and evidence audit',
        k: [
          'Write down the TRL 4 evidence: tests, data, photos',
          'List what works and what has never run outdoors',
          'Set up one master tracker for tasks and dates',
          'Pick one customer type and one turbine size',
        ],
        d: 'Status and gap report',
      },
      {
        t: 'Technical design review',
        k: [
          'Review rotor and blade aerodynamic design',
          'Review generator, controller and battery storage',
          'Review tower, foundation and braking mechanism',
          'Meet the professor with a one-page update',
        ],
        d: 'System architecture and requirements',
      },
      {
        t: 'Test plan and safety',
        k: [
          'Set rated power and target wind range (3 to 12 m/s)',
          'Define how to measure power, RPM, vibration, temperature',
          'Write a risk register: overspeed, braking, lightning, grounding',
          'Read the IEC 61400-2 summary for small turbines',
        ],
        d: 'Prototype testing plan',
      },
      {
        t: 'Business foundation',
        k: [
          'Interview 5 possible industrial or rural off-grid users',
          'Study 5 competitors and their market prices',
          'Build a first manufacturing and parts cost sheet',
          'List grants and incubators; pick the first to apply to',
        ],
        d: 'Customer discovery report',
      },
    ],
  },
  {
    ph: 'Phase 2: Build evidence, not just hardware (Weeks 5 to 8)',
    w: [
      {
        t: 'Design freeze and procurement',
        k: [
          'Freeze the design after professor review',
          'Confirm the bill of materials (BOM)',
          'Order long-lead parts first (magnets, bearings, hub)',
          'Submit the first government or institutional grant application',
        ],
        d: 'Frozen design, orders placed, first grant submitted',
      },
      {
        t: 'Prototype integration',
        k: [
          'Assemble the mechanical hub and blade assembly',
          'Wire the axial flux generator and electronics',
          'Fit controller and overspeed protection',
          'Set up an automated data logger (RPM, voltage, current)',
        ],
        d: 'Prototype ready for controlled tests',
      },
      {
        t: 'Lab validation',
        k: [
          'Measure open-circuit and load voltage, current and efficiency',
          'Record RPM curves against varying resistive loads',
          'Check bearing vibration and coil temperature rise',
          'Compare experimental curves with analytical predictions',
        ],
        d: 'Laboratory test report',
      },
      {
        t: 'Relevant-environment tests',
        k: [
          'Run supervised tests under real atmospheric wind conditions',
          'Log wind speed anemometer data against electrical power output',
          'Record every failure, anomaly and engineering fix',
          'Verify TRL 5 acceptance criteria',
        ],
        d: 'TRL 5 evidence package',
      },
    ],
  },
  {
    ph: 'Phase 3: Pilot and startup validation (Weeks 9 to 12)',
    w: [
      {
        t: 'Field-test preparation',
        k: [
          'Choose a deployment site with documented wind speeds',
          'Verify tower guy-wires and ground anchor foundation needs',
          'Plan electrical safety, disconnect switch and local permissions',
          'Interview 5 more prospective pilot customers',
        ],
        d: 'Field-test readiness report',
      },
      {
        t: 'Pilot demonstration',
        k: [
          'Install the turbine at the test site',
          'Start daily data logging and remote telemetry',
          'Take weekly high-res engineering photos and operation video',
          'Ask for a letter of intent (LOI) from one pilot customer',
        ],
        d: 'Pilot running with live telemetry data',
      },
      {
        t: 'Fix and improve',
        k: [
          'Diagnose and fix the top three failure modes',
          'Run mechanical safety checks and brake clamp tests again',
          'Update the commercial cost sheet with actual production numbers',
          'Apply to a second grant or seed incubator program',
        ],
        d: 'Engineering improvement report',
      },
      {
        t: 'Evidence pack',
        k: [
          'Compile the final data report: 4 weeks of continuous real output',
          'Draft the user manual and installation guidelines',
          'Prepare a concise founder pitch deck for investors and grants',
          'Define the TRL 7 commercial pilot scale roadmap',
        ],
        d: 'TRL 6 Evidence report, user manual, and deck',
      },
    ],
  },
  {
    ph: 'Final Review: Days 85 to 90',
    w: [
      {
        t: 'Founder review and next cycle',
        k: [
          'Score the TRL level against your real experimental evidence',
          'List what to stop, keep and start for the next quarter',
          'Set the next 90-day scale and certification plan',
        ],
        d: 'Decision memo and roadmap',
      },
    ],
  },
];

const JUNIOR_TASKS = [
  ['Competitor research', '10 competitor profiles with price and technical specs'],
  ['CAD documentation', 'Updated 3D CAD assembly drawings and BOM'],
  ['Market research', 'List of 20 prospective customer leads with contact info'],
  ['Literature research', '5 relevant research papers with 3-line executive summaries'],
  ['Data logging', 'Daily data sheet and photos during wind test runs'],
];

export const WindPlanPage: React.FC = () => {
  // Plan Start Date
  const [startDateStr, setStartDateStr] = useState<string>('2026-11-04');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [expandedPhases, setExpandedPhases] = useState<Record<number, boolean>>({
    0: true,
    1: true,
    2: true,
    3: true,
  });

  // Database tasks query to see if 12-week milestones are seeded in Tasks table
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const planTasks = allTasks.filter((t) => t.plan !== undefined);

  // Load ticks from IndexedDB settings or localStorage
  useEffect(() => {
    const loadState = async () => {
      const savedStart = await db.settings.get('wind_start_date');
      if (savedStart) setStartDateStr(savedStart.value);

      const savedTicks = await db.settings.get('wind_ticks');
      if (savedTicks && typeof savedTicks.value === 'object') {
        setCheckedItems(savedTicks.value);
      } else {
        // Fallback to localStorage legacy
        const legacy = localStorage.getItem('wind90-v1');
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            if (parsed.start) setStartDateStr(parsed.start);
            if (parsed.done) setCheckedItems(parsed.done);
          } catch {}
        }
      }
    };
    loadState();
  }, []);

  const saveTicks = async (newTicks: Record<string, boolean>) => {
    setCheckedItems(newTicks);
    await db.settings.put({
      key: 'wind_ticks',
      value: newTicks,
      updated_at: new Date().toISOString(),
    });
  };

  const handleStartDateChange = async (dateVal: string) => {
    setStartDateStr(dateVal);
    await db.settings.put({
      key: 'wind_start_date',
      value: dateVal,
      updated_at: new Date().toISOString(),
    });
  };

  const toggleCheck = (id: string) => {
    const nextVal = !checkedItems[id];
    const newTicks = { ...checkedItems, [id]: nextVal };
    saveTicks(newTicks);

    if (nextVal) {
      confetti({
        particleCount: 25,
        spread: 40,
        origin: { y: 0.8 },
      });
    }
  };

  // Day & Week calculation
  const startMs = new Date(startDateStr + 'T00:00:00').getTime();
  const nowMs = Date.now();
  const dayNumber = Math.max(1, Math.min(90, Math.floor((nowMs - startMs) / 86400000) + 1));
  const currentWeek = Math.max(1, Math.min(13, Math.floor((nowMs - startMs) / (7 * 86400000)) + 1));

  // Count total tasks and checked tasks
  let totalTasks = 0;
  let completedTasks = 0;

  PLAN_DATA.forEach((phase, pIdx) => {
    phase.w.forEach((w, wIdx) => {
      w.k.forEach((_, kIdx) => {
        totalTasks++;
        const id = `${pIdx}-${wIdx}-${kIdx}`;
        if (checkedItems[id]) completedTasks++;
      });
    });
  });

  JUNIOR_TASKS.forEach((_, jIdx) => {
    totalTasks++;
    const id = `j-${jIdx}`;
    if (checkedItems[id]) completedTasks++;
  });

  const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Turbine duration: 12 seconds when 0%, speeds up to 1.5s when 100%
  const turbineDuration = 12 - (10.5 * percentage) / 100;

  const togglePhase = (pIdx: number) => {
    setExpandedPhases((prev) => ({ ...prev, [pIdx]: !prev[pIdx] }));
  };

  // Seed 12-week milestones into Tasks table
  const handleSeedMilestonesToTasks = async () => {
    const now = new Date().toISOString();
    const tasksToAdd: Task[] = [];
    const baseDate = new Date(startDateStr + 'T00:00:00');

    let weekNum = 1;
    PLAN_DATA.slice(0, 3).forEach((phase) => {
      phase.w.forEach((w) => {
        const dueDate = new Date(baseDate);
        dueDate.setDate(dueDate.getDate() + weekNum * 7 - 1);
        const dueStr = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;

        tasksToAdd.push({
          id: generateId(),
          text: `Week ${weekNum}: ${w.t}`,
          description: `Deliverable: ${w.d}. Actions: ${w.k.join('; ')}`,
          area: 'PAWAN SHAKTI',
          priority: weekNum <= 4 ? 'high' : 'medium',
          due_date: dueStr,
          starred: weekNum <= 2,
          done: false,
          plan: weekNum,
          created_at: now,
          updated_at: now,
        });
        weekNum++;
      });
    });

    await db.tasks.bulkAdd(tasksToAdd);
    confetti({
      particleCount: 75,
      spread: 60,
      origin: { y: 0.6 },
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hero Section */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-5 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="flex-none flex flex-col items-center">
            <TurbineLogo size={90} durationSeconds={turbineDuration} />
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 mt-2">
              {turbineDuration.toFixed(1)}s rotation
            </span>
          </div>

          <div className="flex-1 w-full text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-bold mb-2">
              <Wind className="w-3.5 h-3.5" />
              <span>PAWAN SHAKTI FOUNDER ROADMAP</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
              Wind Startup: 90-Day Command Center
            </h2>
            <p className="text-xs sm:text-sm text-[var(--hub-muted)] mt-1 max-w-2xl leading-relaxed">
              Founder plan from TRL 4 (lab prototype) to a verified TRL 6 relevant-environment prototype.
              The wind turbine spins faster as deliverables are checked off.
            </p>

            {/* Overall Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                <span className="text-[var(--hub-ink)]">Execution Velocity</span>
                <span className="text-[var(--hub-accent)]">{percentage}% Complete</span>
              </div>
              <div className="w-full h-3 rounded-full bg-[var(--hub-line)] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-600 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>

            {/* Key Metrics */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 sm:gap-6 mt-4 pt-3 border-t border-[var(--hub-line)] text-xs text-[var(--hub-muted)] font-medium">
              <div>
                Day <strong className="text-[var(--hub-ink)] font-bold text-sm">{dayNumber}</strong> of 90
              </div>
              <div>
                Week <strong className="text-[var(--hub-ink)] font-bold text-sm">{currentWeek}</strong> of 13
              </div>
              <div>
                Tasks <strong className="text-[var(--hub-ink)] font-bold text-sm">{completedTasks}</strong> / {totalTasks}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Realistic Target Alert Note */}
      <div className="bg-[var(--hub-surface)] border-l-4 border-l-[var(--hub-amber)] border border-[var(--hub-line)] rounded-xl p-4 shadow-xs text-xs leading-relaxed text-[var(--hub-ink)]">
        <strong className="text-[var(--hub-amber)] font-bold text-sm block mb-1">
          Realistic Engineering Target:
        </strong>
        The TRL scale ends at 9, so there is no TRL 10. In 90 days aim for robust TRL 5 evidence, a TRL 6 prototype demo, and one customer pilot letter of intent (LOI). TRL 7 to 9 requires long-duration field run hours and formal IEC 61400-2 certification.
      </div>

      {/* TRL Status Stages */}
      <div>
        <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] mb-3">
          Technology Readiness Levels (TRL)
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 text-xs">
            <span className="font-bold text-[var(--hub-ink)] block">TRL 4</span>
            <span className="text-[var(--hub-muted)]">Parts tested in lab</span>
            <span className="block text-[10px] font-bold text-teal-600 mt-1">Starting Point</span>
          </div>

          <div className="bg-teal-500/10 border border-teal-500/40 rounded-xl p-3 text-xs shadow-xs">
            <span className="font-bold text-teal-900 dark:text-teal-200 block">TRL 5</span>
            <span className="text-teal-800/80 dark:text-teal-300/80">Tested in realistic conditions</span>
            <span className="block text-[10px] font-bold text-teal-700 dark:text-teal-300 mt-1">Target: Day 56</span>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 text-xs shadow-xs">
            <span className="font-bold text-amber-900 dark:text-amber-200 block">TRL 6</span>
            <span className="text-amber-800/80 dark:text-amber-300/80">Prototype in relevant env</span>
            <span className="block text-[10px] font-bold text-amber-700 dark:text-amber-300 mt-1">Stretch: Day 90</span>
          </div>

          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 text-xs opacity-75">
            <span className="font-bold text-[var(--hub-ink)] block">TRL 7</span>
            <span className="text-[var(--hub-muted)]">Runs at customer site</span>
            <span className="block text-[10px] text-[var(--hub-muted)] mt-1">After Day 90</span>
          </div>

          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 text-xs opacity-60">
            <span className="font-bold text-[var(--hub-ink)] block">TRL 8 & 9</span>
            <span className="text-[var(--hub-muted)]">Qualified & in-service</span>
            <span className="block text-[10px] text-[var(--hub-muted)] mt-1">Year 2 & Beyond</span>
          </div>
        </div>
      </div>

      {/* Sync 12-week milestones to Tasks database */}
      {planTasks.length === 0 && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-[var(--hub-ink)]">
              Synchronize with Task Management
            </h4>
            <p className="text-xs text-[var(--hub-muted)] mt-0.5">
              Add all 12 weekly milestone tasks under PAWAN SHAKTI into your central task list with calculated due dates.
            </p>
          </div>
          <button
            onClick={handleSeedMilestonesToTasks}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer whitespace-nowrap shadow-xs"
          >
            <Sparkles className="w-4 h-4" />
            <span>Add 12-Week Milestones to Tasks</span>
          </button>
        </div>
      )}

      {/* 4 Execution Phases */}
      <div className="space-y-4">
        {PLAN_DATA.map((phase, pIdx) => {
          const isExpanded = expandedPhases[pIdx] !== false;
          return (
            <div
              key={phase.ph}
              className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl overflow-hidden shadow-xs"
            >
              <button
                type="button"
                onClick={() => togglePhase(pIdx)}
                className="w-full flex items-center justify-between p-4 bg-[var(--hub-bg)]/40 hover:bg-[var(--hub-bg)] text-left cursor-pointer transition-colors"
              >
                <span className="font-heading font-bold text-sm sm:text-base text-[var(--hub-ink)]">
                  {phase.ph}
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-[var(--hub-muted)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--hub-muted)]" />
                )}
              </button>

              {isExpanded && (
                <div className="divide-y divide-[var(--hub-line)] p-2 sm:p-4 space-y-3">
                  {phase.w.map((week, wIdx) => {
                    const weekOffset = pIdx * 4 + wIdx;
                    const weekStart = new Date(startMs + weekOffset * 7 * 86400000);
                    const weekEnd = new Date(startMs + (weekOffset * 7 + 6) * 86400000);

                    return (
                      <div
                        key={week.t}
                        className="p-3 sm:p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                          <h4 className="font-heading font-bold text-sm text-[var(--hub-ink)]">
                            Week {weekOffset + 1}: {week.t}
                          </h4>
                          <span className="text-xs text-[var(--hub-muted)]">
                            {formatShortDate(weekStart.toISOString().slice(0, 10))} –{' '}
                            {formatShortDate(weekEnd.toISOString().slice(0, 10))}
                          </span>
                        </div>

                        {/* Sub-actions checklist */}
                        <div className="space-y-2">
                          {week.k.map((taskStr, kIdx) => {
                            const itemId = `${pIdx}-${wIdx}-${kIdx}`;
                            const isDone = Boolean(checkedItems[itemId]);
                            return (
                              <label
                                key={taskStr}
                                className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer text-xs transition-colors ${
                                  isDone
                                    ? 'bg-teal-500/10 text-teal-900 dark:text-teal-200 line-through'
                                    : 'hover:bg-[var(--hub-bg)] text-[var(--hub-ink)]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isDone}
                                  onChange={() => toggleCheck(itemId)}
                                  className="mt-0.5 w-4 h-4 rounded text-[var(--hub-accent)] focus:ring-[var(--hub-accent)] cursor-pointer flex-none"
                                />
                                <span>{taskStr}</span>
                              </label>
                            );
                          })}
                        </div>

                        {/* Deliverable info */}
                        <div className="flex items-center gap-2 text-xs text-[var(--hub-muted)] bg-[var(--hub-bg)] p-2.5 rounded-lg border border-[var(--hub-line)]">
                          <FileCheck className="w-4 h-4 text-teal-600 flex-none" />
                          <span>
                            <strong className="text-[var(--hub-ink)]">Key Deliverable:</strong>{' '}
                            {week.d}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Junior Tasks (2 to 4 hours each) */}
      <div className="space-y-3">
        <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
          Junior Tasks (2 to 4 Hours Each)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {JUNIOR_TASKS.map((j, i) => {
            const id = `j-${i}`;
            const isDone = Boolean(checkedItems[id]);
            return (
              <label
                key={j[0]}
                className={`flex flex-col justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                  isDone
                    ? 'bg-teal-500/10 border-teal-500/30'
                    : 'bg-[var(--hub-surface)] border-[var(--hub-line)] hover:border-[var(--hub-accent)]'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-xs font-bold text-[var(--hub-ink)]">{j[0]}</h4>
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => toggleCheck(id)}
                    className="w-4 h-4 rounded text-[var(--hub-accent)] focus:ring-[var(--hub-accent)] cursor-pointer"
                  />
                </div>
                <p className="text-[11px] text-[var(--hub-muted)] mt-2">{j[1]}</p>
              </label>
            );
          })}
        </div>
      </div>

      {/* Weekly Rhythm Guidelines */}
      <div className="space-y-3">
        <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
          Founder Weekly Cadence
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          <div className="p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
            <h4 className="text-xs font-bold font-heading text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Founder Deep Work
            </h4>
            <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
              Two undisturbed technical build blocks and one customer/grant sales block every week. Protect them on your calendar.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
            <h4 className="text-xs font-bold font-heading text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Professor Check-in
            </h4>
            <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
              Every 2 weeks, send a 1-page update, then ask for exactly one thing: a lab slot, a named grant recommendation, or an introduction.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)]">
            <h4 className="text-xs font-bold font-heading text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Junior Team Reviews
            </h4>
            <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
              Review deliverables once a week on Saturdays, not continuously. Hand out the next discrete task with a firm due date.
            </p>
          </div>
        </div>
      </div>

      {/* Plan Settings Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--hub-muted)]" />
          <span className="font-medium text-[var(--hub-ink)]">Plan Start Date:</span>
          <input
            type="date"
            value={startDateStr}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="py-1 px-2.5 rounded-md border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] cursor-pointer"
          />
        </div>

        <button
          onClick={() => {
            if (confirm('Reset all ticks in the 90-day plan?')) {
              saveTicks({});
            }
          }}
          className="flex items-center gap-1.5 text-xs text-[var(--hub-muted)] hover:text-red-600 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset checklist ticks</span>
        </button>
      </div>
    </div>
  );
};
