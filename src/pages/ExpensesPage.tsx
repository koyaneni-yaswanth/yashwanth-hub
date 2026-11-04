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
} from 'lucide-react';
import { db } from '../db';
import type { Expense, ExpenseCategory, Area } from '../types';
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

  // State
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);

  // Form Fields
  const [formAmount, setFormAmount] = useState<number | ''>('');
  const [formCategory, setFormCategory] = useState<ExpenseCategory>('Parts');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formDate, setFormDate] = useState(today);
  const [formNote, setFormNote] = useState('');

  // Live Query
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];

  // Filter
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

  // Area breakdown
  const areaTotals: Record<string, number> = {};
  filteredExpenses.forEach((e) => {
    areaTotals[e.area] = (areaTotals[e.area] || 0) + e.amount;
  });

  const openCreateModal = () => {
    setEditingExpense(null);
    setFormAmount('');
    setFormCategory('Parts');
    setFormArea(selectedAreaFilter !== 'All' ? selectedAreaFilter : 'PAWAN SHAKTI');
    setFormDate(today);
    setFormNote('');
    setIsModalOpen(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormAmount(expense.amount);
    setFormCategory(expense.category);
    setFormArea(expense.area);
    setFormDate(expense.date);
    setFormNote(expense.note);
    setIsModalOpen(true);
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formAmount === '' || Number(formAmount) <= 0) return;

    const now = new Date().toISOString();

    if (editingExpense) {
      await db.expenses.update(editingExpense.id, {
        amount: Number(formAmount),
        category: formCategory,
        area: formArea,
        date: formDate,
        note: formNote.trim(),
        updated_at: now,
      });
    } else {
      const newExpense: Expense = {
        id: generateId(),
        amount: Number(formAmount),
        category: formCategory,
        area: formArea,
        date: formDate,
        note: formNote.trim(),
        created_at: now,
        updated_at: now,
      };
      await db.expenses.add(newExpense);
    }

    setIsModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (expenseToDelete) {
      await db.expenses.delete(expenseToDelete);
      setExpenseToDelete(null);
    }
  };

  const categories: ExpenseCategory[] = ['Food', 'Travel', 'Business', 'Parts', 'Bills', 'Equipment', 'Other'];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Expenses & Financials
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Founder burn rate, hardware parts procurement, travel, and operational expenditure
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

      {/* Monthly Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <StatCard
          label="Total Spend (Filtered)"
          value={formatINR(totalAmount)}
          subtext={`Cycle: ${selectedMonth}`}
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
          value={filteredExpenses.length > 0 ? formatINR(Math.round(totalAmount / filteredExpenses.length)) : '₹ 0'}
          subtext="Per expense average"
          icon={<TrendingDown className="w-5 h-5 text-blue-600" />}
        />
      </div>

      {/* Category Breakdown Progress Bars (Matching authentic Yashwanth Hub prototype!) */}
      {totalAmount > 0 && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs">
          <h3 className="text-sm font-bold font-heading text-[var(--hub-ink)] uppercase tracking-wider mb-4">
            Category Breakdown ({selectedMonth})
          </h3>
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
        </div>
      )}

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
            <p className="text-xs mt-1">Record purchases, supplier invoices, or personal bills.</p>
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
                </div>

                <p className="text-xs text-[var(--hub-muted)] mt-1 truncate">
                  {expense.note || 'No description provided'}
                </p>

                <div className="flex items-center gap-1.5 text-[11px] text-[var(--hub-muted)] mt-1">
                  <Calendar className="w-3 h-3" />
                  <span>{formatShortDate(expense.date)}</span>
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

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingExpense ? 'Edit Expense' : 'Log Expense'}
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
                Category
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
                Workspace Area
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
              Description / What For
            </label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="e.g. Laser cut stator core laminations"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
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
