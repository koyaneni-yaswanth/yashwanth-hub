-- ==============================================================================
-- YASHWANTH HUB — SERVER-SIDE AUTOMATION ENGINE & QUEUE PROCESSOR MIGRATION
-- Migration: 20261105_hub_automations_engine.sql
-- Description: Establishes database tables, queues, execution logs, and RLS policies
-- satisfying all Antigravity Hard Constraints for Yashwanth Hub Automations.
-- ==============================================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. HUB AUTOMATIONS TABLE (Automation Definitions & Schedules)
-- ------------------------------------------------------------------------------
create table if not exists public.hub_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  slug text not null,
  description text,
  trigger_type text not null default 'cron' check (trigger_type in ('cron', 'event', 'webhook', 'manual')),
  cron_expression text, -- standard 5-field cron expression, e.g. '0 7 * * *'
  timezone text not null default 'Asia/Kolkata',
  action_type text not null check (action_type in (
    'morning_briefing',
    'task_deadline_scan',
    'meeting_intelligence',
    'neosapien_sync',
    'calendar_reconciliation',
    'custom_agent'
  )),
  configuration jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_user_automation_slug unique (user_id, slug)
);

create index if not exists idx_hub_automations_user_enabled on public.hub_automations (user_id, is_enabled);
create index if not exists idx_hub_automations_action on public.hub_automations (action_type);

alter table public.hub_automations enable row level security;

create policy "Users can view and manage their own automations"
  on public.hub_automations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. AUTOMATION QUEUE TABLE (Durable Serverless Job Queue)
-- ------------------------------------------------------------------------------
create table if not exists public.automation_queue (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.hub_automations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  action_type text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  priority integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_queue_pending on public.automation_queue (status, scheduled_for, priority desc);
create index if not exists idx_automation_queue_user on public.automation_queue (user_id, created_at desc);

alter table public.automation_queue enable row level security;

create policy "Users can manage their automation queue"
  on public.automation_queue for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. AUTOMATION EXECUTION LOGS TABLE (Audit History & Observability)
-- ------------------------------------------------------------------------------
create table if not exists public.automation_execution_logs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.hub_automations(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  trigger_source text not null check (trigger_source in ('cron_vercel', 'pg_cron', 'manual', 'webhook', 'event')),
  action_type text not null,
  status text not null check (status in ('success', 'failed', 'partial')),
  duration_ms integer not null,
  records_affected integer not null default 0,
  input_payload jsonb default '{}'::jsonb,
  output_payload jsonb default '{}'::jsonb,
  error_log text,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_logs_user_time on public.automation_execution_logs (user_id, created_at desc);
create index if not exists idx_automation_logs_automation on public.automation_execution_logs (automation_id, created_at desc);
create index if not exists idx_automation_logs_status on public.automation_execution_logs (status);

alter table public.automation_execution_logs enable row level security;

create policy "Users can view their automation execution logs"
  on public.automation_execution_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. REALTIME PUBLICATION
-- ------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.hub_automations;
    alter publication supabase_realtime add table public.automation_queue;
    alter publication supabase_realtime add table public.automation_execution_logs;
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 5. SEED SYSTEM AUTOMATIONS FUNCTION
-- ------------------------------------------------------------------------------
create or replace function public.seed_default_user_automations(target_user_id uuid)
returns void as $$
begin
  insert into public.hub_automations (
    user_id, name, slug, description, trigger_type, cron_expression, timezone, action_type, configuration, is_enabled
  ) values
    (
      target_user_id,
      'Executive Morning Briefing',
      'executive-morning-briefing',
      'Daily 07:00 AM IST executive briefing synthesizing high-priority tasks, calendar meetings, and active hardware milestones.',
      'cron',
      '0 7 * * *',
      'Asia/Kolkata',
      'morning_briefing',
      '{"priority_threshold": "high", "include_weather": true, "include_projects": ["PAWAN SHAKTI", "MG Automation", "IvLabs"]}'::jsonb,
      true
    ),
    (
      target_user_id,
      'Task Deadline & Meeting Intelligence Scanner',
      'task-meeting-scanner',
      'Hourly server-side scan detecting upcoming deadlines, overdue tasks, and preparing briefs for meetings starting within 45 minutes.',
      'cron',
      '0 * * * *',
      'Asia/Kolkata',
      'task_deadline_scan',
      '{"lead_time_minutes": 45, "alert_priority": "high"}'::jsonb,
      true
    ),
    (
      target_user_id,
      'NeoSapien Wearable & MCP Memory Sync',
      'neosapien-mcp-sync',
      'Bi-hourly automated synchronization pulling Neo 1 wearable conversations, transcripts, and extracting commitments into Action Items.',
      'cron',
      '0 */2 * * *',
      'Asia/Kolkata',
      'neosapien_sync',
      '{"sync_method": "mcp", "extract_action_items": true, "auto_link_projects": true}'::jsonb,
      true
    ),
    (
      target_user_id,
      'Google Calendar & Cross-Platform Reconciliation',
      'calendar-reconciliation',
      'Bi-daily reconciliation aligning Google Workspace Calendar events with Yashwanth Hub commitments and meeting intelligence.',
      'cron',
      '0 8,18 * * *',
      'Asia/Kolkata',
      'calendar_reconciliation',
      '{"sync_direction": "bidirectional", "auto_create_meeting_records": true}'::jsonb,
      true
    )
  on conflict (user_id, slug) do nothing;
end;
$$ language plpgsql security definer;
