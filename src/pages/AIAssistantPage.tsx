import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Sparkles,
  Bot,
  Send,
  Key,
  CheckCircle,
  AlertCircle,
  FileText,
  Calendar,
  IndianRupee,
  Wind,
  ListTodo,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { db } from '../db';
import type { Task, Meeting, Expense, Note, Area } from '../types';
import { formatINR, formatShortDate, getTodayISO, isOverdue, generateId } from '../lib/utils';
import { Badge } from '../components/common/Badge';

interface AIAssistantPageProps {
  currentArea: string;
  areas: Area[];
  onNavigate: (tab: any) => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  dataSynthesis?: boolean;
}

export const AIAssistantPage: React.FC<AIAssistantPageProps> = ({
  currentArea,
  areas,
  onNavigate,
}) => {
  const today = getTodayISO();

  // Queries
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allMeetings = useLiveQuery(() => db.meetings.toArray(), []) || [];
  const allExpenses = useLiveQuery(() => db.expenses.toArray(), []) || [];
  const allNotes = useLiveQuery(() => db.notes.toArray(), []) || [];

  // API Config from localStorage or env
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('yash_ai_key') || '');
  const [provider, setProvider] = useState(() => localStorage.getItem('yash_ai_provider') || 'local_heuristic');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Chat conversation state
  const [inputMessage, setInputMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      content:
        "Welcome Yaswanth. I am your Command Center AI Copilot. I analyze your tasks, meetings, expenses, and PAWAN SHAKTI wind roadmap to keep you focused on high-leverage founder actions.\n\nYou can click any prompt template below for an instant data-driven briefing, or type a custom question.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const saveConfig = (newKey: string, newProvider: string) => {
    setApiKey(newKey);
    setProvider(newProvider);
    localStorage.setItem('yash_ai_key', newKey);
    localStorage.setItem('yash_ai_provider', newProvider);
    setIsConfigOpen(false);
  };

  // Pre-built Prompt Templates with REAL data analysis
  const executeDataSynthesis = (type: 'daily_plan' | 'prioritize' | 'meeting_prep' | 'expense_summary' | 'wind_review') => {
    setIsProcessing(true);
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let userPromptText = '';
    let responseText = '';

    const openTasks = allTasks.filter((t) => !t.done);
    const overdueTasks = openTasks.filter((t) => isOverdue(t.due_date, t.done));
    const todayTasks = openTasks.filter((t) => t.due_date === today);
    const upcomingMeetings = allMeetings.filter((m) => m.date >= today && m.status === 'scheduled');
    const monthExpenses = allExpenses.filter((e) => e.date.startsWith(today.slice(0, 7)));
    const totalMonthSpend = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

    if (type === 'daily_plan') {
      userPromptText = 'Generate my founder daily plan and executive priorities for today.';
      responseText = `### 🎯 Founder Daily Briefing — ${formatShortDate(today)}

**Immediate Action Items:**
${
  overdueTasks.length > 0
    ? `⚠️ **${overdueTasks.length} Overdue Task(s):**\n` +
      overdueTasks.map((t) => `• [${t.area}] **${t.text}** (Overdue: ${formatShortDate(t.due_date)})`).join('\n')
    : '✅ No overdue tasks.'
}

${
  todayTasks.length > 0
    ? `📋 **Due Today (${todayTasks.length}):**\n` +
      todayTasks.map((t) => `• [${t.area}] ${t.text} (${t.priority.toUpperCase()})`).join('\n')
    : '💡 No tasks explicitly marked due today. Pull from your highest priority backlog.'
}

${
  upcomingMeetings.length > 0
    ? `🗓️ **Upcoming Meetings Today & This Week:**\n` +
      upcomingMeetings.slice(0, 3).map((m) => `• **${m.title}** at ${m.start_time} (${m.attendees || 'Team'})`).join('\n')
    : '🗓️ No meetings scheduled today. Enjoy an uninterrupted engineering deep work block!'
}

**Recommendation:**
Focus 2 hours of deep work on your top PAWAN SHAKTI engineering milestone before addressing routine operational emails.`;
    } else if (type === 'prioritize') {
      userPromptText = 'Prioritize all open tasks based on TRL impact and deadlines.';
      const urgentTasks = openTasks.filter((t) => t.priority === 'urgent');
      const highTasks = openTasks.filter((t) => t.priority === 'high');
      const mediumTasks = openTasks.filter((t) => t.priority === 'medium');

      responseText = `### ⚡ Task Prioritization Matrix

**Tier 1: Critical & Urgent (${urgentTasks.length + overdueTasks.length})**
${
  urgentTasks.length + overdueTasks.length > 0
    ? [...new Set([...urgentTasks, ...overdueTasks])].map((t) => `• [${t.area}] **${t.text}**`).join('\n')
    : 'No critical bottlenecks detected.'
}

**Tier 2: High Impact Milestones (${highTasks.length})**
${highTasks.slice(0, 5).map((t) => `• [${t.area}] ${t.text}`).join('\n')}

**Tier 3: Standard Backlog (${mediumTasks.length})**
${mediumTasks.slice(0, 3).map((t) => `• [${t.area}] ${t.text}`).join('\n')}

*Total open backlog size:* **${openTasks.length} tasks** across ${areas.length} workspace areas.`;
    } else if (type === 'meeting_prep') {
      userPromptText = 'Prepare an executive briefing for my upcoming meetings.';
      if (upcomingMeetings.length === 0) {
        responseText = '### 🗓️ Meeting Preparation\n\nYou currently have no upcoming meetings scheduled. Use this calendar freedom for uninterrupted CAD modeling, CFD simulations, or lab bench testing.';
      } else {
        const nextM = upcomingMeetings[0];
        responseText = `### 🤝 Meeting Brief: ${nextM.title}

• **Scheduled:** ${formatShortDate(nextM.date)} at ${nextM.start_time}
• **Workspace Area:** ${nextM.area}
• **Attendees:** ${nextM.attendees || 'Unspecified'}
• **Location / Video:** ${nextM.location_or_link || 'Local meeting'}

**Agenda & Talking Points:**
${nextM.agenda_and_notes || '• Provide one-page progress update.\n• Present latest experimental data.\n• Ask for one concrete request (lab slot or grant referral).'}

${
  nextM.action_items
    ? `**Pending Action Items:**\n${nextM.action_items}`
    : '**Pre-flight check:** Ensure power curves and test data sheets are ready on your screen before launching the call.'
}`;
      }
    } else if (type === 'expense_summary') {
      userPromptText = 'Summarize monthly expenses and hardware burn rate.';
      const categoryMap: Record<string, number> = {};
      monthExpenses.forEach((e) => {
        categoryMap[e.category] = (categoryMap[e.category] || 0) + e.amount;
      });

      responseText = `### 💰 Monthly Financial Burn Summary (${today.slice(0, 7)})

• **Total Spent this Cycle:** **${formatINR(totalMonthSpend)}**
• **Logged Transactions:** ${monthExpenses.length}

**Top Expense Breakdown:**
${
  Object.keys(categoryMap).length > 0
    ? Object.keys(categoryMap)
        .map((cat) => `• **${cat}:** ${formatINR(categoryMap[cat])} (${Math.round((categoryMap[cat] / totalMonthSpend) * 100)}%)`)
        .join('\n')
    : 'No expenses recorded this month.'
}

**Founder Capital Observation:**
${
  totalMonthSpend > 50000
    ? 'Hardware fabrication costs are significant. Ensure all long-lead parts conform to frozen engineering specifications.'
    : 'Monthly expenditure is lean. Maintain capital efficiency while preserving prototype turnaround speed.'
}`;
    } else if (type === 'wind_review') {
      userPromptText = 'Review PAWAN SHAKTI 90-Day Wind Startup Progress.';
      const planTasks = allTasks.filter((t) => t.plan !== undefined);
      const donePlan = planTasks.filter((t) => t.done).length;
      const pct = planTasks.length > 0 ? Math.round((donePlan / planTasks.length) * 100) : 0;

      responseText = `### 🌪️ PAWAN SHAKTI 90-Day TRL Progress Review

• **TRL Plan Progress:** **${pct}% Complete** (${donePlan} of ${planTasks.length} milestones finished)
• **Target:** TRL 5 realistic environment validation by Day 56, TRL 6 demo by Day 90.

**Active Milestone Directives:**
1. Maintain focus on aerodynamic rotor efficiency and power curve logging.
2. Complete the IEC 61400-2 risk register and overspeed brake test plan.
3. Every 2 weeks, request a specific laboratory validation slot or incubator endorsement.`;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        sender: 'user',
        content: userPromptText,
        timestamp: nowTime,
      },
      {
        id: generateId(),
        sender: 'assistant',
        content: responseText,
        timestamp: nowTime,
        dataSynthesis: true,
      },
    ]);
    setIsProcessing(false);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userText = inputMessage.trim();
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const userMsg: ChatMessage = {
      id: generateId(),
      sender: 'user',
      content: userText,
      timestamp: nowTime,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsProcessing(true);

    setTimeout(() => {
      let reply = '';
      if (!apiKey && provider !== 'local_heuristic') {
        reply = `⚠️ **AI Provider Not Configured**\n\nTo connect live generative LLM completions (OpenAI, Gemini, Anthropic, or local Ollama), click the **Configure API** button above to input your endpoint or key.\n\nIn the meantime, you can use the built-in prompt buttons above to instantly synthesize your actual local tasks, calendar, and expense data.`;
      } else {
        // Local contextual search
        const lower = userText.toLowerCase();
        if (lower.includes('task') || lower.includes('todo')) {
          const open = allTasks.filter((t) => !t.done);
          reply = `You have **${open.length} open tasks** in your local database. Top priorities include:\n` +
            open.slice(0, 4).map((t) => `• [${t.area}] ${t.text}`).join('\n');
        } else if (lower.includes('expense') || lower.includes('spend') || lower.includes('money')) {
          const sum = allExpenses.reduce((s, e) => s + e.amount, 0);
          reply = `Your total logged expenses across all time is **${formatINR(sum)}** across ${allExpenses.length} transactions.`;
        } else if (lower.includes('meeting') || lower.includes('schedule')) {
          const upcoming = allMeetings.filter((m) => m.date >= today && m.status === 'scheduled');
          reply = upcoming.length > 0
            ? `You have **${upcoming.length} upcoming meetings**:\n` + upcoming.map((m) => `• ${m.title} on ${formatShortDate(m.date)} at ${m.start_time}`).join('\n')
            : 'No upcoming meetings scheduled. Great time for deep focus.';
        } else {
          reply = `I have received your request: "${userText}".\n\nTo perform unrestricted natural-language reasoning with an external model, configure your API key in **Configure API**. Alternatively, click one of the preset prompts above for instant analysis of your local workspace.`;
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          sender: 'assistant',
          content: reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setIsProcessing(false);
    }, 400);
  };

  return (
    <div className="space-y-6 pb-12 flex flex-col h-[calc(100vh-140px)] min-h-[600px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-none">
        <div>
          <h2 className="text-2xl font-bold font-heading text-[var(--hub-ink)] tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            <span>AI Executive Copilot</span>
          </h2>
          <p className="text-sm text-[var(--hub-muted)] mt-0.5">
            Modular intelligence engine for founder planning, meeting prep, and task prioritization
          </p>
        </div>

        <button
          onClick={() => setIsConfigOpen(!isConfigOpen)}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-[var(--hub-line)] bg-[var(--hub-surface)] text-xs font-semibold text-[var(--hub-ink)] hover:bg-[var(--hub-bg)] cursor-pointer self-start sm:self-auto"
        >
          <Key className="w-3.5 h-3.5 text-amber-500" />
          <span>{apiKey ? 'API Configured' : 'Configure AI Provider'}</span>
        </button>
      </div>

      {/* Provider Status Alert */}
      {!apiKey && (
        <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-900 dark:text-teal-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 flex-none">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-teal-600 flex-none" />
            <span>
              <strong>Local Intelligence Active:</strong> Real-time synthesis of your local tasks, meetings, expenses, and wind roadmap operates 100% offline without cloud tokens.
            </span>
          </div>
          <button
            onClick={() => setIsConfigOpen(true)}
            className="text-xs font-bold underline cursor-pointer text-teal-800 dark:text-teal-100 self-end sm:self-auto"
          >
            Connect Cloud LLM
          </button>
        </div>
      )}

      {/* API Configuration Panel */}
      {isConfigOpen && (
        <div className="p-4 bg-[var(--hub-surface)] border border-[var(--hub-line)] rounded-xl space-y-3 shadow-md flex-none">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--hub-line)]">
            <h4 className="text-xs font-bold text-[var(--hub-ink)] uppercase tracking-wider">
              AI Provider Settings
            </h4>
            <span className="text-[11px] text-[var(--hub-muted)]">
              Keys are stored strictly in local browser storage (never sent to any server)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">
                Provider
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full py-1.5 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
              >
                <option value="local_heuristic">Local Heuristic (Offline)</option>
                <option value="openai">OpenAI (GPT-4o / o1)</option>
                <option value="gemini">Google Gemini 2.5</option>
                <option value="anthropic">Anthropic Claude 3.5</option>
                <option value="ollama">Local Ollama (localhost:11434)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--hub-ink)] mb-1">
                API Key (Optional for Local Mode)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-... or AIza..."
                className="w-full py-1.5 px-3 rounded-lg border border-[var(--hub-line)] bg-[var(--hub-bg)] text-xs text-[var(--hub-ink)]"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsConfigOpen(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--hub-line)] text-[var(--hub-ink)] hover:bg-[var(--hub-bg)]"
            >
              Cancel
            </button>
            <button
              onClick={() => saveConfig(apiKey, provider)}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--hub-accent)] text-white hover:bg-[var(--hub-accent-hover)]"
            >
              Save Configuration
            </button>
          </div>
        </div>
      )}

      {/* Preset Action Prompt Buttons */}
      <div className="flex flex-wrap items-center gap-2 flex-none">
        <button
          onClick={() => executeDataSynthesis('daily_plan')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
        >
          <ListTodo className="w-3.5 h-3.5 text-teal-600" />
          <span>Daily Plan</span>
        </button>

        <button
          onClick={() => executeDataSynthesis('prioritize')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Prioritize Tasks</span>
        </button>

        <button
          onClick={() => executeDataSynthesis('meeting_prep')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
        >
          <Calendar className="w-3.5 h-3.5 text-blue-600" />
          <span>Meeting Briefing</span>
        </button>

        <button
          onClick={() => executeDataSynthesis('expense_summary')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
        >
          <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />
          <span>Expense Burn</span>
        </button>

        <button
          onClick={() => executeDataSynthesis('wind_review')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hub-surface)] border border-[var(--hub-line)] text-xs font-semibold text-[var(--hub-ink)] hover:border-[var(--hub-accent)] hover:bg-[var(--hub-bg)] transition-colors cursor-pointer"
        >
          <Wind className="w-3.5 h-3.5 text-teal-600" />
          <span>90-Day TRL Check</span>
        </button>
      </div>

      {/* Chat Messages Log */}
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
                    ? 'bg-[var(--hub-accent)] text-white rounded-tr-xs'
                    : 'bg-[var(--hub-bg)] border border-[var(--hub-line)] text-[var(--hub-ink)] rounded-tl-xs'
                }`}
              >
                <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
                <div
                  className={`text-[10px] mt-2 text-right ${
                    isUser ? 'text-white/70' : 'text-[var(--hub-muted)]'
                  }`}
                >
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {isProcessing && (
          <div className="flex gap-3 items-center text-xs text-[var(--hub-muted)] animate-pulse">
            <Bot className="w-4 h-4 text-teal-600" />
            <span>Analyzing local workspace data...</span>
          </div>
        )}
      </div>

      {/* Input Message Form */}
      <form onSubmit={handleSendMessage} className="flex gap-2 flex-none">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Ask a question about your tasks, meetings, expenses or 90-day plan..."
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
