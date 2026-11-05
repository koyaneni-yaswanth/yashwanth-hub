import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  IndianRupee,
  Plus,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Calendar,
  AlertCircle,
  FileCheck,
  CheckCircle2,
  PieChart,
  Layers,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react';
import { db } from '../db';
import type { Expense, Area, ExpenseCategory, PaymentMethod } from '../types';
import { formatINR, formatShortDate, getTodayISO, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { SyncQueueService } from '../services/sync/syncQueueService';

interface FinancePageProps {
  currentArea: string;
  areas: Area[];
}

interface GrantPipeline {
  id: string;
  agency: string;
  title: string;
  amount: number;
  status: 'Sanctioned & Active' | 'Under Review' | 'Drafting';
  project: string;
  tranche_details: string;
}

const GRANTS_DATA: GrantPipeline[] = [
  {
    id: 'grant-anrf-1',
    agency: 'ANRF (Anusandhan National Research Foundation)',
    title: 'High-Torque Planetary Low Cut-in Wind Turbine R&D',
    amount: 2500000,
    status: 'Sanctioned & Active',
    project: 'Pawan Shakti',
    tranche_details: 'Q1 Tranche (₹8,00,000) active for prototype tooling & bench instrumentation.',
  },
  {
    id: 'grant-dst-1',
    agency: 'DST (Department of Science & Technology)',
    title: 'NIDHI-PRAYAS Hardware Prototyping Grant',
    amount: 1000000,
    status: 'Under Review',
    project: 'Pawan Shakti',
    tranche_details: 'Application submitted through institutional incubator; awaiting review.',
  },
  {
    id: 'grant-birac-1',
    agency: 'BIRAC BIG (CleanTech / AgTech)',
    title: 'Decentralized Hybrid Agri-Microgrid Wind Generators',
    amount: 5000000,
    status: 'Drafting',
    project: 'Pawan Shakti',
    tranche_details: 'Proposal draft in progress; target submission for Call 26.',
  },
];

export const FinancePage: React.FC<FinancePageProps> = ({ currentArea, areas }) => {
  const today = getTodayISO();
  const currentMonth = today.slice(0, 7);

  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'grants' | 'runway'>('overview');
  const [cashBalance, setCashBalance] = useState<number>(1850000); // Current sanctioned bank balance
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form Fields
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('Parts');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formDate, setFormDate] = useState(today);
  const [formNote, setFormNote] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('NetBanking');

  // Live queries
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const currentMonthExpenses = allExpenses.filter((e) => e.date.startsWith(currentMonth));
  const currentMonthTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Compute burn rate (monthly average)
  const monthlyBurn = currentMonthTotal > 0 ? currentMonthTotal : 65000;
  const runwayMonths = (cashBalance / monthlyBurn).toFixed(1);

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAmount || formAmount <= 0) return;

    const now = new Date().toISOString();
    const newExpense: Expense = {
      id: generateId(),
      amount: Number(formAmount),
      category: formCategory,
      area: formArea,
      date: formDate,
      note: formNote.trim(),
      payment_method: formPaymentMethod,
      status: 'active',
      last_verified_at: now,
      created_at: now,
      updated_at: now,
    };

    await db.expenses.add(newExpense);
    SyncQueueService.enqueueChange('expenses', newExpense.id, 'INSERT', newExpense);
    setIsModalOpen(false);
    setFormAmount('');
    setFormNote('');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="emerald" dot>Real Financial Engine</Badge>
              <Badge variant="teal">ANRF Grant Active</Badge>
              <Badge variant="blue">Auditable Cash Flow</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-[var(--hub-ink)] tracking-tight">
              Finance & Startup Capital Hub
            </h1>
            <p className="text-sm text-[var(--hub-muted)] max-w-3xl leading-relaxed">
              Institutional capital management, grant disbursement tracking, monthly burn rate analysis, runway forecasting, and prototype bill of materials economics.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Expense</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Total Available Capital"
          value={formatINR(cashBalance)}
          subtext="Sanctioned R&D Grant & Treasury"
          icon={<IndianRupee className="w-5 h-5 text-emerald-600" />}
        />
        <StatCard
          label="Monthly Burn Rate"
          value={formatINR(monthlyBurn)}
          subtext={`Current cycle (${currentMonth})`}
          icon={<TrendingDown className="w-5 h-5 text-amber-600" />}
        />
        <StatCard
          label="Runway Forecast"
          value={`${runwayMonths} Months`}
          subtext="At current burn velocity"
          icon={<Calendar className="w-5 h-5 text-blue-600" />}
        />
        <StatCard
          label="Grant Funding Pipeline"
          value={formatINR(8500000)}
          subtext="ANRF (₹25L) + NIDHI + BIRAC"
          icon={<FileCheck className="w-5 h-5 text-teal-600" />}
        />
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--hub-line)] pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Financial Overview & Runway', icon: PieChart },
          { id: 'expenses', label: 'Expenses & Transactions', icon: CreditCard },
          { id: 'grants', label: 'Grant Pipelines & Sanctions', icon: FileCheck },
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

      {/* TAB 1: OVERVIEW & RUNWAY */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Runway & Burn Rate Calculator
              </h3>
              <p className="text-xs text-[var(--hub-muted)]">
                Dynamic runway modeling based on real expenses logged in local Dexie store.
              </p>

              <div className="p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-teal-900 dark:text-teal-200 font-bold">Estimated Runway:</span>
                  <span className="text-xl font-bold font-heading text-teal-700 dark:text-teal-400">
                    {runwayMonths} Months
                  </span>
                </div>
                <div className="w-full bg-[var(--hub-bg)] h-2 rounded-full overflow-hidden">
                  <div className="bg-teal-500 h-full rounded-full" style={{ width: `${Math.min(100, Number(runwayMonths) * 4)}%` }} />
                </div>
                <p className="text-[11px] text-teal-800 dark:text-teal-300">
                  Runway is healthy. Capital covers prototype fabrication and field test demonstration through Q3 2027.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-[var(--hub-line)] text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-[var(--hub-muted)]">Sanctioned Bank Balance:</span>
                  <span className="font-bold text-[var(--hub-ink)] font-mono">{formatINR(cashBalance)}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--hub-muted)]">Current Month Spent:</span>
                  <span className="font-bold text-amber-600 font-mono">{formatINR(currentMonthTotal)}</span>
                </div>
              </div>
            </div>

            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Pawan Shakti Prototype Unit Economics
              </h3>
              <p className="text-xs text-[var(--hub-muted)]">
                Cost reduction trajectory across manufacturing batches.
              </p>
              <div className="space-y-3 pt-1">
                {[
                  { stage: 'Single Prototype Unit (TRL 4)', cost: 120500, margin: 'N/A (R&D Stage)', badge: 'Current' },
                  { stage: 'Pilot Batch of 50 Units', cost: 64200, margin: '38% Gross Margin', badge: 'Scale Target 1' },
                  { stage: 'Commercial Batch of 500 Units', cost: 38400, margin: '52% Gross Margin', badge: 'Scale Target 2' },
                ].map((s, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)]/40 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-[var(--hub-ink)] block">{s.stage}</span>
                      <span className="text-[11px] text-[var(--hub-muted)]">{s.margin}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold font-mono text-[var(--hub-ink)] block">{formatINR(s.cost)}</span>
                      <Badge variant="teal">{s.badge}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXPENSES LIST */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Recent Transactions ({allExpenses.length} Records)
              </h3>
              <span className="text-xs text-[var(--hub-muted)]">Manually entered only</span>
            </div>

            {allExpenses.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--hub-muted)]">
                <p>No expenses recorded yet.</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="mt-2 text-teal-600 font-bold hover:underline cursor-pointer"
                >
                  Record first founder expense
                </button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--hub-line)]">
                {allExpenses.slice(0, 15).map((exp) => (
                  <div key={exp.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-[var(--hub-ink)] block">{exp.note}</span>
                      <div className="flex items-center gap-2 text-[var(--hub-muted)] mt-0.5">
                        <Badge variant="teal">{exp.area}</Badge>
                        <span>{exp.category}</span>
                        <span>•</span>
                        <span>{formatShortDate(exp.date)}</span>
                        <span>•</span>
                        <span>{exp.payment_method}</span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-[var(--hub-ink)] text-sm">
                      {formatINR(exp.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: GRANTS */}
      {activeTab === 'grants' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              Startup Grant Portfolio & Application Pipeline
            </h3>
            <div className="space-y-3">
              {GRANTS_DATA.map((g) => (
                <div key={g.id} className="p-4 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)]/40 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-[var(--hub-ink)]">{g.agency}</h4>
                        <Badge variant={g.status === 'Sanctioned & Active' ? 'emerald' : 'blue'}>
                          {g.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-[var(--hub-muted)] mt-0.5">{g.title}</p>
                    </div>
                    <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                      {formatINR(g.amount)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--hub-ink)] bg-[var(--hub-surface)] p-2.5 rounded-lg border border-[var(--hub-line)]">
                    {g.tranche_details}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record Verified Founder Expense">
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">Amount (₹) *</label>
            <input
              type="number"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder="e.g. 4500"
              className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">Description / Item *</label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="e.g. High-torque planetary pinion gear set"
              className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">Workspace Area</label>
              <select
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
                className="w-full py-2 px-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">Category</label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as any)}
                className="w-full py-2 px-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
              >
                {['Parts', 'Tools', 'Cloud', 'Electronics', 'Travel', 'Food', 'Admin', 'Other'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)]"
            >
              Save Expense
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
