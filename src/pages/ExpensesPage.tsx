import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  IndianRupee,
  Plus,
  Search,
  Calendar,
  PieChart,
  Trash2,
  Edit2,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
} from 'lucide-react';
import { db } from '../db';
import type { Expense, ExpenseCategory, Area, PaymentMethod } from '../types';
import { formatINR, formatShortDate, getTodayISO, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface ExpensesPageProps {
  currentArea: string;
  areas: Area[];
}

export const ExpensesPage: React.FC<ExpensesPageProps> = ({ currentArea, areas }) => {
  const today = getTodayISO();
  const currentMonth = today.slice(0, 7);

  // Filter & Search State
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);

  // Collapsible Quarantine view
  const [showQuarantine, setShowQuarantine] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

  // Form Fields (Protocol v2 & Section 5 compliance)
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('Parts');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formDate, setFormDate] = useState(today);
  const [formNote, setFormNote] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('UPI');
  const [formReceiptDoc, setFormReceiptDoc] = useState('');
  const [formLinkedTask, setFormLinkedTask] = useState('');

  // Live Queries from Dexie
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const quarantinedExpenses = useLiveQuery(
    () => db.quarantine.filter((q) => q.entity_type === 'expense').toArray(),
    []
  ) || [];
  const auditLogs = useLiveQuery(
    () => db.data_audit_logs.filter((a) => a.entity_type === 'expense').reverse().toArray(),
    []
  ) || [];

  // Filter expenses strictly
  const filteredExpenses = allExpenses.filter((e) => {
    if (selectedMonth && !e.date.startsWith(selectedMonth)) return false;
    if (selectedAreaFilter !== 'All' && e.area !== selectedAreaFilter) return false;
    if (selectedCategory !== 'All' && e.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!e.note.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const sortedExpenses = [...filteredExpenses].sort((a, b) => b.date.localeCompare(a.date));

  // Calculations for selected month
  const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Category breakdown
  const categoryTotals: Record<string, number> = {};
  filteredExpenses.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const openCreateModal = () => {
    setEditingExpense(null);
    setFormAmount('');
    setFormCategory('Parts');
    setFormArea(selectedAreaFilter !== 'All' ? selectedAreaFilter : 'PAWAN SHAKTI');
    setFormDate(today);
    setFormNote('');
    setFormPaymentMethod('UPI');
    setFormReceiptDoc('');
    setFormLinkedTask('');
    setIsModalOpen(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormAmount(expense.amount);
    setFormCategory(expense.category);
    setFormArea(expense.area);
    setFormDate(expense.date);
    setFormNote(expense.note);
    setFormPaymentMethod(expense.payment_method || 'UPI');
    setFormReceiptDoc(expense.receipt_doc_id || '');
    setFormLinkedTask(expense.linked_task_id || '');
    setIsModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formAmount === '' || Number(formAmount) <= 0 || !formNote.trim()) return;

    const now = new Date().toISOString();

    if (editingExpense) {
      await db.expenses.update(editingExpense.id, {
        amount: Number(formAmount),
        category: formCategory,
        area: formArea,
        date: formDate,
        payment_method: formPaymentMethod,
        note: formNote.trim(),
        receipt_doc_id: formReceiptDoc.trim() || undefined,
        linked_task_id: formLinkedTask.trim() || undefined,
        updated_at: now,
      });

      await db.data_audit_logs.add({
        id: generateId(),
        timestamp: now,
        action: 'manual_entry',
        entity_type: 'expense',
        record_id: editingExpense.id,
        details: `Updated expense: ₹${formAmount} (${formCategory}, ${formArea}, ${formPaymentMethod})`,
        performed_by: 'Yaswanth (Founder)',
      });
    } else {
      const newId = generateId();
      const newExpense: Expense = {
        id: newId,
        amount: Number(formAmount),
        category: formCategory,
        area: formArea,
        date: formDate,
        payment_method: formPaymentMethod,
        note: formNote.trim(),
        receipt_doc_id: formReceiptDoc.trim() || undefined,
        linked_task_id: formLinkedTask.trim() || undefined,
        source: 'USER_ENTERED',
        created_by: 'Yaswanth (Founder)',
        last_verified_at: now,
        status: 'active',
        created_at: now,
        updated_at: now,
      };
      await db.expenses.add(newExpense);

      await db.data_audit_logs.add({
        id: generateId(),
        timestamp: now,
        action: 'manual_entry',
        entity_type: 'expense',
        record_id: newId,
        details: `Manual entry: ₹${formAmount} (${formCategory}, ${formArea}, ${formPaymentMethod})`,
        performed_by: 'Yaswanth (Founder)',
      });
    }

    setIsModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (expenseToDelete) {
      const exp = await db.expenses.get(expenseToDelete);
      const now = new Date().toISOString();
      if (exp) {
        await db.data_audit_logs.add({
          id: generateId(),
          timestamp: now,
          action: 'delete',
          entity_type: 'expense',
          record_id: expenseToDelete,
          details: `Manual deletion by founder: ₹${exp.amount} (${exp.note || exp.category})`,
          performed_by: 'Yaswanth (Founder)',
        });
      }
      await db.expenses.delete(expenseToDelete);
      setExpenseToDelete(null);
    }
  };

  const categories: ExpenseCategory[] = ['Food', 'Travel', 'Business', 'Parts', 'Bills', 'Equipment', 'Other'];
  const paymentMethods: PaymentMethod[] = ['UPI', 'Card', 'NetBanking', 'Cash', 'Reimbursement', 'Other'];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
              Expenses & Financials
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Zero Auto-Logging Enforced</span>
            </span>
          </div>
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mt-1 flex items-center gap-1.5">
            <span>Expenses: manually entered only</span>
            <span className="text-[var(--hub-muted)] font-normal">• Founder burn rate, hardware parts procurement, and verified capital</span>
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Expense</span>
        </button>
      </div>

      {/* Monthly Summary Cards (Protocol v2 compliant) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <StatCard
          label="Total Spend (Filtered)"
          value={totalAmount === 0 ? '₹0' : formatINR(totalAmount)}
          subtext={`Cycle: ${selectedMonth} • Verified`}
          icon={<IndianRupee className="w-5 h-5 text-amber-600" />}
        />
        <StatCard
          label="Transactions"
          value={filteredExpenses.length}
          subtext="Logged entries in this cycle"
          icon={<PieChart className="w-5 h-5 text-teal-600" />}
        />
        <StatCard
          label="Average Ticket"
          value={filteredExpenses.length > 0 ? formatINR(Math.round(totalAmount / filteredExpenses.length)) : '—'}
          subtext="Per expense average"
          icon={<TrendingDown className="w-5 h-5 text-blue-600" />}
        />
      </div>

      {/* Category Breakdown (Protocol v2: Show 'No expenses logged yet' when empty) */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold font-heading text-[var(--hub-ink)] uppercase tracking-wider">
            Category Breakdown ({selectedMonth})
          </h3>
          <span className="text-xs text-[var(--hub-muted)]">Verified real data</span>
        </div>
        {filteredExpenses.length === 0 ? (
          <p className="text-sm text-[var(--hub-muted)] py-2 italic">
            No expenses logged yet
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.keys(categoryTotals).map((cat) => {
              const amount = categoryTotals[cat];
              const pct = Math.round((amount / totalAmount) * 100);
              return (
                <div
                  key={cat}
                  className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-[var(--hub-ink)] mb-1">
                    <span>{cat}</span>
                    <span>{formatINR(amount)} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[var(--hub-line)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--hub-accent)] rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes or category..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] placeholder:text-[var(--hub-muted)]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Month selector */}
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
          />

          {/* Area select */}
          <select
            value={selectedAreaFilter}
            onChange={(e) => setSelectedAreaFilter(e.target.value)}
            className="py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
          >
            <option value="All">All Areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Category filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs font-medium cursor-pointer"
          >
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Expense Transaction History */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl divide-y divide-[var(--hub-line)] overflow-hidden shadow-xs">
        {sortedExpenses.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--hub-muted)]">
            <IndianRupee className="w-10 h-10 mx-auto text-amber-500 mb-3 opacity-60" />
            <h3 className="text-base font-bold text-[var(--hub-ink)]">No expenses found</h3>
            <p className="text-xs mt-1 text-[var(--hub-muted)]">
              Expenses: manually entered only. Zero auto-logged entries.
            </p>
          </div>
        ) : (
          sortedExpenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between gap-3 p-4 hover:bg-[var(--hub-bg)]/50 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold font-heading text-[var(--hub-ink)]">
                    {formatINR(expense.amount)}
                  </span>
                  <Badge variant="amber">{expense.category}</Badge>
                  <Badge variant="teal">{expense.area}</Badge>
                  {expense.payment_method && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-line)] font-medium">
                      {expense.payment_method}
                    </span>
                  )}
                </div>

                <p className="text-xs text-[var(--hub-ink)] mt-1 truncate font-medium">
                  {expense.note || 'No description provided'}
                </p>

                <div className="flex items-center gap-3 text-[11px] text-[var(--hub-muted)] mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{formatShortDate(expense.date)}</span>
                  </span>
                  {expense.source && (
                    <span className="text-[10px] uppercase font-bold text-teal-600 dark:text-teal-400">
                      [{expense.source}]
                    </span>
                  )}
                  {expense.receipt_doc_id && (
                    <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400">
                      <FileText className="w-3 h-3" />
                      <span>{expense.receipt_doc_id}</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-none">
                <button
                  onClick={() => openEditModal(expense)}
                  className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                  title="Edit expense"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setExpenseToDelete(expense.id)}
                  className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                  title="Delete expense"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Collapsible Quarantine & Audit Log View */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl overflow-hidden shadow-xs">
        <button
          onClick={() => setShowQuarantine(!showQuarantine)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--hub-bg)]/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-bold font-heading text-[var(--hub-ink)]">
              Quarantine & Data Audit Log ({quarantinedExpenses.length} Quarantined, {auditLogs.length} Logged)
            </h3>
          </div>
          {showQuarantine ? <ChevronUp className="w-4 h-4 text-[var(--hub-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--hub-muted)]" />}
        </button>

        {showQuarantine && (
          <div className="p-4 border-t border-[var(--hub-line)] space-y-4">
            <div>
              <h4 className="text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-2">
                Quarantined Records (Excluded from All Totals)
              </h4>
              {quarantinedExpenses.length === 0 ? (
                <p className="text-xs text-[var(--hub-muted)]">No records currently in quarantine.</p>
              ) : (
                <div className="space-y-2">
                  {quarantinedExpenses.map((q) => (
                    <div
                      key={q.id}
                      className="p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs text-[var(--hub-ink)] space-y-1"
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>Original ID: {q.original_id}</span>
                        <span className="text-red-600 dark:text-red-400 font-bold">QUARANTINED</span>
                      </div>
                      <div className="text-[var(--hub-muted)]">
                        Reason: <span className="text-red-600 dark:text-red-400 font-medium">{q.reason}</span>
                      </div>
                      <div className="text-[var(--hub-muted)]">
                        Source: {q.source} • Created by: {q.created_by} • At: {new Date(q.quarantined_at).toLocaleString()}
                      </div>
                      {q.original_data && (
                        <div className="mt-1 font-mono text-[11px] bg-[var(--hub-bg)] p-2 rounded border border-[var(--hub-line)]">
                          ₹{q.original_data.amount} — {q.original_data.note} ({q.original_data.category}, {q.original_data.area})
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-2">
                Recent Data Audit Log Entries
              </h4>
              {auditLogs.length === 0 ? (
                <p className="text-xs text-[var(--hub-muted)]">No audit entries recorded yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 rounded bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs flex items-start justify-between gap-2"
                    >
                      <div>
                        <span className="font-semibold text-[var(--hub-ink)]">[{log.action.toUpperCase()}]</span>{' '}
                        <span className="text-[var(--hub-muted)]">{log.details}</span>
                      </div>
                      <span className="text-[11px] text-[var(--hub-muted)] flex-none">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal for Adding / Editing Expense */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingExpense ? 'Edit Expense' : 'Log Expense (Manual Entry Only)'}
      >
        <form onSubmit={handleSaveExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Amount (₹ INR) *
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value ? Number(e.target.value) : '')}
                placeholder="₹ e.g. 8500"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] font-semibold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Category *
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as ExpenseCategory)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Workspace Area *
              </label>
              <select
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Date *
              </label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Description / What For *
            </label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="e.g. Laser cut stator core laminations"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Payment Method *
              </label>
              <select
                value={formPaymentMethod}
                onChange={(e) => setFormPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                {paymentMethods.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Receipt File / Document (Optional)
              </label>
              <input
                type="text"
                value={formReceiptDoc}
                onChange={(e) => setFormReceiptDoc(e.target.value)}
                placeholder="e.g. receipt_invoice_102.pdf"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Linked Project / Task ID (Optional)
            </label>
            <input
              type="text"
              value={formLinkedTask}
              onChange={(e) => setFormLinkedTask(e.target.value)}
              placeholder="e.g. task_neodymium_magnets"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--hub-line)]">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-accent)] text-white hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
            >
              {editingExpense ? 'Save Changes' : 'Log Expense'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(expenseToDelete)}
        onClose={() => setExpenseToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Expense"
        message="Are you sure you want to remove this expense record?"
      />
    </div>
  );
};
