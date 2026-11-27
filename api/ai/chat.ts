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
import { listGeminiModels, resolveGeminiModel } from '../_lib/geminiModels.ts';
import { chooseGeminiModels, GEMINI_AUTO, GEMINI_AUTO_PRO } from '../_lib/geminiRanking.ts';
import {
  AI_PROVIDER_REGISTRY,
  buildProviderExecutionChain,
  detectConfiguredProviders,
  probeAllProviders,
  selectRecommendedProvider,
  type CloudOrLocalProviderId,
} from '../_lib/aiProviderAdapters.ts';
import {
  canEncryptUserSecrets,
  encryptProviderSecret,
  extractConfigMap,
  generateCorrelationId,
  loadEffectiveProviderContext,
  maskSecretHint,
  serverCircuitBreaker,
  testSingleProviderAndPersist,
} from '../_lib/aiVaultAndRouter.ts';
import {
  buildJarvis5RoutePlan,
  computeJitteredBackoffMs,
  type TaskRouteCategory,
} from '../../src/lib/modelRouter5.ts';
import { applyCors } from '../_lib/http.ts';

/** Provider model defaults — configurable via Vercel env vars so ids never go stale. */
const OPENAI_DEFAULT_MODEL = (env: Record<string, string | undefined> = process.env) => (env.OPENAI_MODEL || 'gpt-4o-mini').trim();
const ANTHROPIC_DEFAULT_MODEL = (env: Record<string, string | undefined> = process.env) => (env.ANTHROPIC_MODEL || 'claude-haiku-4-5').trim();
const OPENROUTER_DEFAULT_MODEL = (env: Record<string, string | undefined> = process.env) => (env.OPENROUTER_MODEL || 'openrouter/auto').trim();
const HF_DEFAULT_MODEL = (env: Record<string, string | undefined> = process.env) => (env.HUGGINGFACE_MODEL || 'Qwen/Qwen2.5-72B-Instruct').trim();
const OLLAMA_DEFAULT_MODEL = (env: Record<string, string | undefined> = process.env) => (env.OLLAMA_MODEL || 'llama3.2').trim();

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

interface SanitizedImagePart {
  name?: string;
  mimeType: string;
  base64: string;
}

