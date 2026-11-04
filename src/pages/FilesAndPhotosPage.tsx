import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FolderArchive,
  Cloud,
  Image as ImageIcon,
  HardDrive,
  Search,
  Plus,
  FileText,
  FileSpreadsheet,
  FileCode,
  Download,
  Trash2,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Camera,
} from 'lucide-react';
import { db } from '../db';
import type { DocumentItem, GoogleDriveFile, Area } from '../types';
import { GoogleDriveService } from '../services/google/googleDriveService';
import { GooglePhotosService } from '../services/google/googlePhotosService';
import { GoogleAuthService } from '../services/google/googleAuthService';
import { formatFileSize, formatShortDate, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';

interface FilesAndPhotosPageProps {
  currentArea: string;
  areas: Area[];
}

export const FilesAndPhotosPage: React.FC<FilesAndPhotosPageProps> = ({ currentArea, areas }) => {
  const [activeTab, setActiveTab] = useState<'drive' | 'photos' | 'vault'>('drive');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);

  useEffect(() => {
    setSelectedAreaFilter(currentArea);
  }, [currentArea]);

  // Google Drive State
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isCreateDocModalOpen, setIsCreateDocModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocType, setNewDocType] = useState<'document' | 'spreadsheet' | 'presentation'>('document');

  // Google Photos Picker State
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [pickerStatus, setPickerStatus] = useState<string | null>(null);
  const [isOpeningPicker, setIsOpeningPicker] = useState(false);

  // Local Vault State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArea, setUploadArea] = useState('Personal');
  const [uploadTags, setUploadTags] = useState('');

  const isConnected = GoogleAuthService.isConnected();
  const localDocuments = useLiveQuery(() => db.documents.toArray(), []) || [];
  const importedPhotos = useLiveQuery(() => db.photos_media.toArray(), []) || [];

  // Load Google Drive files
  const loadDriveFiles = async () => {
    if (!isConnected) return;
    setIsLoadingDrive(true);
    try {
      const files = await GoogleDriveService.searchFiles(searchQuery);
      setDriveFiles(files);
    } finally {
      setIsLoadingDrive(false);
    }
  };

  useEffect(() => {
    if (isConnected && activeTab === 'drive') {
      loadDriveFiles();
    }
  }, [isConnected, activeTab]);

  // Create Google Doc / Sheet / Slide
  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim()) return;

    const file = await GoogleDriveService.createGoogleDoc(newDocTitle.trim(), newDocType);
    if (file) {
      await GoogleDriveService.importDriveFileToHub(file, selectedAreaFilter);
      setIsCreateDocModalOpen(false);
      setNewDocTitle('');
      window.open(file.webViewLink, '_blank');
      loadDriveFiles();
    }
  };

  // Launch Google Photos Picker API Session
  const handleStartPhotosPicker = async () => {
    setIsOpeningPicker(true);
    setPickerStatus('Initializing Google Photos Picker session...');
    try {
      const session = await GooglePhotosService.createPickerSession();
      if (!session) {
        setPickerStatus('Failed to start session. Ensure Google Account is connected.');
        return;
      }

      setActiveSessionId(session.sessionId);
      setPickerStatus('Session active! Select photos in the opened window, then click "Import Selected".');
      window.open(session.pickerUri, '_blank', 'width=800,height=600');
    } finally {
      setIsOpeningPicker(false);
    }
  };

  // Retrieve user selections from Photos Picker session
  const handleRetrievePhotos = async () => {
    if (!activeSessionId) return;
    setPickerStatus('Checking for selected photos...');
    const items = await GooglePhotosService.retrieveSelectedPhotos(activeSessionId, undefined, selectedAreaFilter);
    if (items.length > 0) {
      setPickerStatus(`✅ Successfully imported ${items.length} photos!`);
      setActiveSessionId(null);
    } else {
      setPickerStatus('No photos selected yet. Please select photos in the Google Photos window and click Done.');
    }
  };

  // Handle local file vault upload (IndexedDB Blob)
  const handleLocalUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    const now = new Date().toISOString();
    const doc: DocumentItem = {
      id: generateId(),
      title: uploadTitle.trim() || uploadFile.name,
      file_name: uploadFile.name,
      file_size: uploadFile.size,
      mime_type: uploadFile.type || 'application/octet-stream',
      tags: uploadTags.split(',').map((t) => t.trim()).filter(Boolean),
      area: uploadArea,
      data_blob: uploadFile,
      created_at: now,
      updated_at: now,
    };

    await db.documents.add(doc);
    setIsUploadModalOpen(false);
    setUploadFile(null);
    setUploadTitle('');
    setUploadTags('');
  };

  const getMimeIcon = (mime: string) => {
    if (mime.includes('spreadsheet') || mime.includes('sheet')) return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
    if (mime.includes('presentation') || mime.includes('slide')) return <FileCode className="w-5 h-5 text-amber-600" />;
    if (mime.includes('image')) return <ImageIcon className="w-5 h-5 text-purple-600" />;
    return <FileText className="w-5 h-5 text-blue-600" />;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <FolderArchive className="w-6 h-6 text-teal-600" />
            <span>Files, Drive & Photos</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Unified file experience across Google Drive, Google Photos Picker, and local IndexedDB vault
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'drive' && isConnected && (
            <button
              onClick={() => setIsCreateDocModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Google Doc / Sheet</span>
            </button>
          )}

          {activeTab === 'photos' && isConnected && (
            <button
              onClick={handleStartPhotosPicker}
              disabled={isOpeningPicker}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs disabled:opacity-50"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Select from Google Photos</span>
            </button>
          )}

          {activeTab === 'vault' && (
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Upload Local File</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--hub-line)] pb-2">
        <button
          onClick={() => setActiveTab('drive')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'drive'
              ? 'bg-[var(--hub-accent)] text-white shadow-xs'
              : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)]'
          }`}
        >
          <Cloud className="w-4 h-4" />
          <span>Google Drive</span>
        </button>

        <button
          onClick={() => setActiveTab('photos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'photos'
              ? 'bg-[var(--hub-accent)] text-white shadow-xs'
              : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)]'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Google Photos ({importedPhotos.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('vault')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
            activeTab === 'vault'
              ? 'bg-[var(--hub-accent)] text-white shadow-xs'
              : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)]'
          }`}
        >
          <HardDrive className="w-4 h-4" />
          <span>Local Vault ({localDocuments.length})</span>
        </button>
      </div>

      {/* Tab 1: Google Drive */}
      {activeTab === 'drive' && (
        <div className="space-y-4">
          {!isConnected ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center space-y-3">
              <Cloud className="w-10 h-10 text-amber-600 mx-auto" />
              <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                Connect Google Drive
              </h3>
              <p className="text-xs text-[var(--hub-muted)] max-w-md mx-auto">
                Authorize Google Workspace in the Connection Center to browse, create, and attach Google Docs, Sheets, and Slides.
              </p>
              <a
                href="#integrations"
                className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[var(--hub-accent)] text-white text-xs font-bold"
              >
                Go to Connection Center
              </a>
            </div>
          ) : (
            <>
              {/* Search Drive Toolbar */}
              <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 flex items-center gap-3">
                <Search className="w-4 h-4 text-[var(--hub-muted)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadDriveFiles()}
                  placeholder="Search Google Drive files..."
                  className="w-full bg-transparent text-xs text-[var(--hub-ink)] focus:outline-none"
                />
                <button
                  onClick={loadDriveFiles}
                  disabled={isLoadingDrive}
                  className="px-3 py-1 rounded bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] border border-[var(--hub-line)] cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Drive Files Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {driveFiles.map((file) => (
                  <div
                    key={file.id}
                    className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 space-y-3 hover:border-[var(--hub-accent)] transition-all shadow-xs flex flex-col justify-between"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-[var(--hub-bg)] flex-none">
                        {getMimeIcon(file.mimeType)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-xs text-[var(--hub-ink)] truncate" title={file.name}>
                          {file.name}
                        </h4>
                        <span className="text-[10px] text-[var(--hub-muted)] block mt-0.5">
                          {file.modifiedTime ? formatShortDate(file.modifiedTime.slice(0, 10)) : 'Drive Document'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[var(--hub-line)]">
                      <button
                        onClick={() => GoogleDriveService.importDriveFileToHub(file, selectedAreaFilter)}
                        className="text-[11px] text-[var(--hub-accent)] hover:underline font-semibold cursor-pointer"
                      >
                        + Pin to Vault
                      </button>
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[11px] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] font-medium"
                      >
                        <span>Open</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: Google Photos Picker */}
      {activeTab === 'photos' && (
        <div className="space-y-4">
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div>
              <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Google Photos Picker (Official Supported API)</span>
              </h3>
              <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                Explicit user selection ensures complete data sovereignty without claiming full background library access.
              </p>
            </div>

            {activeSessionId && (
              <button
                onClick={handleRetrievePhotos}
                className="px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-bold hover:bg-teal-700 cursor-pointer animate-pulse"
              >
                Import Selected Photos
              </button>
            )}
          </div>

          {pickerStatus && (
            <div className="p-3 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs text-[var(--hub-ink)] font-medium">
              {pickerStatus}
            </div>
          )}

          {/* Photo Gallery Grid */}
          {importedPhotos.length === 0 ? (
            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-12 text-center space-y-3">
              <Camera className="w-10 h-10 text-[var(--hub-muted)] mx-auto opacity-50" />
              <p className="text-sm font-semibold text-[var(--hub-ink)]">No Google Photos imported yet</p>
              <p className="text-xs text-[var(--hub-muted)]">
                Click "Select from Google Photos" to choose photos and attach them to engineering projects.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {importedPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl overflow-hidden group shadow-xs space-y-2 p-2 hover:border-[var(--hub-accent)] transition-all"
                >
                  <div className="aspect-square bg-[var(--hub-bg)] rounded-lg overflow-hidden relative">
                    <img
                      src={`${photo.baseUrl}=w400-h400`}
                      alt={photo.filename}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="px-1">
                    <h5 className="font-semibold text-xs text-[var(--hub-ink)] truncate">{photo.filename}</h5>
                    <span className="text-[10px] text-[var(--hub-muted)] block">
                      {formatShortDate(photo.selectedAt.slice(0, 10))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Local Documents Vault (IndexedDB Blobs) */}
      {activeTab === 'vault' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {localDocuments.map((doc) => (
              <div
                key={doc.id}
                className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 space-y-3 hover:border-[var(--hub-accent)] transition-all shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[var(--hub-bg)] flex-none">
                    {getMimeIcon(doc.mime_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-xs text-[var(--hub-ink)] truncate" title={doc.title}>
                      {doc.title}
                    </h4>
                    <span className="text-[10px] text-[var(--hub-muted)] block mt-0.5">
                      {formatFileSize(doc.file_size)} • {formatShortDate(doc.created_at.slice(0, 10))}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--hub-line)]">
                  <Badge variant="teal">{doc.area || 'Personal'}</Badge>
                  <div className="flex items-center gap-2">
                    {doc.data_blob && (
                      <button
                        onClick={() => {
                          const url = URL.createObjectURL(doc.data_blob!);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = doc.file_name;
                          a.click();
                        }}
                        className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                        title="Download file"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => db.documents.delete(doc.id)}
                      className="p-1 rounded text-[var(--hub-muted)] hover:text-red-500 cursor-pointer"
                      title="Delete from vault"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Create Google Doc */}
      <Modal
        isOpen={isCreateDocModalOpen}
        onClose={() => setIsCreateDocModalOpen(false)}
        title="Create New Google Workspace Document"
      >
        <form onSubmit={handleCreateDoc} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Document Title *</label>
            <input
              type="text"
              value={newDocTitle}
              onChange={(e) => setNewDocTitle(e.target.value)}
              placeholder="e.g. Aerodynamic Turbine Blade Spec v2"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              required
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Application Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'document', label: 'Google Docs', icon: FileText },
                  { id: 'spreadsheet', label: 'Google Sheets', icon: FileSpreadsheet },
                  { id: 'presentation', label: 'Google Slides', icon: FileCode },
                ] as const
              ).map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setNewDocType(t.id)}
                  className={`p-3 rounded-lg border text-center flex flex-col items-center gap-1 cursor-pointer ${
                    newDocType === t.id
                      ? 'border-[var(--hub-accent)] bg-[var(--hub-accent)]/10 font-bold'
                      : 'border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-muted)]'
                  }`}
                >
                  <t.icon className="w-4 h-4" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--hub-line)]">
            <button
              type="button"
              onClick={() => setIsCreateDocModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--hub-line)] font-semibold text-[var(--hub-ink)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[var(--hub-accent)] text-white font-bold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
            >
              Create in Google Drive
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Local Vault Upload */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        title="Upload Local File to Vault (IndexedDB)"
      >
        <form onSubmit={handleLocalUpload} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Choose File *</label>
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadFile(f);
                  if (!uploadTitle) setUploadTitle(f.name);
                }
              }}
              className="w-full text-xs text-[var(--hub-ink)] cursor-pointer"
              required
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Title</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            />
          </div>

          <div>
            <label className="block font-bold text-[var(--hub-ink)] mb-1">Workspace Area</label>
            <select
              value={uploadArea}
              onChange={(e) => setUploadArea(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
            >
              {areas.map((a) => (
                <option key={a.id} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--hub-line)]">
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-[var(--hub-line)] font-semibold text-[var(--hub-ink)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[var(--hub-accent)] text-white font-bold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
            >
              Save to Local Vault
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
