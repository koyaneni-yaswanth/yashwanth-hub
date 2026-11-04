import type {
  AIProvider,
  AIMode,
  AIComparisonResult,
  AIUsageLog,
} from '../../types';
import { db } from '../../db';
import { generateId } from '../../lib/utils';
import { SUPPORTED_MODELS, getRecommendedModel } from './aiModels';
import { NeoSapienMemoryService } from '../neoSapienMemoryService';

export interface AISendOptions {
  provider?: AIProvider;
  modelId?: string;
  mode: AIMode;
  complexity?: 'simple' | 'moderate' | 'complex';
  systemPrompt?: string;
  contextData?: any;
}

export interface AIResponse {
  text: string;
  provider: AIProvider;
  modelId: string;
  latencyMs: number;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUSD: number;
}

export class AIGateway {
  private static getStoredKey(provider: AIProvider): string {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(`yash_ai_key_${provider}`) || localStorage.getItem('yash_ai_key') || '';
  }

  public static async executePrompt(
    userPrompt: string,
    options: AISendOptions
  ): Promise<AIResponse> {
    const startTime = performance.now();
    const mode = options.mode || 'personal';
    const complexity = options.complexity || 'simple';

    // 1. Determine Provider & Model
    const selectedModel =
      options.modelId
        ? SUPPORTED_MODELS.find((m) => m.modelId === options.modelId) || getRecommendedModel(mode, complexity)
        : getRecommendedModel(mode, complexity);

    const provider = options.provider || selectedModel.provider;
    const apiKey = this.getStoredKey(provider);

    // If no API key is configured or local_heuristic is chosen, use intelligent local heuristic engine
    if (!apiKey || provider === 'local_heuristic') {
      const fallbackText = await this.executeLocalHeuristic(userPrompt, mode, options.contextData);
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        text: fallbackText,
        provider: 'local_heuristic',
        modelId: 'heuristic-engine-v2',
        latencyMs,
        tokensInput: 0,
        tokensOutput: 0,
        estimatedCostUSD: 0,
      };
    }

