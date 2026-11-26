/**
 * AI Executive Daily Briefing Service
 *
 * Consolidates verified workspace facts across tasks, goals, calendar, Pawan Shakti,
 * Robotics Lab, plus optional live GitHub/Vercel telemetry and research highlights.
 * Never fabricates completion metrics or external data.
 */
import { db } from '../../db';
import { getTodayISO, toDueKey } from '../../lib/utils';
import { AIGateway } from './aiGateway';
import type { DevMonitorReport } from '../../../api/_lib/devMonitor';
import type { ResearchPaperItem } from '../../../api/_lib/researchConnectors';

export interface ExecutiveBriefingReport {
  dateISO: string;
  generatedAt: string;
  headline: string;
  summaryMarkdown: string;
  verifiedCounts: {
    overdueTasks: number;
    dueTodayTasks: number;
    openTasks: number;
    activeProjects: number;
    activeGoals: number;
    todayMeetings: number;
    roboticsRecords: number;
  };
  aiEnhanced: boolean;
  providerUsed?: string;
}

export async function buildExecutiveDailyBriefing(options: {
  useAI?: boolean;
  devReport?: DevMonitorReport | null;
  topPapers?: ResearchPaperItem[];
} = {}): Promise<ExecutiveBriefingReport> {
  const today = getTodayISO();
  const [tasks, projects, goals, meetings, events, robotics] = await Promise.all([
    db.tasks.toArray(),
    db.projects.toArray(),
    db.goals.toArray(),
    db.meetings.toArray(),
    db.events.toArray(),
    db.robotics_records.toArray().catch(() => []),
  ]);

  const openTasks = tasks.filter((t) => !t.done);
  const overdue = openTasks.filter((t) => {
    const k = toDueKey(t.due_date);
    return Boolean(k && k < today);
  });
  const dueToday = openTasks.filter((t) => toDueKey(t.due_date) === today);
  const activeProjects = projects.filter((p) => p.status === 'active' || p.status === 'planning');
  const activeGoals = goals.filter((g) => g.status === 'active');
  const todayMeetings = meetings.filter((m) => m.date === today && m.status !== 'cancelled');
  const todayEvents = events.filter((e) => e.date === today);

  const pawan = activeProjects.find((p) => p.area === 'PAWAN SHAKTI');
  const pawanBlockers = (pawan?.blockers || []).filter((b) => b.status === 'open');

  const lines: string[] = [
    `# Executive Daily Briefing — ${today}`,
    '',
    '### Verified Workspace State',
    `- **Due Today**: ${dueToday.length} task(s)${overdue.length > 0 ? ` · **Overdue**: ${overdue.length}` : ''} (${openTasks.length} total open)`,
    `- **Today Schedule**: ${todayMeetings.length} meeting(s), ${todayEvents.length} calendar event(s)`,
    `- **Portfolio & Goals**: ${activeProjects.length} active project(s), ${activeGoals.length} active goal(s), ${robotics.length} robotics record(s)`,
  ];

  if (pawan) {
    lines.push(
      `- **PAWAN SHAKTI**: "${pawan.title}" (${pawan.progress}% reported${pawan.target_date ? `, target ${pawan.target_date}` : ''})${
        pawanBlockers.length > 0 ? ` — Blockers: ${pawanBlockers.map((b) => b.title).join('; ')}` : ''
      }`
    );
  }

  if (overdue.length > 0 || dueToday.length > 0) {
    lines.push('', '### Top Priority Actions');
    for (const t of [...overdue, ...dueToday].slice(0, 5)) {
      const k = toDueKey(t.due_date);
      lines.push(`- [${k && k < today ? 'OVERDUE' : 'TODAY'}] ${t.text} (${t.area || 'Personal'})`);
    }
  }

  if (options.devReport) {
    lines.push('', '### Engineering & Deployment Health');
    if (options.devReport.github.recentCommits.length > 0) {
      const latestCommit = options.devReport.github.recentCommits[0];
      lines.push(
        `- **GitHub (${options.devReport.github.repo})**: Latest commit \`${latestCommit.sha}\` — ${latestCommit.message}`
      );
    }
    if (options.devReport.github.recentWorkflowRuns.length > 0) {
      const run = options.devReport.github.recentWorkflowRuns[0];
      lines.push(`- **CI Run**: ${run.name} (${run.conclusion || run.status})`);
    }
    if (options.devReport.vercel.runtimeCommitSha) {
      lines.push(
        `- **Vercel Live Runtime**: ${options.devReport.vercel.runtimeCommitRef || 'production'} @ \`${options.devReport.vercel.runtimeCommitSha}\``
      );
    }
  }

  if (options.topPapers && options.topPapers.length > 0) {
    lines.push('', '### Research Highlights');
    for (const p of options.topPapers.slice(0, 3)) {
      lines.push(`- [${p.source.toUpperCase()} · ${p.publishedDate || 'Recent'}] ${p.title}`);
    }
  }

  let summaryMarkdown = lines.join('\n');
  let aiEnhanced = false;
  let providerUsed: string | undefined;

  if (options.useAI) {
    const prompt = `Synthesize a crisp 4-bullet morning executive action brief from ONLY the verified facts below. Do not invent any figures or claim unverified completions:\n\n${summaryMarkdown}`;
    const res = await AIGateway.analyze(prompt, {
      mode: 'personal',
      complexity: 'moderate',
    });
    if (res.text && res.providerMode === 'server_llm') {
      summaryMarkdown = `${res.text}\n\n---\n${summaryMarkdown}`;
      aiEnhanced = true;
      providerUsed = `${res.provider}/${res.modelId}`;
    }
  }

  const headline =
    overdue.length > 0
      ? `${overdue.length} overdue and ${dueToday.length} due today — clear blockers first.`
      : dueToday.length > 0
      ? `${dueToday.length} task(s) due today across ${activeProjects.length} active project(s).`
      : `Clear daily slate — advance ${pawan ? 'Pawan Shakti milestones' : 'your highest-leverage project'}.`;

  return {
    dateISO: today,
    generatedAt: new Date().toISOString(),
    headline,
    summaryMarkdown,
    verifiedCounts: {
      overdueTasks: overdue.length,
      dueTodayTasks: dueToday.length,
      openTasks: openTasks.length,
      activeProjects: activeProjects.length,
      activeGoals: activeGoals.length,
      todayMeetings: todayMeetings.length,
      roboticsRecords: robotics.length,
    },
    aiEnhanced,
    providerUsed,
  };
}
