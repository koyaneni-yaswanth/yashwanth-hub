import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Plane,
  Plus,
  Train,
  Car,
  Bus,
  Calendar,
  IndianRupee,
  MapPin,
  Trash2,
  Edit2,
  CheckCircle2,
  Navigation,
} from 'lucide-react';
import { db } from '../db';
import type { TravelRecord, Area } from '../types';
import { formatINR, formatShortDate, getTodayISO, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface TravelPageProps {
  currentArea: string;
  areas: Area[];
}

export const TravelPage: React.FC<TravelPageProps> = ({ currentArea, areas }) => {
  const today = getTodayISO();

  // State
  const [statusFilter, setStatusFilter] = useState<'all' | 'upcoming' | 'completed'>('upcoming');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<TravelRecord | null>(null);
  const [tripToDelete, setTripToDelete] = useState<string | null>(null);

  // Form State
  const [formDestination, setFormDestination] = useState('');
  const [formPurpose, setFormPurpose] = useState('');
  const [formStartDate, setFormStartDate] = useState(today);
  const [formEndDate, setFormEndDate] = useState(today);
  const [formMode, setFormMode] = useState<TravelRecord['mode']>('Flight');
  const [formBookingRef, setFormBookingRef] = useState('');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formCost, setFormCost] = useState<number | ''>('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<TravelRecord['status']>('planning');

  // Live Query
  const allTravel = useLiveQuery(() => db.travel.toArray(), []) || [];
  const travelList = currentArea === 'All' ? allTravel : allTravel.filter((t) => t.area === currentArea);

  // Filter
  const filteredTravel = travelList.filter((trip) => {
    if (statusFilter === 'upcoming') {
      return trip.status !== 'completed' && trip.end_date >= today;
    }
    if (statusFilter === 'completed') {
      return trip.status === 'completed' || trip.end_date < today;
    }
    return true;
  });

  const sortedTravel = [...filteredTravel].sort((a, b) => b.start_date.localeCompare(a.start_date));

  const totalCost = travelList.reduce((sum, t) => sum + (t.cost_estimate || 0), 0);

  const getModeIcon = (mode: TravelRecord['mode']) => {
    switch (mode) {
      case 'Flight':
        return <Plane className="w-4 h-4 text-blue-500" />;
      case 'Train':
        return <Train className="w-4 h-4 text-emerald-500" />;
      case 'Cab / Car':
        return <Car className="w-4 h-4 text-amber-500" />;
      case 'Bus':
        return <Bus className="w-4 h-4 text-purple-500" />;
      default:
        return <Navigation className="w-4 h-4 text-teal-500" />;
    }
  };

  const openCreateModal = () => {
    setEditingTrip(null);
    setFormDestination('');
    setFormPurpose('');
    setFormStartDate(today);
    setFormEndDate(today);
    setFormMode('Flight');
    setFormBookingRef('');
    setFormArea(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
    setFormCost('');
    setFormNotes('');
    setFormStatus('planning');
    setIsModalOpen(true);
  };

  const openEditModal = (trip: TravelRecord) => {
    setEditingTrip(trip);
    setFormDestination(trip.destination);
    setFormPurpose(trip.purpose);
    setFormStartDate(trip.start_date);
    setFormEndDate(trip.end_date);
    setFormMode(trip.mode);
    setFormBookingRef(trip.booking_reference || '');
    setFormArea(trip.area);
    setFormCost(trip.cost_estimate || '');
    setFormNotes(trip.notes_and_itinerary || '');
    setFormStatus(trip.status);
    setIsModalOpen(true);
  };

  const handleSaveTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDestination.trim()) return;

    const now = new Date().toISOString();

    if (editingTrip) {
      await db.travel.update(editingTrip.id, {
        destination: formDestination.trim(),
        purpose: formPurpose.trim(),
        start_date: formStartDate,
        end_date: formEndDate,
        mode: formMode,
        booking_reference: formBookingRef.trim() || undefined,
        area: formArea,
        cost_estimate: formCost !== '' ? Number(formCost) : undefined,
        notes_and_itinerary: formNotes.trim() || undefined,
        status: formStatus,
        updated_at: now,
      });
    } else {
      const newTrip: TravelRecord = {
        id: generateId(),
        destination: formDestination.trim(),
        purpose: formPurpose.trim(),
        start_date: formStartDate,
        end_date: formEndDate,
        mode: formMode,
        booking_reference: formBookingRef.trim() || undefined,
        area: formArea,
        cost_estimate: formCost !== '' ? Number(formCost) : undefined,
        notes_and_itinerary: formNotes.trim() || undefined,
        status: formStatus,
        created_at: now,
        updated_at: now,
      };
      await db.travel.add(newTrip);
    }

    setIsModalOpen(false);
  };

  const handleToggleCompleted = async (trip: TravelRecord) => {
    const nextStatus = trip.status === 'completed' ? 'booked' : 'completed';
    await db.travel.update(trip.id, {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    });
  };

  const handleConfirmDelete = async () => {
    if (tripToDelete) {
      await db.travel.delete(tripToDelete);
      setTripToDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Travel & Field Trips
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Founder visits to wind sites, labs, suppliers, and client deployments
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Plan Trip</span>
        </button>
      </div>

      {/* Stats Summary & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--hub-surface)] border border-[var(--hub-line)] p-4 rounded-xl shadow-xs">
        <div className="flex items-center gap-2">
          {(
            [
              { id: 'upcoming', label: 'Upcoming Trips' },
              { id: 'completed', label: 'Completed' },
              { id: 'all', label: `All Trips (${travelList.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[var(--hub-accent)] text-white'
                  : 'bg-[var(--hub-bg)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs font-medium text-[var(--hub-muted)]">
          Total travel budget / expenditure: <strong className="text-[var(--hub-ink)] font-bold text-sm">{formatINR(totalCost)}</strong>
        </div>
      </div>

      {/* Travel Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedTravel.length === 0 ? (
          <div className="col-span-full bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-12 text-center text-sm text-[var(--hub-muted)]">
            <Plane className="w-10 h-10 mx-auto text-blue-500 mb-3 opacity-60" />
            <h3 className="text-base font-bold text-[var(--hub-ink)]">No trips in this view</h3>
            <p className="text-xs mt-1">Plan your next site visit, supplier meeting, or conference trip.</p>
          </div>
        ) : (
          sortedTravel.map((trip) => {
            const isCompleted = trip.status === 'completed';
            return (
              <div
                key={trip.id}
                className={`flex flex-col justify-between p-5 rounded-xl border transition-all ${
                  isCompleted
                    ? 'bg-[var(--hub-surface-subtle)] border-[var(--hub-line)] opacity-80'
                    : 'bg-[var(--hub-surface)] border-[var(--hub-line)] hover:border-[var(--hub-accent)] shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      {getModeIcon(trip.mode)}
                      <span className="text-xs font-bold text-[var(--hub-ink)] uppercase">
                        {trip.mode}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={isCompleted ? 'gray' : trip.status === 'booked' ? 'emerald' : 'amber'} dot>
                        {trip.status.toUpperCase()}
                      </Badge>
                      <Badge variant="teal">{trip.area}</Badge>
                    </div>
                  </div>

                  <h3 className="text-lg font-bold font-heading text-[var(--hub-ink)] flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-red-500 flex-none" />
                    <span>{trip.destination}</span>
                  </h3>

                  <p className="text-xs font-medium text-[var(--hub-muted)] mt-1">
                    {trip.purpose}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--hub-muted)] mt-3">
                    <span className="flex items-center gap-1 font-semibold text-[var(--hub-ink)]">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      {formatShortDate(trip.start_date)}
                      {trip.start_date !== trip.end_date && ` - ${formatShortDate(trip.end_date)}`}
                    </span>

                    {trip.cost_estimate !== undefined && trip.cost_estimate > 0 && (
                      <span className="flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                        <IndianRupee className="w-3.5 h-3.5" />
                        {formatINR(trip.cost_estimate)}
                      </span>
                    )}

                    {trip.booking_reference && (
                      <span className="font-mono bg-[var(--hub-bg)] px-2 py-0.5 rounded border border-[var(--hub-line)]">
                        Ref: {trip.booking_reference}
                      </span>
                    )}
                  </div>

                  {trip.notes_and_itinerary && (
                    <div className="mt-3 p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] whitespace-pre-wrap">
                      <p className="font-bold text-[11px] uppercase tracking-wider text-[var(--hub-muted)] mb-1">
                        Itinerary & Agenda
                      </p>
                      {trip.notes_and_itinerary}
                    </div>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-end gap-1 pt-4 mt-4 border-t border-[var(--hub-line)]">
                  <button
                    onClick={() => handleToggleCompleted(trip)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isCompleted
                        ? 'text-emerald-600 hover:bg-emerald-500/10'
                        : 'text-[var(--hub-muted)] hover:text-emerald-600 hover:bg-[var(--hub-bg)]'
                    }`}
                    title={isCompleted ? 'Mark active' : 'Mark completed'}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(trip)}
                    className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                    title="Edit trip"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setTripToDelete(trip.id)}
                    className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                    title="Delete trip"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTrip ? 'Edit Trip' : 'Plan Trip'}
      >
        <form onSubmit={handleSaveTrip} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Destination City / Site *
            </label>
            <input
              type="text"
              value={formDestination}
              onChange={(e) => setFormDestination(e.target.value)}
              placeholder="e.g. Pune Industrial Zone or Wind Site Muppandal"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Purpose *
            </label>
            <input
              type="text"
              value={formPurpose}
              onChange={(e) => setFormPurpose(e.target.value)}
              placeholder="e.g. Laser cut stator laminations inspection & vendor audit"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Departure Date *
              </label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Return Date *
              </label>
              <input
                type="date"
                value={formEndDate}
                onChange={(e) => setFormEndDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Mode
              </label>
              <select
                value={formMode}
                onChange={(e) => setFormMode(e.target.value as any)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                <option value="Flight">Flight</option>
                <option value="Train">Train</option>
                <option value="Cab / Car">Cab / Car</option>
                <option value="Bus">Bus</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as any)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                <option value="planning">Planning</option>
                <option value="booked">Booked</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Cost Est. (₹)
              </label>
              <input
                type="number"
                value={formCost}
                onChange={(e) => setFormCost(e.target.value ? Number(e.target.value) : '')}
                placeholder="₹"
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
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
                Booking Reference / PNR
              </label>
              <input
                type="text"
                value={formBookingRef}
                onChange={(e) => setFormBookingRef(e.target.value)}
                placeholder="e.g. 6E-2841 / PNR 4829"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Itinerary & Meeting Schedule
            </label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={3}
              placeholder="Day 1 morning: Factory tour. Afternoon: Technical spec review..."
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
              {editingTrip ? 'Save Changes' : 'Record Trip'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(tripToDelete)}
        onClose={() => setTripToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Trip"
        message="Are you sure you want to remove this travel record?"
      />
    </div>
  );
};
