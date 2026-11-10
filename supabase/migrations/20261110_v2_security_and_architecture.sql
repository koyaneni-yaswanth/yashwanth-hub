-- ==============================================================================
-- YASHWANTH HUB V2 — SECURITY HARDENING, UNIFIED AUTOMATION QUEUE, AI & PROJECTS
-- Migration: 20261110_v2_security_and_architecture.sql
-- Non-destructive additive migration (preserves all existing records).
-- ==============================================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. PHASE 1 SECURITY FIX: STRICT RLS ON integration_tokens
-- Removes `or auth.uid() is null` vulnerability so anonymous/other users
-- cannot inspect or overwrite OAuth tokens. Serverless endpoints use service_role.
-- ------------------------------------------------------------------------------
alter table if exists public.integration_tokens enable row level security;

drop policy if exists "Users can view and manage their own integration tokens" on public.integration_tokens;
drop policy if exists "Strict user ownership for integration_tokens" on public.integration_tokens;

create policy "Strict user ownership for integration_tokens"
  on public.integration_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. PHASE 2 UNIFIED DURABLE AUTOMATION ENGINE & APPROVAL QUEUE
-- Unifies automations + automation_queue + automation_runs without dropping data.
-- ------------------------------------------------------------------------------
do $$
begin
  -- Extend public.automations for one-time & recurring schedules and human approval gating
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automations' and column_name='schedule_type') then
    alter table public.automations add column schedule_type text not null default 'recurring';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automations' and column_name='cron_expression') then
    alter table public.automations add column cron_expression text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automations' and column_name='timezone') then
    alter table public.automations add column timezone text not null default 'Asia/Kolkata';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automations' and column_name='scheduled_for') then
    alter table public.automations add column scheduled_for timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automations' and column_name='next_run_at') then
    alter table public.automations add column next_run_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automations' and column_name='last_run_at') then
    alter table public.automations add column last_run_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automations' and column_name='requires_approval') then
    alter table public.automations add column requires_approval boolean not null default false;
  end if;
end $$;

-- Update trigger_type & status check constraints on public.automations safely
do $$
begin
  alter table public.automations drop constraint if exists automations_trigger_type_check;
  alter table public.automations add constraint automations_trigger_type_check
    check (trigger_type in ('cron', 'one_time', 'event', 'webhook', 'manual'));
  alter table public.automations drop constraint if exists automations_status_check;
  alter table public.automations add constraint automations_status_check
    check (status in ('active', 'paused', 'error', 'needs_authorization', 'completed'));
exception when others then null;
end $$;

-- Ensure automation_queue works cleanly with public.automations + supports approval queue & backoff retries
create table if not exists public.automation_queue (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  action_type text not null,
  trigger_source text not null default 'cron_vercel',
  status text not null default 'pending' check (status in ('pending', 'processing', 'retry_scheduled', 'completed', 'failed', 'cancelled')),
  approval_status text not null default 'auto_approved' check (approval_status in ('auto_approved', 'pending_approval', 'approved', 'rejected')),
  approved_by uuid,
  approved_at timestamptz,
  priority integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  result_payload jsonb default '{}'::jsonb,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  scheduled_for timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  idempotency_key text,
  created_at timestamptz not null default now()
);

do $$
begin
  alter table public.automation_queue drop constraint if exists automation_queue_automation_id_fkey;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automation_queue' and column_name='trigger_source') then
    alter table public.automation_queue add column trigger_source text not null default 'cron_vercel';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automation_queue' and column_name='approval_status') then
    alter table public.automation_queue add column approval_status text not null default 'auto_approved';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automation_queue' and column_name='approved_by') then
    alter table public.automation_queue add column approved_by uuid;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automation_queue' and column_name='approved_at') then
    alter table public.automation_queue add column approved_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automation_queue' and column_name='result_payload') then
    alter table public.automation_queue add column result_payload jsonb default '{}'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automation_queue' and column_name='idempotency_key') then
    alter table public.automation_queue add column idempotency_key text;
  end if;
  alter table public.automation_queue drop constraint if exists automation_queue_status_check;
  alter table public.automation_queue add constraint automation_queue_status_check
    check (status in ('pending', 'processing', 'retry_scheduled', 'completed', 'failed', 'cancelled'));
exception when others then null;
end $$;

create unique index if not exists idx_automation_queue_idempotency
  on public.automation_queue (idempotency_key) where idempotency_key is not null;

create index if not exists idx_automation_queue_due
  on public.automation_queue (status, approval_status, scheduled_for);

alter table public.automation_queue enable row level security;
drop policy if exists "Users can manage their automation queue" on public.automation_queue;
create policy "Users can manage their automation queue"
  on public.automation_queue for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automation_runs' and column_name='queue_job_id') then
    alter table public.automation_runs add column queue_job_id uuid;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='automation_runs' and column_name='records_affected') then
    alter table public.automation_runs add column records_affected integer not null default 0;
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 3. PHASE 3 & 4: AI CHIEF OF STAFF & PROJECT INTELLIGENCE TABLES
-- ------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='priority') then
    alter table public.projects add column priority text default 'high';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='start_date') then
    alter table public.projects add column start_date date;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='repository_url') then
    alter table public.projects add column repository_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='tags') then
    alter table public.projects add column tags text[] default '{}';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='goals') then
    alter table public.projects add column goals jsonb default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='decisions') then
    alter table public.projects add column decisions jsonb default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='risks') then
    alter table public.projects add column risks jsonb default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='blockers') then
    alter table public.projects add column blockers jsonb default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='activity_history') then
    alter table public.projects add column activity_history jsonb default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='progress_reports') then
    alter table public.projects add column progress_reports jsonb default '[]'::jsonb;
  end if;
end $$;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  agent_id text not null default 'orchestrator',
  mode text not null default 'personal',
  project_id text,
  messages jsonb not null default '[]'::jsonb,
  total_tokens integer not null default 0,
  total_cost_usd numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_user_updated on public.ai_conversations (user_id, updated_at desc);
alter table public.ai_conversations enable row level security;
drop policy if exists "Users can manage their own AI conversations" on public.ai_conversations;
create policy "Users can manage their own AI conversations"
  on public.ai_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.robotics_experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  project text not null,
  title text not null,
  category text not null,
  status text not null default 'active',
  description text,
  parameters jsonb default '{}'::jsonb,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.robotics_experiments enable row level security;
drop policy if exists "Users can manage their own robotics experiments" on public.robotics_experiments;
create policy "Users can manage their own robotics experiments"
  on public.robotics_experiments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.projects;
    alter publication supabase_realtime add table public.ai_conversations;
    alter publication supabase_realtime add table public.robotics_experiments;
  end if;
exception when others then null;
end $$;
