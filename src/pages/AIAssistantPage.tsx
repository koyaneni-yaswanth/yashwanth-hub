import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Sparkles,
  Bot,
  Send,
  Key,
  Sliders,
  CheckCircle,
  FileText,
  Calendar,
  IndianRupee,
  Wind,
  ListTodo,
  Layers,
  Wrench,
  TrendingUp,
  Cpu,
  Columns3,
  Clock,
  Zap,
} from 'lucide-react';
import { db } from '../db';
import type { Area, AIMode, AIProvider, AIComparisonResult } from '../types';
import { formatINR, formatShortDate, getTodayISO, generateId } from '../lib/utils';
import { SUPPORTED_MODELS } from '../services/ai/aiModels';
import { AIGateway } from '../services/ai/aiGateway';
import { Badge } from '../components/common/Badge';

interface AIAssistantPageProps {
  currentArea: string;
  areas: Area[];
  onNavigate: (tab: any) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  provider?: string;
  modelId?: string;
  latencyMs?: number;
  tokensUsed?: number;
}

export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  currentArea,
  areas,
  onNavigate,
}) => {
  const today = getTodayISO();

  // Queries
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allProjects = useLiveQuery(() => db.projects.toArray(), []) || [];
  const allMeetings = useLiveQuery(() => db.meetings.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const aiLogs = useLiveQuery(() => db.ai_logs.toArray(), []) || [];

  // Configuration State
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(() => {
    return (localStorage.getItem('yash_ai_provider') as AIProvider) || 'gemini';
  });
  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return localStorage.getItem('yash_ai_model') || 'gemini-2.5-flash';
  });
  const [selectedMode, setSelectedMode] = useState<AIMode>('personal');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isCompareMode, setIsCompareMode] = useState(false);

  // API Keys
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('yash_ai_key_gemini') || localStorage.getItem('yash_ai_key') || '');
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('yash_ai_key_openai') || '');
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem('yash_ai_key_anthropic') || '');

  // Comparison State
  const [comparePrompt, setComparePrompt] = useState('');
  const [comparisonResults, setComparisonResults] = useState<AIComparisonResult[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  // Chat State
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      content:
        "Welcome Yaswanth. I am your Jarvis-level Personal AI Operating System.\n\nI have real-time memory of your tasks, projects (PAWAN SHAKTI, IvLabs, MG Automation), schedule, and budget.\n\nSelect an AI Mode below (Personal, Engineering, Startup, Research, Meeting, Writing) or ask a question directly.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      provider: 'Jarvis Gateway',
      modelId: 'gemini-2.5-flash',
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const saveApiKeys = () => {
    localStorage.setItem('yash_ai_key_gemini', geminiKey.trim());
    localStorage.setItem('yash_ai_key_openai', openaiKey.trim());
    localStorage.setItem('yash_ai_key_anthropic', anthropicKey.trim());
    localStorage.setItem('yash_ai_provider', selectedProvider);
    localStorage.setItem('yash_ai_model', selectedModelId);
    setIsConfigOpen(false);
  };

  const currentAvailableModels = SUPPORTED_MODELS.filter((m) =>
    selectedProvider === 'local_heuristic' ? true : m.provider === selectedProvider
  );

  // Total metrics
  const totalTokensLogged = aiLogs.reduce((s, l) => s + l.tokensInput + l.tokensOutput, 0);
  const totalCostLogged = aiLogs.reduce((s, l) => s + l.estimatedCostUSD, 0);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isProcessing) return;

    const userText = inputMessage.trim();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        sender: 'user',
        content: userText,
        timestamp: nowTime,
      },
    ]);
    setInputMessage('');
    setIsProcessing(true);

    try {
      const response = await AIGateway.executePrompt(userText, {
        provider: selectedProvider,
        modelId: selectedModelId,
        mode: selectedMode,
        systemPrompt: `You are Jarvis, the executive personal AI operating system for Yaswanth (founder of PAWAN SHAKTI wind startup, robotics lead at IvLabs, and engineer at MG Automation). Provide rigorous, concise, structured answers. Distinguish verified facts from assumptions.`,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          sender: 'assistant',
          content: response.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          provider: response.provider,
          modelId: response.modelId,
          latencyMs: response.latencyMs,
          tokensUsed: response.tokensInput + response.tokensOutput,
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          sender: 'assistant',
          content: `Error: ${err.message || 'Execution error.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Run model comparison
  const handleRunComparison = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comparePrompt.trim() || isComparing) return;

    setIsComparing(true);
    setComparisonResults([]);

    try {
      // Pick representative flagship models
      const modelsToCompare = ['gemini-2.5-flash', 'gpt-4o-mini', 'claude-3-5-haiku-20241022'];
      const results = await AIGateway.compareModels(comparePrompt.trim(), modelsToCompare);
      setComparisonResults(results);
    } catch (err) {
      console.error('Model comparison failed:', err);
    } finally {
      setIsComparing(false);
    }
  };

  const modes: { id: AIMode; label: string; icon: React.ElementType }[] = [
    { id: 'personal', label: 'Personal & Habits', icon: CheckCircle },
    { id: 'engineering', label: 'Engineering & Robotics', icon: Wrench },
    { id: 'startup', label: 'Startup & TRL Roadmap', icon: Wind },
    { id: 'research', label: 'Research & Literature', icon: FileText },
    { id: 'meeting', label: 'Meeting Preparation', icon: Calendar },
    { id: 'writing', label: 'Executive Writing', icon: Sparkles },
  ];

  return (
    <div className="space-y-6 pb-12 flex flex-col h-[calc(100vh-140px)] min-h-[650px]">
      {/* Top Bar: Mode Selector & Model Config */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-none">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            <span>Jarvis AI Operating System</span>
          </h2>
          <p className="text-xs sm:text-sm text-[var(--hub-muted)] mt-0.5">
            Multi-model intelligence engine connecting Gemini, Claude, and GPT with local memory
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Compare toggle */}
          <button
            onClick={() => setIsCompareMode(!isCompareMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
              isCompareMode
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-[var(--hub-surface)] border-[var(--hub-line)] text-[var(--hub-ink)] hover:border-purple-500'
            }`}
          >
            <Columns3 className="w-3.5 h-3.5" />
            <span>Benchmark Models</span>
          </button>

          {/* Config Key Modal toggle */}
          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
          >
            <Key className="w-3.5 h-3.5 text-amber-500" />
            <span>API Gateway Settings</span>
          </button>
        </div>
      </div>

      {/* Model & Mode Quick Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[var(--hub-surface)] border border-[var(--hub-line)] p-2.5 rounded-xl flex-none shadow-xs text-xs">
        {/* Mode Selector */}
        <div className="flex flex-wrap items-center gap-1">
          {modes.map((m) => {
            const Icon = m.icon;
            const isSelected = selectedMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMode(m.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--hub-accent)] text-white shadow-xs'
                    : 'text-[var(--hub-muted)] hover:text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Model Selector */}
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-[var(--hub-muted)]" />
          <select
            value={selectedModelId}
            onChange={(e) => {
              setSelectedModelId(e.target.value);
              const m = SUPPORTED_MODELS.find((x) => x.modelId === e.target.value);
              if (m) setSelectedProvider(m.provider);
            }}
            className="py-1 px-2 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-semibold text-[var(--hub-ink)] cursor-pointer"
          >
            {SUPPORTED_MODELS.map((m) => (
              <option key={m.modelId} value={m.modelId}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Config Drawer / Modal */}
      {isConfigOpen && (
        <div className="p-5 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl space-y-4 shadow-xl flex-none animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--hub-line)]">
            <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] uppercase tracking-wider">
              Multi-Model AI Gateway Credentials
            </h3>
            <span className="text-[11px] text-[var(--hub-muted)]">
              Keys remain private on your machine (never leaked or stored on external servers)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">
                Google Gemini API Key
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-mono text-[var(--hub-ink)]"
              />
              <span className="text-[10px] text-[var(--hub-muted)] mt-1 block">
                Powers Gemini 2.5 Pro & 2.5 Flash
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">
                Anthropic Claude API Key
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-mono text-[var(--hub-ink)]"
              />
              <span className="text-[10px] text-[var(--hub-muted)] mt-1 block">
                Powers Claude 3.5 Sonnet & Haiku
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-proj-..."
                className="w-full py-2 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs font-mono text-[var(--hub-ink)]"
              />
              <span className="text-[10px] text-[var(--hub-muted)] mt-1 block">
                Powers GPT-4o & o1-mini
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-[var(--hub-muted)]">
              Logged Tokens: <strong>{totalTokensLogged.toLocaleString()}</strong> (~${totalCostLogged.toFixed(4)})
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsConfigOpen(false)}
                className="px-4 py-1.5 text-xs font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={saveApiKeys}
                className="px-5 py-1.5 text-xs font-semibold rounded-lg bg-[var(--hub-accent)] text-white hover:bg-[var(--hub-accent-hover)] cursor-pointer shadow-xs"
              >
                Save Keys
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model Benchmark Comparison Mode */}
      {isCompareMode ? (
        <div className="flex-1 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-5 overflow-y-auto space-y-4 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--hub-line)] flex-none">
            <div>
              <h3 className="font-heading font-bold text-sm text-[var(--hub-ink)] flex items-center gap-2">
                <Columns3 className="w-4 h-4 text-purple-600" />
                <span>Multi-Model Benchmark Arena (Gemini vs GPT vs Claude)</span>
              </h3>
              <p className="text-xs text-[var(--hub-muted)] mt-0.5">
                Send the same query simultaneously to compare reasoning quality, response time, and token output
              </p>
            </div>
          </div>

          <form onSubmit={handleRunComparison} className="flex gap-2 flex-none">
            <input
              type="text"
              value={comparePrompt}
              onChange={(e) => setComparePrompt(e.target.value)}
              placeholder="e.g. Design a low-drag NACA 4412 blade root attachment or compare grant proposals..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs sm:text-sm text-[var(--hub-ink)] focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              type="submit"
              disabled={!comparePrompt.trim() || isComparing}
              className="px-5 py-2.5 rounded-xl bg-purple-600 text-white font-semibold text-xs sm:text-sm hover:bg-purple-700 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <Zap className="w-4 h-4" />
              <span>{isComparing ? 'Benchmarking...' : 'Run Benchmark'}</span>
            </button>
          </form>

          {/* Comparison Cards Grid */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-0 overflow-y-auto pt-2">
            {comparisonResults.length === 0 ? (
              <div className="col-span-full py-16 text-center text-xs text-[var(--hub-muted)]">
                Enter an engineering brief or business question above and click "Run Benchmark" to compare models.
              </div>
            ) : (
              comparisonResults.map((res) => (
                <div
                  key={res.modelId}
                  className="bg-[var(--hub-bg)] border border-[var(--hub-line)] rounded-xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--hub-line)]">
                      <span className="font-heading font-bold text-xs uppercase text-[var(--hub-ink)]">
                        {res.provider.toUpperCase()}
                      </span>
                      <span className="text-[11px] font-mono text-[var(--hub-muted)]">
                        {res.latencyMs}ms • {res.tokensUsed} tokens
                      </span>
                    </div>
                    <div className="text-xs text-[var(--hub-ink)] whitespace-pre-wrap leading-relaxed mt-3 max-h-96 overflow-y-auto pr-1">
                      {res.response}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Standard Jarvis Conversation Feed */
        <div className="flex-1 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-2xl p-4 overflow-y-auto space-y-4 shadow-xs">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                {!isUser && (
                  <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 flex items-center justify-center flex-none border border-teal-500/20">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                    isUser
                      ? 'bg-[var(--hub-accent)] text-white rounded-tr-xs shadow-xs'
                      : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-ink)] rounded-tl-xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

                  <div
                    className={`flex items-center justify-between gap-3 text-[10px] mt-2 pt-1 border-t ${
                      isUser
                        ? 'border-white/20 text-white/70'
                        : 'border-[var(--hub-line)] text-[var(--hub-muted)]'
                    }`}
                  >
                    {!isUser && msg.modelId && (
                      <span className="font-mono">
                        {msg.modelId} {msg.latencyMs ? `(${msg.latencyMs}ms)` : ''}
                      </span>
                    )}
                    <span className="ml-auto">{msg.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {isProcessing && (
            <div className="flex gap-3 items-center text-xs text-[var(--hub-muted)] animate-pulse">
              <Bot className="w-4 h-4 text-teal-600" />
              <span>Jarvis is reasoning across your local workspace data...</span>
            </div>
          )}
        </div>
      )}

      {/* Input Message Form */}
      <form onSubmit={handleSendMessage} className="flex gap-2 flex-none">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={`Ask Jarvis in ${selectedMode.toUpperCase()} mode (e.g. prioritize today's milestones, audit burn rate, prep meeting)...`}
          className="flex-1 px-4 py-3 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-[var(--hub-ink)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--hub-accent)] placeholder:text-[var(--hub-muted)] shadow-xs"
        />
        <button
          type="submit"
          disabled={!inputMessage.trim() || isProcessing}
          className="px-5 py-3 rounded-xl bg-[var(--hub-accent)] text-white font-semibold text-sm hover:bg-[var(--hub-accent-hover)] transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2 shadow-xs"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Ask</span>
        </button>
      </form>
    </div>
  );
};
