import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FolderKanban,
  Plus,
  Search,
  Edit2,
  Trash2,
  ListTodo,
} from 'lucide-react';
import { db } from '../db';
import type { Project, ProjectStatus, Priority, Area } from '../types';
import { formatShortDate, getTodayISO, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

interface ProjectsPageProps {
  currentArea: string;
  areas: Area[];
  onNavigateToTasks?: () => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  currentArea,
  areas,
  onNavigateToTasks,
}) => {
  const today = getTodayISO();

  // State
  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'milestones'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('active');
  const [formPriority, setFormPriority] = useState<Priority>('high');
  const [formStartDate, setFormStartDate] = useState(today);
  const [formTargetDate, setFormTargetDate] = useState(today);
  const [formProgress, setFormProgress] = useState(30);
  const [formTags, setFormTags] = useState('');
  const [formMilestones, setFormMilestones] = useState<{ id: string; title: string; done: boolean }[]>([
    { id: generateId(), title: 'Phase 1 Architecture Freeze', done: true },
    { id: generateId(), title: 'Prototype Validation Run', done: false },
  ]);

  // Live Query
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];

  // Filter
  const filteredProjects = allProjects.filter((p) => {
    if (selectedAreaFilter !== 'All' && p.area !== selectedAreaFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchDesc = p.description.toLowerCase().includes(q);
      const matchTags = p.tags?.some((t) => t.toLowerCase().includes(q));
      if (!matchTitle && !matchDesc && !matchTags) return false;
    }
    return true;
  });

  const openCreateModal = () => {
    setEditingProject(null);
    setFormTitle('');
    setFormDescription('');
    setFormArea(selectedAreaFilter !== 'All' ? selectedAreaFilter : 'PAWAN SHAKTI');
    setFormStatus('active');
    setFormPriority('high');
    setFormStartDate(today);
    setFormTargetDate(new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10));
    setFormProgress(0);
    setFormTags('Engineering, Hardware');
    setFormMilestones([
      { id: generateId(), title: 'System Architecture & Requirements Review', done: false },
      { id: generateId(), title: 'Prototype Bench Validation', done: false },
    ]);
    setIsModalOpen(true);
  };

  const openEditModal = (p: Project) => {
    setEditingProject(p);
    setFormTitle(p.title);
    setFormDescription(p.description);
    setFormArea(p.area);
    setFormStatus(p.status);
    setFormPriority(p.priority);
    setFormStartDate(p.start_date);
    setFormTargetDate(p.target_date);
    setFormProgress(p.progress);
    setFormTags(p.tags ? p.tags.join(', ') : '');
    setFormMilestones(p.milestones || []);
    setIsModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const now = new Date().toISOString();
    const tagArray = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingProject) {
      await db.projects.update(editingProject.id, {
        title: formTitle.trim(),
        description: formDescription.trim(),
        area: formArea,
        status: formStatus,
        priority: formPriority,
        start_date: formStartDate,
        target_date: formTargetDate,
        progress: Number(formProgress),
        tags: tagArray,
        milestones: formMilestones,
        updated_at: now,
      });
    } else {
      const newProj: Project = {
        id: generateId(),
        title: formTitle.trim(),
        description: formDescription.trim(),
        area: formArea,
        status: formStatus,
        priority: formPriority,
        start_date: formStartDate,
        target_date: formTargetDate,
        progress: Number(formProgress),
        tags: tagArray,
        milestones: formMilestones,
        created_at: now,
        updated_at: now,
      };
      await db.projects.add(newProj);
    }

    setIsModalOpen(false);
  };

  const handleToggleMilestone = async (project: Project, mId: string) => {
    const updatedMilestones = project.milestones.map((m) =>
      m.id === mId ? { ...m, done: !m.done } : m
    );
    const completedCount = updatedMilestones.filter((m) => m.done).length;
    const progress = Math.round((completedCount / updatedMilestones.length) * 100);

    await db.projects.update(project.id, {
      milestones: updatedMilestones,
      progress,
      updated_at: new Date().toISOString(),
    });
  };

  const handleConfirmDelete = async () => {
    if (projectToDelete) {
      await db.projects.delete(projectToDelete);
      setProjectToDelete(null);
    }
  };

  const statusColumns: { id: ProjectStatus; label: string; color: string }[] = [
    { id: 'planning', label: 'Planning & Discovery', color: 'border-t-blue-500' },
    { id: 'active', label: 'Active Sprint', color: 'border-t-teal-500' },
    { id: 'paused', label: 'Paused / Blocked', color: 'border-t-amber-500' },
    { id: 'completed', label: 'Shipped & Validated', color: 'border-t-emerald-500' },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            <span>Projects & Engineering Workflows</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Manage startup hardware milestones, robotics pipelines, and automation client projects
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-1 text-xs font-semibold">
            {(['kanban', 'list', 'milestones'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-colors cursor-pointer ${
                  viewMode === mode
                    ? 'bg-[var(--hub-accent)] text-white'
                    : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs sm:text-sm font-semibold hover:bg-[var(--hub-accent-hover)] transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects, engineering specs, or tags..."
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

      {/* Kanban Board View */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {statusColumns.map((col) => {
            const colProjects = filteredProjects.filter((p) => p.status === col.id);
            return (
              <div
                key={col.id}
                className={`bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl border-t-4 ${col.color} p-4 space-y-3 min-h-[450px] shadow-xs`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-[var(--hub-line)]">
                  <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--hub-ink)]">
                    {col.label}
                  </h3>
                  <span className="text-xs font-bold text-[var(--hub-muted)] bg-[var(--hub-bg)] px-2 py-0.5 rounded-full border border-[var(--hub-line)]">
                    {colProjects.length}
                  </span>
                </div>

                {colProjects.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[var(--hub-muted)]">
                    No projects in this stage
                  </div>
                ) : (
                  <div className="space-y-3">
                    {colProjects.map((project) => {
                      const linkedTasks = allTasks.filter((t) => t.project_id === project.id);
                      return (
                        <div
                          key={project.id}
                          className="bg-[var(--hub-bg)] border border-[var(--hub-line)] rounded-xl p-3.5 space-y-3 hover:border-[var(--hub-accent)] transition-all shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Badge variant="teal">{project.area}</Badge>
                            {project.priority === 'urgent' && <Badge variant="red">Urgent</Badge>}
                            {project.priority === 'high' && <Badge variant="amber">High</Badge>}
                          </div>

                          <h4 className="font-heading font-bold text-sm text-[var(--hub-ink)] leading-snug">
                            {project.title}
                          </h4>

                          <p className="text-xs text-[var(--hub-muted)] line-clamp-2 leading-relaxed">
                            {project.description}
                          </p>

                          {/* Progress Bar */}
                          <div>
                            <div className="flex items-center justify-between text-[11px] font-bold mb-1 text-[var(--hub-ink)]">
                              <span>Progress</span>
                              <span>{project.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full bg-[var(--hub-line)] overflow-hidden">
                              <div
                                className="h-full bg-[var(--hub-accent)] rounded-full transition-all duration-300"
                                style={{ width: `${project.progress}%` }}
                              />
                            </div>
                          </div>

                          {/* Milestones count & due date */}
                          <div className="flex items-center justify-between text-[11px] text-[var(--hub-muted)] pt-2 border-t border-[var(--hub-line)]">
                            <span className="flex items-center gap-2">
                              <span className="flex items-center gap-1">
                                <ListTodo className="w-3 h-3" />
                                <span>{project.milestones.filter((m) => m.done).length}/{project.milestones.length}</span>
                              </span>
                              {linkedTasks.length > 0 && onNavigateToTasks && (
                                <button
                                  type="button"
                                  onClick={onNavigateToTasks}
                                  className="text-[var(--hub-accent)] hover:underline cursor-pointer"
                                >
                                  {linkedTasks.length} tasks
                                </button>
                              )}
                            </span>
                            <span className="font-medium text-[var(--hub-ink)]">
                              Due {formatShortDate(project.target_date)}
                            </span>
                          </div>

                          {/* Card Actions */}
                          <div className="flex items-center justify-end gap-1 pt-1">
                            <button
                              onClick={() => openEditModal(project)}
                              className="p-1 rounded text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)] cursor-pointer"
                              title="Edit project"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setProjectToDelete(project.id)}
                              className="p-1 rounded text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-surface)] cursor-pointer"
                              title="Delete project"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl divide-y divide-[var(--hub-line)] overflow-hidden shadow-xs">
          {filteredProjects.length === 0 ? (
            <div className="p-12 text-center text-xs text-[var(--hub-muted)]">
              No projects matching criteria. Click "New Project" to create one.
            </div>
          ) : (
            filteredProjects.map((p) => (
              <div
                key={p.id}
                className="p-4 hover:bg-[var(--hub-bg)]/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="teal">{p.area}</Badge>
                    <Badge variant={p.status === 'active' ? 'emerald' : p.status === 'paused' ? 'amber' : 'gray'}>
                      {p.status.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-[var(--hub-muted)]">
                      Target: {formatShortDate(p.target_date)}
                    </span>
                  </div>

                  <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                    {p.title}
                  </h3>

                  <p className="text-xs text-[var(--hub-muted)] line-clamp-2">
                    {p.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {p.tags?.map((t) => (
                      <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--hub-bg)] text-[var(--hub-muted)] border border-[var(--hub-line)]">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-none self-end sm:self-center">
                  <div className="w-32 text-right">
                    <div className="text-xs font-bold text-[var(--hub-ink)]">{p.progress}%</div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--hub-line)] overflow-hidden mt-1">
                      <div
                        className="h-full bg-[var(--hub-accent)] rounded-full"
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(p)}
                      className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setProjectToDelete(p.id)}
                      className="p-1.5 rounded-lg text-[var(--hub-muted)] hover:text-red-600 hover:bg-[var(--hub-bg)] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Milestones View */}
      {viewMode === 'milestones' && (
        <div className="space-y-4">
          {filteredProjects.map((p) => (
            <div
              key={p.id}
              className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 shadow-xs space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[var(--hub-line)]">
                <div>
                  <h3 className="font-heading font-bold text-base text-[var(--hub-ink)] flex items-center gap-2">
                    <span>{p.title}</span>
                    <Badge variant="teal">{p.area}</Badge>
                  </h3>
                  <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                    Target: {formatShortDate(p.target_date)} • Overall Progress: {p.progress}%
                  </p>
                </div>
                <button
                  onClick={() => openEditModal(p)}
                  className="text-xs font-bold text-[var(--hub-accent)] hover:underline self-start sm:self-auto cursor-pointer"
                >
                  Manage Milestones →
                </button>
              </div>

              <div className="space-y-2 pt-1">
                {p.milestones.map((m) => (
                  <label
                    key={m.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer text-xs ${
                      m.done
                        ? 'bg-teal-500/10 border-teal-500/20 text-teal-900 dark:text-teal-200 line-through'
                        : 'bg-[var(--hub-bg)] border-[var(--hub-line)] hover:border-[var(--hub-accent)] text-[var(--hub-ink)]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => handleToggleMilestone(p, m.id)}
                      className="mt-0.5 w-4 h-4 rounded text-[var(--hub-accent)] focus:ring-[var(--hub-accent)] cursor-pointer flex-none"
                    />
                    <div className="flex-1">
                      <span className="font-medium">{m.title}</span>
                      {m.target_date && (
                        <span className="block text-[11px] text-[var(--hub-muted)] mt-0.5">
                          Target: {formatShortDate(m.target_date)}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProject ? 'Edit Project' : 'Create Engineering Project'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSaveProject} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Project Title *
            </label>
            <input
              type="text"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="e.g. Small Wind Turbine TRL 6 Prototype Demonstration"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Scope & Engineering Deliverables
            </label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              rows={3}
              placeholder="Specifications, hardware components, CFD simulation parameters, or pilot requirements..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                Status
              </label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value as ProjectStatus)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                <option value="planning">Planning</option>
                <option value="active">Active Sprint</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Priority
              </label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as Priority)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
                Target Deadline
              </label>
              <input
                type="date"
                value={formTargetDate}
                onChange={(e) => setFormTargetDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Tags (Comma separated)
            </label>
            <input
              type="text"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              placeholder="Hardware, TRL-6, ROS2, CAD"
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
              {editingProject ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(projectToDelete)}
        onClose={() => setProjectToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Project"
        message="Are you sure you want to permanently delete this project and its milestones?"
      />
    </div>
  );
};
