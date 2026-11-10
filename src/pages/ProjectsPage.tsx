import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  FolderKanban,
  Plus,
  Search,
  Edit2,
  Trash2,
  ListTodo,
  ArrowLeft,
  Sparkles,
  Target,
  ShieldAlert,
  FileText,
  History,
  CheckCircle2,
  AlertTriangle,
  Gavel,
  BookOpen,
} from 'lucide-react';
import { db } from '../db';
import type {
  Project,
  ProjectStatus,
  Priority,
  Area,
  ProjectGoal,
  ProjectDecision,
  ProjectRisk,
  ProjectBlocker,
  ProjectProgressReport,
  Task,
  Note,
} from '../types';
import { formatShortDate, getTodayISO, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { SyncQueueService } from '../services/sync/syncQueueService';
import { AIGateway } from '../services/ai/aiGateway';

interface ProjectsPageProps {
  currentArea: string;
  areas: Area[];
  onNavigateToTasks?: () => void;
  onNavigateToAI?: () => void;
}

type WorkspaceTab = 'overview' | 'tasks_docs' | 'decisions' | 'risks_blockers' | 'reports' | 'activity';

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  currentArea,
  areas,
  onNavigateToTasks,
  onNavigateToAI,
}) => {
  const today = getTodayISO();

  const [viewMode, setViewMode] = useState<'kanban' | 'list' | 'milestones'>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState(currentArea);

  // Selected project workspace state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Quick Workspace Input States
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalMetric, setNewGoalMetric] = useState('');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('high');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteBody, setNewNoteBody] = useState('');
  const [newDecisionTitle, setNewDecisionTitle] = useState('');
  const [newDecisionText, setNewDecisionText] = useState('');
  const [newDecisionRationale, setNewDecisionRationale] = useState('');
  const [newRiskTitle, setNewRiskTitle] = useState('');
  const [newRiskSeverity, setNewRiskSeverity] = useState<ProjectRisk['severity']>('high');
  const [newRiskMitigation, setNewRiskMitigation] = useState('');
  const [newBlockerTitle, setNewBlockerTitle] = useState('');
  const [newBlockerImpact, setNewBlockerImpact] = useState('');

  // Create / Edit Project Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formArea, setFormArea] = useState(currentArea !== 'All' ? currentArea : 'PAWAN SHAKTI');
  const [formStatus, setFormStatus] = useState<ProjectStatus>('active');
  const [formPriority, setFormPriority] = useState<Priority>('high');
  const [formStartDate, setFormStartDate] = useState(today);
  const [formTargetDate, setFormTargetDate] = useState(today);
  const [formProgress, setFormProgress] = useState(30);
  const [formTags, setFormTags] = useState('');
  const [formVerificationNote, setFormVerificationNote] = useState('');
  const [formMilestones, setFormMilestones] = useState<{ id: string; title: string; done: boolean }[]>([
    { id: generateId(), title: 'Architecture & Baseline Freeze', done: false },
    { id: generateId(), title: 'Bench Validation Run', done: false },
  ]);

  // Live Queries
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allNotes = useLiveQuery(() => db.notes.toArray(), []) || [];
  const allDocs = useLiveQuery(() => db.documents.toArray(), []) || [];

  const activeWorkspaceProject = selectedProjectId
    ? allProjects.find((p) => p.id === selectedProjectId) || null
    : null;

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

  const updateProjectWithActivity = async (
    project: Project,
    patch: Partial<Project>,
    activityAction: string,
    activityDetails: string
  ) => {
    const now = new Date().toISOString();
    const nextHistory = [
      {
        id: generateId(),
        action: activityAction,
        details: activityDetails,
        timestamp: now,
        actor: 'Yashwanth',
      },
      ...(project.activity_history || []),
    ].slice(0, 60);

    await db.projects.update(project.id, {
      ...patch,
      activity_history: nextHistory,
      updated_at: now,
    });
    const saved = await db.projects.get(project.id);
    if (saved) {
      SyncQueueService.enqueueChange('projects', project.id, 'UPDATE', saved).catch(() => {});
    }
  };

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
    setFormVerificationNote('');
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
    setFormVerificationNote(p.verification_note || '');
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
      await updateProjectWithActivity(
        editingProject,
        {
          title: formTitle.trim(),
          description: formDescription.trim(),
          area: formArea,
          status: formStatus,
          priority: formPriority,
          start_date: formStartDate,
          target_date: formTargetDate,
          progress: Number(formProgress),
          verification_note: formVerificationNote.trim() || undefined,
          tags: tagArray,
          milestones: formMilestones,
        },
        'Project Edited',
        `Updated project metadata (${formStatus}, ${formProgress}%).`
      );
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
        verification_note: formVerificationNote.trim() || undefined,
        tags: tagArray,
        milestones: formMilestones,
        goals: [],
        decisions: [],
        risks: [],
        blockers: [],
        progress_reports: [],
        activity_history: [
          {
            id: generateId(),
            action: 'Project Created',
            details: `Created project in ${formArea}`,
            timestamp: now,
            actor: 'Yashwanth',
          },
        ],
        created_at: now,
        updated_at: now,
      };
      await db.projects.add(newProj);
      SyncQueueService.enqueueChange('projects', newProj.id, 'INSERT', newProj).catch(() => {});
    }

    setIsModalOpen(false);
  };

  const handleToggleMilestone = async (project: Project, mId: string) => {
    const targetM = project.milestones.find((m) => m.id === mId);
    const updatedMilestones = project.milestones.map((m) =>
      m.id === mId ? { ...m, done: !m.done } : m
    );
    const completedCount = updatedMilestones.filter((m) => m.done).length;
    const progress = updatedMilestones.length > 0 ? Math.round((completedCount / updatedMilestones.length) * 100) : 0;

    await updateProjectWithActivity(
      project,
      { milestones: updatedMilestones, progress },
      'Milestone Updated',
      `${!targetM?.done ? 'Completed' : 'Reopened'} milestone "${targetM?.title || mId}"`
    );
  };

  const handleConfirmDelete = async () => {
    if (projectToDelete) {
      await db.projects.delete(projectToDelete);
      SyncQueueService.enqueueChange('projects', projectToDelete, 'DELETE', { id: projectToDelete }).catch(() => {});
      if (selectedProjectId === projectToDelete) setSelectedProjectId(null);
      setProjectToDelete(null);
    }
  };

  const handleOpenProjectInAI = (project: Project, customPrompt?: string) => {
    localStorage.setItem('yash_ai_project_scope', project.id);
    if (customPrompt) {
      localStorage.setItem('yash_ai_prefill_prompt', customPrompt);
    }
    onNavigateToAI?.();
  };

  // ===========================================================================
  // WORKSPACE DETAIL VIEW
  // ===========================================================================
  if (activeWorkspaceProject) {
    const proj = activeWorkspaceProject;
    const linkedTasks = allTasks.filter((t) => t.project_id === proj.id || t.area === proj.area);
    const openLinkedTasks = linkedTasks.filter((t) => !t.done);
    const linkedNotes = allNotes.filter((n) => n.area === proj.area);
    const linkedDocs = allDocs.filter((d) => d.area === proj.area);
    const openBlockers = (proj.blockers || []).filter((b) => b.status === 'open');
    const openRisks = (proj.risks || []).filter((r) => r.status === 'open');

    const handleAddGoal = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newGoalTitle.trim()) return;
      const goal: ProjectGoal = {
        id: generateId(),
        title: newGoalTitle.trim(),
        target_metric: newGoalMetric.trim() || undefined,
        status: 'in_progress',
        truth_tag: 'target',
      };
      await updateProjectWithActivity(
        proj,
        { goals: [...(proj.goals || []), goal] },
        'Goal Added',
        goal.title
      );
      setNewGoalTitle('');
      setNewGoalMetric('');
    };

    const handleToggleGoalStatus = async (gId: string) => {
      const next = (proj.goals || []).map((g) =>
        g.id === gId
          ? {
              ...g,
              status: (g.status === 'achieved' ? 'in_progress' : 'achieved') as ProjectGoal['status'],
              truth_tag: (g.status === 'achieved' ? 'target' : 'verified_fact') as ProjectGoal['truth_tag'],
            }
          : g
      );
      await updateProjectWithActivity(proj, { goals: next }, 'Goal Status Updated', `Toggled goal completion`);
    };

    const handleAddMilestoneInline = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMilestoneTitle.trim()) return;
      const nextMilestones = [
        ...proj.milestones,
        { id: generateId(), title: newMilestoneTitle.trim(), target_date: proj.target_date, done: false },
      ];
      const doneCount = nextMilestones.filter((m) => m.done).length;
      const progress = Math.round((doneCount / nextMilestones.length) * 100);
      await updateProjectWithActivity(
        proj,
        { milestones: nextMilestones, progress },
        'Milestone Added',
        newMilestoneTitle.trim()
      );
      setNewMilestoneTitle('');
    };

    const handleAddLinkedTask = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newTaskTitle.trim()) return;
      const now = new Date().toISOString();
      const task: Task = {
        id: generateId(),
        text: newTaskTitle.trim(),
        area: proj.area,
        priority: newTaskPriority,
        project_id: proj.id,
        due_date: today,
        starred: newTaskPriority === 'urgent',
        done: false,
        created_at: now,
        updated_at: now,
      };
      await db.tasks.add(task);
      SyncQueueService.enqueueChange('tasks', task.id, 'INSERT', task).catch(() => {});
      await updateProjectWithActivity(proj, {}, 'Linked Task Created', task.text);
      setNewTaskTitle('');
    };

    const handleToggleLinkedTask = async (t: Task) => {
      const now = new Date().toISOString();
      await db.tasks.update(t.id, { done: !t.done, updated_at: now });
      const updatedTask = await db.tasks.get(t.id);
      if (updatedTask) SyncQueueService.enqueueChange('tasks', t.id, 'UPDATE', updatedTask).catch(() => {});
    };

    const handleAddLinkedNote = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newNoteTitle.trim() || !newNoteBody.trim()) return;
      const now = new Date().toISOString();
      const note: Note = {
        id: generateId(),
        title: newNoteTitle.trim(),
        body: newNoteBody.trim(),
        area: proj.area,
        pinned: false,
        created_at: now,
        updated_at: now,
      };
      await db.notes.add(note);
      SyncQueueService.enqueueChange('notes', note.id, 'INSERT', note).catch(() => {});
      await updateProjectWithActivity(proj, {}, 'Project Note Saved', note.title);
      setNewNoteTitle('');
      setNewNoteBody('');
    };

    const handleAddDecision = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newDecisionTitle.trim() || !newDecisionText.trim()) return;
      const dec: ProjectDecision = {
        id: generateId(),
        title: newDecisionTitle.trim(),
        decision: newDecisionText.trim(),
        rationale: newDecisionRationale.trim() || undefined,
        decided_at: today,
        author: 'Yashwanth',
      };
      await updateProjectWithActivity(
        proj,
        { decisions: [dec, ...(proj.decisions || [])] },
        'Decision Logged',
        dec.title
      );
      setNewDecisionTitle('');
      setNewDecisionText('');
      setNewDecisionRationale('');
    };

    const handleAddRisk = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newRiskTitle.trim()) return;
      const risk: ProjectRisk = {
        id: generateId(),
        title: newRiskTitle.trim(),
        severity: newRiskSeverity,
        mitigation: newRiskMitigation.trim() || 'Mitigation plan pending review.',
        status: 'open',
        created_at: new Date().toISOString(),
      };
      await updateProjectWithActivity(
        proj,
        { risks: [risk, ...(proj.risks || [])] },
        'Risk Logged',
        `${risk.severity.toUpperCase()}: ${risk.title}`
      );
      setNewRiskTitle('');
      setNewRiskMitigation('');
    };

    const handleToggleRisk = async (rId: string) => {
      const next = (proj.risks || []).map((r) =>
        r.id === rId ? { ...r, status: (r.status === 'open' ? 'mitigated' : 'open') as ProjectRisk['status'] } : r
      );
      await updateProjectWithActivity(proj, { risks: next }, 'Risk Status Updated', `Toggled risk ${rId.slice(0, 6)}`);
    };

    const handleAddBlocker = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newBlockerTitle.trim()) return;
      const blocker: ProjectBlocker = {
        id: generateId(),
        title: newBlockerTitle.trim(),
        owner: 'Yashwanth',
        impact: newBlockerImpact.trim() || 'Blocks milestone progression.',
        status: 'open',
        created_at: new Date().toISOString(),
      };
      await updateProjectWithActivity(
        proj,
        { blockers: [blocker, ...(proj.blockers || [])] },
        'Blocker Added',
        blocker.title
      );
      setNewBlockerTitle('');
      setNewBlockerImpact('');
    };

    const handleToggleBlocker = async (bId: string) => {
      const next = (proj.blockers || []).map((b) =>
        b.id === bId
          ? {
              ...b,
              status: (b.status === 'open' ? 'resolved' : 'open') as ProjectBlocker['status'],
              resolved_at: b.status === 'open' ? new Date().toISOString() : undefined,
            }
          : b
      );
      await updateProjectWithActivity(proj, { blockers: next }, 'Blocker Updated', `Toggled blocker ${bId.slice(0, 6)}`);
    };

    const handleGenerateProgressReport = async () => {
      setIsGeneratingReport(true);
      try {
        const resp = await AIGateway.executePrompt(
          `Prepare a factual project progress report for "${proj.title}". Cite only verified milestones, blockers, risks, and open tasks.`,
          {
            mode: 'startup',
            projectId: proj.id,
          }
        );

        const report: ProjectProgressReport = {
          id: generateId(),
          title: `${proj.area} Grounded Progress Report — ${today}`,
          summary: resp.text,
          verified_facts: resp.verifiedFacts || proj.milestones.filter((m) => m.done).map((m) => m.title),
          unknowns: resp.unknowns || ['Check open milestones and sensor evidence before external claims.'],
          next_actions: resp.recommendations || openLinkedTasks.slice(0, 3).map((t) => t.text),
          generated_at: new Date().toISOString(),
          generated_by: 'ai_chief_of_staff',
        };

        await updateProjectWithActivity(
          proj,
          { progress_reports: [report, ...(proj.progress_reports || [])] },
          'Progress Report Generated',
          report.title
        );
      } finally {
        setIsGeneratingReport(false);
      }
    };

    return (
      <div className="space-y-5 pb-12">
        {/* Top Breadcrumb + Scoped AI Button */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[var(--hub-line)]">
          <div className="space-y-1">
            <button
              onClick={() => setSelectedProjectId(null)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--hub-accent)] hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to All Projects</span>
            </button>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge variant="teal">{proj.area}</Badge>
              <Badge variant={proj.status === 'active' ? 'emerald' : 'amber'}>{proj.status.toUpperCase()}</Badge>
              <Badge variant="blue">{proj.progress}% Milestones Done</Badge>
              {openBlockers.length > 0 && <Badge variant="red">{openBlockers.length} Open Blocker(s)</Badge>}
            </div>
            <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)]">{proj.title}</h2>
            <p className="text-xs text-[var(--hub-muted)] max-w-3xl">{proj.description}</p>
          </div>

          <div className="flex items-center gap-2 self-start">
            <button
              onClick={() => openEditModal(proj)}
              className="px-3 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-semibold text-[var(--hub-ink)] cursor-pointer"
            >
              Edit Metadata
            </button>
            {onNavigateToAI && (
              <button
                onClick={() => handleOpenProjectInAI(proj, `What is the status and what is blocking ${proj.title}?`)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold hover:bg-[var(--hub-accent-hover)] cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ask Chief of Staff</span>
              </button>
            )}
          </div>
        </div>

        {/* Truthfulness / Grounding Baseline Banner */}
        {proj.verification_note && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Verification Baseline: </span>
              <span>{proj.verification_note}</span>
            </div>
          </div>
        )}

        {/* Workspace Navigation Tabs */}
        <div className="flex items-center gap-1.5 border-b border-[var(--hub-line)] pb-2 overflow-x-auto text-xs">
          {[
            { id: 'overview', label: `Goals & Milestones (${proj.milestones.length})`, icon: Target },
            { id: 'tasks_docs', label: `Tasks & Notes (${linkedTasks.length + linkedNotes.length})`, icon: ListTodo },
            { id: 'decisions', label: `Decisions (${proj.decisions?.length || 0})`, icon: Gavel },
            { id: 'risks_blockers', label: `Risks & Blockers (${openRisks.length + openBlockers.length})`, icon: ShieldAlert },
            { id: 'reports', label: `Progress Reports (${proj.progress_reports?.length || 0})`, icon: FileText },
            { id: 'activity', label: `Activity (${proj.activity_history?.length || 0})`, icon: History },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setWorkspaceTab(t.id as WorkspaceTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap cursor-pointer ${
                  workspaceTab === t.id
                    ? 'bg-[var(--hub-accent)] text-white'
                    : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-surface)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab 1: Overview, Goals & Milestones */}
        {workspaceTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-4">
              <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
                <Target className="w-4 h-4 text-[var(--hub-accent)]" />
                <span>Project Goals (Persisted)</span>
              </h3>
              <div className="space-y-2">
                {(proj.goals || []).length === 0 ? (
                  <p className="text-xs text-[var(--hub-muted)]">No goals logged yet. Add a measurable target below.</p>
                ) : (
                  (proj.goals || []).map((g) => (
                    <div
                      key={g.id}
                      onClick={() => handleToggleGoalStatus(g.id)}
                      className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-start justify-between gap-2 cursor-pointer"
                    >
                      <div className="space-y-0.5 text-xs">
                        <div className={`font-semibold ${g.status === 'achieved' ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>
                          {g.title}
                        </div>
                        {g.target_metric && (
                          <div className="text-[11px] text-[var(--hub-muted)]">Target Metric: {g.target_metric}</div>
                        )}
                      </div>
                      <Badge variant={g.status === 'achieved' ? 'emerald' : 'amber'}>
                        {g.truth_tag === 'verified_fact' ? 'ACHIEVED' : 'TARGET'}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleAddGoal} className="space-y-2 pt-2 border-t border-[var(--hub-line)] text-xs">
                <input
                  type="text"
                  value={newGoalTitle}
                  onChange={(e) => setNewGoalTitle(e.target.value)}
                  placeholder="Add measurable goal..."
                  className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGoalMetric}
                    onChange={(e) => setNewGoalMetric(e.target.value)}
                    placeholder="Target evidence / metric (optional)"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer">
                    Add Goal
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-4">
              <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>Milestones ({proj.milestones.filter((m) => m.done).length}/{proj.milestones.length})</span>
              </h3>
              <div className="space-y-2">
                {proj.milestones.map((m) => (
                  <label
                    key={m.id}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => handleToggleMilestone(proj, m.id)}
                      className="mt-0.5 cursor-pointer"
                    />
                    <div className="flex-1">
                      <span className={m.done ? 'line-through text-[var(--hub-muted)]' : 'font-semibold text-[var(--hub-ink)]'}>
                        {m.title}
                      </span>
                      {m.target_date && (
                        <div className="text-[10px] text-[var(--hub-muted)]">Target: {m.target_date}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              <form onSubmit={handleAddMilestoneInline} className="flex gap-2 pt-2 border-t border-[var(--hub-line)] text-xs">
                <input
                  type="text"
                  value={newMilestoneTitle}
                  onChange={(e) => setNewMilestoneTitle(e.target.value)}
                  placeholder="Add milestone..."
                  className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                />
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer">
                  Add
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: Linked Tasks & Notes/Documents */}
        {workspaceTab === 'tasks_docs' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)]">
                  Linked Tasks ({openLinkedTasks.length} open)
                </h3>
                {onNavigateToTasks && (
                  <button onClick={onNavigateToTasks} className="text-xs text-[var(--hub-accent)] hover:underline cursor-pointer">
                    Open Tasks Board
                  </button>
                )}
              </div>
              <form onSubmit={handleAddLinkedTask} className="flex gap-2 text-xs">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder={`New ${proj.area} task...`}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                />
                <select
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
                  className="px-2 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                >
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                  <option value="medium">Medium</option>
                </select>
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer">
                  Add
                </button>
              </form>
              <div className="space-y-1.5 max-h-[340px] overflow-y-auto text-xs">
                {linkedTasks.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2.5 p-2 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] cursor-pointer"
                  >
                    <input type="checkbox" checked={t.done} onChange={() => handleToggleLinkedTask(t)} />
                    <span className={`flex-1 ${t.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>
                      {t.text}
                    </span>
                    <Badge variant={t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'amber' : 'gray'}>
                      {t.priority}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-4">
              <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[var(--hub-accent)]" />
                <span>Notes & Documents ({linkedNotes.length + linkedDocs.length})</span>
              </h3>
              <form onSubmit={handleAddLinkedNote} className="space-y-2 text-xs">
                <input
                  type="text"
                  value={newNoteTitle}
                  onChange={(e) => setNewNoteTitle(e.target.value)}
                  placeholder="Note title..."
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                />
                <textarea
                  rows={2}
                  value={newNoteBody}
                  onChange={(e) => setNewNoteBody(e.target.value)}
                  placeholder="Verified observation, bench setup detail, or engineering note..."
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                />
                <button type="submit" className="px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer">
                  Save Project Note
                </button>
              </form>
              <div className="space-y-2 max-h-[260px] overflow-y-auto text-xs">
                {linkedDocs.map((d) => (
                  <div key={d.id} className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                    <div className="font-bold text-[var(--hub-ink)]">Doc: {d.title}</div>
                    <div className="text-[11px] text-[var(--hub-muted)]">{d.file_name}</div>
                  </div>
                ))}
                {linkedNotes.map((n) => (
                  <div key={n.id} className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)]">
                    <div className="font-bold text-[var(--hub-ink)]">{n.title}</div>
                    <div className="text-[11px] text-[var(--hub-muted)] mt-0.5 line-clamp-3">{n.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Decisions Log */}
        {workspaceTab === 'decisions' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={handleAddDecision}
              className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-3 text-xs h-fit"
            >
              <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)]">Log Engineering / Architecture Decision</h3>
              <input
                type="text"
                required
                value={newDecisionTitle}
                onChange={(e) => setNewDecisionTitle(e.target.value)}
                placeholder="Decision title (e.g. PiPER CAN bus 1 Mbps config)"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              />
              <textarea
                rows={3}
                required
                value={newDecisionText}
                onChange={(e) => setNewDecisionText(e.target.value)}
                placeholder="What was decided?"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              />
              <input
                type="text"
                value={newDecisionRationale}
                onChange={(e) => setNewDecisionRationale(e.target.value)}
                placeholder="Rationale / evidence (optional)"
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              />
              <button type="submit" className="w-full py-2 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer">
                Save Decision
              </button>
            </form>

            <div className="lg:col-span-2 space-y-3">
              {(proj.decisions || []).length === 0 ? (
                <div className="bg-[var(--hub-surface)] border border-dashed border-[var(--hub-line)] rounded-xl p-8 text-center text-xs text-[var(--hub-muted)]">
                  No decisions logged for this project yet. Decisions logged here become immediately searchable by the AI Chief of Staff.
                </div>
              ) : (
                (proj.decisions || []).map((d) => (
                  <div key={d.id} className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-[var(--hub-ink)]">{d.title}</span>
                      <Badge variant="gray">{d.decided_at}</Badge>
                    </div>
                    <p className="text-[var(--hub-ink)] leading-relaxed">{d.decision}</p>
                    {d.rationale && <p className="text-[var(--hub-muted)]">Rationale: {d.rationale}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Risks & Blockers */}
        {workspaceTab === 'risks_blockers' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-4">
              <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)]">Active Blockers</h3>
              <form onSubmit={handleAddBlocker} className="space-y-2">
                <input
                  type="text"
                  required
                  value={newBlockerTitle}
                  onChange={(e) => setNewBlockerTitle(e.target.value)}
                  placeholder="Blocker summary..."
                  className="w-full px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newBlockerImpact}
                    onChange={(e) => setNewBlockerImpact(e.target.value)}
                    placeholder="What does this block?"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold cursor-pointer">
                    Add Blocker
                  </button>
                </div>
              </form>
              <div className="space-y-2">
                {(proj.blockers || []).map((b) => (
                  <div key={b.id} className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-start justify-between gap-2">
                    <div>
                      <div className={`font-bold ${b.status === 'resolved' ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>
                        {b.title}
                      </div>
                      <div className="text-[11px] text-[var(--hub-muted)]">{b.impact}</div>
                    </div>
                    <button
                      onClick={() => handleToggleBlocker(b.id)}
                      className="px-2 py-1 rounded border border-[var(--hub-line)] font-semibold cursor-pointer"
                    >
                      {b.status === 'open' ? 'Resolve' : 'Reopen'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-4">
              <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)]">Engineering Risk Register</h3>
              <form onSubmit={handleAddRisk} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={newRiskTitle}
                    onChange={(e) => setNewRiskTitle(e.target.value)}
                    placeholder="Technical / compliance risk..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                  />
                  <select
                    value={newRiskSeverity}
                    onChange={(e) => setNewRiskSeverity(e.target.value as ProjectRisk['severity'])}
                    className="px-2 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRiskMitigation}
                    onChange={(e) => setNewRiskMitigation(e.target.value)}
                    placeholder="Mitigation plan..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
                  />
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-[var(--hub-accent)] text-white font-semibold cursor-pointer">
                    Add Risk
                  </button>
                </div>
              </form>
              <div className="space-y-2">
                {(proj.risks || []).map((r) => (
                  <div key={r.id} className="p-3 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={r.severity === 'critical' || r.severity === 'high' ? 'red' : 'amber'}>
                          {r.severity.toUpperCase()}
                        </Badge>
                        <span className={`font-bold ${r.status === 'mitigated' ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}`}>
                          {r.title}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--hub-muted)] mt-1">Mitigation: {r.mitigation}</div>
                    </div>
                    <button
                      onClick={() => handleToggleRisk(r.id)}
                      className="px-2 py-1 rounded border border-[var(--hub-line)] font-semibold cursor-pointer"
                    >
                      {r.status === 'open' ? 'Mitigate' : 'Reopen'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Grounded Progress Reports */}
        {workspaceTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4">
              <div className="text-xs">
                <div className="font-bold text-[var(--hub-ink)]">Grounded Project Progress Reports</div>
                <p className="text-[var(--hub-muted)]">
                  Synthesizes strictly from logged milestones, open blockers, risks, and tasks — explicitly flagging unknowns.
                </p>
              </div>
              <button
                onClick={handleGenerateProgressReport}
                disabled={isGeneratingReport}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isGeneratingReport ? 'Generating...' : 'Generate Report'}</span>
              </button>
            </div>

            {(proj.progress_reports || []).length === 0 ? (
              <div className="bg-[var(--hub-surface)] border border-dashed border-[var(--hub-line)] rounded-xl p-8 text-center text-xs text-[var(--hub-muted)]">
                No progress reports generated yet.
              </div>
            ) : (
              (proj.progress_reports || []).map((rep) => (
                <div key={rep.id} className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[var(--hub-ink)]">{rep.title}</span>
                    <Badge variant="teal">{rep.generated_at.slice(0, 10)}</Badge>
                  </div>
                  <div className="whitespace-pre-wrap text-[var(--hub-ink)] leading-relaxed">{rep.summary}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 6: Activity History */}
        {workspaceTab === 'activity' && (
          <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-2 text-xs">
            <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] mb-2">Immutable Project Activity Log</h3>
            {(proj.activity_history || []).length === 0 ? (
              <p className="text-[var(--hub-muted)]">No project activity recorded yet.</p>
            ) : (
              (proj.activity_history || []).map((act) => (
                <div key={act.id} className="py-2 border-b border-[var(--hub-line)] flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-[var(--hub-ink)]">{act.action}: </span>
                    <span className="text-[var(--hub-muted)]">{act.details}</span>
                  </div>
                  <span className="font-mono text-[10px] text-[var(--hub-muted)] shrink-0">
                    {new Date(act.timestamp).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  // ===========================================================================
  // PROJECTS OVERVIEW (KANBAN / LIST / MILESTONES)
  // ===========================================================================
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
            <span>Projects & Intelligence Workspaces</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Click any project to open its Goals, Milestones, Decisions, Risks, Blockers & Grounded Reports workspace.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
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

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hub-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects, specs, or tags..."
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {statusColumns.map((col) => {
            const colProjects = filteredProjects.filter((p) => p.status === col.id);
            return (
              <div
                key={col.id}
                className={`bg-[var(--hub-surface)] border border-[var(--hub-line)] border-t-4 ${col.color} rounded-2xl p-3.5 space-y-3 shadow-xs min-h-[280px]`}
              >
                <div className="flex items-center justify-between px-1">
                  <h3 className="font-heading font-bold text-xs uppercase tracking-wider text-[var(--hub-muted)]">
                    {col.label}
                  </h3>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-ink)]">
                    {colProjects.length}
                  </span>
                </div>

                {colProjects.map((p) => {
                  const openBlockerCount = (p.blockers || []).filter((b) => b.status === 'open').length;
                  return (
                    <div
                      key={p.id}
                      className="bg-[var(--hub-bg)]/80 border border-[var(--hub-line)] rounded-xl p-3.5 space-y-2.5 hover:border-[var(--hub-accent)] transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Badge variant="gray">{p.area}</Badge>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(p)}
                            className="p-1 text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                            aria-label="Edit Project"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setProjectToDelete(p.id)}
                            className="p-1 text-[var(--hub-muted)] hover:text-red-500 cursor-pointer"
                            aria-label="Delete Project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedProjectId(p.id);
                          setWorkspaceTab('overview');
                        }}
                        className="text-left w-full group cursor-pointer"
                      >
                        <h4 className="font-heading font-bold text-sm text-[var(--hub-ink)] group-hover:text-[var(--hub-accent)] transition-colors">
                          {p.title}
                        </h4>
                        <p className="text-xs text-[var(--hub-muted)] mt-1 line-clamp-2">{p.description}</p>
                      </button>

                      <div className="w-full h-1.5 bg-[var(--hub-surface)] rounded-full overflow-hidden border border-[var(--hub-line)]">
                        <div
                          className="h-full bg-[var(--hub-accent)] rounded-full"
                          style={{ width: `${p.progress}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[var(--hub-muted)]">
                        <span>{p.progress}% • {p.milestones.length} milestones</span>
                        {openBlockerCount > 0 && (
                          <span className="text-red-500 font-semibold">{openBlockerCount} blocker(s)</span>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setSelectedProjectId(p.id);
                          setWorkspaceTab('overview');
                        }}
                        className="w-full py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-accent)] hover:border-[var(--hub-accent)] cursor-pointer"
                      >
                        Open Workspace
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-3">
          {filteredProjects.map((p) => (
            <div
              key={p.id}
              className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="teal">{p.area}</Badge>
                  <Badge variant={p.status === 'active' ? 'emerald' : 'amber'}>{p.status}</Badge>
                  <span className="text-xs font-mono text-[var(--hub-muted)]">Target: {formatShortDate(p.target_date)}</span>
                </div>
                <h4 className="font-heading font-bold text-base text-[var(--hub-ink)]">{p.title}</h4>
                <p className="text-xs text-[var(--hub-muted)]">{p.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setWorkspaceTab('overview');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[var(--hub-accent)] text-white text-xs font-semibold cursor-pointer"
                >
                  Open Workspace
                </button>
                <button
                  onClick={() => openEditModal(p)}
                  className="p-2 rounded-lg border border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)] cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Milestones Checklist View */}
      {viewMode === 'milestones' && (
        <div className="space-y-4">
          {filteredProjects.map((p) => (
            <div key={p.id} className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-heading font-bold text-base text-[var(--hub-ink)]">{p.title}</h4>
                <Badge variant="blue">{p.progress}%</Badge>
              </div>
              <div className="space-y-2">
                {p.milestones.map((m) => (
                  <label key={m.id} className="flex items-center gap-2.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={m.done}
                      onChange={() => handleToggleMilestone(p, m.id)}
                    />
                    <span className={m.done ? 'line-through text-[var(--hub-muted)]' : 'text-[var(--hub-ink)]'}>
                      {m.title}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Project Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProject ? 'Edit Project Metadata' : 'Create Project Workspace'}
      >
        <form onSubmit={handleSaveProject} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Project Title *
            </label>
            <input
              type="text"
              required
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">
              Verification Note (Verified vs Pending Evidence)
            </label>
            <input
              type="text"
              value={formVerificationNote}
              onChange={(e) => setFormVerificationNote(e.target.value)}
              placeholder="e.g. TRL 4 benchtop baseline only; closed-loop test pending"
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">Area</label>
              <select
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.name}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">Status</label>
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
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">Priority</label>
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
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">Start Date</label>
              <input
                type="date"
                value={formStartDate}
                onChange={(e) => setFormStartDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">Target Deadline</label>
              <input
                type="date"
                value={formTargetDate}
                onChange={(e) => setFormTargetDate(e.target.value)}
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider mb-1">Tags</label>
            <input
              type="text"
              value={formTags}
              onChange={(e) => setFormTags(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)] text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--hub-line)]">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] cursor-pointer"
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
        message="Are you sure you want to permanently delete this project and its workspace data?"
      />
    </div>
  );
};