function sanitizeImageAttachments(raw: any): SanitizedImagePart[] {
  if (!Array.isArray(raw)) return [];
  const allowed = /^image\/(png|jpeg|jpg|webp|gif)$/i;
  const out: SanitizedImagePart[] = [];
  for (const item of raw.slice(0, 3)) {
    if (!item || typeof item !== 'object') continue;
    let mimeType = String(item.mimeType || '').trim().toLowerCase();
    let base64 = String(item.base64 || '').trim();
    if (!base64 && typeof item.dataUrl === 'string') {
      const m = item.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
      if (m) {
        mimeType = m[1].toLowerCase();
        base64 = m[2];
      }
    }
    if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
    if (!allowed.test(mimeType) || !base64 || base64.length > 5_600_000) continue;
    out.push({
      name: typeof item.name === 'string' ? item.name.slice(0, 80) : undefined,
      mimeType,
      base64,
    });
  }
  return out;
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

  if (userId && (dbClient !== supabaseServer || isServerSupabaseConfigured())) {
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
  }

  // Grounding Baseline Safety: Ensure verified portfolio projects exist if client snapshot was unseeded
  if (base.projects.length === 0) {
    base.projects = [
      {
        id: 'proj-pawan-baseline',
        title: 'PAWAN SHAKTI — TRL 4 Benchtop to TRL 5 Integrated Test',
        description:
          'Verified baseline: TRL 4 benchtop prototype (wooden frame, PLA blades, planetary gearbox, published Indian patent "Compact Wind Turbine with Planetary Gears"). TRL 6 is NOT reached; target date for TRL 6 is 2027-01-03. Closed-loop integrated testing and structural upgrade pending.',
        area: 'PAWAN SHAKTI',
        status: 'active',
        priority: 'urgent',
        progress: 45,
        target_date: '2027-01-03',
        verification_note:
          'Ground truth baseline: TRL 4 benchtop only. Operational TRL 6 is NOT reached. Closed-loop electrical + aerodynamic test, continuous >= 1 Hz P-v curve CSV, and customer LOIs are NOT yet completed.',
        milestones: [
          { id: 'm1', title: 'Publish Indian Patent: Compact Wind Turbine with Planetary Gears', done: true },
          { id: 'm2', title: 'TRL 4 separate subcomponent benchtop fabrication (wood + PLA baseline)', done: true },
          { id: 'm3', title: 'Closed-loop integrated aerodynamic + generator bench test with continuous >= 1 Hz P-v curve CSV', done: false },
          { id: 'm4', title: 'Advance to TRL 6 field operational demonstration in operational environment', done: false },
        ],
        goals: [
          { id: 'g1', title: 'Achieve verified TRL 5 integrated bench/wind-tunnel demonstration', status: 'in_progress' },
          { id: 'g2', title: 'Target TRL 6 field operational demonstration by 2027-01-03', status: 'planned' },
        ],
        decisions: [
          {
            id: 'd1',
            title: 'Planetary gear architecture patented in India',
            decision: 'Retain compact planetary gearbox topology as primary torque-speed transmission baseline.',
            rationale: 'Backed by published Indian patent specification.',
            author: 'Yashwanth',
          },
        ],
        risks: [
          {
            id: 'r1',
            title: 'Unverified structural durability of wood frame and PLA blades at high RPM',
            severity: 'high',
            mitigation: 'Replace wood/PLA prior to outdoor overspeed testing; run rotor dynamic balance first.',
            status: 'open',
          },
          {
            id: 'r2',
            title: 'No continuous >= 1 Hz time-series P-v logging yet',
            severity: 'high',
            mitigation: 'Wire synchronized tachometer + electrical load DAQ logging CSV before TRL 5 claim.',
            status: 'open',
          },
        ],
        blockers: [
          {
            id: 'b1',
            title: 'Closed-loop integrated aerodynamic + generator bench test has not been executed',
            owner: 'Yashwanth',
            impact: 'Prevents claiming TRL 5 evidence or external technical validation.',
            status: 'open',
          },
        ],
        tags: ['TRL-4-Baseline', 'Target-TRL-5', 'Patent-Published', 'Wind-Hardware'],
      },
      {
        id: 'proj-robotics-baseline',
        title: 'Robotics Lab — AgileX PiPER, 3-Drone Swarm & AWR2944 mmWave',
        description: 'Active robotics engineering workspace covering manipulator control (AgileX PiPER), multi-UAV coordination, and TI AWR2944 radar perception.',
        area: 'IvLabs',
        status: 'active',
        priority: 'high',
        progress: 40,
        verification_note: 'Engineering workspace active; record every hardware run in Experiments Log with exact parameters.',
        milestones: [
          { id: 'rm1', title: 'AgileX PiPER workspace & CAN-bus motion bring-up checklist', done: true },
          { id: 'rm2', title: 'AWR2944 mmWave radar frame capture & range-Doppler verification', done: false },
          { id: 'rm3', title: '3-Drone swarm SITL + hardware-in-loop safety geofence test', done: false },
        ],
        risks: [
          {
            id: 'rr1',
            title: 'Hardware safety incident during multi-axis arm or UAV tether tests',
            severity: 'high',
            mitigation: 'Enforce hardware e-stop verification, prop guards / workspace fence checklist before arming.',
            status: 'open',
          },
        ],
        blockers: [],
        tags: ['Robotics', 'PiPER', 'Swarm', 'AWR2944'],
      },
      {
        id: 'proj-mg-baseline',
        title: 'MG Automation — Industrial PLC Control Panel Delivery',
        description: 'Client PLC panel wiring schematics, 24V DC isolation checks, and commissioning documentation.',
        area: 'MG Automation',
        status: 'active',
        priority: 'medium',
        progress: 25,
        milestones: [
          { id: 'mm1', title: 'Single-line electrical schematic & BOM review', done: false },
          { id: 'mm2', title: 'Factory commissioning sign-off & handover checklist', done: false },
        ],
        risks: [],
        blockers: [],
        tags: ['Automation', 'PLC', 'Industrial'],
      },
    ];
  }

  if (base.tasks.length === 0) {
    base.tasks = [
      {
        id: 't-baseline-1',
        text: 'Finalize IEC 61400-2 safety risk register for wind rotor braking system',
        description: 'Review overspeed protection, mechanical calipers, and emergency resistive dump load.',
        area: 'PAWAN SHAKTI',
        priority: 'high',
        due_date: todayISO,
        done: false,
        starred: true,
        project_id: 'proj-pawan-baseline',
      },
      {
        id: 't-baseline-2',
        text: 'Inspect PLC control cabinet wiring schematics and emergency stop relays',
        description: 'Check 24V DC bus distribution and signal isolation.',
        area: 'MG Automation',
        priority: 'medium',
        due_date: todayISO,
        done: false,
        starred: false,
        project_id: 'proj-mg-baseline',
      },
      {
        id: 't-baseline-3',
        text: 'Calibrate OAK-D stereo camera rig and test visual odometry package in ROS 2',
        area: 'IvLabs',
        priority: 'medium',
        due_date: todayISO,
        done: false,
        starred: false,
        project_id: 'proj-robotics-baseline',
      },
    ];
  }

  return base;
}

