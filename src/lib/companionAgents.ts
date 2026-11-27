/**
 * JARVIS 4.0 Specialized Agents Registry, Complexity-Aware Model Routing,
 * and 3-Tier Execution Permission Policy.
 * Pure TypeScript (Node & Browser safe).
 */
import type { BuddyAgentRole, JarvisCompanionSettings } from '../types';
import type { CloudOrLocalProviderId, ProviderConfigMap } from '../../api/_lib/aiProviderAdapters.ts';
import type { PermissionLevel } from './selfHealingCore.ts';

export interface CompanionAgentSpec {
  id: BuddyAgentRole;
  name: string;
  tagline: string;
  preferredComplexity: 'simple' | 'moderate' | 'complex';
  maxSteps: number;
  allowedTools: string[];
  detectKeywords: string[];
  systemGuidance: string;
}

export const COMPANION_AGENTS: Record<BuddyAgentRole, CompanionAgentSpec> = {
  executive: {
    id: 'executive',
    name: 'Executive Coordinator',
    tagline: 'Cross-domain prioritization, daily/weekly briefings, and clarity',
    preferredComplexity: 'moderate',
    maxSteps: 4,
    allowedTools: ['get_workspace_state', 'create_task', 'schedule_event', 'save_note', 'create_handover_doc', 'save_memory'],
    detectKeywords: ['briefing', 'morning', 'evening', 'priority', 'what\'s happening', 'overview', 'focus', 'weekly'],
    systemGuidance:
      'Synthesize across startup, robotics, engineering, research, and personal commitments. Surface trade-offs and propose clean next moves.',
  },
  startup: {
    id: 'startup',
    name: 'Startup & Pawan Shakti Agent',
    tagline: 'Wind turbine TRL milestones, V3F rigor, grants, and customer readiness',
    preferredComplexity: 'complex',
    maxSteps: 4,
    allowedTools: ['get_workspace_state', 'create_task', 'save_note', 'create_handover_doc', 'save_memory'],
    detectKeywords: ['pawan', 'turbine', 'trl', 'v3f', 'startup', 'grant', 'investor', 'patent', 'windmill', 'blade'],
    systemGuidance:
      'Maintain strict empirical honesty: TRL 4 benchtop is baseline unless closed-loop >= 1 Hz telemetry verifies TRL 5/6. Focus on fundraising, LOIs, and test rigor.',
  },
  robotics: {
    id: 'robotics',
    name: 'Robotics Research Agent',
    tagline: 'AgileX PiPER arm, 3-drone swarm, AWR2944 mmWave & ROS 2 diagnostics',
    preferredComplexity: 'complex',
    maxSteps: 4,
    allowedTools: ['get_workspace_state', 'create_task', 'save_note', 'save_memory'],
    detectKeywords: ['robot', 'piper', 'agilex', 'drone', 'swarm', 'awr2944', 'mmwave', 'ros', 'can bus', 'ivlabs'],
    systemGuidance:
      'Analyze control loops, CAN bus kinematics, hardware safety interlocks, radar calibration, and physical lab test checklists carefully.',
  },
  research: {
    id: 'research',
    name: 'Academic Research Agent',
    tagline: 'arXiv / OpenAlex / Semantic Scholar discovery, citations & experiment synthesis',
    preferredComplexity: 'moderate',
    maxSteps: 4,
    allowedTools: ['search_research_papers', 'save_note', 'create_handover_doc', 'save_memory'],
    detectKeywords: ['paper', 'arxiv', 'research', 'citation', 'literature', 'study', 'experiment', 'methodology'],
    systemGuidance:
      'Always distinguish peer-reviewed papers vs preprints, highlight testable hypotheses, and connect literature back to Yashwanth\'s active robotics/wind work.',
  },
  developer: {
    id: 'developer',
    name: 'Developer Agent',
    tagline: 'GitHub repos, PR diffs, CI runs, Vercel builds, architecture & bug triage',
    preferredComplexity: 'complex',
    maxSteps: 4,
    allowedTools: ['get_dev_status', 'create_github_issue', 'create_task', 'save_note', 'create_handover_doc', 'save_memory'],
    detectKeywords: ['github', 'commit', 'pr', 'deploy', 'vercel', 'build', 'bug', 'error', 'sentry', 'code', 'api', 'repo'],
    systemGuidance:
      'Inspect real repository commits, workflow runs, and Vercel deployment state when connected. Never invent commit SHAs or logs; flag unconfigured tokens clearly.',
  },
  productivity: {
    id: 'productivity',
    name: 'Productivity & Planning Agent',
    tagline: 'Task triage, My Day timeboxing, calendar conflict resolution & habits',
    preferredComplexity: 'simple',
    maxSteps: 3,
    allowedTools: ['get_workspace_state', 'create_task', 'update_task', 'schedule_event', 'save_memory'],
    detectKeywords: ['task', 'todo', 'schedule', 'calendar', 'meeting', 'deadline', 'habit', 'my day', 'remind'],
    systemGuidance:
      'Keep plans realistic inside available hours. Respect unfinished loops, eliminate duplicate work, and ask approval before modifying tasks or events.',
  },
  knowledge: {
    id: 'knowledge',
    name: 'Knowledge & Handover Agent',
    tagline: 'Long-term memory curation, knowledge graph links & technical handover docs',
    preferredComplexity: 'moderate',
    maxSteps: 4,
    allowedTools: ['search_memories', 'save_memory', 'save_note', 'create_handover_doc'],
    detectKeywords: ['remember', 'memory', 'forget', 'handover', 'handoff', 'summary', 'document', 'notes', 'vault'],
    systemGuidance:
      'Organize institutional knowledge, verify provenance, detect outdated facts, and compose clean structured handover documents.',
  },
};

