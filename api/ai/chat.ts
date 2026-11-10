// Vercel Serverless Function: AI Chief of Staff Gateway
// Endpoint: /api/ai/chat (11th serverless function <= 12 Hobby limit)
// Features:
// - GET ?action=tools: exposes structured tool schemas and server provider readiness
// - POST: server-side Gemini / OpenAI / Anthropic tool-calling orchestration over user workspace data,
//   strict factual grounding separating Verified Facts, Estimates, Recommendations & Unknowns,
//   Level 2 write-action previews requiring explicit human approval, and grounded fallback when keys are absent.

import {
  AI_TOOL_DEFINITIONS,
  buildDeterministicGroundedResponse,
  executeAiTool,
  type ProposedActionPreview,
  type WorkspaceSnapshot,
} from '../_lib/aiTools.ts';
import { isServerSupabaseConfigured, resolveAuthenticatedUser, supabaseServer } from '../_lib/db.ts';

function toOpenAiTools() {
  return AI_TOOL_DEFINITIONS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

function toGeminiFunctionDeclarations() {
  return AI_TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(
        Object.entries(t.parameters.properties).map(([k, v]) => [
          k,
          {
            type: v.type.toUpperCase(),
            description: v.description,
            ...(v.enum ? { enum: v.enum } : {}),
          },
        ])
      ),
      ...(t.parameters.required ? { required: t.parameters.required } : {}),
    },
  }));
}

