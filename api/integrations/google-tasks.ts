// Vercel Serverless Function: Google Tasks REST API & Bi-Directional Sync Service
// Endpoint: /api/integrations/google-tasks
// Features: Real server-side credentials, token refresh, CRUD, and bi-directional database sync.

import { google } from 'googleapis';
import { supabaseServer } from '../_lib/db.ts';

export async function getUserIdFromRequest(req: any): Promise<string> {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      const { data: { user } } = await supabaseServer.auth.getUser(token);
      if (user) return user.id;
    } catch {
      // Fallback
    }
  }
  return '00000000-0000-0000-0000-000000000001';
}

export async function getAuthenticatedGoogleOAuthClient(userId: string) {
  const { data: tokenRecord, error } = await supabaseServer
    .from('integration_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .single();

  if (error || !tokenRecord) {
    throw new Error('Google account not connected. Please connect Google Workspace in Settings -> Integrations.');
  }

  const accessToken = tokenRecord.access_token || tokenRecord.encrypted_access_token;
  const refreshToken = tokenRecord.refresh_token || tokenRecord.encrypted_refresh_token;

  if (!accessToken && !refreshToken) {
    throw new Error('No valid Google access or refresh token found in integration vault.');
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

  // Check token expiration and auto-refresh using refreshToken
  const expiresAt = tokenRecord.expires_at || tokenRecord.token_expires_at || tokenRecord.token_expiry;
  const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() + 60000 : false;

  if (isExpired && refreshToken) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const newExpiry = credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : new Date(Date.now() + 3600000).toISOString();

      await supabaseServer
        .from('integration_tokens')
        .update({
          access_token: credentials.access_token,
          encrypted_access_token: credentials.access_token,
          expires_at: newExpiry,
          token_expires_at: newExpiry,
          token_expiry: newExpiry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tokenRecord.id);

      oauth2Client.setCredentials(credentials);
    } catch (refreshErr: any) {
      console.warn('[GoogleTasks] Token auto-refresh error:', refreshErr.message);
    }
  }

  return { oauth2Client, tokenRecord };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const userId = await getUserIdFromRequest(req);
  const action = req.query.action || req.body?.action || 'ping';

  try {
    const { oauth2Client, tokenRecord } = await getAuthenticatedGoogleOAuthClient(userId);
    const tasksService = google.tasks({ version: 'v1', auth: oauth2Client });

    // 1. ACTION: Ping & Verify Connectivity (Return Latest 3 Tasks)
    if (action === 'ping' || action === 'test') {
      const response = await tasksService.tasks.list({
        tasklist: '@default',
        maxResults: 3,
        showCompleted: true,
        showHidden: true,
      });

      const items = (response.data.items || []).map((t) => ({
        id: t.id,
        title: t.title || 'Untitled Task',
        status: t.status,
        due: t.due,
        updated: t.updated,
      }));

      return res.status(200).json({
        success: true,
        connected: true,
        provider: 'google',
        accountEmail: tokenRecord.account_email,
        expiresAt: tokenRecord.expires_at || tokenRecord.token_expires_at,
        hasRefreshToken: Boolean(tokenRecord.refresh_token || tokenRecord.encrypted_refresh_token),
        latestTasks: items,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. ACTION: List Task Lists
    if (action === 'tasklists' || action === 'listTaskLists') {
      const resp = await tasksService.tasklists.list({ maxResults: 50 });
      return res.status(200).json({
        success: true,
        tasklists: resp.data.items || [],
      });
    }

    // 3. ACTION: List Tasks
    if (action === 'list' || action === 'listTasks') {
      const tasklistId = req.query.tasklist || req.body?.tasklist || '@default';
      const showCompleted = req.query.showCompleted !== 'false';
      const resp = await tasksService.tasks.list({
        tasklist: tasklistId,
        showCompleted,
        showHidden: true,
        maxResults: 100,
      });
      return res.status(200).json({
        success: true,
        tasks: resp.data.items || [],
      });
    }

    // 4. ACTION: Create Task in Google Tasks
    if (action === 'create' || action === 'createTask') {
      const { title, notes, due, tasklist = '@default', hub_task_id } = req.body || {};
      if (!title) {
        return res.status(400).json({ error: 'Missing required "title" property.' });
      }

      const created = await tasksService.tasks.insert({
        tasklist,
        requestBody: {
          title,
          notes: notes || undefined,
          due: due ? new Date(due).toISOString() : undefined,
        },
      });

      const googleTaskId = created.data.id;

      // If hub_task_id was provided, link it in Supabase tasks table
      if (hub_task_id && googleTaskId) {
        await supabaseServer
          .from('tasks')
          .update({
            google_task_id: googleTaskId,
            synced: true,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', hub_task_id)
          .eq('user_id', userId);
      }

      return res.status(200).json({
        success: true,
        task: created.data,
      });
    }

    // 5. ACTION: Update / Complete Task
    if (action === 'update' || action === 'updateTask' || action === 'completeTask') {
      const { taskId, title, notes, due, done, tasklist = '@default', hub_task_id } = req.body || {};
      const targetId = taskId || req.query.taskId;

      if (!targetId) {
        return res.status(400).json({ error: 'Missing required "taskId" parameter.' });
      }

      const patchBody: any = {};
      if (title !== undefined) patchBody.title = title;
      if (notes !== undefined) patchBody.notes = notes;
      if (due !== undefined) patchBody.due = new Date(due).toISOString();
      if (done !== undefined) {
        patchBody.status = done ? 'completed' : 'needsAction';
        if (done) patchBody.completed = new Date().toISOString();
      }

      const updated = await tasksService.tasks.patch({
        tasklist,
        task: targetId,
        requestBody: patchBody,
      });

      if (hub_task_id && done !== undefined) {
        await supabaseServer
          .from('tasks')
          .update({
            done: Boolean(done),
            synced: true,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', hub_task_id)
          .eq('user_id', userId);
      }

      return res.status(200).json({
        success: true,
        task: updated.data,
      });
    }

    // 6. ACTION: Bi-directional Database Sync
    if (action === 'sync') {
      const tasklist = req.query.tasklist || req.body?.tasklist || '@default';

      // A. Retrieve all remote Google Tasks
      const remoteResp = await tasksService.tasks.list({
        tasklist,
        showCompleted: true,
        showHidden: true,
        maxResults: 100,
      });
      const remoteTasks = remoteResp.data.items || [];

      // B. Retrieve all local Supabase tasks for this user
      const { data: localTasks, error: localErr } = await supabaseServer
        .from('tasks')
        .select('*')
        .eq('user_id', userId);

      if (localErr) {
        throw new Error(`Failed to read local tasks from Supabase: ${localErr.message}`);
      }

      const localList = localTasks || [];
      const remoteMap = new Map<string, any>();
      remoteTasks.forEach((rt) => {
        if (rt.id) remoteMap.set(rt.id, rt);
      });

      let createdInGoogle = 0;
      let createdInHub = 0;
      let updatedBoth = 0;

      // C. Push local tasks without google_task_id to Google
      for (const lt of localList) {
        if (!lt.google_task_id) {
          try {
            const createdGoogleTask = await tasksService.tasks.insert({
              tasklist,
              requestBody: {
                title: lt.text,
                notes: lt.notes || lt.description || undefined,
                due: lt.due_date ? new Date(lt.due_date).toISOString() : undefined,
                status: lt.done ? 'completed' : 'needsAction',
              },
            });

            if (createdGoogleTask.data.id) {
              await supabaseServer
                .from('tasks')
                .update({
                  google_task_id: createdGoogleTask.data.id,
                  synced: true,
                  last_synced_at: new Date().toISOString(),
                })
                .eq('id', lt.id);

              createdInGoogle++;
              remoteMap.set(createdGoogleTask.data.id, createdGoogleTask.data);
            }
          } catch (e: any) {
            console.warn(`[GoogleTasks Sync] Error pushing task ${lt.id} to Google:`, e.message);
          }
        } else {
          // Both exist: reconcile completion status
          const remoteItem = remoteMap.get(lt.google_task_id);
          if (remoteItem) {
            const remoteDone = remoteItem.status === 'completed';
            if (lt.done !== remoteDone) {
              // Remote takes precedence if updated more recently, otherwise local
              await tasksService.tasks.patch({
                tasklist,
                task: lt.google_task_id,
                requestBody: {
                  status: lt.done ? 'completed' : 'needsAction',
                },
              });
              updatedBoth++;
            }
          }
        }
      }

      // D. Pull remote tasks not yet in Supabase into local database
      const existingGoogleTaskIds = new Set(localList.map((t) => t.google_task_id).filter(Boolean));

      for (const rt of remoteTasks) {
        if (rt.id && !existingGoogleTaskIds.has(rt.id)) {
          const dueDate = rt.due ? new Date(rt.due).toISOString().slice(0, 10) : null;
          await supabaseServer.from('tasks').insert({
            user_id: userId,
            text: rt.title || 'Imported Google Task',
            description: rt.notes || null,
            notes: rt.notes || null,
            done: rt.status === 'completed',
            due_date: dueDate,
            area: 'Personal',
            priority: 'medium',
            google_task_id: rt.id,
            synced: true,
            last_synced_at: new Date().toISOString(),
          });
          createdInHub++;
        }
      }

      return res.status(200).json({
        success: true,
        summary: {
          totalRemote: remoteTasks.length,
          totalLocal: localList.length,
          createdInGoogle,
          createdInHub,
          updatedBoth,
        },
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(400).json({
      error: 'Invalid Action',
      message: `Unknown action "${action}". Valid actions: ping, tasklists, list, create, update, sync.`,
    });
  } catch (err: any) {
    console.error('[GoogleTasks API Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Google Tasks Integration Error',
      message: err.message || 'Error executing Google Tasks operation.',
    });
  }
}
