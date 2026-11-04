import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FolderArchive,
  Upload,
  Search,
  File,
  Download,
  Trash2,
  Eye,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Tag,
  AlertCircle,
} from 'lucide-react';
import { db } from '../db';
import type { DocumentItem, Area } from '../types';
import { formatFileSize, formatShortDate, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface DocumentsPageProps {
  currentArea: string;
  areas: Area[];
}

export const DocumentsPage: React.FC<DocumentsPageProps> = ({ currentArea, areas }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArea, setUploadArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadNotes, setUploadNotes] = useState('');

  // Preview Modal State
  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Delete State
  const [docToDelete, setDocToDelete] = useState<string | null>(null);

  // Live Query
  const allDocs = useLiveQuery(() => db.documents.toArray(), []) || [];

  // Filter
  const filteredDocs = allDocs.filter((doc) => {
    if (selectedAreaFilter !== 'All' && doc.area !== selectedAreaFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = doc.title.toLowerCase().includes(q);
      const matchFile = doc.file_name.toLowerCase().includes(q);
      const matchTags = doc.tags?.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchFile && !matchTags) return false;
    }
    return true;
  });

  const sortedDocs = [...filteredDocs].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const totalBytes = allDocs.reduce((sum, d) => sum + d.file_size, 0);

  const getFileIcon = (mime: string) => {
    if (mime.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-purple-500" />;
    if (mime.includes('pdf')) return <FileText className="w-5 h-5 text-red-500" />;
    if (mime.includes('sheet') || mime.includes('csv') || mime.includes('excel'))
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    return <File className="w-5 h-5 text-blue-500" />;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const now = new Date().toISOString();
    const tagArray = uploadTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const newDoc: DocumentItem = {
      id: generateId(),
      title: uploadTitle.trim() || uploadFile.name,
      file_name: uploadFile.name,
      file_size: uploadFile.size,
      mime_type: uploadFile.type || 'application/octet-stream',
      tags: tagArray,
      area: uploadArea,
      notes: uploadNotes.trim() || undefined,
      data_blob: uploadFile, // Saved directly to IndexedDB!
      created_at: now,
      updated_at: now,
    };

    await db.documents.add(newDoc);
    setIsUploadOpen(false);
    setUploadFile(null);
    setUploadTitle('');
    setUploadTags('');
    setUploadNotes('');
  };

  const handleDownload = (doc: DocumentItem) => {
    if (!doc.data_blob) {
      alert('File content is not available locally.');
      return;
    }
    const url = URL.createObjectURL(doc.data_blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleOpenPreview = (doc: DocumentItem) => {
    setPreviewDoc(doc);
    if (doc.data_blob && doc.mime_type.startsWith('image/')) {
      const url = URL.createObjectURL(doc.data_blob);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const handleClosePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewDoc(null);
    setPreviewUrl(null);
  };

  const handleConfirmDelete = async () => {
    if (docToDelete) {
      await db.documents.delete(docToDelete);
      setDocToDelete(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight">
            Documents & Drawings
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Local IndexedDB file vault for CAD models, test sheets, grant PDFs and manuals
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--hub-accent)] text-white text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Document</span>
        </button>
      </div>

      {/* Storage Status & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--hub-surface)] border border-[var(--hub-line)] p-4 rounded-xl shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by title, file name or tags..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] placeholder:text-[var(--hub-muted)]"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedAreaFilter}
            onChange={(e) => setSelectedAreaFilter(e.target.value)}
            className="py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm font-medium cursor-pointer"
          >
            <option value="All">All Areas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>

          <div className="text-xs text-[var(--hub-muted)] font-medium whitespace-nowrap px-2">
            Local Storage: <strong className="text-[var(--hub-ink)]">{formatFileSize(totalBytes)}</strong>
          </div>
        </div>
      </div>

      {/* Documents Table / Grid */}
      <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl overflow-hidden shadow-xs">
        {sortedDocs.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--hub-muted)]">
            <FolderArchive className="w-10 h-10 mx-auto text-[var(--hub-muted)] mb-3 opacity-60" />
            <h3 className="text-base font-bold text-[var(--hub-ink)]">No documents in this view</h3>
            <p className="text-xs mt-1">Upload CAD drawings, test protocols, or reports to store locally.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--hub-line)]">
            {sortedDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-[var(--hub-bg)]/50 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex-none">
                    {getFileIcon(doc.mime_type)}
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[var(--hub-ink)] truncate">
                      {doc.title}
                    </h4>
                    <p className="text-xs text-[var(--hub-muted)] font-mono mt-0.5 truncate">
                      {doc.file_name} • {formatFileSize(doc.file_size)}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {doc.area && <Badge variant="teal">{doc.area}</Badge>}
                      <span className="text-[11px] text-[var(--hub-muted)]">
                        Uploaded: {formatShortDate(doc.created_at.slice(0, 10))}
                      </span>
                      {doc.tags?.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-line)]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>

                    {doc.notes && (
                      <p className="text-xs text-[var(--hub-muted)] mt-1.5 italic">
                        "{doc.notes}"
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center flex-none">
                  <button
                    onClick={() => handleOpenPreview(doc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Details</span>
                  </button>

                  <button
                    onClick={() => handleDownload(doc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>

                  <button
                    onClick={() => setDocToDelete(doc.id)}
                    className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer transition-colors"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        title="Upload Document into Local Vault"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Select File *
            </label>
            <input
              type="file"
              onChange={handleFileChange}
              className="w-full text-xs text-[var(--hub-muted)] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[var(--hub-accent)] file:text-white hover:file:bg-[var(--hub-accent-hover)] file:cursor-pointer"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Display Title *
            </label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="e.g. TRL 5 Wind Tunnel Testing Protocol"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Workspace Area
              </label>
              <select
                value={uploadArea}
                onChange={(e) => setUploadArea(e.target.value)}
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
                Tags (Comma separated)
              </label>
              <input
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                placeholder="CAD, Stator, Grant, Patent"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              File Notes / Version Info
            </label>
            <textarea
              value={uploadNotes}
              onChange={(e) => setUploadNotes(e.target.value)}
              rows={2}
              placeholder="Add key revision notes or author information..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div className="p-3 rounded-lg bg-teal-500/10 text-teal-800 dark:text-teal-200 text-xs">
            Documents are stored locally in IndexedDB persistent storage. When cloud storage is connected, private encrypted sync will be enabled.
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--hub-line)]">
            <button
              type="button"
              onClick={() => setIsUploadOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[var(--hub-accent)] text-white hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
            >
              Save to Vault
            </button>
          </div>
        </form>
      </Modal>

      {/* Preview / Details Modal */}
      {previewDoc && (
        <Modal isOpen={Boolean(previewDoc)} onClose={handleClosePreview} title={previewDoc.title}>
          <div className="space-y-4">
            {previewUrl && (
              <div className="rounded-lg overflow-hidden border border-[var(--hub-line)] max-h-80 flex items-center justify-center bg-black/5">
                <img src={previewUrl} alt={previewDoc.title} className="max-h-80 object-contain" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                <span className="text-[var(--hub-muted)] block">File Name</span>
                <span className="font-semibold text-[var(--hub-ink)] break-words">{previewDoc.file_name}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                <span className="text-[var(--hub-muted)] block">Size</span>
                <span className="font-semibold text-[var(--hub-ink)]">{formatFileSize(previewDoc.file_size)}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                <span className="text-[var(--hub-muted)] block">Workspace Area</span>
                <span className="font-semibold text-[var(--hub-ink)]">{previewDoc.area || 'Personal'}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                <span className="text-[var(--hub-muted)] block">Date Uploaded</span>
                <span className="font-semibold text-[var(--hub-ink)]">{formatShortDate(previewDoc.created_at.slice(0, 10))}</span>
              </div>
            </div>

            {previewDoc.notes && (
              <div className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)]">
                <strong className="block text-[var(--hub-muted)] mb-1">Notes:</strong>
                {previewDoc.notes}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--hub-line)]">
              <button
                type="button"
                onClick={() => handleDownload(previewDoc)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download File</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={Boolean(docToDelete)}
        onClose={() => setDocToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Document"
        message="Are you sure you want to delete this file from your local storage vault?"
      />
    </div>
  );
};