function toAnthropicTools() {
  return AI_TOOL_DEFINITIONS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

const CHIEF_OF_STAFF_SYSTEM_PROMPT = `You are the AI Chief of Staff for Yashwanth Hub.
CRITICAL GROUNDING RULES:
1. Always inspect the user's actual workspace via tools before answering questions about tasks, projects, blockers, decisions, memories, or schedules.
2. NEVER invent metrics, test results, TRL advancements, funding balances, customer commitments, or completed milestones.
3. Explicitly separate sections in every substantive answer:
   - ### Verified Facts (cite specific task, project, decision, note, or Neo memory title)
   - ### Targets / Estimates (clearly labeled as unverified targets)
   - ### Recommended Next Actions
   - ### Unknowns / Missing Evidence
4. When the user asks to create a task, schedule an event, log a decision, or run an automation, call the corresponding propose_* tool so the UI renders a confirmation card. Do NOT claim the write succeeded until the user approves it.`;

async function enrichSnapshotFromServer(
  clientSnapshot: Partial<WorkspaceSnapshot> | undefined,
  userId: string | null,
  dbClient: any
): Promise<WorkspaceSnapshot> {
  const todayISO = clientSnapshot?.todayISO || new Date().toISOString().slice(0, 10);
  const base: WorkspaceSnapshot = {
    todayISO,
    areaFilter: clientSnapshot?.areaFilter,
    projectIdScope: clientSnapshot?.projectIdScope,
    tasks: Array.isArray(clientSnapshot?.tasks) ? clientSnapshot!.tasks : [],
    projects: Array.isArray(clientSnapshot?.projects) ? clientSnapshot!.projects : [],
    notes: Array.isArray(clientSnapshot?.notes) ? clientSnapshot!.notes : [],
    meetings: Array.isArray(clientSnapshot?.meetings) ? clientSnapshot!.meetings : [],
    events: Array.isArray(clientSnapshot?.events) ? clientSnapshot!.events : [],
    documents: Array.isArray(clientSnapshot?.documents) ? clientSnapshot!.documents : [],
    robotics_records: Array.isArray(clientSnapshot?.robotics_records) ? clientSnapshot!.robotics_records : [],
    neo_memories: Array.isArray(clientSnapshot?.neo_memories) ? clientSnapshot!.neo_memories : [],
    automations: Array.isArray(clientSnapshot?.automations) ? clientSnapshot!.automations : [],
  };

  if (!userId || (dbClient === supabaseServer && !isServerSupabaseConfigured())) {
    return base;
  }

  try {
    const [tRes, pRes, nRes, mRes, neoRes] = await Promise.all([
      dbClient.from('tasks').select('*').eq('user_id', userId).limit(50),
      dbClient.from('projects').select('*').eq('user_id', userId).limit(25),
      dbClient.from('notes').select('*').eq('user_id', userId).limit(30),
      dbClient.from('meetings').select('*').eq('user_id', userId).limit(20),
      dbClient.from('neosapien_memories').select('*').eq('user_id', userId).limit(30),
    ]);

    const mergeById = (primary: any[], extra: any[]) => {
      const seen = new Set(primary.map((r) => r.id));
      return [...primary, ...(extra || []).filter((r) => r?.id && !seen.has(r.id))];
    };

    if (tRes.data) base.tasks = mergeById(base.tasks, tRes.data);
    if (pRes.data) base.projects = mergeById(base.projects, pRes.data);
    if (nRes.data) base.notes = mergeById(base.notes, nRes.data);
    if (mRes.data) base.meetings = mergeById(base.meetings, mRes.data);
    if (neoRes.data) {
      const permittedNeo = (neoRes.data || []).filter((m: any) => m.allow_ai_usage !== false && m.privacy_level !== 'private');
      base.neo_memories = mergeById(base.neo_memories, permittedNeo);
    }
  } catch {
    // Non-fatal: continue with client snapshot
  }

  return base;
}

async function runGeminiWithTools(
  apiKey: string,
  modelId: string,
  userPrompt: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
  snapshot: WorkspaceSnapshot
) {
  const contents: any[] = [];
  for (const msg of history.slice(-6)) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: userPrompt }] });

  const toolCallsTrace: Array<{ tool: string; args: Record<string, any>; summary: string }> = [];
  const proposedActions: ProposedActionPreview[] = [];
  const citations = new Set<string>();
  let totalIn = 0;
  let totalOut = 0;
  let finalText = '';

  for (let round = 0; round < 4; round++) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ functionDeclarations: toGeminiFunctionDeclarations() }],
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini API returned HTTP ${resp.status}`);
    }

    const data = await resp.json();
    totalIn += data.usageMetadata?.promptTokenCount || 0;
    totalOut += data.usageMetadata?.candidatesTokenCount || 0;

    const candidateContent = data.candidates?.[0]?.content;
    const parts = candidateContent?.parts || [];
    const fnCalls = parts.filter((p: any) => p.functionCall);

    if (fnCalls.length === 0) {
      finalText = parts.map((p: any) => p.text || '').join('\n').trim();
      break;
    }

    contents.push(candidateContent);
    const responseParts: any[] = [];
    for (const part of fnCalls) {
      const fnName = part.functionCall.name;
      const fnArgs = part.functionCall.args || {};
      const exec = executeAiTool(fnName, fnArgs, snapshot);
      toolCallsTrace.push({ tool: exec.tool, args: exec.args, summary: exec.summary });
      exec.citations.forEach((c) => citations.add(c));
      if (exec.proposedAction) proposedActions.push(exec.proposedAction);

      responseParts.push({
        functionResponse: {
          name: fnName,
          response: { summary: exec.summary, result: exec.data },
        },
      });
    }
    contents.push({ role: 'user', parts: responseParts });
  }

  return {
    text: finalText || 'Unable to synthesize response.',
    tokensIn: totalIn,
    tokensOut: totalOut,
    tool_calls: toolCallsTrace,
    proposed_actions: proposedActions,
    citations: Array.from(citations),
  };
}

async function runOpenAiWithTools(
  apiKey: string,
  modelId: string,
  userPrompt: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
  snapshot: WorkspaceSnapshot
) {
  const messages: any[] = [{ role: 'system', content: systemPrompt }];
  for (const m of history.slice(-6)) {
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  messages.push({ role: 'user', content: userPrompt });

  const toolCallsTrace: Array<{ tool: string; args: Record<string, any>; summary: string }> = [];
  const proposedActions: ProposedActionPreview[] = [];
  const citations = new Set<string>();
  let totalIn = 0;
  let totalOut = 0;
  let finalText = '';

  for (let round = 0; round < 4; round++) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        tools: toOpenAiTools(),
        tool_choice: 'auto',
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenAI API returned HTTP ${resp.status}`);
    }

    const data = await resp.json();
    totalIn += data.usage?.prompt_tokens || 0;
    totalOut += data.usage?.completion_tokens || 0;

    const msg = data.choices?.[0]?.message;
    if (!msg?.tool_calls?.length) {
      finalText = msg?.content || '';
      break;
    }

    messages.push(msg);
    for (const tc of msg.tool_calls) {
      const fnName = tc.function?.name;
      let fnArgs = {};
      try {
        fnArgs = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch {
        fnArgs = {};
      }
      const exec = executeAiTool(fnName, fnArgs, snapshot);
      toolCallsTrace.push({ tool: exec.tool, args: exec.args, summary: exec.summary });
      exec.citations.forEach((c) => citations.add(c));
      if (exec.proposedAction) proposedActions.push(exec.proposedAction);

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify({ summary: exec.summary, result: exec.data }),
      });
    }
  }

  return {
    text: finalText || 'Unable to synthesize response.',
    tokensIn: totalIn,
    tokensOut: totalOut,
    tool_calls: toolCallsTrace,
    proposed_actions: proposedActions,
    citations: Array.from(citations),
  };
}

