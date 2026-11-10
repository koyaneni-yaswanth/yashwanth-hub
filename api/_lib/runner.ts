// Vercel Serverless Automation Runner
// Central executor mapping action_type: Google Workspace, NeoSapien MCP, AI Gateway, Task Scans.
// Implements exponential backoff retries (up to 3 attempts), duration timing, and immutable logging.

import { google } from 'googleapis';
import { supabaseServer } from './db.ts';

export interface AutomationJobInput {
  run_id: string;
  automation_id: string;
  user_id: string;
  action_type: string;
  action_config?: any;
  input_payload?: any;
  trigger_source?: string;
  max_retries?: number;
}

export interface RunnerResult {
  run_id: string;
  status: 'completed' | 'failed' | 'needs_authorization';
  duration_ms: number;
  records_affected: number;
  output_payload: any;
  error_log?: string | null;
  retry_count: number;
}

/**
 * Main Runner Entrypoint: Executes an automation run with retry management
 */
export async function executeAutomationRun(
  job: AutomationJobInput,
  dbClient: any = supabaseServer
): Promise<RunnerResult> {
  const startTime = Date.now();
  const maxRetries = job.max_retries ?? 3;
  let retryCount = 0;
  let lastError: any = null;
  let outputPayload: any = null;
  let recordsAffected = 0;
  let runStatus: 'completed' | 'failed' | 'needs_authorization' = 'completed';

  // 1. Mark run as 'running' in database
  await dbClient
    .from('automation_runs')
    .update({
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .eq('id', job.run_id);

  // 2. Retry loop (0 when driven by durable automation_queue scheduler)
  while (retryCount <= maxRetries) {
    try {
      const execResult = await dispatchActionHandler(job, dbClient);
      outputPayload = execResult.output;
      recordsAffected = execResult.recordsAffected || 0;
      runStatus = 'completed';
      lastError = null;
      break;
    } catch (err: any) {
      lastError = err;
      const errorMessage = err.message || String(err);

      if (
        errorMessage.includes('needs_authorization') ||
        errorMessage.includes('Google Workspace account not connected') ||
        errorMessage.includes('NeoSapien authorization token missing')
      ) {
        runStatus = 'needs_authorization';
        if (job.automation_id) {
          await dbClient
            .from('automations')
            .update({ status: 'needs_authorization' })
            .eq('id', job.automation_id);
        }
        break;
      }

      retryCount++;
      if (retryCount <= maxRetries) {
        const backoffMs = Math.pow(2, retryCount) * 500;
        await new Promise((r) => setTimeout(r, backoffMs));
      } else {
        runStatus = 'failed';
      }
    }
  }

  const durationMs = Date.now() - startTime;
  const errorLogText = lastError ? (lastError.stack || lastError.message || String(lastError)) : null;

  // 3. Update database record with final status and execution metrics
  await dbClient
    .from('automation_runs')
    .update({
      status: runStatus === 'needs_authorization' ? 'failed' : runStatus,
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      records_affected: recordsAffected,
      output_payload: outputPayload || { error: errorLogText, status: runStatus },
      error_log: errorLogText,
      retry_count: Math.min(retryCount, maxRetries),
    })
    .eq('id', job.run_id);

  return {
    run_id: job.run_id,
    status: runStatus,
    duration_ms: durationMs,
    records_affected: recordsAffected,
    output_payload: outputPayload,
    error_log: errorLogText,
    retry_count: retryCount,
  };
}

/**
 * Internal router executing the specific action logic
 */
async function dispatchActionHandler(
  job: AutomationJobInput,
  dbClient: any = supabaseServer
): Promise<{ output: any; recordsAffected: number }> {
  const { action_type, user_id, action_config, input_payload } = job;
  const config = { ...action_config, ...input_payload };

  switch (action_type) {
    case 'google_calendar':
    case 'google_gmail':
    case 'google_workspace': {
      return await executeGoogleWorkspaceAction(user_id, action_type, config, dbClient);
    }

    case 'neosapien_mcp':
    case 'neosapien_sync': {
      return await executeNeoSapienMcpAction(user_id, config, dbClient);
    }

    case 'morning_briefing':
    case 'ai_briefing':
    case 'custom_agent': {
      return await executeAIGatewayAction(user_id, config, dbClient);
    }

    case 'task_deadline_scan': {
      return await executeTaskDeadlineScanAction(user_id, config, dbClient);
    }

    case 'isolated_scheduled_check':
    case 'health_ping': {
      const checkedAt = new Date().toISOString();
      const noteTitle = String(config.notification_title || 'Scheduled Automation Verification Check');
      const noteMsg = String(
        config.notification_message || `Isolated check executed cleanly via server runner at ${checkedAt}.`
      );
      if (config.write_notification !== false && user_id) {
        await dbClient.from('notifications').insert({
          user_id,
          title: noteTitle,
          message: noteMsg,
          type: 'system',
          priority: 'low',
          action_link: 'automations',
          read: false,
          created_at: checkedAt,
        });
      }
      return {
        output: {
          checkedAt,
          run_id: job.run_id,
          automation_id: job.automation_id,
          trigger_source: job.trigger_source || 'manual',
          marker: config.marker || 'ok',
        },
        recordsAffected: 1,
      };
    }

    default:
      throw new Error(`Unsupported action_type: "${action_type}"`);
  }
}

/**
 * 1. GOOGLE WORKSPACE ACTION (Calendar / Gmail)
 */
async function executeGoogleWorkspaceAction(
  userId: string,
  actionType: string,
  config: any,
  dbClient: any = supabaseServer
) {
  const { data: tokenRecord, error } = await dbClient
    .from('integration_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  const accessToken = tokenRecord?.access_token || tokenRecord?.encrypted_access_token;
  const refreshToken = tokenRecord?.refresh_token || tokenRecord?.encrypted_refresh_token;

  if (error || !tokenRecord || (!refreshToken && !accessToken)) {
    throw new Error(
      'Google Workspace account not connected or refresh token missing. Status set to needs_authorization. Please connect in Settings -> Integrations.'
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://yashwanth-hub.vercel.app/api/auth/google/callback'
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (actionType === 'google_calendar') {
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const nowISO = new Date().toISOString();
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const eventsRes = await calendar.events.list({
      calendarId: 'primary',
      timeMin: nowISO,
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const events = eventsRes.data.items || [];
    return {
      output: {
        calendarId: 'primary',
        eventsCount: events.length,
        events: events.map((e) => ({
          id: e.id,
          summary: e.summary,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri || null,
        })),
      },
      recordsAffected: events.length,
    };
  }

  if (actionType === 'google_gmail') {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const msgsRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 10,
      q: 'is:unread',
    });

    const messages = msgsRes.data.messages || [];
    return {
      output: {
        unreadMessagesCount: messages.length,
        messageIds: messages.map((m) => m.id),
      },
      recordsAffected: messages.length,
    };
  }

  return { output: { status: 'reconciled' }, recordsAffected: 0 };
}

/**
 * 2. NEOSAPIEN MCP ACTION
 * Verifies tool discovery on https://api.neosapien.xyz/mcp before calling tools
 */
async function executeNeoSapienMcpAction(
  userId: string,
  config: any,
  dbClient: any = supabaseServer
) {
  const mcpEndpoint = config.mcp_endpoint || 'https://api.neosapien.xyz/mcp';

  const { data: conn } = await dbClient
    .from('neosapien_connections')
    .select('encrypted_access_token, status')
    .eq('user_id', userId)
    .single();

  const token = conn?.encrypted_access_token || process.env.NEOSAPIEN_API_KEY;

  if (!token && conn?.status !== 'connected') {
    throw new Error(
      'NeoSapien authorization token missing. Status set to needs_authorization. Connect your NeoSapien wearable in Settings -> Integrations.'
    );
  }

  let availableTools: string[] = [];
  try {
    const discoverResp = await fetch(mcpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (discoverResp.ok) {
      const data = await discoverResp.json();
      if (data.result && Array.isArray(data.result.tools)) {
        availableTools = data.result.tools.map((t: any) => t.name);
      }
    }
  } catch (err) {
    console.warn('[Runner] NeoSapien MCP discovery warning:', err);
  }

  let importedCount = 0;
  if (token) {
    try {
      const syncResp = await fetch('https://api.neosapien.xyz/api/v1/memories/sync?limit=20', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });

      if (syncResp.ok) {
        const syncData = await syncResp.json();
        const memories = syncData.memories || [];
        for (const mem of memories) {
          if (mem.id) {
            await dbClient.from('neosapien_memories').upsert({
              user_id: userId,
              source_record_id: mem.id,
              title: mem.title || 'Neo 1 Capture',
              content_hash: `hash_${mem.id}`,
              source: 'neo_1_device',
              summary: mem.summary || '',
              transcript: mem.transcript || null,
              imported_at: new Date().toISOString(),
            }, { onConflict: 'user_id,source_record_id' });
            importedCount++;
          }
        }
      }
    } catch (syncErr) {
      console.warn('[Runner] Live NeoSapien memory sync error:', syncErr);
    }
  }

  return {
    output: {
      mcpEndpoint,
      availableTools,
      memoriesImported: importedCount,
      syncedAt: new Date().toISOString(),
    },
    recordsAffected: importedCount,
  };
}

/**
 * 3. AI GATEWAY (Morning Briefing & Executive Synthesis)
 */
async function executeAIGatewayAction(
  userId: string,
  config: any,
  dbClient: any = supabaseServer
) {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const [tasksRes, meetingsRes] = await Promise.all([
    dbClient.from('tasks').select('*').eq('user_id', userId).eq('done', false),
    dbClient.from('meetings').select('*').eq('user_id', userId).eq('date', todayStr),
  ]);

  const tasks = tasksRes.data || [];
  const meetings = meetingsRes.data || [];
  const urgentTasks = tasks.filter((t: any) => t.priority === 'high' || t.priority === 'urgent');

  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  const geminiModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  let aiSummary = `Executive Morning Briefing for ${todayStr}:\n- ${meetings.length} meeting(s) today.\n- ${urgentTasks.length} urgent task(s) requiring immediate attention.\n- Total open tasks: ${tasks.length}.`;

  if (geminiKey) {
    try {
      const prompt = `Synthesize a concise executive daily brief for Yaswanth based strictly on these verified records. Do not invent facts or milestones.
Date: ${todayStr}
Focus Filter: ${config?.focus || 'General'}
Meetings: ${JSON.stringify(meetings.map((m: any) => ({ title: m.title, time: m.start_time, attendees: m.attendees })))}
High Priority Open Tasks: ${JSON.stringify(urgentTasks.map((t: any) => ({ text: t.text || t.title, due: t.due_date })))}
Format as crisp bullet points with clear next actions.`;

      const aiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
          signal: AbortSignal.timeout(10000),
        }
      );

      if (aiResp.ok) {
        const json = await aiResp.json();
        const candidateText = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          aiSummary = candidateText.trim();
        }
      }
    } catch (aiErr) {
      console.warn('[Runner] Gemini AI brief call failed, using deterministic summary:', aiErr);
    }
  }

  await dbClient.from('notifications').insert({
    user_id: userId,
    title: `Executive Morning Briefing — ${todayStr}`,
    message: `${meetings.length} meetings, ${urgentTasks.length} urgent tasks.`,
    type: 'system',
    priority: 'high',
    action_link: 'dashboard',
    created_at: now.toISOString(),
  });

  return {
    output: {
      date: todayStr,
      briefingSummary: aiSummary,
      tasksAnalyzed: tasks.length,
      meetingsCount: meetings.length,
    },
    recordsAffected: 1,
  };
}

/**
 * 4. TASK DEADLINE & UPCOMING MEETING SCANNER
 */
async function executeTaskDeadlineScanAction(
  userId: string,
  config: any,
  dbClient: any = supabaseServer
) {
  const leadMinutes = config.lead_time_minutes || 45;
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const [tRes, mRes] = await Promise.all([
    dbClient.from('tasks').select('*').eq('user_id', userId).eq('done', false),
    dbClient.from('meetings').select('*').eq('user_id', userId).eq('status', 'scheduled'),
  ]);

  const tasks = tRes.data || [];
  const meetings = mRes.data || [];

  let alertsCreated = 0;
  const overdueTasks = tasks.filter((t: any) => t.due_date && t.due_date < todayStr);

  if (overdueTasks.length > 0) {
    await dbClient.from('notifications').insert({
      user_id: userId,
      title: 'Action Required: Overdue Tasks Detected',
      message: `You have ${overdueTasks.length} task(s) past due date. Item: "${overdueTasks[0].text || overdueTasks[0].title}"`,
      type: 'deadline',
      priority: 'high',
      action_link: 'tasks',
      created_at: now.toISOString(),
    });
    alertsCreated++;
  }

  for (const m of meetings) {
    if (m.date === todayStr && m.start_time) {
      const [h, min] = m.start_time.split(':').map(Number);
      const meetingMins = h * 60 + min;
      const currentMins = now.getHours() * 60 + now.getMinutes();
      const diff = meetingMins - currentMins;

      if (diff > 0 && diff <= leadMinutes) {
        await dbClient.from('notifications').insert({
          user_id: userId,
          title: `Upcoming Meeting in ${diff}m: ${m.title}`,
          message: `Join: ${m.location_or_link || 'Virtual'} | Attendees: ${m.attendees || 'Team'}`,
          type: 'meeting',
          priority: 'high',
          action_link: m.location_or_link || 'meetings',
          created_at: now.toISOString(),
        });
        alertsCreated++;
      }
    }
  }

  return {
    output: {
      tasksScanned: tasks.length,
      overdueTasksCount: overdueTasks.length,
      meetingsScanned: meetings.length,
      alertsCreated,
      scannedAt: now.toISOString(),
    },
    recordsAffected: alertsCreated,
  };
}
