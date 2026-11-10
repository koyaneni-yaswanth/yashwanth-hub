import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  IndianRupee,
  Plus,
  TrendingDown,
  CreditCard,
  Calendar,
  FileCheck,
  PieChart,
  Edit2,
  Trash2,
  AlertTriangle,
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
  status: 'Sanctioned & Verified' | 'Applied / Under Review' | 'Drafting';
  project: string;
  tranche_details: string;
}

interface TreasuryConfig {
  cashBalance: number;
  verifiedLabel: string;
  grants: GrantPipeline[];
}

const DEFAULT_TREASURY: TreasuryConfig = {
  cashBalance: 0,
  verifiedLabel: 'Unconfigured — click Edit Capital to enter verified bank/grant balance',
  grants: [],
};

export const FinancePage: React.FC<FinancePageProps> = ({ currentArea, areas }) => {
  const today = getTodayISO();
  const currentMonth = today.slice(0, 7);

  const [activeTab, setActiveTab] = useState<'overview' | 'expenses' | 'grants'>('overview');
  const [treasury, setTreasury] = useState<TreasuryConfig>(DEFAULT_TREASURY);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditTreasuryOpen, setIsEditTreasuryOpen] = useState(false);
  const [isAddGrantOpen, setIsAddGrantOpen] = useState(false);

  // Treasury edit form
  const [editCashInput, setEditCashInput] = useState('0');
  const [editCashLabel, setEditCashLabel] = useState('');

  // Grant form
  const [grantAgency, setGrantAgency] = useState('');
  const [grantTitle, setGrantTitle] = useState('');
  const [grantAmount, setGrantAmount] = useState('');
  const [grantStatus, setGrantStatus] = useState<GrantPipeline['status']>('Drafting');
  const [grantNotes, setGrantNotes] = useState('');

  // Expense Form Fields
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('Parts');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formDate, setFormDate] = useState(today);
  const [formNote, setFormNote] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('NetBanking');

  useEffect(() => {
    db.settings.get('finance_treasury_v2').then((row) => {
      if (row?.value) {
        setTreasury(row.value as TreasuryConfig);
      }
    });
  }, []);

  const persistTreasury = async (next: TreasuryConfig) => {
    setTreasury(next);
    await db.settings.put({
      key: 'finance_treasury_v2',
      value: next,
      updated_at: new Date().toISOString(),
    });
  };

  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const currentMonthExpenses = allExpenses.filter((e) => e.date.startsWith(currentMonth));
  const currentMonthTotal = currentMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const monthlyBurn = currentMonthTotal > 0 ? currentMonthTotal : 0;
  const runwayMonths =
    treasury.cashBalance > 0 && monthlyBurn > 0
      ? (treasury.cashBalance / monthlyBurn).toFixed(1)
      : null;

  const grantPipelineTotal = treasury.grants.reduce((sum, g) => sum + (Number(g.amount) || 0), 0);

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
    SyncQueueService.enqueueChange('expenses', newExpense.id, 'INSERT', newExpense).catch(() => {});
    setIsModalOpen(false);
    setFormAmount('');
    setFormNote('');
  };

  const handleSaveTreasury = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistTreasury({
      ...treasury,
      cashBalance: Math.max(0, Number(editCashInput) || 0),
      verifiedLabel: editCashLabel.trim() || `User-entered on ${today}`,
    });
    setIsEditTreasuryOpen(false);
  };

  const handleSaveGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantAgency.trim() || !grantTitle.trim()) return;
    const item: GrantPipeline = {
      id: generateId(),
      agency: grantAgency.trim(),
      title: grantTitle.trim(),
      amount: Math.max(0, Number(grantAmount) || 0),
      status: grantStatus,
      project: 'PAWAN SHAKTI',
      tranche_details: grantNotes.trim() || 'Status updated manually.',
    };
    await persistTreasury({
      ...treasury,
      grants: [item, ...treasury.grants],
    });
    setIsAddGrantOpen(false);
    setGrantAgency('');
    setGrantTitle('');
    setGrantAmount('');
    setGrantNotes('');
  };

  const handleDeleteGrant = async (id: string) => {
    await persistTreasury({
      ...treasury,
      grants: treasury.grants.filter((g) => g.id !== id),
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="teal" dot>Persisted Financial Ledger</Badge>
              <Badge variant="gray">Zero Fabricated Balances</Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-[var(--hub-ink)] tracking-tight">
              Finance & Startup Capital Hub
            </h1>
            <p className="text-sm text-[var(--hub-muted)] max-w-3xl leading-relaxed">
              Tracks user-recorded expenses, manually verified capital balances, and grant applications cleanly in local Dexie & Supabase sync.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start lg:self-auto">
            <button
              onClick={() => {
                setEditCashInput(String(treasury.cashBalance));
                setEditCashLabel(treasury.verifiedLabel);
                setIsEditTreasuryOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-semibold hover:border-[var(--hub-accent)] cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Capital</span>
            </button>
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

      {treasury.cashBalance === 0 && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <strong>Capital Balance Unconfigured:</strong> No verified bank balance or grant sanction is configured yet. Use{' '}
            <strong>Edit Capital</strong> or <strong>Grant Pipelines</strong> to enter verified figures rather than placeholder estimates.
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatCard
          label="Entered Available Capital"
          value={formatINR(treasury.cashBalance)}
          subtext={treasury.verifiedLabel.slice(0, 42)}
          icon={<IndianRupee className="w-5 h-5 text-emerald-600" />}
        />
        <StatCard
          label="Current Month Expenses"
          value={formatINR(currentMonthTotal)}
          subtext={`${currentMonthExpenses.length} recorded in ${currentMonth}`}
          icon={<TrendingDown className="w-5 h-5 text-amber-600" />}
        />
        <StatCard
          label="Runway Calculation"
          value={runwayMonths ? `${runwayMonths} Months` : 'N/A'}
          subtext={runwayMonths ? 'Capital / current-month spend' : 'Requires capital & expense entries'}
          icon={<Calendar className="w-5 h-5 text-blue-600" />}
        />
        <StatCard
          label="Tracked Grants"
          value={formatINR(grantPipelineTotal)}
          subtext={`${treasury.grants.length} grant record(s)`}
          icon={<FileCheck className="w-5 h-5 text-teal-600" />}
        />
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--hub-line)] pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Financial Overview & Unit Targets', icon: PieChart },
          { id: 'expenses', label: `Expenses (${allExpenses.length})`, icon: CreditCard },
          { id: 'grants', label: `Grants (${treasury.grants.length})`, icon: FileCheck },
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

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              Treasury & Monthly Burn Summary
            </h3>
            <div className="space-y-2 pt-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                <span className="text-[var(--hub-muted)]">Verified Capital Entered:</span>
                <span className="font-bold text-[var(--hub-ink)] font-mono">{formatINR(treasury.cashBalance)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--hub-line)]">
                <span className="text-[var(--hub-muted)]">Current Month Recorded Spend:</span>
                <span className="font-bold text-amber-600 font-mono">{formatINR(currentMonthTotal)}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-[var(--hub-muted)]">Computed Runway:</span>
                <span className="font-bold text-[var(--hub-ink)] font-mono">
                  {runwayMonths ? `${runwayMonths} months` : 'Insufficient data'}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Pawan Shakti BOM Estimates (Target / Unquoted)
              </h3>
              <Badge variant="amber">Estimate Only</Badge>
            </div>
            <p className="text-xs text-[var(--hub-muted)]">
              Preliminary target numbers pending formal supplier quotations & upgraded chassis BOM.
            </p>
            <div className="space-y-2.5 pt-1 text-xs">
              {[
                { stage: 'Prototype Benchmark Estimate', cost: 120500, note: 'Planning baseline only' },
                { stage: 'Small Batch Target (50 Units)', cost: 64200, note: 'Unverified scale estimate' },
                { stage: 'Volume Target (500 Units)', cost: 38400, note: 'Unverified scale estimate' },
              ].map((s, idx) => (
                <div key={idx} className="p-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)]/40 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-[var(--hub-ink)] block">{s.stage}</span>
                    <span className="text-[11px] text-[var(--hub-muted)]">{s.note}</span>
                  </div>
                  <span className="text-sm font-bold font-mono text-[var(--hub-ink)]">{formatINR(s.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXPENSES LIST */}
      {activeTab === 'expenses' && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              Recorded Transactions ({allExpenses.length} Records)
            </h3>
            <span className="text-xs text-[var(--hub-muted)]">Stored in Dexie & Sync Queue</span>
          </div>

          {allExpenses.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--hub-muted)]">
              <p>No expenses recorded yet.</p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-2 text-teal-600 font-bold hover:underline cursor-pointer"
              >
                Record first expense
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--hub-line)]">
              {allExpenses.slice(0, 20).map((exp) => (
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
      )}

      {/* TAB 3: GRANTS */}
      {activeTab === 'grants' && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
              Grant Applications & Sanction Tracker
            </h3>
            <button
              onClick={() => setIsAddGrantOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Grant Record</span>
            </button>
          </div>

          {treasury.grants.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--hub-muted)] border border-dashed border-[var(--hub-line)] rounded-xl">
              No verified grant applications or sanction letters recorded yet. Add one when submitted or sanctioned.
            </div>
          ) : (
            <div className="space-y-3">
              {treasury.grants.map((g) => (
                <div key={g.id} className="p-4 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)]/40 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-[var(--hub-ink)]">{g.agency}</h4>
                        <Badge variant={g.status === 'Sanctioned & Verified' ? 'emerald' : 'amber'}>
                          {g.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-[var(--hub-muted)] mt-0.5">{g.title}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {formatINR(g.amount)}
                      </span>
                      <button
                        onClick={() => handleDeleteGrant(g.id)}
                        className="text-[var(--hub-muted)] hover:text-red-500 cursor-pointer"
                        aria-label="Delete grant entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--hub-ink)] bg-[var(--hub-surface)] p-2.5 rounded-lg border border-[var(--hub-line)]">
                    {g.tranche_details}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Capital Modal */}
      <Modal isOpen={isEditTreasuryOpen} onClose={() => setIsEditTreasuryOpen(false)} title="Configure Verified Capital Balance">
        <form onSubmit={handleSaveTreasury} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Available Capital (₹) *</label>
            <input
              type="number"
              min="0"
              required
              value={editCashInput}
              onChange={(e) => setEditCashInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Source / Reference Note</label>
            <input
              type="text"
              value={editCashLabel}
              onChange={(e) => setEditCashLabel(e.target.value)}
              placeholder="e.g. Startup Bank Account Balance as of 10 Nov"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsEditTreasuryOpen(false)} className="px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] cursor-pointer">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer">
              Save Balance
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Grant Modal */}
      <Modal isOpen={isAddGrantOpen} onClose={() => setIsAddGrantOpen(false)} title="Add Grant Record">
        <form onSubmit={handleSaveGrant} className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Agency *</label>
            <input
              type="text"
              required
              value={grantAgency}
              onChange={(e) => setGrantAgency(e.target.value)}
              placeholder="e.g. DST NIDHI-PRAYAS / BIRAC"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Program / Title *</label>
            <input
              type="text"
              required
              value={grantTitle}
              onChange={(e) => setGrantTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-[var(--hub-ink)] mb-1">Amount (₹)</label>
              <input
                type="number"
                min="0"
                value={grantAmount}
                onChange={(e) => setGrantAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              />
            </div>
            <div>
              <label className="block font-bold text-[var(--hub-ink)] mb-1">Status</label>
              <select
                value={grantStatus}
                onChange={(e) => setGrantStatus(e.target.value as GrantPipeline['status'])}
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              >
                <option value="Drafting">Drafting</option>
                <option value="Applied / Under Review">Applied / Under Review</option>
                <option value="Sanctioned & Verified">Sanctioned & Verified</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Reference / Notes</label>
            <input
              type="text"
              value={grantNotes}
              onChange={(e) => setGrantNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsAddGrantOpen(false)} className="px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] cursor-pointer">
              Cancel
            </button>
            <button type="submit" className="px-4 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer">
              Save Grant
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Expense Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Record Expense">
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
              placeholder="e.g. Bench power supply / sensor component"
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
              className="px-4 py-2 rounded-lg border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
            >
              Save Transaction
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