async function runAnthropicWithTools(
  apiKey: string,
  modelId: string,
  userPrompt: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
  snapshot: WorkspaceSnapshot
) {
  const messages: any[] = [];
  for (const m of history.slice(-6)) {
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  messages.push({ role: 'user', content: userPrompt });

  const toolCallsTrace: Array<{ tool: string; args: Record<string, any>; summary: string }> = [];
  const proposedActions: ProposedActionPreview[] = [];
  const citations = new Set<string>();
  let totalIn = 0;
  let totalOut = 0;
  let finalText = '';

  for (let round = 0; round < 4; round++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1500,
        system: systemPrompt,
        tools: toAnthropicTools(),
        messages,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Anthropic API returned HTTP ${resp.status}`);
    }

    const data = await resp.json();
    totalIn += data.usage?.input_tokens || 0;
    totalOut += data.usage?.output_tokens || 0;

    const blocks = data.content || [];
    const toolUses = blocks.filter((b: any) => b.type === 'tool_use');
    if (toolUses.length === 0) {
      finalText = blocks
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
        .trim();
      break;
    }

    messages.push({ role: 'assistant', content: blocks });
    const toolResults: any[] = [];
    for (const tu of toolUses) {
      const exec = executeAiTool(tu.name, tu.input || {}, snapshot);
      toolCallsTrace.push({ tool: exec.tool, args: exec.args, summary: exec.summary });
      exec.citations.forEach((c) => citations.add(c));
      if (exec.proposedAction) proposedActions.push(exec.proposedAction);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: JSON.stringify({ summary: exec.summary, result: exec.data }),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return {
    text: finalText || 'Unable to synthesize response.',
    tokensIn: totalIn,
    tokensOut: totalOut,
    tool_calls: toolCallsTrace,
    proposed_actions: proposedActions,
    citations: Array.from(citations),
  };
}

export function createAiChatHandler(dbClient: any = supabaseServer) {
  return async function handler(req: any, res: any) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const envProviders = {
      gemini: Boolean((process.env.GEMINI_API_KEY || '').trim()),
      openai: Boolean((process.env.OPENAI_API_KEY || '').trim()),
      anthropic: Boolean((process.env.ANTHROPIC_API_KEY || '').trim()),
    };

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        tools: AI_TOOL_DEFINITIONS,
        configuredProviders: envProviders,
        timestamp: new Date().toISOString(),
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const startTime = Date.now();

    try {
      const body = req.body || {};
      const prompt = String(body.prompt || '').trim();
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required.' });
      }

      const auth = await resolveAuthenticatedUser(req, dbClient);
      const history = Array.isArray(body.history) ? body.history : [];
      const projectId = body.projectId ? String(body.projectId) : undefined;
      const mode = String(body.mode || 'personal');
      const snapshot = await enrichSnapshotFromServer(body.workspaceSnapshot, auth.userId, dbClient);

      const requestedProvider = String(body.provider || 'gemini');
      const requestedModel = String(body.modelId || '');
      const projectScopeNote = projectId
        ? `\nFocused Project ID: ${projectId}. Prioritize this project when resolving context.`
        : '';
      const systemPrompt = `${CHIEF_OF_STAFF_SYSTEM_PROMPT}\nMode: ${mode}.${projectScopeNote}${
        body.systemPrompt ? `\nAdditional Instructions: ${body.systemPrompt}` : ''
      }`;

      const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
      const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
      const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();

      let chosenProvider: 'gemini' | 'openai' | 'anthropic' | null = null;
      let apiKey = '';
      let modelId = requestedModel;

      if (requestedProvider === 'openai' && openaiKey) {
        chosenProvider = 'openai';
        apiKey = openaiKey;
        if (!modelId) modelId = 'gpt-4o-mini';
      } else if (requestedProvider === 'anthropic' && anthropicKey) {
        chosenProvider = 'anthropic';
        apiKey = anthropicKey;
        if (!modelId) modelId = 'claude-3-5-haiku-20241022';
      } else if (requestedProvider === 'gemini' && geminiKey) {
        chosenProvider = 'gemini';
        apiKey = geminiKey;
        if (!modelId) modelId = 'gemini-2.5-flash';
      } else if (requestedProvider !== 'local_heuristic') {
        if (geminiKey) {
          chosenProvider = 'gemini';
          apiKey = geminiKey;
          modelId = 'gemini-2.5-flash';
        } else if (openaiKey) {
          chosenProvider = 'openai';
          apiKey = openaiKey;
          modelId = 'gpt-4o-mini';
        } else if (anthropicKey) {
          chosenProvider = 'anthropic';
          apiKey = anthropicKey;
          modelId = 'claude-3-5-haiku-20241022';
        }
      }

      if (chosenProvider && apiKey) {
        try {
          const llmResult =
            chosenProvider === 'gemini'
              ? await runGeminiWithTools(apiKey, modelId, prompt, history, systemPrompt, snapshot)
              : chosenProvider === 'openai'
              ? await runOpenAiWithTools(apiKey, modelId, prompt, history, systemPrompt, snapshot)
              : await runAnthropicWithTools(apiKey, modelId, prompt, history, systemPrompt, snapshot);

          return res.status(200).json({
            success: true,
            providerMode: 'server_llm',
            provider: chosenProvider,
            modelId,
            text: llmResult.text,
            tokensInput: llmResult.tokensIn,
            tokensOutput: llmResult.tokensOut,
            latencyMs: Date.now() - startTime,
            tool_calls: llmResult.tool_calls,
            proposed_actions: llmResult.proposed_actions,
            citations: llmResult.citations,
            configuredProviders: envProviders,
          });
        } catch (llmErr: any) {
          const grounded = buildDeterministicGroundedResponse(prompt, snapshot, projectId);
          return res.status(200).json({
            success: true,
            providerMode: 'grounded_fallback_after_error',
            providerError: llmErr?.message || 'LLM call failed',
            provider: 'local_heuristic',
            modelId: 'grounded-chief-of-staff-v2',
            ...grounded,
            tokensInput: 0,
            tokensOutput: 0,
            latencyMs: Date.now() - startTime,
            configuredProviders: envProviders,
          });
        }
      }

      const grounded = buildDeterministicGroundedResponse(prompt, snapshot, projectId);
      return res.status(200).json({
        success: true,
        providerMode: 'grounded_deterministic',
        providerNotice:
          'No live server LLM API key (GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY) is configured in environment variables; returning deterministic tool-grounded response from verified workspace records.',
        provider: 'local_heuristic',
        modelId: 'grounded-chief-of-staff-v2',
        ...grounded,
        tokensInput: 0,
        tokensOutput: 0,
        latencyMs: Date.now() - startTime,
        configuredProviders: envProviders,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'AI Chief of Staff Error',
        message: err?.message || 'Failed to process AI request.',
      });
    }
  };
}

export default createAiChatHandler();
