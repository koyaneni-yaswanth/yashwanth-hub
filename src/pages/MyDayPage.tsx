import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Compass,
  Sparkles,
  LifeBuoy,
  Moon,
  Timer,
  CheckCircle2,
  Circle,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
  GripVertical,
  Calendar as CalendarIcon,
  ArrowRight,
  RotateCcw,
  PartyPopper,
} from 'lucide-react';
import { db } from '../db';
import type { Area, DailyPlan, NavigationTab, PlanItem, Task } from '../types';
import { getTodayISO } from '../lib/utils';
import { addDays } from '../lib/habits';
import { TaskService } from '../services/sync/taskService';
import { handOffFocusTask } from '../lib/focusHandoff';
import {
  DEFAULT_AVAILABLE_MINUTES,
  RESCUE_MINUTES,
  TOP_COUNT,
  defaultEstimate,
  formatMinutes,
  moveItem,
  planLoad,
  pruneMissing,
  rankTasks,
  replan,
  splitForWrapUp,
} from '../lib/dailyCompass';

interface MyDayPageProps {
  onNavigate: (tab: NavigationTab) => void;
  areas?: Area[];
}

const TIME_OPTIONS = [60, 120, 180, 240, 300, 360, 480];

const card = 'rounded-2xl p-5 sm:p-6 bg-[var(--hub-surface)] border border-[var(--hub-line)] shadow-xs';
const input =
  'w-full px-3 py-2.5 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] text-sm text-[var(--hub-ink)] placeholder:text-[var(--hub-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)]';
const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-[var(--hub-accent-ink)] text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer disabled:opacity-50';
const ghostBtn =
  'inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-sm font-medium text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] transition-colors cursor-pointer disabled:opacity-50';
const iconBtn =
  'p-2 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface-hover)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed';

