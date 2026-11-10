import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Sparkles,
  Bot,
  Send,
  CheckCircle,
  FileText,
  Calendar,
  Wind,
  Wrench,
  Cpu,
  Columns3,
  Zap,
  Check,
  X,
  ShieldCheck,
  Plus,
  History,
  Trash2,
  FolderGit2,
  AlertTriangle,
  Database,
} from 'lucide-react';
import { db } from '../db';
import type {
  Area,
  AIMode,
  AIProvider,
  AIComparisonResult,
  AIConversation,
  AIChatMessage,
  AIProposedAction,
} from '../types';
import { generateId } from '../lib/utils';
import { SUPPORTED_MODELS } from '../services/ai/aiModels';
import { AIGateway } from '../services/ai/aiGateway';
import { Badge } from '../components/common/Badge';
import type { AIToolSpec } from '../../api/_lib/aiTools';

interface AIAssistantPageProps {
  currentArea: string;
  areas: Area[];
  onNavigate: (tab: any) => void;
}

export type ModularAgent =
  | 'orchestrator'
  | 'planning'
  | 'research'
  | 'execution'
  | 'startup_advisor'
  | 'robotics'
  | 'productivity';

const MODULAR_AGENTS: {
  id: ModularAgent;
  name: string;
  role: string;
  icon: React.ElementType;
  badge: string;
}[] = [
  { id: 'orchestrator', name: 'Chief of Staff', role: 'Workspace Orchestrator', icon: Sparkles, badge: 'Lead' },
  { id: 'planning', name: 'Planning Agent', role: 'Daily Focus & Milestones', icon: Calendar, badge: 'Strategy' },
  { id: 'startup_advisor', name: 'Startup Advisor', role: 'PAWAN SHAKTI TRL & V3F', icon: Wind, badge: 'Founder' },
  { id: 'robotics', name: 'Robotics Assistant', role: 'PiPER, Swarm & AWR2944', icon: Bot, badge: 'Hardware' },
  { id: 'research', name: 'Deep Research', role: 'Specs, Papers & Notes', icon: FileText, badge: 'Research' },
  { id: 'execution', name: 'Execution Agent', role: 'Tasks & Automations', icon: Zap, badge: 'Ops' },
  { id: 'productivity', name: 'Routine Coach', role: 'Deep Work & Recovery', icon: CheckCircle, badge: 'Health' },
];

const QUICK_CHIEF_PROMPTS = [
  'Plan my day.',
  'What is blocking Pawan Shakti?',
  'Prepare my weekly robotics progress report.',
  'Find my last decision about the PiPER setup.',
  'Create a task to test the generator tomorrow.',
  'Summarise my unfinished work.',
];