async function runGeminiWithTools(
  apiKey: string,
  modelId: string,
  userPrompt: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
  snapshot: WorkspaceSnapshot,
  fallbackModel: string | null = null,
  images: SanitizedImagePart[] = [],
  fetchImpl: typeof fetch = fetch
) {
  let activeModel = modelId;

  const contents: any[] = [];
  for (const msg of history.slice(-6)) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }
  const userParts: any[] = [{ text: userPrompt }];
  for (const img of images) {
    userParts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }
  contents.push({ role: 'user', parts: userParts });

  const toolCallsTrace: Array<{ tool: string; args: Record<string, any>; summary: string }> = [];
  const proposedActions: ProposedActionPreview[] = [];
  const citations = new Set<string>();
  let totalIn = 0;
  let totalOut = 0;
  let finalText = '';

  for (let round = 0; round < 4; round++) {
    const payloadBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ functionDeclarations: toGeminiFunctionDeclarations() }],
    });

    let resp = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: payloadBody,
        signal: AbortSignal.timeout(28000),
      }
    );

    let firstErrorMsg = '';
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      firstErrorMsg = errData.error?.message || `HTTP ${resp.status}`;
    }

    // Automatic fallback if primary model is unavailable or spikes (404/503/400)
    if (!resp.ok && fallbackModel && activeModel !== fallbackModel && (resp.status === 404 || resp.status === 503 || resp.status === 400)) {
      activeModel = fallbackModel;
      resp = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: payloadBody,
          signal: AbortSignal.timeout(28000),
        }
      );
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      const secondErrorMsg = errData.error?.message || `HTTP ${resp.status}`;
      throw new Error(`[${modelId} error: ${firstErrorMsg}] [${activeModel} fallback error: ${secondErrorMsg}]`);
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
    resolvedModelId: activeModel,
    tool_calls: toolCallsTrace,
    proposed_actions: proposedActions,
    citations: Array.from(citations),
  };
}

