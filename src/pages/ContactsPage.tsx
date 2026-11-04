import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  Building,
  Trash2,
  Edit2,
  ExternalLink,
} from 'lucide-react';
import { db } from '../db';
import type { Contact, Area } from '../types';
import { generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface ContactsPageProps {
  currentArea: string;
  areas: Area[];
}

export const ContactsPage: React.FC<ContactsPageProps> = ({ currentArea, areas }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactToDelete, setContactToDelete] = useState<string | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formNote, setFormNote] = useState('');

  // Live Query
  const allContacts = useLiveQuery(() => db.contacts.toArray(), []) || [];

  // Filter
  const filteredContacts = allContacts.filter((c) => {
    if (selectedAreaFilter !== 'All' && c.area !== selectedAreaFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchRole = c.role.toLowerCase().includes(q);
      const matchCompany = c.company?.toLowerCase().includes(q) || false;
      const matchEmail = c.email?.toLowerCase().includes(q) || false;
      const matchPhone = c.phone?.toLowerCase().includes(q) || false;
      if (!matchName && !matchRole && !matchCompany && !matchEmail && !matchPhone) return false;
    }
    return true;
  });

  const sortedContacts = [...filteredContacts].sort((a, b) => a.name.localeCompare(b.name));

  const openCreateModal = () => {
    setEditingContact(null);
    setFormName('');
    setFormRole('');
    setFormCompany('');
    setFormPhone('');
    setFormEmail('');
    setFormArea(selectedAreaFilter !== 'All' ? selectedAreaFilter : 'PAWAN SHAKTI');
    setFormNote('');
    setIsModalOpen(true);
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setFormName(contact.name);
    setFormRole(contact.role);
    setFormCompany(contact.company || '');
    setFormPhone(contact.phone || '');
    setFormEmail(contact.email || '');
    setFormArea(contact.area || 'Personal');
    setFormNote(contact.note || '');
    setIsModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const now = new Date().toISOString();

    if (editingContact) {
      await db.contacts.update(editingContact.id, {
        name: formName.trim(),
        role: formRole.trim(),
        company: formCompany.trim() || undefined,
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        area: formArea,
        note: formNote.trim() || undefined,
        updated_at: now,
      });
    } else {
      const newContact: Contact = {
        id: generateId(),
        name: formName.trim(),
        role: formRole.trim(),
        company: formCompany.trim() || undefined,
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        area: formArea,
        note: formNote.trim() || undefined,
        created_at: now,
        updated_at: now,
      };
      await db.contacts.add(newContact);
    }

    setIsModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (contactToDelete) {
      await db.contacts.delete(contactToDelete);
      setContactToDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Contacts & Rolodex
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Key advisors, lab professors, component suppliers, grant officers, and team
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Contact</span>
        </button>
      </div>

      {/* Search and Area Filter */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts by name, role, company or email..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] placeholder:text-[var(--hub-muted)]"
          />
        </div>

        <select
          value={selectedAreaFilter}
          onChange={(e) => setSelectedAreaFilter(e.target.value)}
          className="w-full sm:w-auto py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm font-medium cursor-pointer"
        >
          <option value="All">All Areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {/* Contacts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedContacts.length === 0 ? (
          <div className="col-span-full bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-12 text-center text-sm text-[var(--hub-muted)]">
            <Users className="w-10 h-10 mx-auto text-teal-600 mb-3 opacity-60" />
            <h3 className="text-base font-bold text-[var(--hub-ink)]">No contacts found</h3>
            <p className="text-xs mt-1">Add research advisors, suppliers, and collaborators.</p>
          </div>
        ) : (
          sortedContacts.map((contact) => (
            <div
              key={contact.id}
              className="flex flex-col justify-between p-5 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl hover:border-[var(--hub-accent)] transition-all shadow-xs"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-sm border border-teal-500/20 flex-none">
                      {contact.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-bold font-heading text-[var(--hub-ink)] leading-tight">
                        {contact.name}
                      </h3>
                      <p className="text-xs text-[var(--hub-muted)] font-medium mt-0.5">
                        {contact.role}
                      </p>
                    </div>
                  </div>

                  {contact.area && <Badge variant="teal">{contact.area}</Badge>}
                </div>

                {contact.company && (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--hub-muted)] mt-2">
                    <Building className="w-3.5 h-3.5 flex-none" />
                    <span>{contact.company}</span>
                  </div>
                )}

                {/* Direct Action Links */}
                <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-[var(--hub-line)] text-xs">
                  {contact.phone && (
                    <a
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-2 text-[var(--hub-ink)] hover:text-[var(--hub-accent)] transition-colors py-0.5"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{contact.phone}</span>
                    </a>
                  )}

                  {contact.email && (
                    <a
                      href={`mailto:${contact.email}`}
                      className="flex items-center gap-2 text-[var(--hub-ink)] hover:text-[var(--hub-accent)] transition-colors py-0.5"
                    >
                      <Mail className="w-3.5 h-3.5 text-blue-600" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                </div>

                {contact.note && (
                  <p className="text-xs text-[var(--hub-muted)] bg-[var(--hub-bg)] p-2.5 rounded-lg mt-3 border border-[var(--hub-line)] italic">
                    "{contact.note}"
                  </p>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-end gap-1 pt-3 mt-4 border-t border-[var(--hub-line)]">
                <button
                  onClick={() => openEditModal(contact)}
                  className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                  title="Edit contact"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setContactToDelete(contact.id)}
                  className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                  title="Delete contact"
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
        title={editingContact ? 'Edit Contact' : 'Add Contact'}
      >
        <form onSubmit={handleSaveContact} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Dr. K. S. Sharma"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Role / Title *
              </label>
              <input
                type="text"
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                placeholder="e.g. Principal Advisor or Stator Supplier"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Company / Institution
              </label>
              <input
                type="text"
                value={formCompany}
                onChange={(e) => setFormCompany(e.target.value)}
                placeholder="e.g. Renewable Energy Lab, VNIT"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="+91 98220 12345"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="advisor@vnit.ac.in"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

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
              Notes & Context
            </label>
            <textarea
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              rows={2}
              placeholder="Key collaboration notes or terms..."
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
              {editingContact ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(contactToDelete)}
        onClose={() => setContactToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Contact"
        message="Are you sure you want to remove this contact from your rolodex?"
      />
    </div>
  );
};