export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  currentArea: _currentArea,
  areas: _areas,
  onNavigate: _onNavigate,
}) => {
  const aiLogs = useLiveQuery(() => db.ai_logs.toArray(), []) || [];
  const projects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const conversations = useLiveQuery(
    () => db.ai_conversations.orderBy('updated_at').reverse().toArray(),
    []
  ) || [];

  const [selectedAgent, setSelectedAgent] = useState<ModularAgent>('orchestrator');
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(() => {
    return (localStorage.getItem('yash_ai_provider') as AIProvider) || 'gemini';
  });
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return localStorage.getItem('yash_ai_model') || 'gemini-2.5-flash';
  });
  const [selectedMode, setSelectedMode] = useState<AIMode>('personal');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return localStorage.getItem('yash_ai_project_scope') || '';
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AIChatMessage[]>([]);

  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [isCompareMode, setIsCompareMode] = useState(false);

  const [discoveredTools, setDiscoveredTools] = useState<AIToolSpec[]>([]);
  const [configuredProviders, setConfiguredProviders] = useState<Record<string, boolean>>({});
  const [toolSource, setToolSource] = useState<'server' | 'local_manifest'>('local_manifest');

  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [comparePrompt, setComparePrompt] = useState('');
  const [comparisonResults, setComparisonResults] = useState<AIComparisonResult[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Discover tools & consume optional cross-page navigation prefill (e.g. from Projects Workspace)
  useEffect(() => {
    AIGateway.discoverTools().then((res) => {
      setDiscoveredTools(res.tools);
      setConfiguredProviders(res.configuredProviders);
      setToolSource(res.source);
    });

    const prefillScope = localStorage.getItem('yash_ai_project_scope');
    const prefillPrompt = localStorage.getItem('yash_ai_prefill_prompt');
    if (prefillScope) {
      setSelectedProjectId(prefillScope);
      localStorage.removeItem('yash_ai_project_scope');
    }
    if (prefillPrompt) {
      setInputMessage(prefillPrompt);
      localStorage.removeItem('yash_ai_prefill_prompt');
    }
  }, []);

  // Load most recent conversation if one exists and none selected yet
  useEffect(() => {
    if (!activeConversationId && conversations.length > 0 && messages.length === 0) {
      const latest = conversations[0];
      setActiveConversationId(latest.id);
      setMessages(latest.messages || []);
      if (latest.project_id) setSelectedProjectId(latest.project_id);
    }
  }, [conversations, activeConversationId, messages.length]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const totalTokensLogged = aiLogs.reduce((s, l) => s + l.tokensInput + l.tokensOutput, 0);
  const totalCostLogged = aiLogs.reduce((s, l) => s + l.estimatedCostUSD, 0);

  const handleStartNewConversation = () => {
    setActiveConversationId(null);
    setMessages([]);
  };

  const handleSelectConversation = (conv: AIConversation) => {
    setActiveConversationId(conv.id);
    setMessages(conv.messages || []);
    setSelectedProjectId(conv.project_id || '');
  };

  const handleDeleteConversation = async (id: string) => {
    await db.ai_conversations.delete(id);
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
    }
  };

  const persistMessages = async (
    nextMessages: AIChatMessage[],
    convId: string,
    titleSeed: string,
    addedTokens: number,
    addedCost: number
  ) => {
    const existing = await db.ai_conversations.get(convId);
    const conv: AIConversation = {
      id: convId,
      title: existing?.title || titleSeed.slice(0, 56),
      agent_id: selectedAgent,
      mode: 'personal',
      project_id: selectedProjectId || undefined,
      messages: nextMessages,
      total_tokens: (existing?.total_tokens || 0) + addedTokens,
      total_cost_usd: (existing?.total_cost_usd || 0) + addedCost,
      created_at: existing?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await AIGateway.saveConversation(conv);
  };

  const handleApproveAction = async (msgId: string, action: AIProposedAction) => {
    setActionBusyId(action.id);
    try {
      const exec = await AIGateway.executeApprovedAction(action);
      const updated = messages.map((m) => {
        if (m.id !== msgId || !m.proposed_actions) return m;
        return {
          ...m,
          proposed_actions: m.proposed_actions.map((a) =>
            a.id === action.id
              ? {
                  ...a,
                  status: exec.success ? ('executed' as const) : ('approved' as const),
                  verified_record_id: exec.verifiedRecordId,
                  error: exec.success ? undefined : exec.message,
                }
              : a
          ),
        };
      });
      setMessages(updated);
      if (activeConversationId) {
        await persistMessages(updated, activeConversationId, updated[0]?.content || 'AI Thread', 0, 0);
      }
    } finally {
      setActionBusyId(null);
    }
  };

  const handleRejectAction = async (msgId: string, actionId: string) => {
    const updated = messages.map((m) => {
      if (m.id !== msgId || !m.proposed_actions) return m;
      return {
        ...m,
        proposed_actions: m.proposed_actions.map((a) =>
          a.id === actionId ? { ...a, status: 'rejected' as const } : a
        ),
      };
    });
    setMessages(updated);
    if (activeConversationId) {
      await persistMessages(updated, activeConversationId, updated[0]?.content || 'AI Thread', 0, 0);
    }
  };

  const sendPromptText = async (promptText: string) => {
    const userText = promptText.trim();
    if (!userText || isProcessing) return;

    const convId = activeConversationId || generateId();
    if (!activeConversationId) setActiveConversationId(convId);

    const userMsg: AIChatMessage = {
      id: generateId(),
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInputMessage('');
    setIsProcessing(true);

    try {
      const activeAgentMeta = MODULAR_AGENTS.find((a) => a.id === selectedAgent);
      const response = await AIGateway.executePrompt(userText, {
        provider: selectedProvider,
        modelId: selectedModelId,
        mode: selectedMode,
        projectId: selectedProjectId || undefined,
        history: withUser.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        systemPrompt: `Persona: ${activeAgentMeta?.name || 'Chief of Staff'} (${activeAgentMeta?.role || 'Executive Operating System'}).`,
      });

      if (response.configuredProviders) {
        setConfiguredProviders(response.configuredProviders);
      }

      const assistantMsg: AIChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: response.providerNotice ? `${response.text}\n\n_${response.providerNotice}_` : response.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        provider: response.provider,
        modelId: response.modelId,
        citations: response.citations,
        verified_facts: response.verifiedFacts,
        estimates: response.estimates,
        recommendations: response.recommendations,
        unknowns: response.unknowns,
        tool_calls: response.toolCalls,
        proposed_actions: response.proposedActions,
        usage: {
          inputTokens: response.tokensInput,
          outputTokens: response.tokensOutput,
          estimatedCostUsd: response.estimatedCostUSD,
        },
      };

      const finalMessages = [...withUser, assistantMsg];
      setMessages(finalMessages);
      await persistMessages(
        finalMessages,
        convId,
        userText,
        response.tokensInput + response.tokensOutput,
        response.estimatedCostUSD
      );
    } catch (err: any) {
      const errorMsg: AIChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Chief of Staff Error: ${err?.message || 'Execution failed.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages([...withUser, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendPromptText(inputMessage);
  };

  const handleRunComparison = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comparePrompt.trim() || isComparing) return;
    setIsComparing(true);
    setComparisonResults([]);
    try {
      const modelsToCompare = ['gemini-2.5-flash', 'gpt-4o-mini', 'claude-3-5-haiku-20241022'];
      const results = await AIGateway.compareModels(comparePrompt.trim(), modelsToCompare);
      setComparisonResults(results);
    } finally {
      setIsComparing(false);
    }
  };

  const anyServerLlmConfigured = Object.values(configuredProviders).some(Boolean);
  const modes: { id: AIMode; label: string; icon: React.ElementType }[] = [
    { id: 'personal', label: 'Daily Ops', icon: CheckCircle },
    { id: 'engineering', label: 'Robotics & Eng', icon: Wrench },
    { id: 'startup', label: 'Pawan Shakti & V3F', icon: Wind },
    { id: 'research', label: 'Research', icon: FileText },
    { id: 'meeting', label: 'Meetings', icon: Calendar },
  ];

  return (
    <div className="space-y-4 pb-8 flex flex-col min-h-[680px]">
      {/* Top Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[var(--hub-line)]">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-[var(--hub-accent)]" />
            <span>AI Chief of Staff</span>
          </h2>
          <p className="text-xs text-[var(--hub-muted)] mt-0.5">
            Tool-grounded intelligence over your real tasks, projects, blockers, decisions, notes, and permitted memories.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[11px]">
            <FolderGit2 className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              aria-label="Scope AI context to project"
              className="bg-transparent font-medium text-[var(--hub-ink)] focus:outline-none cursor-pointer max-w-[170px]"
            >
              <option value="">All Workspace Context</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  Scope: {p.title.slice(0, 32)}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              isHistoryOpen
                ? 'bg-[var(--hub-accent)]/10 text-[var(--hub-accent)] border-[var(--hub-accent)]/30'
                : 'border-[var(--hub-line)] text-[var(--hub-muted)]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Threads ({conversations.length})</span>
          </button>

          <button
            onClick={() => setIsToolsOpen(!isToolsOpen)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-surface)] cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
            <span>Tools ({discoveredTools.length})</span>
          </button>

          <button
            onClick={() => setIsCompareMode(!isCompareMode)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
              isCompareMode
                ? 'bg-purple-500 text-white border-purple-500'
                : 'border-[var(--hub-line)] text-[var(--hub-ink)]'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>Compare</span>
          </button>

          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-[var(--hub-line)] text-[var(--hub-ink)] cursor-pointer"
          >
            <Cpu className="w-3.5 h-3.5 text-teal-500" />
            <span>{anyServerLlmConfigured ? selectedModelId : 'Grounded Engine'}</span>
          </button>
        </div>
      </div>

      {/* Mode & Cost Telemetry Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {modes.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMode(m.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                  selectedMode === m.id
                    ? 'bg-[var(--hub-accent)] text-white border-[var(--hub-accent)]'
                    : 'bg-[var(--hub-surface)] border-[var(--hub-line)] text-[var(--hub-muted)] hover:text-[var(--hub-ink)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <Badge variant={anyServerLlmConfigured ? 'emerald' : 'amber'}>
            {anyServerLlmConfigured ? 'Server LLM Tools Active' : 'Grounded Deterministic Mode (No Server API Key)'}
          </Badge>
          <span className="px-2 py-0.5 rounded bg-[var(--hub-surface)] border border-[var(--hub-line)] font-mono text-[var(--hub-muted)]">
            {totalTokensLogged.toLocaleString()} tok • ${totalCostLogged.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Tools Discovery Panel */}
      {isToolsOpen && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--hub-ink)]">
              Registered Chief of Staff Tools ({toolSource === 'server' ? 'Server /api/ai/chat' : 'Local Manifest'})
            </h3>
            <button onClick={() => setIsToolsOpen(false)} className="text-xs text-[var(--hub-muted)] cursor-pointer">
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            {discoveredTools.map((tool) => (
              <div key={tool.name} className="p-2.5 rounded-lg bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <code className="font-mono font-bold text-[11px] text-[var(--hub-accent)]">{tool.name}</code>
                  <Badge variant={tool.level === 'read' ? 'blue' : 'purple'}>
                    {tool.level === 'read' ? 'Read' : 'Approval Gate'}
                  </Badge>
                </div>
                <p className="text-[11px] text-[var(--hub-muted)] leading-snug">{tool.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider Config Drawer */}
      {isConfigOpen && (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-4 space-y-3 shadow-xs text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[var(--hub-ink)]">
              Model Routing (Keys managed on Vercel server; local overrides live in Settings → AI)
            </span>
            <button onClick={() => setIsConfigOpen(false)} className="text-[var(--hub-muted)] cursor-pointer">
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[var(--hub-muted)] mb-1">Preferred Provider</label>
              <select
                value={selectedProvider}
                onChange={(e) => {
                  const p = e.target.value as AIProvider;
                  setSelectedProvider(p);
                  localStorage.setItem('yash_ai_provider', p);
                }}
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              >
                <option value="gemini">Google Gemini (Server GEMINI_API_KEY: {configuredProviders.gemini ? 'Set' : 'Unset'})</option>
                <option value="openai">OpenAI (Server OPENAI_API_KEY: {configuredProviders.openai ? 'Set' : 'Unset'})</option>
                <option value="anthropic">Anthropic Claude (Server ANTHROPIC_API_KEY: {configuredProviders.anthropic ? 'Set' : 'Unset'})</option>
                <option value="local_heuristic">Grounded Deterministic Only (Offline / Zero Cost)</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-[var(--hub-muted)] mb-1">Target Model</label>
              <select
                value={selectedModelId}
                onChange={(e) => {
                  setSelectedModelId(e.target.value);
                  localStorage.setItem('yash_ai_model', e.target.value);
                }}
                className="w-full px-3 py-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-[var(--hub-ink)]"
              >
                {SUPPORTED_MODELS.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Model Comparison View */}
      {isCompareMode ? (
        <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-5 space-y-4">
          <form onSubmit={handleRunComparison} className="flex gap-2">
            <input
              type="text"
              value={comparePrompt}
              onChange={(e) => setComparePrompt(e.target.value)}
              placeholder="Run one grounded prompt across Gemini, OpenAI, and Claude..."
              className="flex-1 px-4 py-2 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-sm text-[var(--hub-ink)]"
            />
            <button
              type="submit"
              disabled={isComparing || !comparePrompt.trim()}
              className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {isComparing ? 'Running...' : 'Compare'}
            </button>
          </form>
          {comparisonResults.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {comparisonResults.map((res, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-[var(--hub-bg)] border border-[var(--hub-line)] space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-[var(--hub-ink)]">
                    <span>{res.modelId}</span>
                    <span className="font-mono text-[var(--hub-muted)]">{res.latencyMs}ms</span>
                  </div>
                  <div className="whitespace-pre-wrap text-[var(--hub-ink)] max-h-[340px] overflow-y-auto">
                    {res.response}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[520px]">
          {/* Left Rail: Persistent Conversations + Specialist Personas */}
          <div className={`${isHistoryOpen ? 'lg:col-span-3' : 'lg:col-span-3'} space-y-3`}>
            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--hub-muted)]">
                  Saved Conversations
                </span>
                <button
                  onClick={handleStartNewConversation}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--hub-accent)] text-white text-[11px] font-semibold cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>New</span>
                </button>
              </div>
              {conversations.length === 0 ? (
                <p className="text-[11px] text-[var(--hub-muted)] py-2">
                  No saved threads yet. Ask a Chief of Staff prompt to begin.
                </p>
              ) : (
                <div className="space-y-1 max-h-[220px] overflow-y-auto pr-0.5">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        activeConversationId === conv.id
                          ? 'bg-[var(--hub-accent)]/12 text-[var(--hub-accent)] font-semibold'
                          : 'text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                      }`}
                      onClick={() => handleSelectConversation(conv)}
                    >
                      <span className="truncate flex-1">{conv.title}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conv.id);
                        }}
                        aria-label="Delete thread"
                        className="opacity-0 group-hover:opacity-100 text-[var(--hub-muted)] hover:text-red-500 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl p-3 space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--hub-muted)] px-1">
                Specialist Perspective
              </div>
              {MODULAR_AGENTS.map((agent) => {
                const Icon = agent.icon;
                const active = selectedAgent === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent.id)}
                    className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-[var(--hub-accent)]/10 text-[var(--hub-accent)]'
                        : 'text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <div className="truncate">
                        <div className="text-xs font-semibold truncate">{agent.name}</div>
                        <div className="text-[10px] text-[var(--hub-muted)] truncate">{agent.role}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Center Chat & Verified Action Previews */}
          <div className="lg:col-span-9 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl flex flex-col overflow-hidden min-h-[520px]">
            {/* Starter Prompts Strip */}
            <div className="px-4 py-2.5 border-b border-[var(--hub-line)] bg-[var(--hub-bg)]/50 flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[10px] font-bold uppercase text-[var(--hub-muted)] shrink-0 mr-1">
                Ask:
              </span>
              {QUICK_CHIEF_PROMPTS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendPromptText(q)}
                  disabled={isProcessing}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-[var(--hub-surface)] border border-[var(--hub-line)] text-[11px] text-[var(--hub-ink)] hover:border-[var(--hub-accent)] hover:text-[var(--hub-accent)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Messages Scroll */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-3 py-10">
                  <div className="w-11 h-11 rounded-2xl bg-[var(--hub-accent)]/10 text-[var(--hub-accent)] flex items-center justify-center">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h3 className="font-heading font-bold text-base text-[var(--hub-ink)]">
                    Grounded Personal Operating System Assistant
                  </h3>
                  <p className="text-xs text-[var(--hub-muted)] leading-relaxed">
                    Every response queries your live workspace database first, cites source records, separates verified facts from unknowns, and previews any new task, note, or decision before saving.
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed space-y-3 ${
                        msg.role === 'user'
                          ? 'bg-[var(--hub-accent)] text-white rounded-tr-sm'
                          : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-ink)] rounded-tl-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 text-[10px] opacity-75">
                        <span className="font-bold">
                          {msg.role === 'user' ? 'You' : `Chief of Staff (${msg.modelId || 'grounded'})`}
                        </span>
                        <span className="font-mono">
                          {msg.timestamp}
                          {msg.usage && (msg.usage.inputTokens || msg.usage.outputTokens)
                            ? ` • ${(msg.usage.inputTokens || 0) + (msg.usage.outputTokens || 0)} tok`
                            : ''}
                        </span>
                      </div>

                      <div className="whitespace-pre-wrap text-[13px]">{msg.content}</div>

                      {/* Tool Call & Citation Trace */}
                      {msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0 && (
                        <div className="pt-2 border-t border-[var(--hub-line)] space-y-1.5 text-[11px]">
                          <div className="font-bold text-[var(--hub-muted)] flex items-center gap-1">
                            <Database className="w-3 h-3 text-[var(--hub-accent)]" />
                            <span>Workspace Queries Executed ({msg.tool_calls.length})</span>
                          </div>
                          {msg.tool_calls.map((tc, i) => (
                            <div key={i} className="text-[var(--hub-muted)] flex items-start gap-1.5">
                              <code className="font-mono text-[var(--hub-accent)] shrink-0">{tc.tool}</code>
                              <span>→ {tc.summary}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Verified Action Previews */}
                      {msg.proposed_actions && msg.proposed_actions.length > 0 && (
                        <div className="pt-2 space-y-2">
                          {msg.proposed_actions.map((act) => (
                            <div
                              key={act.id}
                              className="p-3 rounded-xl bg-[var(--hub-surface)] border border-[var(--hub-accent)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-0.5 text-xs">
                                <div className="flex items-center gap-1.5 font-bold text-[var(--hub-ink)]">
                                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--hub-accent)]" />
                                  <span>{act.title}</span>
                                </div>
                                <div className="text-[11px] text-[var(--hub-muted)]">{act.description}</div>
                                {act.verified_record_id && (
                                  <div className="text-[11px] text-emerald-500 font-mono">
                                    Verified saved ID: {act.verified_record_id.slice(0, 12)}
                                  </div>
                                )}
                                {act.error && (
                                  <div className="text-[11px] text-red-500 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> {act.error}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {act.status === 'pending' ? (
                                  <>
                                    <button
                                      onClick={() => handleApproveAction(msg.id, act)}
                                      disabled={actionBusyId === act.id}
                                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 cursor-pointer disabled:opacity-50"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      <span>{actionBusyId === act.id ? 'Saving...' : 'Approve & Save'}</span>
                                    </button>
                                    <button
                                      onClick={() => handleRejectAction(msg.id, act.id)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/30 text-red-500 text-xs font-semibold hover:bg-red-500/10 cursor-pointer"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      <span>Reject</span>
                                    </button>
                                  </>
                                ) : (
                                  <Badge
                                    variant={
                                      act.status === 'executed'
                                        ? 'emerald'
                                        : act.status === 'rejected'
                                        ? 'red'
                                        : 'amber'
                                    }
                                  >
                                    {act.status === 'executed' ? 'SAVED & VERIFIED' : act.status.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {isProcessing && (
                <div className="flex items-center gap-2 text-xs text-[var(--hub-muted)] px-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--hub-accent)] animate-ping" />
                  <span>Querying workspace tools & synthesizing grounded response...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <form
              onSubmit={handleSendMessage}
              className="p-3.5 border-t border-[var(--hub-line)] bg-[var(--hub-bg)]/60 flex items-center gap-2.5"
            >
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Ask your Chief of Staff (e.g., Plan my day, What is blocking Pawan Shakti?)..."
                disabled={isProcessing}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-sm text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)]"
              />
              <button
                type="submit"
                disabled={isProcessing || !inputMessage.trim()}
                className="p-2.5 rounded-xl bg-[var(--hub-accent)] text-white hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