async function runGeminiStreamingWithTools(
  apiKey: string,
  modelId: string,
  userPrompt: string,
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
  snapshot: WorkspaceSnapshot,
  fallbackModel: string | null = null,
  onToken?: (delta: string) => void,
  onTool?: (toolMeta: { tool: string; summary: string }) => void,
  fetchImpl: typeof fetch = fetch,
  images: SanitizedImagePart[] = []
) {
  let activeModel = modelId;
  const contents: any[] = [];
  for (const msg of history.slice(-6)) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    });
  }
  const userParts: any[] = [{ text: userPrompt }];
  for (const img of images) {
    userParts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }
  contents.push({ role: 'user', parts: userParts });

  const toolCallsTrace: Array<{ tool: string; args: Record<string, any>; summary: string }> = [];
  const proposedActions: ProposedActionPreview[] = [];
  const citations = new Set<string>();
  let totalIn = 0;
  let totalOut = 0;
  let finalText = '';

  for (let round = 0; round < 4; round++) {
    const payloadBody = JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      tools: [{ functionDeclarations: toGeminiFunctionDeclarations() }],
    });

    let resp = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: payloadBody,
        signal: AbortSignal.timeout(28000),
      }
    );

    if (!resp.ok && fallbackModel && activeModel !== fallbackModel && (resp.status === 404 || resp.status === 503 || resp.status === 400)) {
      activeModel = fallbackModel;
      resp = await fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: payloadBody,
          signal: AbortSignal.timeout(28000),
        }
      );
    }

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Gemini HTTP ${resp.status}`);
    }

    const roundParts: any[] = [];
    const fnCalls: any[] = [];
    let roundText = '';

    const reader = resp.body?.getReader();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const chunk = JSON.parse(jsonStr);
            if (chunk.usageMetadata) {
              totalIn = Math.max(totalIn, chunk.usageMetadata.promptTokenCount || 0);
              totalOut += chunk.usageMetadata.candidatesTokenCount || 0;
            }
            const parts = chunk.candidates?.[0]?.content?.parts || [];
            for (const p of parts) {
              roundParts.push(p);
              if (p.functionCall) {
                fnCalls.push(p);
              } else if (typeof p.text === 'string' && p.text.length > 0) {
                roundText += p.text;
                onToken?.(p.text);
              }
            }
          } catch {
            /* ignore partial JSON SSE frames */
          }
        }
      }
    } else {
      const data = await resp.json();
      totalIn += data.usageMetadata?.promptTokenCount || 0;
      totalOut += data.usageMetadata?.candidatesTokenCount || 0;
      const parts = data.candidates?.[0]?.content?.parts || [];
      for (const p of parts) {
        roundParts.push(p);
        if (p.functionCall) fnCalls.push(p);
        else if (typeof p.text === 'string' && p.text.length > 0) {
          roundText += p.text;
          onToken?.(p.text);
        }
      }
    }

    if (fnCalls.length === 0) {
      finalText = roundText.trim();
      break;
    }

    contents.push({ role: 'model', parts: roundParts });
    const responseParts: any[] = [];
    for (const part of fnCalls) {
      const fnName = part.functionCall.name;
      const fnArgs = part.functionCall.args || {};
      const exec = executeAiTool(fnName, fnArgs, snapshot);
      toolCallsTrace.push({ tool: exec.tool, args: exec.args, summary: exec.summary });
      exec.citations.forEach((c) => citations.add(c));
      if (exec.proposedAction) proposedActions.push(exec.proposedAction);
      onTool?.({ tool: exec.tool, summary: exec.summary });
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
    resolvedModelId: activeModel,
    tool_calls: toolCallsTrace,
    proposed_actions: proposedActions,
    citations: Array.from(citations),
  };
}

function writeSseEvent(res: any, payload: Record<string, any>) {
  const chunk = `data: ${JSON.stringify(payload)}\n\n`;
  if (typeof res.write === 'function') {
    res.write(chunk);
  }
}

function streamTextInChunks(res: any, fullText: string) {
  const tokens = String(fullText || '').match(/\S+\s*/g) || [String(fullText || '')];
  for (let i = 0; i < tokens.length; i += 4) {
    const delta = tokens.slice(i, i + 4).join('');
    writeSseEvent(res, { type: 'token', delta });
  }
}

async function runOpenAiCompatibleWithTools(params: {
  providerLabel: string;
  endpoint: string;
  apiKey?: string;
  extraHeaders?: Record<string, string>;
  modelId: string;
  userPrompt: string;
  history: Array<{ role: string; content: string }>;
  systemPrompt: string;
  snapshot: WorkspaceSnapshot;
  allowToolFallback?: boolean;
  images?: SanitizedImagePart[];
  fetchImpl?: typeof fetch;
}) {
  const {
    providerLabel,
    endpoint,
    apiKey,
    extraHeaders,
    modelId,
    userPrompt,
    history,
    systemPrompt,
    snapshot,
    allowToolFallback = false,
    images = [],
    fetchImpl = fetch,
  } = params;

  const messages: any[] = [{ role: 'system', content: systemPrompt }];
  for (const m of history.slice(-6)) {
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  if (images.length > 0) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userPrompt },
        ...images.map((img) => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
        })),
      ],
    });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  const toolCallsTrace: Array<{ tool: string; args: Record<string, any>; summary: string }> = [];
  const proposedActions: ProposedActionPreview[] = [];
  const citations = new Set<string>();
  let totalIn = 0;
  let totalOut = 0;
  let finalText = '';
  let includeTools = true;

  for (let round = 0; round < 4; round++) {
    const reqBody: Record<string, any> = {
      model: modelId,
      messages,
    };
    if (includeTools) {
      reqBody.tools = toOpenAiTools();
      reqBody.tool_choice = 'auto';
    }

    const resp = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        ...extraHeaders,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(16000),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      if (includeTools && allowToolFallback && (resp.status === 400 || resp.status === 422)) {
        // Retry once without OpenAI tools schema for open-weight endpoints that reject tool_choice
        includeTools = false;
        continue;
      }
      throw new Error(errData.error?.message || `${providerLabel} API returned HTTP ${resp.status}`);
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
  snapshot: WorkspaceSnapshot,
  images: SanitizedImagePart[] = [],
  fetchImpl: typeof fetch = fetch
) {
  const messages: any[] = [];
  for (const m of history.slice(-6)) {
    messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  if (images.length > 0) {
    messages.push({
      role: 'user',
      content: [
        ...images.map((img) => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: img.base64 },
        })),
        { type: 'text', text: userPrompt },
      ],
    });
  } else {
    messages.push({ role: 'user', content: userPrompt });
  }

  const toolCallsTrace: Array<{ tool: string; args: Record<string, any>; summary: string }> = [];
  const proposedActions: ProposedActionPreview[] = [];
  const citations = new Set<string>();
  let totalIn = 0;
  let totalOut = 0;
  let finalText = '';

  for (let round = 0; round < 4; round++) {
    const resp = await fetchImpl('https://api.anthropic.com/v1/messages', {
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

function modelForProvider(providerId: CloudOrLocalProviderId, requestedModel: string): string {
  const req = requestedModel.trim();
  if (providerId === 'gemini') {
    return req.startsWith('gemini-') || !req || req === 'auto-fastest'
      ? req === 'auto-fastest'
        ? (process.env.GEMINI_MODEL || GEMINI_AUTO).trim()
        : req || (process.env.GEMINI_MODEL || GEMINI_AUTO).trim()
      : (process.env.GEMINI_MODEL || GEMINI_AUTO).trim();
  }
  if (providerId === 'openrouter') {
    return req.includes('/') ? req : OPENROUTER_DEFAULT_MODEL();
  }
  if (providerId === 'openai') {
    return /^(gpt-|o[134])/.test(req) ? req : OPENAI_DEFAULT_MODEL();
  }
  if (providerId === 'anthropic') {
    return req.startsWith('claude-') ? req : ANTHROPIC_DEFAULT_MODEL();
  }
  if (providerId === 'huggingface') {
    return req.includes('/') ? req : HF_DEFAULT_MODEL();
  }
  if (providerId === 'ollama') {
    return req && !req.startsWith('gemini-') && !req.startsWith('claude-') && !req.startsWith('gpt-') && req !== 'auto-fastest'
      ? req
      : OLLAMA_DEFAULT_MODEL();
  }
  return req;
}

async function generateTextEmbedding(
  text: string,
  requestedProvider: string,
  env: Record<string, string | undefined>
): Promise<{ ok: true; provider: string; model: string; embedding: number[] } | { ok: false; error: string }> {
  const geminiKey = (env.GEMINI_API_KEY || '').trim();
  const openaiKey = (env.OPENAI_API_KEY || '').trim();
  const ollamaUrl = (env.OLLAMA_BASE_URL || '').trim().replace(/\/$/, '');

  if ((requestedProvider === 'gemini' || requestedProvider === 'auto' || !requestedProvider) && geminiKey) {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({ content: { parts: [{ text }] } }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data.embedding?.values)) {
        return { ok: true, provider: 'gemini', model: 'text-embedding-004', embedding: data.embedding.values };
      }
    }
  }

  if ((requestedProvider === 'openai' || requestedProvider === 'auto' || !requestedProvider) && openaiKey) {
    const resp = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text, dimensions: 768 }),
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const vec = data.data?.[0]?.embedding;
      if (Array.isArray(vec)) {
        return { ok: true, provider: 'openai', model: 'text-embedding-3-small', embedding: vec };
      }
    }
  }

  if ((requestedProvider === 'ollama' || requestedProvider === 'auto') && ollamaUrl) {
    const resp = await fetch(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text', input: text }),
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      const data = await resp.json();
      const vec = data.embeddings?.[0];
      if (Array.isArray(vec)) {
        return { ok: true, provider: 'ollama', model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text', embedding: vec };
      }
    }
  }

  return {
    ok: false,
    error: `Embeddings unavailable for provider "${requestedProvider || 'auto'}". Configure GEMINI_API_KEY, OPENAI_API_KEY, or OLLAMA_BASE_URL.`,
  };
}

export function createAiChatHandler(
  dbClient: any = supabaseServer,
  customFetch?: typeof fetch
) {
  return async function handler(req: any, res: any) {
    const fetchImpl = customFetch ?? fetch;
    applyCors(req, res, 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const requestId =
      typeof req.headers?.['x-request-id'] === 'string' && req.headers['x-request-id'].trim()
        ? req.headers['x-request-id'].trim()
        : generateCorrelationId();
    if (typeof res.setHeader === 'function') {
      res.setHeader('X-Request-Id', requestId);
    }

    const envProviders = detectConfiguredProviders(process.env);
    const actionParam = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;

    if (req.method === 'GET') {
      if (actionParam === 'health') {
        let effectiveEnv = process.env as Record<string, string | undefined>;
        try {
          const auth = await resolveAuthenticatedUser(req, dbClient);
          if (auth.authenticated && auth.userId) {
            const ctx = await loadEffectiveProviderContext((auth as any).client || dbClient, auth.userId, process.env);
            effectiveEnv = ctx.effectiveEnv;
          }
        } catch {
          /* unauthenticated public health stays env-only */
        }
        const reports = await probeAllProviders(effectiveEnv, fetchImpl);
        const recommendation = selectRecommendedProvider(reports);
        return res.status(200).json({
          success: true,
          requestId,
          configuredProviders: detectConfiguredProviders(effectiveEnv),
          providers: reports,
          recommended: recommendation,
          circuitBreakers: serverCircuitBreaker.snapshot(),
          vaultEncryptionReady: canEncryptUserSecrets(process.env),
          timestamp: new Date().toISOString(),
        });
      }

      if (actionParam === 'providers') {
        const auth = await resolveAuthenticatedUser(req, dbClient);
        if (!auth.authenticated || !auth.userId) {
          return res.status(401).json({ error: 'Sign in to inspect provider credentials.', code: 'auth_required' });
        }
        const activeDb = (auth as any).client || dbClient;
        const ctx = await loadEffectiveProviderContext(activeDb, auth.userId, process.env);
        return res.status(200).json({
          success: true,
          requestId,
          configs: ctx.configs,
          vaultEncryptionReady: canEncryptUserSecrets(process.env),
          circuitBreakers: serverCircuitBreaker.snapshot(),
        });
      }

      const geminiKeyForList = (process.env.GEMINI_API_KEY || '').trim();
      const available = geminiKeyForList ? await listGeminiModels(geminiKeyForList) : null;
      const flash = chooseGeminiModels(available, (process.env.GEMINI_MODEL || GEMINI_AUTO).trim());
      const pro = chooseGeminiModels(available, GEMINI_AUTO_PRO);
      const defaultGeminiModel = flash.primary;
      return res.status(200).json({
        success: true,
        tools: AI_TOOL_DEFINITIONS,
        configuredProviders: envProviders,
        providerCapabilities: AI_PROVIDER_REGISTRY,
        defaultGeminiModel,
        supportedModels: [
          { provider: 'gemini', modelId: GEMINI_AUTO, resolvesTo: flash.primary, displayName: 'Gemini Flash (best available)', isDefault: true },
          { provider: 'gemini', modelId: GEMINI_AUTO_PRO, resolvesTo: pro.primary, displayName: 'Gemini Pro (best available)' },
          { provider: 'openrouter', modelId: OPENROUTER_DEFAULT_MODEL(), displayName: 'OpenRouter Auto (OPENROUTER_API_KEY)' },
          { provider: 'openai', modelId: OPENAI_DEFAULT_MODEL(), displayName: 'OpenAI (OPENAI_MODEL)' },
          { provider: 'anthropic', modelId: ANTHROPIC_DEFAULT_MODEL(), displayName: 'Claude (ANTHROPIC_MODEL)' },
          { provider: 'huggingface', modelId: HF_DEFAULT_MODEL(), displayName: 'Hugging Face Router (HF_TOKEN)' },
          { provider: 'ollama', modelId: OLLAMA_DEFAULT_MODEL(), displayName: 'Ollama Local (OLLAMA_BASE_URL)' },
        ],
        availableGeminiModels: available,
        timestamp: new Date().toISOString(),
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const startTime = Date.now();

    try {
      const body = req.body || {};

      if (actionParam === 'provider_config' || body.action === 'provider_config') {
        const auth = await resolveAuthenticatedUser(req, dbClient);
        if (!auth.authenticated || !auth.userId) {
          return res.status(401).json({ error: 'Sign in to configure AI providers.', code: 'auth_required' });
        }
        const provider = String(body.provider || '') as CloudOrLocalProviderId;
        if (!Object.prototype.hasOwnProperty.call(AI_PROVIDER_REGISTRY, provider)) {
          return res.status(400).json({ error: `Unsupported provider "${provider}".` });
        }
        const activeDb = (auth as any).client || dbClient;
        const updates: Record<string, any> = {
          user_id: auth.userId,
          provider,
          updated_at: new Date().toISOString(),
        };
        if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
        if (typeof body.selectedModel === 'string') {
          updates.selected_model = body.selectedModel.trim() || null;
        }
        if (provider === 'ollama' && typeof body.baseUrl === 'string') {
          updates.base_url = body.baseUrl.trim() || null;
        }
        if (body.clearKey === true) {
          updates.encrypted_api_key = null;
          updates.key_hint = null;
        } else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
          if (!canEncryptUserSecrets(process.env)) {
            return res.status(400).json({
              error: 'Cannot encrypt API key: set AI_VAULT_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY on Vercel.',
            });
          }
          updates.encrypted_api_key = encryptProviderSecret(body.apiKey.trim(), process.env);
          updates.key_hint = maskSecretHint(body.apiKey.trim());
        }
        const { error: upErr } = await activeDb.from('provider_credentials').upsert(updates, { onConflict: 'user_id,provider' });
        if (upErr) {
          return res.status(500).json({ error: `Failed saving provider configuration: ${upErr.message}` });
        }
        return res.status(200).json({
          success: true,
          requestId,
          provider,
          message: `Saved ${AI_PROVIDER_REGISTRY[provider].name} configuration securely.`,
        });
      }

      if (actionParam === 'provider_test' || body.action === 'provider_test') {
        const auth = await resolveAuthenticatedUser(req, dbClient);
        if (!auth.authenticated || !auth.userId) {
          return res.status(401).json({ error: 'Sign in to test provider connections.', code: 'auth_required' });
        }
        const provider = String(body.provider || '') as CloudOrLocalProviderId;
        if (!Object.prototype.hasOwnProperty.call(AI_PROVIDER_REGISTRY, provider)) {
          return res.status(400).json({ error: `Unsupported provider "${provider}".` });
        }
        const activeDb = (auth as any).client || dbClient;
        const ctx = await loadEffectiveProviderContext(activeDb, auth.userId, process.env);
        const report = await testSingleProviderAndPersist({
          db: activeDb,
          userId: auth.userId,
          provider,
          effectiveEnv: ctx.effectiveEnv,
          fetchImpl,
        });
        return res.status(200).json({ success: true, requestId, report });
      }

      if (body.action === 'embed' || actionParam === 'embed') {
        const auth = await resolveAuthenticatedUser(req, dbClient);
        if (!auth.authenticated) {
          return res.status(401).json({ error: 'Sign in to generate embeddings.', code: 'auth_required' });
        }
        const embedText = String(body.text || body.prompt || '').trim();
        if (!embedText) {
          return res.status(400).json({ error: 'Text is required for embeddings.' });
        }
        const embedRes = await generateTextEmbedding(embedText, String(body.provider || 'auto'), process.env);
        if (!embedRes.ok) {
          return res.status(422).json({ success: false, unsupported: true, error: embedRes.error });
        }
        return res.status(200).json({ success: true, ...embedRes, latencyMs: Date.now() - startTime });
      }

      const prompt = String(body.prompt || '').trim();
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required.' });
      }

      const auth = await resolveAuthenticatedUser(req, dbClient);
      // The model calls spend the owner's provider keys: signed-in users (or the cron secret) only.
      if (!auth.authenticated) {
        return res.status(401).json({
          error: 'Sign in to use the AI assistant.',
          code: 'auth_required',
        });
      }
      const activeDb = (auth as any).client || dbClient;
      const providerCtx = await loadEffectiveProviderContext(activeDb, auth.userId, process.env);
      const effectiveEnv = providerCtx.effectiveEnv;
      const activeConfigMap =
        dbClient === supabaseServer || auth.userId
          ? detectConfiguredProviders(effectiveEnv)
          : extractConfigMap(providerCtx.configs);

      const images = sanitizeImageAttachments(body.images);
      const history = Array.isArray(body.history) ? body.history : [];
      const projectId = body.projectId ? String(body.projectId) : undefined;
      const mode = String(body.mode || 'personal');
      const snapshot = await enrichSnapshotFromServer(body.workspaceSnapshot, auth.userId, activeDb);

      const requestedProvider = String(body.provider || 'auto');
      const requestedModel = String(body.modelId || '');
      const projectScopeNote = projectId
        ? `\nFocused Project ID: ${projectId}. Prioritize this project when resolving context.`
        : '';
      const systemPrompt = `${CHIEF_OF_STAFF_SYSTEM_PROMPT}\nMode: ${mode}.${projectScopeNote}${
        body.systemPrompt ? `\nAdditional Instructions: ${body.systemPrompt}` : ''
      }`;

      const routePlan = buildJarvis5RoutePlan({
        prompt,
        requestedProvider: requestedProvider as any,
        explicitCategory: body.routeCategory as TaskRouteCategory | undefined,
        hasImageInput: Boolean(body.hasImageInput) || images.length > 0,
        hasAudioInput: Boolean(body.hasAudioInput),
        requiresTools: body.requiresTools !== false,
        privateOfflineOnly: Boolean(body.privateOfflineOnly),
        allowCloudFallbackWhenLocalDown: Boolean(body.allowCloudFallback),
        configured: activeConfigMap,
        enabledProviders: providerCtx.enabledProviders,
        breaker: dbClient === supabaseServer ? serverCircuitBreaker : undefined,
      });

      const executionChain =
        routePlan.fallbackChain.length > 0
          ? routePlan.fallbackChain
          : buildProviderExecutionChain(requestedProvider, activeConfigMap);
      const wantsStream =
        body.stream === true ||
        (typeof req.headers?.accept === 'string' && req.headers.accept.includes('text/event-stream'));

      if (wantsStream) {
        if (typeof res.setHeader === 'function') {
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
        }
        res.statusCode = 200;
      }

      let lastError: string | null = null;

      for (const candidateProvider of executionChain) {
        const userDefaultModel = providerCtx.selectedModels[candidateProvider];
        const modelId = modelForProvider(candidateProvider, requestedModel || userDefaultModel || '');
        try {
          let llmResult: any;
          let resolvedModelId = modelId;
          let streamedInline = false;

          const runAttempt = async () => {
            if (candidateProvider === 'gemini') {
              const geminiKey = (effectiveEnv.GEMINI_API_KEY || '').trim();
              const resolved = await resolveGeminiModel(geminiKey, modelId);
              resolvedModelId = resolved.primary;
              if (wantsStream) {
                streamedInline = true;
                return await runGeminiStreamingWithTools(
                  geminiKey,
                  resolved.primary,
                  prompt,
                  history,
                  systemPrompt,
                  snapshot,
                  resolved.fallback,
                  (delta) => writeSseEvent(res, { type: 'token', delta }),
                  (toolMeta) => writeSseEvent(res, { type: 'tool', ...toolMeta }),
                  fetchImpl,
                  images
                );
              }
              return await runGeminiWithTools(
                geminiKey,
                resolved.primary,
                prompt,
                history,
                systemPrompt,
                snapshot,
                resolved.fallback,
                images,
                fetchImpl
              );
            }
            if (candidateProvider === 'openrouter') {
              const orKey = (effectiveEnv.OPENROUTER_API_KEY || '').trim();
              return await runOpenAiCompatibleWithTools({
                providerLabel: 'OpenRouter',
                endpoint: 'https://openrouter.ai/api/v1/chat/completions',
                apiKey: orKey,
                extraHeaders: {
                  'HTTP-Referer': 'https://yashwanth-hub.vercel.app',
                  'X-Title': 'Yashwanth Hub Jarvis AI OS',
                },
                modelId,
                userPrompt: prompt,
                history,
                systemPrompt,
                snapshot,
                allowToolFallback: true,
                images,
                fetchImpl,
              });
            }
            if (candidateProvider === 'openai') {
              const openaiKey = (effectiveEnv.OPENAI_API_KEY || '').trim();
              return await runOpenAiCompatibleWithTools({
                providerLabel: 'OpenAI',
                endpoint: 'https://api.openai.com/v1/chat/completions',
                apiKey: openaiKey,
                modelId,
                userPrompt: prompt,
                history,
                systemPrompt,
                snapshot,
                images,
                fetchImpl,
              });
            }
            if (candidateProvider === 'anthropic') {
              const anthropicKey = (effectiveEnv.ANTHROPIC_API_KEY || '').trim();
              return await runAnthropicWithTools(anthropicKey, modelId, prompt, history, systemPrompt, snapshot, images, fetchImpl);
            }
            if (candidateProvider === 'huggingface') {
              const hfKey = (effectiveEnv.HF_TOKEN || effectiveEnv.HUGGINGFACE_API_KEY || '').trim();
              return await runOpenAiCompatibleWithTools({
                providerLabel: 'Hugging Face',
                endpoint: 'https://router.huggingface.co/v1/chat/completions',
                apiKey: hfKey,
                modelId,
                userPrompt: prompt,
                history,
                systemPrompt,
                snapshot,
                allowToolFallback: true,
                images,
                fetchImpl,
              });
            }
            if (candidateProvider === 'ollama') {
              const ollamaUrl = (effectiveEnv.OLLAMA_BASE_URL || '').trim().replace(/\/$/, '');
              return await runOpenAiCompatibleWithTools({
                providerLabel: 'Ollama',
                endpoint: `${ollamaUrl}/v1/chat/completions`,
                apiKey: '',
                modelId,
                userPrompt: prompt,
                history,
                systemPrompt,
                snapshot,
                allowToolFallback: true,
                images,
                fetchImpl,
              });
            }
            return null;
          };

          // Single jittered safe retry on transient rate/5xx failure before failing over
          try {
            llmResult = await runAttempt();
          } catch (firstErr: any) {
            const msg = String(firstErr?.message || '');
            const transient = /(429|502|503|504|timeout|abort|rate)/i.test(msg);
            if (!transient || streamedInline) throw firstErr;
            await new Promise((r) => setTimeout(r, computeJitteredBackoffMs(0, 200)));
            llmResult = await runAttempt();
          }

          if (candidateProvider === 'gemini' && llmResult?.resolvedModelId) {
            resolvedModelId = llmResult.resolvedModelId;
          }

          if (llmResult) {
            serverCircuitBreaker.recordSuccess(candidateProvider);
            const payload = {
              success: true,
              requestId,
              routeCategory: routePlan.category,
              routeRationale: routePlan.rationale,
              providerMode: 'server_llm',
              provider: candidateProvider,
              modelId: resolvedModelId,
              failoverNotice:
                lastError && requestedProvider !== candidateProvider
                  ? `Primary provider failed (${lastError}); served seamlessly via ${candidateProvider}.`
                  : undefined,
              text: llmResult.text,
              tokensInput: llmResult.tokensIn,
              tokensOutput: llmResult.tokensOut,
              latencyMs: Date.now() - startTime,
              tool_calls: llmResult.tool_calls,
              proposed_actions: llmResult.proposed_actions,
              citations: llmResult.citations,
              configuredProviders: activeConfigMap,
            };
            if (wantsStream) {
              if (!streamedInline) streamTextInChunks(res, payload.text);
              writeSseEvent(res, { type: 'done', ...payload });
              return res.end();
            }
            return res.status(200).json(payload);
          }
        } catch (err: any) {
          const msg = err?.message || 'error';
          serverCircuitBreaker.recordFailure(candidateProvider, msg, /(401|403|invalid[_ ]api[_ ]key)/i.test(msg));
          lastError = `${candidateProvider}: ${msg}`;
        }
      }

      if (lastError) {
        const grounded = buildDeterministicGroundedResponse(prompt, snapshot, projectId);
        const payload = {
          success: true,
          providerMode: 'grounded_fallback_after_error',
          providerError: lastError,
          provider: 'local_heuristic',
          modelId: 'grounded-chief-of-staff-v2',
          ...grounded,
          tokensInput: 0,
          tokensOutput: 0,
          latencyMs: Date.now() - startTime,
          configuredProviders: envProviders,
        };
        if (wantsStream) {
          streamTextInChunks(res, payload.text);
          writeSseEvent(res, { type: 'done', ...payload });
          return res.end();
        }
        return res.status(200).json(payload);
      }

      const grounded = buildDeterministicGroundedResponse(prompt, snapshot, projectId);
      const payload = {
        success: true,
        providerMode: 'grounded_deterministic',
        providerNotice:
          'No live server LLM API key (GEMINI_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / HF_TOKEN) is configured in environment variables; returning deterministic tool-grounded response from verified workspace records.',
        provider: 'local_heuristic',
        modelId: 'grounded-chief-of-staff-v2',
        ...grounded,
        tokensInput: 0,
        tokensOutput: 0,
        latencyMs: Date.now() - startTime,
        configuredProviders: envProviders,
      };
      if (wantsStream) {
        streamTextInChunks(res, payload.text);
        writeSseEvent(res, { type: 'done', ...payload });
        return res.end();
      }
      return res.status(200).json(payload);
    } catch (err: any) {
      return res.status(500).json({
        error: 'AI Chief of Staff Error',
        message: err?.message || 'Failed to process AI request.',
      });
    }
  };
}

export default createAiChatHandler();
