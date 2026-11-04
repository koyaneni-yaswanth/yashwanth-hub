import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Mail,
  Search,
  RefreshCw,
  Plus,
  Clock,
  Send,
  Sparkles,
  Inbox,
} from 'lucide-react';
import { db } from '../db';
import type { GmailFollowUpItem } from '../types';
import { GmailService } from '../services/google/gmailService';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';

interface GmailPageProps {
  onNavigateToTasks?: () => void;
}

export const GmailPage: React.FC<GmailPageProps> = ({ onNavigateToTasks }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'unread' | 'deadlines'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<GmailFollowUpItem | null>(null);
  const [draftReplyBody, setDraftReplyBody] = useState('');
  const [draftStatus, setDraftStatus] = useState<string | null>(null);

  const isConnected = GoogleAuthService.isConnected();
  const cachedMessages = useLiveQuery(() => db.gmail_messages.toArray(), []) || [];

  const handleFetchMessages = async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      const q = searchQuery.trim() || 'label:INBOX';
      await GmailService.searchMessages(q);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && cachedMessages.length === 0) {
      handleFetchMessages();
    }
  }, [isConnected]);

  // Convert email to task with one click
  const handleConvertToTask = async (item: GmailFollowUpItem) => {
    await GmailService.convertEmailToTask(item);
    if (onNavigateToTasks) {
      onNavigateToTasks();
    } else {
      alert(`Created task: "Follow up: ${item.subject}" in Tasks.`);
    }
  };

  // Open safe reply draft modal
  const openDraftModal = (item: GmailFollowUpItem) => {
    setActiveItem(item);
    setDraftReplyBody(`Hi,\n\nThank you for reaching out regarding "${item.subject}".\n\nI am reviewing the deliverable and will follow up shortly.\n\nBest regards,\nYashwanth`);
    setDraftStatus(null);
    setIsDraftModalOpen(true);
  };

  const handleSaveDraft = async () => {
    if (!activeItem) return;
    setIsLoading(true);
    setDraftStatus('Saving draft to Gmail...');
    const success = await GmailService.createDraftReply(
      activeItem.from,
      activeItem.subject,
      draftReplyBody,
      activeItem.threadId
    );
    setIsLoading(false);
    if (success) {
      setDraftStatus('✅ Draft saved to your Gmail Drafts folder. (Never auto-sent)');
      setTimeout(() => setIsDraftModalOpen(false), 2000);
    } else {
      setDraftStatus('❌ Failed to save draft. Check Gmail API authorization.');
    }
  };

  const filtered = cachedMessages.filter((m) => {
    if (filterMode === 'unread') return m.status === 'pending';
    if (filterMode === 'deadlines') return Boolean(m.detectedDeadline);
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <Mail className="w-6 h-6 text-red-500" />
            <span>Gmail Intelligence & Follow-Ups</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Real-time deadline detection, supplier follow-ups, and safe draft replies via official Gmail API
          </p>
        </div>

        {isConnected && (
          <button
            onClick={handleFetchMessages}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>{isLoading ? 'Scanning...' : 'Sync Gmail'}</span>
          </button>
        )}
      </div>

      {/* Connection Banner */}
      {!isConnected ? (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center space-y-3">
          <Mail className="w-10 h-10 text-amber-600 mx-auto" />
          <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
            Connect Your Google Account
          </h3>
          <p className="text-xs text-[var(--hub-muted)] max-w-md mx-auto">
            Authorize read-only access to scan important emails, detect pending deadlines, and link messages to founder projects.
          </p>
          <a
            href="#integrations"
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-bold hover:bg-[var(--hub-accent-hover)]"
          >
            Go to Connection Center
          </a>
        </div>
      ) : (
        <>
          {/* Search & Filter Toolbar */}
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 flex flex-col sm:flex-row items-center gap-3 shadow-xs">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-[var(--hub-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetchMessages()}
                placeholder="Search email threads (e.g. 'supplier', 'contract', 'TRL', 'has:attachment')..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] focus:outline-none focus:border-[var(--hub-accent)]"
              />
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              {(
                [
                  { id: 'all', label: 'All Emails' },
                  { id: 'deadlines', label: 'Deadlines & Tasks' },
                  { id: 'unread', label: 'Pending Reply' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilterMode(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    filterMode === f.id
                      ? 'bg-[var(--hub-accent)] text-white'
                      : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Email List */}
          {filtered.length === 0 ? (
            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-12 text-center space-y-3">
              <Inbox className="w-10 h-10 text-[var(--hub-muted)] mx-auto opacity-50" />
              <p className="text-sm font-semibold text-[var(--hub-ink)]">No messages match this filter</p>
              <p className="text-xs text-[var(--hub-muted)]">
                Click "Sync Gmail" to fetch recent important threads or adjust your search keywords.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 space-y-3 hover:border-[var(--hub-accent)] transition-all shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold text-sm text-[var(--hub-ink)]">
                        {item.from}
                      </span>
                      {item.detectedDeadline && (
                        <Badge variant="red">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Deadline: {item.detectedDeadline}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-[var(--hub-muted)]">{item.date}</span>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-[var(--hub-ink)]">{item.subject}</h4>
                    <p className="text-xs text-[var(--hub-muted)] mt-1 line-clamp-2 leading-relaxed">
                      {item.snippet}
                    </p>
                  </div>

                  {item.suggestedAction && (
                    <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-center gap-2 text-xs text-[var(--hub-accent)] font-medium">
                      <Sparkles className="w-3.5 h-3.5 flex-none text-amber-500" />
                      <span>AI Suggestion: {item.suggestedAction}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--hub-line)]">
                    <span className="text-[10px] text-[var(--hub-muted)] font-mono">
                      Thread ID: {item.threadId}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleConvertToTask(item)}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] cursor-pointer"
                        title="Create a linked task in Yashwanth Hub"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create Task</span>
                      </button>
                      <button
                        onClick={() => openDraftModal(item)}
                        className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>Draft Reply</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Safe Draft Reply Modal */}
      <Modal
        isOpen={isDraftModalOpen}
        onClose={() => setIsDraftModalOpen(false)}
        title="Prepare Reply Draft (Gmail Drafts API)"
      >
        <div className="space-y-4 text-xs">
          <p className="text-[var(--hub-muted)]">
            Per safety standards, this will save a draft to your Gmail account. <strong>Emails are never sent automatically.</strong>
          </p>
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">To</label>
            <input
              type="text"
              value={activeItem?.from || ''}
              disabled
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] font-mono"
            />
          </div>
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Subject</label>
            <input
              type="text"
              value={`Re: ${activeItem?.subject || ''}`}
              disabled
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] font-semibold"
            />
          </div>
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Draft Body *</label>
            <textarea
              rows={6}
              value={draftReplyBody}
              onChange={(e) => setDraftReplyBody(e.target.value)}
              className="w-full p-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
            />
          </div>

          {draftStatus && (
            <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] font-medium">
              {draftStatus}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--hub-line)]">
            <button
              onClick={() => setIsDraftModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--hub-line)] font-semibold text-[var(--hub-ink)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={isLoading}
              className="px-5 py-2 rounded-lg bg-[var(--hub-accent)] text-white font-bold hover:bg-[var(--hub-accent-hover)] cursor-pointer disabled:opacity-50"
            >
              Save to Gmail Drafts
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
