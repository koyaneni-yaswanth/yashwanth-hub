-- ==============================================================================
-- YASHWANTH HUB — REAL-TIME AI OPERATING SYSTEM & NEO 1 SUPABASE MIGRATION
-- Migration: 20261104_neo1_realtime_os.sql
-- Description: Creates structured tables, RLS policies, indexes, and Realtime publications
-- ==============================================================================

-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. INTEGRATIONS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  provider text not null check (provider in ('neosapien', 'google_workspace', 'github', 'custom_mcp')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error', 'pending_auth')),
  auth_type text not null default 'oauth2' check (auth_type in ('oauth2', 'api_key', 'webhook', 'mcp_sse')),
  account_id text,
  account_email text,
  permissions_granted text[] default '{}',
  last_successful_sync timestamptz,
  last_error text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_user_provider unique (user_id, provider)
);

alter table public.integrations enable row level security;

create policy "Users can manage their own integrations"
  on public.integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. CONNECTED DEVICES TABLE (Neo 1, Companion Apps, BLE)
-- ------------------------------------------------------------------------------
create table if not exists public.connected_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  device_type text not null default 'neo1' check (device_type in ('neo1', 'desktop_companion', 'android_companion', 'ios', 'other')),
  name text not null,
  hardware_id text,
  firmware_version text,
  battery_percentage integer check (battery_percentage between 0 and 100),
  connection_state text not null default 'disconnected' check (connection_state in ('connected', 'disconnected', 'stale', 'pairing')),
  listening_state text not null default 'idle' check (listening_state in ('listening', 'idle', 'sleeping', 'charging', 'unknown')),
  telemetry_source text not null default 'web_bluetooth' check (telemetry_source in ('web_bluetooth', 'android_companion', 'desktop_client', 'cloud_polled')),
  last_connected_at timestamptz,
  last_status_update timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.connected_devices enable row level security;

create policy "Users can manage their own connected devices"
  on public.connected_devices for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. DEVICE STATUS HISTORY (Telemetry Time-Series)
-- ------------------------------------------------------------------------------
create table if not exists public.device_status_history (
  id uuid primary key default gen_random_uuid(),
  device_id uuid references public.connected_devices(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  battery_percentage integer,
  connection_state text not null,
  listening_state text not null,
  rssi integer,
  recorded_at timestamptz default now()
);

alter table public.device_status_history enable row level security;

create policy "Users can view their own device telemetry history"
  on public.device_status_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. MEMORIES TABLE (NeoSapien Personal Second Brain)
-- ------------------------------------------------------------------------------
create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  original_neo_id text,
  title text not null,
  source text not null check (source in ('wearable_neo1', 'desktop_meeting', 'web_import', 'mcp_sync', 'webhook')),
  platform text not null default 'in_person' check (platform in ('google_meet', 'zoom', 'microsoft_teams', 'whatsapp', 'in_person', 'phone_call', 'other')),
  captured_at timestamptz not null default now(),
  duration_minutes integer,
  summary text not null,
  transcript text,
  speakers jsonb default '[]'::jsonb,
  decisions jsonb default '[]'::jsonb,
  action_items jsonb default '[]'::jsonb,
  commitments text[] default '{}',
  follow_ups text[] default '{}',
  people_mentioned text[] default '{}',
  tags text[] default '{}',
  associated_project_id text,
  associated_area text default 'Personal',
  associated_google_event_id text,
  sync_method text default 'webhook',
  is_important boolean default false,
  imported_at timestamptz default now(),
  constraint unique_user_original_neo_id unique (user_id, original_neo_id)
);

alter table public.memories enable row level security;

create policy "Users can manage their own memories"
  on public.memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 5. MEETING SUMMARIES (AI Intelligence & Briefs)
-- ------------------------------------------------------------------------------
create table if not exists public.meeting_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  meeting_id uuid references public.meetings(id) on delete cascade not null,
  source_memory_id uuid references public.memories(id) on delete set null,
  executive_summary text not null,
  key_decisions text[] default '{}',
  action_items jsonb default '[]'::jsonb,
  draft_follow_up_email text,
  sentiment text check (sentiment in ('constructive', 'neutral', 'urgent', 'contentious')),
  suggested_next_meeting timestamptz,
  approved_by_user boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.meeting_summaries enable row level security;

create policy "Users can manage their own meeting summaries"
  on public.meeting_summaries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 6. ACTION ITEMS TABLE (Cross-Platform Commitments & Reconciliation)
-- ------------------------------------------------------------------------------
create table if not exists public.action_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  source_memory_id uuid references public.memories(id) on delete set null,
  text text not null,
  assignee_name text,
  detected_deadline timestamptz,
  status text not null default 'pending_approval' check (status in ('pending_approval', 'approved', 'rejected', 'synced_to_hub', 'synced_to_google')),
  hub_task_id uuid references public.tasks(id) on delete set null,
  google_task_id text,
  priority text default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  is_commitment boolean default false,
  reconciliation_status text default 'new_commitment',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.action_items enable row level security;

create policy "Users can manage their own action items"
  on public.action_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 7. REMINDERS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  source_memory_id uuid references public.memories(id) on delete set null,
  text text not null,
  remind_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'dismissed', 'snoozed')),
  created_at timestamptz default now()
);

alter table public.reminders enable row level security;

create policy "Users can manage their own reminders"
  on public.reminders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 8. SYNC JOBS TABLE (Audit & Idempotency)
-- ------------------------------------------------------------------------------
create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  service text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  records_processed integer default 0,
  records_failed integer default 0,
  idempotency_key text not null,
  started_at timestamptz default now(),
  completed_at timestamptz,
  error_log text,
  constraint unique_user_idempotency unique (user_id, idempotency_key)
);

alter table public.sync_jobs enable row level security;

create policy "Users can view their own sync jobs"
  on public.sync_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 9. INTEGRATION EVENTS TABLE (Webhook & Realtime Ingestion Log)
-- ------------------------------------------------------------------------------
create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  integration_id uuid references public.integrations(id) on delete cascade,
  event_type text not null,
  payload_summary text,
  status text default 'processed' check (status in ('processed', 'ignored', 'failed')),
  created_at timestamptz default now()
);

alter table public.integration_events enable row level security;

create policy "Users can view their integration events"
  on public.integration_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 10. REALTIME PUBLICATIONS
-- ------------------------------------------------------------------------------
-- Add tables to supabase_realtime publication for reactive client updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.connected_devices;
    alter publication supabase_realtime add table public.memories;
    alter publication supabase_realtime add table public.meetings;
    alter publication supabase_realtime add table public.meeting_summaries;
    alter publication supabase_realtime add table public.action_items;
    alter publication supabase_realtime add table public.sync_jobs;
  end if;
end $$;
