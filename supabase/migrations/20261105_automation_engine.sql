-- ==============================================================================
-- YASHWANTH HUB — PRODUCTION SERVER-SIDE AUTOMATION ENGINE SCHEMA
-- Migration: 20261105_automation_engine.sql
-- Description: Establishes durable automations registry, execution runs, 
--              server-side token encryption vault, and strict RLS policies.
-- ==============================================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. AUTOMATIONS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  description text,
  trigger_type text not null check (trigger_type in ('cron', 'event', 'webhook', 'manual')),
  trigger_config jsonb not null default '{}'::jsonb,
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'error', 'needs_authorization')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for automations
create index if not exists idx_automations_user_status on public.automations (user_id, status);
create index if not exists idx_automations_trigger on public.automations (trigger_type, status);

alter table public.automations enable row level security;

create policy "Users can view and manage their own automations"
  on public.automations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. AUTOMATION RUNS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.automations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  trigger_source text not null check (trigger_source in ('cron_vercel', 'pg_cron', 'manual', 'webhook', 'event')),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  input_payload jsonb default '{}'::jsonb,
  output_payload jsonb default '{}'::jsonb,
  error_log text,
  retry_count integer not null default 0,
  idempotency_key text unique,
  created_at timestamptz not null default now()
);

-- Indexes for automation_runs
create index if not exists idx_automation_runs_user_status on public.automation_runs (user_id, status);
create index if not exists idx_automation_runs_automation_created on public.automation_runs (automation_id, created_at desc);
create index if not exists idx_automation_runs_idempotency on public.automation_runs (idempotency_key);

alter table public.automation_runs enable row level security;

create policy "Users can view and manage their own automation runs"
  on public.automation_runs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. INTEGRATION TOKENS VAULT (Server-Side Protected Credentials)
-- ------------------------------------------------------------------------------
create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  provider text not null check (provider in ('google', 'neosapien', 'github')),
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scopes text[] default '{}',
  account_email text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unique_user_provider_tokens unique (user_id, provider)
);

create index if not exists idx_integration_tokens_user on public.integration_tokens (user_id, provider);

alter table public.integration_tokens enable row level security;

create policy "Users can view and manage their own integration tokens"
  on public.integration_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. REALTIME REPLICATION
-- ------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.automations;
    alter publication supabase_realtime add table public.automation_runs;
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 5. SEED SYSTEM AUTOMATIONS
-- ------------------------------------------------------------------------------
create or replace function public.seed_production_automations(target_user_id uuid)
returns void as $$
begin
  insert into public.automations (
    id, user_id, name, description, trigger_type, trigger_config, action_type, action_config, status
  ) values
    (
      'a0000000-0000-0000-0000-000000000001'::uuid,
      target_user_id,
      'Executive Morning Briefing',
      'Daily 07:00 AM IST executive briefing synthesizing high-priority tasks, Google Calendar events, and hardware milestones for PAWAN SHAKTI & MG Automation.',
      'cron',
      '{"cron_expression": "0 7 * * *", "timezone": "Asia/Kolkata", "next_run_at": "2026-11-06T01:30:00Z"}'::jsonb,
      'morning_briefing',
      '{"priority_threshold": "high", "delivery_channel": "notification", "include_projects": ["PAWAN SHAKTI", "MG Automation", "IvLabs"]}'::jsonb,
      'active'
    ),
    (
      'a0000000-0000-0000-0000-000000000002'::uuid,
      target_user_id,
      'Task Deadline & Meeting Intelligence Scanner',
      'Hourly server-side scan detecting tasks approaching or past due date, and synthesizing preparation briefs for meetings starting within 45 minutes.',
      'cron',
      '{"cron_expression": "0 * * * *", "timezone": "Asia/Kolkata", "next_run_at": "2026-11-05T15:00:00Z"}'::jsonb,
      'task_deadline_scan',
      '{"lead_time_minutes": 45, "alert_priority": "high", "auto_remind": true}'::jsonb,
      'active'
    ),
    (
      'a0000000-0000-0000-0000-000000000003'::uuid,
      target_user_id,
      'NeoSapien Wearable & Memory MCP Sync',
      'Bi-hourly automated synchronization pulling Neo 1 wearable conversations and transcripts via NeoSapien MCP (https://api.neosapien.xyz/mcp).',
      'cron',
      '{"cron_expression": "0 */2 * * *", "timezone": "Asia/Kolkata", "next_run_at": "2026-11-05T16:00:00Z"}'::jsonb,
      'neosapien_mcp',
      '{"mcp_endpoint": "https://api.neosapien.xyz/mcp", "extract_action_items": true, "auto_link_projects": true}'::jsonb,
      'active'
    ),
    (
      'a0000000-0000-0000-0000-000000000004'::uuid,
      target_user_id,
      'Google Workspace Calendar & Task Reconciliation',
      'Twice daily synchronization aligning Google Calendar events with Yashwanth Hub commitments and meeting intelligence.',
      'cron',
      '{"cron_expression": "0 8,18 * * *", "timezone": "Asia/Kolkata", "next_run_at": "2026-11-06T02:30:00Z"}'::jsonb,
      'google_calendar',
      '{"sync_direction": "bidirectional", "auto_create_meeting_records": true}'::jsonb,
      'active'
    )
  on conflict (id) do nothing;
end;
$$ language plpgsql security definer;