export function selectCompanionAgent(prompt: string, explicitRole?: BuddyAgentRole): CompanionAgentSpec {
  if (explicitRole && COMPANION_AGENTS[explicitRole]) {
    return COMPANION_AGENTS[explicitRole];
  }
  const lower = String(prompt || '').toLowerCase();
  let bestAgent: CompanionAgentSpec = COMPANION_AGENTS.executive;
  let bestScore = 0;

  for (const agent of Object.values(COMPANION_AGENTS)) {
    if (agent.id === 'executive') continue;
    let score = 0;
    for (const kw of agent.detectKeywords) {
      if (lower.includes(kw)) score += kw.length > 5 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return bestAgent;
}

export interface SmartModelSelection {
  providerChain: CloudOrLocalProviderId[];
  rationale: string;
  tierLabel: 'fast_low_cost' | 'balanced' | 'deep_reasoning' | 'offline_heuristic';
}

export function selectSmartModelRoute(input: {
  requestedProvider?: JarvisCompanionSettings['preferredProvider'];
  complexity: 'simple' | 'moderate' | 'complex';
  costBudget: JarvisCompanionSettings['costBudget'];
  requiresTools?: boolean;
  configured: ProviderConfigMap;
  latenciesMs?: Partial<Record<CloudOrLocalProviderId, number | null>>;
}): SmartModelSelection {
  const configuredList = (Object.keys(input.configured) as CloudOrLocalProviderId[]).filter(
    (id) => input.configured[id]
  );

  if (configuredList.length === 0) {
    return {
      providerChain: [],
      rationale: 'No cloud/local LLM API keys configured on server; using local verified workspace synthesis.',
      tierLabel: 'offline_heuristic',
    };
  }

  const orderByGoal: CloudOrLocalProviderId[] =
    input.costBudget === 'low' || input.complexity === 'simple'
      ? ['ollama', 'gemini', 'openrouter', 'huggingface', 'openai', 'anthropic']
      : input.complexity === 'complex' && input.costBudget === 'best'
      ? ['anthropic', 'openai', 'gemini', 'openrouter', 'huggingface', 'ollama']
      : ['gemini', 'openrouter', 'openai', 'anthropic', 'huggingface', 'ollama'];

  let available = orderByGoal.filter((id) => input.configured[id]);
  if (input.latenciesMs) {
    available.sort((a, b) => {
      const la = input.latenciesMs?.[a] ?? 999999;
      const lb = input.latenciesMs?.[b] ?? 999999;
      // Preserve explicit quality preference when latency diff is small (<400ms)
      if (Math.abs(la - lb) < 400) return orderByGoal.indexOf(a) - orderByGoal.indexOf(b);
      return la - lb;
    });
  }

  if (input.requestedProvider && input.requestedProvider !== 'auto' && input.configured[input.requestedProvider]) {
    available = [input.requestedProvider, ...available.filter((p) => p !== input.requestedProvider)];
  }

  const tierLabel =
    input.complexity === 'complex' && input.costBudget === 'best'
      ? 'deep_reasoning'
      : input.costBudget === 'low' || input.complexity === 'simple'
      ? 'fast_low_cost'
      : 'balanced';

  return {
    providerChain: available,
    rationale: `Routed (${tierLabel}, tools=${Boolean(input.requiresTools)}) across configured providers: ${available.join(' -> ')}`,
    tierLabel,
  };
}

const COMP_TIER_1 = new Set([
  'get_workspace_state',
  'search_memories',
  'search_research_papers',
  'get_dev_status',
  'refresh_awareness',
  'run_diagnostics',
  'prioritize_tasks',
  'save_note',
  'save_memory',
  'create_handover_doc',
  'summarize_project',
]);

const COMP_TIER_2 = new Set([
  'create_task',
  'update_task',
  'reschedule_task',
  'schedule_event',
  'send_notification',
  'create_github_issue',
  'draft_email',
  'send_email',
  'dispatch_webhook',
]);

const COMP_TIER_3 = new Set([
  'delete_database',
  'wipe_records',
  'delete_account',
  'financial_transfer',
  'billing_update',
  'modify_secrets',
  'change_rls',
  'force_push',
]);

export function classifyCompanionActionTier(toolName: string): {
  level: PermissionLevel;
  policyLabel: 'automatic' | 'approval_required' | 'restricted';
} {
  const key = String(toolName || '').trim().toLowerCase();
  if (COMP_TIER_3.has(key) || /(drop|wipe|delete_all|secret|token|payment|transfer|billing|rls|force_push)/.test(key)) {
    return { level: 3, policyLabel: 'restricted' };
  }
  if (COMP_TIER_1.has(key)) {
    return { level: 1, policyLabel: 'automatic' };
  }
  if (COMP_TIER_2.has(key)) {
    return { level: 2, policyLabel: 'approval_required' };
  }
  return { level: 2, policyLabel: 'approval_required' };
}