export const MyDayPage: React.FC<MyDayPageProps> = ({ onNavigate, areas = [] }) => {
  const today = getTodayISO();
  const tomorrow = addDays(today, 1);

  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  // null = no plan yet; undefined = still loading (useLiveQuery returns undefined for both otherwise).
  const plan = useLiveQuery(async () => (await db.daily_plans.get(today)) ?? null, [today]);
  const events = useLiveQuery(() => db.events.where('date').equals(today).toArray(), [today]) ?? [];

  const [status, setStatus] = useState('');
  const [captureText, setCaptureText] = useState('');
  const [addTaskId, setAddTaskId] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [wrapOpen, setWrapOpen] = useState(false);

  useEffect(() => {
    if (!status) return;
    const id = window.setTimeout(() => setStatus(''), 6000);
    return () => window.clearTimeout(id);
  }, [status]);

  const tasksById = useMemo(() => new Map((tasks ?? []).map((t) => [t.id, t])), [tasks]);
  const items: PlanItem[] = useMemo(
    () => (plan ? pruneMissing(plan.items, new Set(tasksById.keys())) : []),
    [plan, tasksById]
  );
  const available = plan?.available_minutes ?? DEFAULT_AVAILABLE_MINUTES;
  const load = planLoad(items, available);
  const top = items.slice(0, TOP_COUNT);
  const rest = items.slice(TOP_COUNT);
  const onPlan = new Set(items.map((i) => i.task_id));
  const candidates = useMemo(
    () => rankTasks((tasks ?? []).filter((t) => !onPlan.has(t.id)), today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, items, today]
  );
  const doneCount = items.filter((i) => tasksById.get(i.task_id)?.done).length;

  const savePlan = async (patch: Partial<DailyPlan>) => {
    const ts = new Date().toISOString();
    const base: DailyPlan = plan ?? {
      id: today,
      available_minutes: DEFAULT_AVAILABLE_MINUTES,
      items: [],
      rescue: false,
      created_at: ts,
      updated_at: ts,
    };
    await db.daily_plans.put({ ...base, ...patch, id: today, updated_at: ts });
  };

  const makePlan = async (opts: { rescue?: boolean; minutes?: number } = {}) => {
    const minutes = opts.minutes ?? available;
    const next = replan(items, tasks ?? [], today, { availableMinutes: minutes, rescue: opts.rescue });
    await savePlan({ items: next, available_minutes: minutes, rescue: Boolean(opts.rescue) });
    if (next.every((i) => tasksById.get(i.task_id)?.done)) setStatus('No open tasks to plan. Add one below.');
    else if (opts.rescue) setStatus('Rescue mode: just one small step. Everything else can wait.');
    else setStatus(`Planned ${next.length} task${next.length === 1 ? '' : 's'} for ${formatMinutes(minutes)}. Drag or use the arrows to reorder.`);
  };

  const setItems = (next: PlanItem[]) => savePlan({ items: next });

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    void setItems(moveItem(items, from, to));
    const t = tasksById.get(items[from].task_id);
    setStatus(`Moved “${t?.text ?? 'task'}” to position ${to + 1}.`);
  };

  const remove = (index: number) => {
    const t = tasksById.get(items[index].task_id);
    void setItems(items.filter((_, i) => i !== index));
    setStatus(`Removed “${t?.text ?? 'task'}” from today's plan. The task is still in Tasks.`);
  };

  const setMinutes = (index: number, minutes: number) => {
    const m = Math.max(5, Math.min(480, Math.round(minutes) || 5));
    void setItems(items.map((it, i) => (i === index ? { ...it, minutes: m } : it)));
  };

  const addExisting = async () => {
    const t = tasksById.get(addTaskId);
    if (!t) return;
    await setItems([...items, { task_id: t.id, minutes: defaultEstimate(t) }]);
    setAddTaskId('');
    setStatus(`Added “${t.text}” to today's plan.`);
  };

  const capture = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = captureText.trim();
    if (!text) return;
    const { task } = await TaskService.create({
      text,
      area: areas[0]?.name || 'Personal',
      priority: 'medium',
      due_date: today,
      starred: false,
      done: false,
    });
    await setItems([...items, { task_id: task.id, minutes: defaultEstimate(task) }]);
    setCaptureText('');
    setStatus(`Added “${text}” to Tasks and today's plan.`);
  };

  const focusOn = (taskId: string) => {
    handOffFocusTask(taskId);
    onNavigate('focus');
  };

  const onDrop = (to: number) => {
    if (dragIndex === null || dragIndex === to) return setDragIndex(null);
    move(dragIndex, to);
    setDragIndex(null);
  };

  const loading = tasks === undefined || plan === undefined;
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const renderRow = (item: PlanItem, index: number, isTop: boolean) => {
    const t = tasksById.get(item.task_id) as Task;
    return (
      <li
        key={item.task_id}
        draggable
        onDragStart={() => setDragIndex(index)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(index)}
        onDragEnd={() => setDragIndex(null)}
        className={`flex items-start gap-2 sm:gap-3 p-3 rounded-xl border transition-colors ${
          dragIndex === index ? 'opacity-60 border-dashed' : ''
        } ${
          t.done
            ? 'bg-[var(--hub-done)] border-[var(--hub-done-border)]'
            : isTop
              ? 'bg-[var(--hub-surface)] border-[var(--hub-line)]'
              : 'bg-[var(--hub-bg)] border-[var(--hub-line)]'
        }`}
      >
        <GripVertical className="hidden sm:block w-4 h-4 mt-2.5 shrink-0 text-[var(--hub-muted)] cursor-grab" aria-hidden="true" />
        <button
          type="button"
          onClick={() => void TaskService.toggleDone(t)}
          aria-pressed={t.done}
          aria-label={`${t.done ? 'Mark not done' : 'Mark done'}: ${t.text}`}
          className={`mt-1.5 shrink-0 ${t.done ? 'text-[var(--hub-accent)]' : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'} cursor-pointer`}
        >
          {t.done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium break-words ${t.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>
            {isTop && <span className="sr-only">Top {index + 1}: </span>}
            {t.text}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[var(--hub-muted)]">
            <span>{t.area}</span>
            {t.due_date && t.due_date < today && !t.done && <span className="text-[var(--hub-red)] font-semibold">Overdue</span>}
            <label className="inline-flex items-center gap-1">
              <span className="sr-only">Minutes for: {t.text}</span>
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={item.minutes}
                onChange={(e) => setMinutes(index, Number(e.target.value))}
                className="w-16 px-2 py-1 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hub-accent)]"
              />
              <span aria-hidden="true">min</span>
            </label>
          </div>
        </div>
        <div className="flex items-center shrink-0">
          {!t.done && (
            <button type="button" onClick={() => focusOn(t.id)} className={iconBtn} aria-label={`Start a focus session: ${t.text}`} title="Focus on this">
              <Timer className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} className={iconBtn} aria-label={`Move up: ${t.text}`}>
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => move(index, index + 1)}
            disabled={index === items.length - 1}
            className={iconBtn}
            aria-label={`Move down: ${t.text}`}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => remove(index)} className={iconBtn} aria-label={`Remove from today's plan: ${t.text}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </li>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="sr-only" role="status" aria-live="polite">
        {status}
      </div>

      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--hub-accent)]">{dateLabel}</p>
          <h1 className="text-2xl font-bold font-heading text-[var(--hub-ink)] flex items-center gap-2">
            <Compass className="w-6 h-6 text-[var(--hub-accent)]" aria-hidden="true" />
            Daily Compass
          </h1>
          <p className="text-sm text-[var(--hub-muted)]">A realistic plan for the time you actually have.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setWrapOpen((o) => !o)} aria-expanded={wrapOpen} aria-controls="wrap-up" className={ghostBtn}>
            <Moon className="w-4 h-4" aria-hidden="true" />
            Evening wrap-up
          </button>
        </div>
      </header>

      {status && (
        <p className="text-sm rounded-xl px-3 py-2 bg-[var(--hub-accent)]/10 border border-[var(--hub-accent)]/30 text-[var(--hub-ink)]" aria-hidden="true">
          {status}
        </p>
      )}

      {/* ---------------- Planner controls ---------------- */}
      <section className={`${card} space-y-4`} aria-labelledby="plan-controls-title">
        <h2 id="plan-controls-title" className="sr-only">
          Plan settings
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <label className="text-sm font-semibold text-[var(--hub-ink)] sm:w-56">
            Time I have for tasks today
            <select
              value={available}
              onChange={(e) => void makePlan({ minutes: Number(e.target.value), rescue: false })}
              className={`${input} mt-1 font-normal`}
            >
              {Array.from(new Set([...TIME_OPTIONS, available]))
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void makePlan({ rescue: false })} className={primaryBtn} disabled={loading}>
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              {items.length ? 'Re-plan my day' : 'Plan my day'}
            </button>
            {!plan?.rescue && (
              <button type="button" onClick={() => void makePlan({ rescue: true })} className={ghostBtn} disabled={loading}>
                <LifeBuoy className="w-4 h-4" aria-hidden="true" />
                Feeling overwhelmed
              </button>
            )}
          </div>
        </div>

        {items.length > 0 && !plan?.rescue && (
          <div>
            <div className="flex justify-between text-xs text-[var(--hub-muted)] mb-1">
              <span>
                Planned {formatMinutes(load.plannedMinutes)} of {formatMinutes(available)}
              </span>
              <span>
                {doneCount} of {items.length} done
              </span>
            </div>
            <div
              className="h-2 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] overflow-hidden"
              role="progressbar"
              aria-label="Planned time compared with time available"
              aria-valuemin={0}
              aria-valuemax={available}
              aria-valuenow={Math.min(load.plannedMinutes, available)}
              aria-valuetext={`${formatMinutes(load.plannedMinutes)} planned of ${formatMinutes(available)}`}
            >
              <div
                className={`h-full ${load.state === 'over' ? 'bg-[var(--hub-amber)]' : 'bg-[var(--hub-accent)]'}`}
                style={{ width: `${Math.min(100, (load.plannedMinutes / Math.max(1, available)) * 100)}%` }}
              />
            </div>
            {load.state === 'over' && (
              <p className="text-xs text-[var(--hub-ink)] mt-2">
                This plan is {formatMinutes(load.overBy)} over your time. Consider moving the last task to tomorrow — finishing a
                smaller plan feels better than half of a big one.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ---------------- Rescue ---------------- */}
      {plan?.rescue && items[0] && tasksById.get(items[0].task_id) && (
        <section className={`${card} space-y-3 border-[var(--hub-accent)]`} aria-labelledby="rescue-title">
          <h2 id="rescue-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
            Just one thing
          </h2>
          <p className="text-sm text-[var(--hub-muted)]">
            Too much on your plate happens to everyone. Do only this for {RESCUE_MINUTES} minutes — everything else can wait.
          </p>
          <ul className="space-y-2">
            {renderRow(items[0], 0, true)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => focusOn(items[0].task_id)} className={primaryBtn}>
              <Timer className="w-4 h-4" aria-hidden="true" />
              Start {RESCUE_MINUTES} minutes
            </button>
            <button type="button" onClick={() => void makePlan({ rescue: false })} className={ghostBtn}>
              I'm ready for the full plan
            </button>
          </div>
        </section>
      )}

      {/* ---------------- Top 3 + rest ---------------- */}
      {!plan?.rescue && (
        <section className={`${card} space-y-4`} aria-labelledby="top3-title">
          <div className="flex items-center justify-between gap-2">
            <h2 id="top3-title" className="text-base font-bold text-[var(--hub-ink)]">
              Top 3 for today
            </h2>
            {items.length > 1 && <p className="hidden sm:block text-xs text-[var(--hub-muted)]">Drag or use the arrows to reorder</p>}
          </div>

          {top.length > 0 && top.every((i) => tasksById.get(i.task_id)?.done) && (
            <div className="hub-rise flex items-center gap-3 rounded-xl px-4 py-3 bg-[var(--hub-done)] border border-[var(--hub-done-border)]">
              <PartyPopper className="w-5 h-5 shrink-0 text-[var(--hub-accent)]" aria-hidden="true" />
              <p className="text-sm text-[var(--hub-ink)]">
                <span className="font-semibold">Top {top.length} done.</span> That's the day that mattered — anything more is a bonus.
              </p>
            </div>
          )}

          {loading ? (
            <div className="h-24 rounded-xl bg-[var(--hub-bg)] animate-pulse" aria-hidden="true" />
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--hub-line)] p-6 text-center space-y-3">
              <p className="text-sm text-[var(--hub-muted)]">
                No plan yet. Pick how much time you have, then let the Compass suggest your best three — you can change anything.
              </p>
              <button type="button" onClick={() => void makePlan()} className={primaryBtn}>
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                Plan my day
              </button>
            </div>
          ) : (
            <ol className="space-y-2" aria-label="Top 3 tasks">
              {top.map((it, i) => (
                renderRow(it, i, true)
              ))}
            </ol>
          )}

          {rest.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-[var(--hub-muted)]">If there's time</h3>
              <ol className="space-y-2" start={TOP_COUNT + 1} aria-label="More tasks if there's time">
                {rest.map((it, i) => (
                  renderRow(it, i + TOP_COUNT, false)
                ))}
              </ol>
            </div>
          )}

          {!loading && (
            <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--hub-line)]">
              <form onSubmit={capture} className="space-y-1">
                <label htmlFor="compass-capture" className="text-sm font-semibold text-[var(--hub-ink)]">
                  Add a new task for today
                </label>
                <div className="flex gap-2">
                  <input
                    id="compass-capture"
                    value={captureText}
                    onChange={(e) => setCaptureText(e.target.value)}
                    placeholder="What needs doing?"
                    className={input}
                  />
                  <button type="submit" className={`${ghostBtn} shrink-0`} disabled={!captureText.trim()} aria-label="Add new task to today's plan">
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </form>
              {candidates.length > 0 && (
                <div className="space-y-1">
                  <label htmlFor="compass-add-existing" className="text-sm font-semibold text-[var(--hub-ink)]">
                    Add an existing task
                  </label>
                  <div className="flex gap-2">
                    <select id="compass-add-existing" value={addTaskId} onChange={(e) => setAddTaskId(e.target.value)} className={input}>
                      <option value="">Choose a task…</option>
                      {candidates.slice(0, 50).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.text}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void addExisting()}
                      className={`${ghostBtn} shrink-0`}
                      disabled={!addTaskId}
                      aria-label="Add chosen task to today's plan"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------------- Today's schedule ---------------- */}
      <section className={`${card} space-y-3`} aria-labelledby="schedule-title">
        <div className="flex items-center justify-between">
          <h2 id="schedule-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
            Today's schedule
          </h2>
          <button type="button" onClick={() => onNavigate('calendar')} className="text-sm font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer inline-flex items-center gap-1">
            Calendar <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-[var(--hub-muted)]">Nothing scheduled — your whole day is open for the plan above.</p>
        ) : (
          <ul className="space-y-2">
            {events
              .slice()
              .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
              .map((e) => (
                <li key={e.id} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-xs font-semibold text-[var(--hub-ink)] w-14 shrink-0 pt-0.5">{e.start_time || 'All day'}</span>
                  <span className="min-w-0 break-words text-[var(--hub-ink)]">{e.title}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      {/* ---------------- Evening wrap-up ---------------- */}
      {wrapOpen && (
        <WrapUp
          id="wrap-up"
          plan={plan ?? undefined}
          items={items}
          tasksById={tasksById}
          tomorrow={tomorrow}
          areas={areas}
          onDone={(msg) => {
            setStatus(msg);
            setWrapOpen(false);
          }}
        />
      )}
      {!wrapOpen && plan?.wrap_up && (
        <p className="text-sm text-[var(--hub-muted)] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[var(--hub-accent)]" aria-hidden="true" />
          Day wrapped up at {new Date(plan.wrap_up.wrapped_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
          {plan.wrap_up.first_action_task_id && tasksById.get(plan.wrap_up.first_action_task_id) && (
            <> Tomorrow starts with “{tasksById.get(plan.wrap_up.first_action_task_id)?.text}”.</>
          )}
        </p>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

interface WrapUpProps {
  id: string;
  plan: DailyPlan | undefined;
  items: PlanItem[];
  tasksById: Map<string, Task>;
  tomorrow: string;
  areas: Area[];
  onDone: (message: string) => void;
}

const WrapUp: React.FC<WrapUpProps> = ({ id, plan, items, tasksById, tomorrow, areas, onDone }) => {
  const split = splitForWrapUp(items, tasksById);
  const [carry, setCarry] = useState<Set<string>>(() => new Set(split.open_ids));
  const [wentWell, setWentWell] = useState(plan?.wrap_up?.went_well ?? '');
  const [firstAction, setFirstAction] = useState<string>(split.open_ids[0] ?? '');
  const [newFirst, setNewFirst] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleCarry = (taskId: string) =>
    setCarry((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const carried = split.open_ids.filter((tid) => carry.has(tid));
      for (const tid of carried) {
        const t = tasksById.get(tid);
        if (t) await TaskService.scheduleFor(t, tomorrow);
      }

      let firstId = firstAction === '__new' ? '' : firstAction;
      if (firstAction === '__new' && newFirst.trim()) {
        const { task } = await TaskService.create({
          text: newFirst.trim(),
          area: areas[0]?.name || 'Personal',
          priority: 'high',
          due_date: tomorrow,
          starred: false,
          done: false,
        });
        firstId = task.id;
      }

      const ts = new Date().toISOString();
      const today = plan?.id ?? getTodayISO();
      await db.daily_plans.put({
        ...(plan ?? { id: today, available_minutes: DEFAULT_AVAILABLE_MINUTES, items, rescue: false, created_at: ts }),
        updated_at: ts,
        wrap_up: {
          wrapped_at: ts,
          completed_ids: split.completed_ids,
          carried_ids: carried,
          went_well: wentWell.trim() || undefined,
          first_action_task_id: firstId || undefined,
        },
      });

      // Seed tomorrow's plan with the chosen first action, without overwriting a plan made already.
      if (firstId && !(await db.daily_plans.get(tomorrow))) {
        const t = tasksById.get(firstId);
        await db.daily_plans.put({
          id: tomorrow,
          available_minutes: plan?.available_minutes ?? DEFAULT_AVAILABLE_MINUTES,
          items: [{ task_id: firstId, minutes: t ? defaultEstimate(t) : 45 }],
          rescue: false,
          created_at: ts,
          updated_at: ts,
        });
      }

      onDone(
        `Day wrapped up: ${split.completed_ids.length} done${carried.length ? `, ${carried.length} moved to tomorrow` : ''}. Rest well.`
      );
    } finally {
      setSaving(false);
    }
  };

  const titleOf = (tid: string) => tasksById.get(tid)?.text ?? 'Task';

  return (
    <section id={id} className={`${card} space-y-5`} aria-labelledby="wrap-title">
      <h2 id="wrap-title" className="text-base font-bold text-[var(--hub-ink)] flex items-center gap-2">
        <Moon className="w-5 h-5 text-[var(--hub-accent)]" aria-hidden="true" />
        Evening wrap-up
      </h2>

      <div>
        <h3 className="text-sm font-semibold text-[var(--hub-ink)]">
          Done today {split.completed_ids.length > 0 && <span className="font-normal text-[var(--hub-muted)]">({split.completed_ids.length})</span>}
        </h3>
        {split.completed_ids.length === 0 ? (
          <p className="text-sm text-[var(--hub-muted)] mt-1">Nothing from the plan was ticked off — that's okay. Some days are for showing up.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm text-[var(--hub-ink)]">
            {split.completed_ids.map((tid) => (
              <li key={tid} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-[var(--hub-accent)]" aria-hidden="true" />
                <span className="break-words">{titleOf(tid)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {split.open_ids.length > 0 && (
        <fieldset>
          <legend className="text-sm font-semibold text-[var(--hub-ink)] flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Move to tomorrow
          </legend>
          <div className="mt-1 space-y-1">
            {split.open_ids.map((tid) => (
              <label key={tid} className="flex items-start gap-2 text-sm text-[var(--hub-ink)] cursor-pointer">
                <input type="checkbox" checked={carry.has(tid)} onChange={() => toggleCarry(tid)} className="w-4 h-4 mt-0.5" />
                <span className="break-words">{titleOf(tid)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="block text-sm font-semibold text-[var(--hub-ink)]">
        What went well? <span className="font-normal text-[var(--hub-muted)]">(optional)</span>
        <textarea
          rows={2}
          value={wentWell}
          onChange={(e) => setWentWell(e.target.value)}
          placeholder="One small win counts"
          className={`${input} mt-1 font-normal`}
        />
      </label>

      <div className="space-y-2">
        <label htmlFor="first-action" className="text-sm font-semibold text-[var(--hub-ink)]">
          Tomorrow's first action
        </label>
        <select id="first-action" value={firstAction} onChange={(e) => setFirstAction(e.target.value)} className={input}>
          <option value="">Decide tomorrow</option>
          {split.open_ids.map((tid) => (
            <option key={tid} value={tid}>
              {titleOf(tid)}
            </option>
          ))}
          <option value="__new">Something new…</option>
        </select>
        {firstAction === '__new' && (
          <input
            aria-label="New first action for tomorrow"
            value={newFirst}
            onChange={(e) => setNewFirst(e.target.value)}
            placeholder="e.g. Email the gearbox supplier"
            className={input}
          />
        )}
        <p className="text-xs text-[var(--hub-muted)]">It will be first on tomorrow's plan, so you can start without deciding.</p>
      </div>

      <button type="button" onClick={() => void save()} className={primaryBtn} disabled={saving || (firstAction === '__new' && !newFirst.trim())}>
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        {saving ? 'Saving…' : 'Wrap up the day'}
      </button>
    </section>
  );
};