    try {
      let resultText = '';
      let tokensIn = 0;
      let tokensOut = 0;

      // 1.5 Permission-Aware NeoSapien Personal Memory Retrieval Layer
      const neoContext = await NeoSapienMemoryService.buildAIRetrievalContext(userPrompt, provider);
      let augmentedSystemPrompt = options.systemPrompt || '';
      if (neoContext.allowed && neoContext.contextSnippet) {
        augmentedSystemPrompt = `${augmentedSystemPrompt ? `${augmentedSystemPrompt}\n\n` : ''}${neoContext.contextSnippet}\n\nWhen citing information from Neo memories, always include the source reference formatted as [Neo Memory: "Title" (Date)].`;
      }

      // 2. Dispatch to designated provider
      if (provider === 'gemini') {
        const resp = await this.callGemini(apiKey, selectedModel.modelId, userPrompt, augmentedSystemPrompt);
        resultText = resp.text;
        tokensIn = resp.tokensIn;
        tokensOut = resp.tokensOut;
      } else if (provider === 'openai') {
        const resp = await this.callOpenAI(apiKey, selectedModel.modelId, userPrompt, augmentedSystemPrompt);
        resultText = resp.text;
        tokensIn = resp.tokensIn;
        tokensOut = resp.tokensOut;
      } else if (provider === 'anthropic') {
        const resp = await this.callAnthropic(apiKey, selectedModel.modelId, userPrompt, augmentedSystemPrompt);
        resultText = resp.text;
        tokensIn = resp.tokensIn;
        tokensOut = resp.tokensOut;
      }

      const latencyMs = Math.round(performance.now() - startTime);
      const estimatedCost =
        (tokensIn / 1000) * selectedModel.costPer1kInputTokensUSD +
        (tokensOut / 1000) * selectedModel.costPer1kOutputTokensUSD;

      // Log usage to database
      const logEntry: AIUsageLog = {
        id: generateId(),
        provider,
        modelId: selectedModel.modelId,
        taskMode: mode,
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        latencyMs,
        estimatedCostUSD: estimatedCost,
        timestamp: new Date().toISOString(),
      };
      await db.ai_logs.add(logEntry).catch(() => {});

      return {
        text: resultText,
        provider,
        modelId: selectedModel.modelId,
        latencyMs,
        tokensInput: tokensIn,
        tokensOutput: tokensOut,
        estimatedCostUSD: estimatedCost,
      };
    } catch (err: any) {
      console.warn(`Primary AI Provider ${provider} failed, cascading to local heuristic:`, err);
      // Fallback cascade to local heuristic
      const fallbackText = await this.executeLocalHeuristic(userPrompt, mode, options.contextData);
      const latencyMs = Math.round(performance.now() - startTime);

      return {
        text: `*(Provider ${provider} encountered: ${err.message || 'Connection error'}. Switched to local heuristic engine)*\n\n${fallbackText}`,
        provider: 'local_heuristic',
        modelId: 'heuristic-fallback',
        latencyMs,
        tokensInput: 0,
        tokensOutput: 0,
        estimatedCostUSD: 0,
      };
    }
  }

  // Model Comparison Mode: Runs query concurrently across 2 or 3 providers
  public static async compareModels(
    userPrompt: string,
    modelIds: string[]
  ): Promise<AIComparisonResult[]> {
    const tasks = modelIds.map(async (modelId) => {
      const model = SUPPORTED_MODELS.find((m) => m.modelId === modelId);
      if (!model) return null;
      const resp = await this.executePrompt(userPrompt, {
        provider: model.provider,
        modelId: model.modelId,
        mode: 'research',
      });
      return {
        provider: resp.provider,
        modelId: resp.modelId,
        response: resp.text,
        latencyMs: resp.latencyMs,
        tokensUsed: resp.tokensInput + resp.tokensOutput,
      };
    });

    const results = await Promise.all(tasks);
    return results.filter(Boolean) as AIComparisonResult[];
  }

  // Google Gemini API Call
  private static async callGemini(
    apiKey: string,
    modelId: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const payload: any = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    };
    if (systemPrompt) {
      payload.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Gemini API returned status ${res.status}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || 'No response generated.';
    const usage = data.usageMetadata || {};

    return {
      text,
      tokensIn: usage.promptTokenCount || Math.round(prompt.length / 4),
      tokensOut: usage.candidatesTokenCount || Math.round(text.length / 4),
    };
  }

  // OpenAI Chat Completions API Call
  private static async callOpenAI(
    apiKey: string,
    modelId: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `OpenAI returned status ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || 'No response generated.';
    const usage = data.usage || {};

    return {
      text,
      tokensIn: usage.prompt_tokens || Math.round(prompt.length / 4),
      tokensOut: usage.completion_tokens || Math.round(text.length / 4),
    };
  }

  // Anthropic Messages API Call
  private static async callAnthropic(
    apiKey: string,
    modelId: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Anthropic returned status ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || 'No response generated.';
    const usage = data.usage || {};

    return {
      text,
      tokensIn: usage.input_tokens || Math.round(prompt.length / 4),
      tokensOut: usage.output_tokens || Math.round(text.length / 4),
    };
  }

  // Local Heuristic Intelligence Engine
  private static async executeLocalHeuristic(
    prompt: string,
    mode: AIMode,
    _contextData?: any
  ): Promise<string> {
    const today = new Date().toISOString().slice(0, 10);
    const [tasks, meetings, projects, expenses] = await Promise.all([
      db.tasks.toArray(),
      db.meetings.toArray(),
      db.projects.toArray(),
      db.expenses.toArray(),
    ]);

    const openTasks = tasks.filter((t) => !t.done);
    const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < today);
    const activeProjects = projects.filter((p) => p.status === 'active');
    const upcomingMeetings = meetings.filter((m) => m.date >= today && m.status === 'scheduled');
    const monthExpenses = expenses.filter((e) => e.date.startsWith(today.slice(0, 7)));
    const totalMonthSpend = monthExpenses.reduce((s, e) => s + e.amount, 0);

    const lower = prompt.toLowerCase();

    // Check NeoSapien Authorized Memory Layer
    const neoSearchResults = await NeoSapienMemoryService.searchMemories(prompt, { limit: 3 });
    const hasNeoMatch =
      neoSearchResults.memories.length > 0 &&
      (lower.includes('discuss') ||
        lower.includes('pawan') ||
        lower.includes('wind') ||
        lower.includes('turbine') ||
        lower.includes('memory') ||
        lower.includes('meeting') ||
        lower.includes('said') ||
        lower.includes('talk') ||
        lower.includes('decision') ||
        lower.includes('commitment'));

    if (hasNeoMatch) {
      const memorySections = neoSearchResults.memories
        .map((m) => {
          let block = `• **[Neo Memory: "${m.title}"]** (${m.source}, ${m.capturedAt.slice(0, 10)})\n  - **Summary:** ${m.summary}`;
          if (m.decisions.length > 0) {
            block += `\n  - **Decisions Made:** ${m.decisions.map((d) => d.text).join('; ')}`;
          }
          if (m.commitments.length > 0) {
            block += `\n  - **Commitments:** ${m.commitments.join('; ')}`;
          }
          if (m.actionItems.length > 0) {
            block += `\n  - **Extracted Action Items:** ${m.actionItems
              .map((a) => `${a.text} (Due: ${a.detectedDeadline || 'TBD'})`)
              .join('; ')}`;
          }
          return block;
        })
        .join('\n\n');

      return `### 🧠 NeoSapien Personal Memory Intelligence (${neoSearchResults.latencyMs}ms)

Found **${neoSearchResults.totalCount}** authorized conversation record(s) matching your inquiry:

${memorySections}

*References: Powered by NeoSapien Second Brain timeline. Review and approve commitments in the Neo Memory Center.*`;
    }

    if (mode === 'engineering' || lower.includes('robot') || lower.includes('wind') || lower.includes('cad')) {
      return `### 🛠️ Engineering & Robotics Intelligence

• **Active Engineering Projects (${activeProjects.length}):**
${activeProjects.map((p) => `  - **[${p.area}] ${p.title}** (${p.progress}% progress, Target: ${p.target_date})`).join('\n')}

• **Technical Backlog:**
${openTasks
  .filter((t) => t.area === 'PAWAN SHAKTI' || t.area === 'IvLabs' || t.area === 'MG Automation')
  .slice(0, 4)
  .map((t) => `  - [${t.priority.toUpperCase()}] ${t.text}`)
  .join('\n')}

**Guidance:** Keep rotor CAD tolerances and ROS 2 coordinate frames aligned before on-site hardware integration.`;
    }

    if (mode === 'startup' || lower.includes('grant') || lower.includes('burn') || lower.includes('trl')) {
      return `### 🌪️ Startup & Venture Health

• **Monthly Hardware/Operational Spend:** ₹ ${totalMonthSpend.toLocaleString('en-IN')} across ${monthExpenses.length} transactions.
• **90-Day Wind Roadmap Status:** TRL 5 validation underway.
• **Top Deliverable:** Customer pilot letter of intent (LOI) & DST grant review.`;
    }

    if (mode === 'meeting' || lower.includes('meeting') || lower.includes('call')) {
      if (upcomingMeetings.length === 0) {
        return `### 🗓️ Meeting Briefing\n\nNo meetings scheduled today. Enjoy an uninterrupted deep engineering sprint block!`;
      }
      const nextM = upcomingMeetings[0];
      return `### 🗓️ Meeting Briefing: ${nextM.title}\n\n• **Time:** ${nextM.date} at ${nextM.start_time}\n• **Area:** ${nextM.area}\n• **Attendees:** ${nextM.attendees || 'Team'}\n• **Action items pending:** ${nextM.action_items || 'None currently registered'}`;
    }

    // Default Personal Productivity
    return `### 🎯 Personal Executive Overview (${today})

• **Open Tasks:** ${openTasks.length} (${overdueTasks.length} overdue)
• **Upcoming Meetings:** ${upcomingMeetings.length}
• **Active Projects:** ${activeProjects.length}

**Recommended Focus:** Tackle the ${overdueTasks.length > 0 ? `${overdueTasks.length} overdue priority tasks` : 'highest impact technical milestone'} before shifting to routine communication.`;
  }
}
