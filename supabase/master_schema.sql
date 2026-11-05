-- ==============================================================================
-- YASHWANTH HUB: COMPLETE PRODUCTION CLOUD SCHEMA
-- Target Project Reference ID: xjhkxnfahkkgwbbtmhtk
-- Region: ap-northeast-1 (Tokyo)
-- URL: https://xjhkxnfahkkgwbbtmhtk.supabase.co
-- Description: Creates all 19 application tables, RLS policies, indexes,
--              realtime publication, and initial seed defaults.
-- ==============================================================================

create extension if not exists "uuid-ossp";

-- ==============================================================================
-- 1. CORE EXECUTIVE COMMAND CENTER TABLES
-- ==============================================================================

-- 1.1 Tasks Table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  text text not null,
  description text,
  area text not null default 'Personal',
  priority text not null default 'medium',
  due_date date,
  starred boolean default false,
  done boolean default false,
  notes text,
  plan integer,
  google_task_id text,
  synced boolean default false,
  last_synced_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.tasks enable row level security;
create policy "Users can manage their own tasks" on public.tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.2 Events Table (Calendar)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  date date not null,
  start_time text,
  end_time text,
  kind text not null default 'Meeting',
  place text,
  area text default 'Personal',
  notes text,
  google_event_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.events enable row level security;
create policy "Users can manage their own events" on public.events for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.3 Meetings Table
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  date date not null,
  start_time text not null,
  end_time text,
  attendees text,
  location_or_link text,
  area text default 'Personal',
  agenda_and_notes text,
  action_items text,
  status text default 'scheduled',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.meetings enable row level security;
create policy "Users can manage their own meetings" on public.meetings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.4 Travel Table
create table if not exists public.travel (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  destination text not null,
  purpose text not null,
  start_date date not null,
  end_date date not null,
  mode text default 'Flight',
  booking_reference text,
  area text default 'Personal',
  cost_estimate numeric,
  notes_and_itinerary text,
  status text default 'planning',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.travel enable row level security;
create policy "Users can manage their own travel" on public.travel for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.5 Notes Table
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  body text,
  area text default 'Personal',
  pinned boolean default false,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.notes enable row level security;
create policy "Users can manage their own notes" on public.notes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.6 Expenses Table
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  amount numeric not null,
  category text not null,
  area text not null default 'Personal',
  note text,
  date date not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.expenses enable row level security;
create policy "Users can manage their own expenses" on public.expenses for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.7 Documents Table
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  category text not null,
  file_type text not null,
  file_size text not null,
  storage_path text,
  download_url text,
  starred boolean default false,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.documents enable row level security;
create policy "Users can manage their own documents" on public.documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.8 Contacts Table
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  role text,
  organization text,
  email text,
  phone text,
  area text default 'Personal',
  relationship text default 'Network',
  last_contact_date date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.contacts enable row level security;
create policy "Users can manage their own contacts" on public.contacts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.9 Projects Table (PAWAN SHAKTI, IvLabs, MG Automation)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  area text not null default 'Work',
  status text not null default 'active',
  progress integer default 0,
  target_date date,
  description text,
  milestones jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.projects enable row level security;
create policy "Users can manage their own projects" on public.projects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.10 Notifications Table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  message text not null,
  type text not null default 'system',
  priority text not null default 'medium',
  read boolean default false,
  action_link text,
  created_at timestamptz default now()
);
alter table public.notifications enable row level security;
create policy "Users can manage their own notifications" on public.notifications for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 1.11 AI Logs Table (Token tracking and cost)
create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  provider text not null,
  model_id text not null,
  mode text not null,
  tokens_input integer default 0,
  tokens_output integer default 0,
  estimated_cost_usd numeric default 0,
  latency_ms integer default 0,
  timestamp timestamptz default now()
);
alter table public.ai_logs enable row level security;
create policy "Users can view their own AI logs" on public.ai_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==============================================================================
-- 2. NEOSAPIEN NEO 1 WEARABLE & MCP PROTOCOL TABLES
-- ==============================================================================

-- 2.1 Integrations Table
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
create policy "Users can manage their own integrations" on public.integrations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2.2 Connected Devices Table (Neo 1 Companion, BLE)
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
create policy "Users can manage their own connected devices" on public.connected_devices for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2.3 Memories Table (NeoSapien Personal Second Brain)
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
  content_hash text,
  export_eligible boolean default true,
  authorized_for_ai boolean default true,
  synced_to_supabase boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_memories_user_captured on public.memories (user_id, captured_at desc);
create unique index if not exists idx_memories_unique_neo_id on public.memories (user_id, original_neo_id) where original_neo_id is not null;
alter table public.memories enable row level security;
create policy "Users can manage their own memories" on public.memories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2.4 NeoSapien Connections Table (Token Store)
create table if not exists public.neosapien_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique default auth.uid(),
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  scope text,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error', 'expired')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.neosapien_connections enable row level security;
create policy "Users can view and manage their own connection" on public.neosapien_connections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2.5 NeoSapien Memories Table
create table if not exists public.neosapien_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  source_record_id text not null,
  title text not null,
  content_hash text not null,
  source text not null default 'neo_1_device',
  summary text,
  transcript text,
  speakers jsonb default '[]'::jsonb,
  decisions jsonb default '[]'::jsonb,
  action_items jsonb default '[]'::jsonb,
  commitments text[] default '{}',
  imported_at timestamptz not null default now(),
  constraint uq_user_source_memory unique (user_id, source_record_id)
);
create index if not exists idx_neosapien_memories_user on public.neosapien_memories (user_id, imported_at desc);
alter table public.neosapien_memories enable row level security;
create policy "Users can access their own NeoSapien memories" on public.neosapien_memories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2.6 NeoSapien Sync History Table
create table if not exists public.neosapien_sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  sync_method text not null check (sync_method in ('mcp', 'sse', 'manual', 'webhook')),
  status text not null check (status in ('success', 'failed', 'partial')),
  records_imported integer not null default 0,
  details text,
  created_at timestamptz not null default now()
);
alter table public.neosapien_sync_history enable row level security;
create policy "Users can view their own sync history" on public.neosapien_sync_history for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ==============================================================================
-- 3. SERVER-SIDE AUTOMATION ENGINE & VAULT TABLES
-- ==============================================================================

-- 3.1 Automations Registry Table
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
create index if not exists idx_automations_user_status on public.automations (user_id, status);
create index if not exists idx_automations_trigger on public.automations (trigger_type, status);
alter table public.automations enable row level security;
create policy "Users can view and manage their own automations" on public.automations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3.2 Automation Runs Table (Immutable Execution Audit Log)
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
  idempotency_key text,
  created_at timestamptz not null default now()
);
create index if not exists idx_automation_runs_user_created on public.automation_runs (user_id, created_at desc);
create index if not exists idx_automation_runs_automation on public.automation_runs (automation_id, created_at desc);
create unique index if not exists idx_automation_runs_idempotency on public.automation_runs (idempotency_key) where idempotency_key is not null;
alter table public.automation_runs enable row level security;
create policy "Users can view and inspect their own automation runs" on public.automation_runs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3.3 Integration Tokens Vault (Server-side Encrypted Credentials)
create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  provider text not null check (provider in ('google', 'neosapien', 'github')),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[] default '{}',
  token_type text default 'Bearer',
  account_email text,
  metadata jsonb default '{}'::jsonb,
  -- Backwards-compatible aliases
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expiry timestamptz,
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_provider_tokens unique (user_id, provider)
);
alter table public.integration_tokens enable row level security;
create policy "Users can view and manage their own integration tokens"
  on public.integration_tokens for all
  using (auth.uid() = user_id or auth.uid() is null)
  with check (auth.uid() = user_id or auth.uid() is null);

-- ==============================================================================
-- 4. REALTIME REPLICATION CONFIGURATION
-- ==============================================================================
-- Add key tables to Supabase Realtime publication
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.meetings;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.memories;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.connected_devices;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.automations;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.automation_runs;
exception when others then null;
end $$;

-- ==============================================================================
-- 5. INITIAL SEED AUTOMATION DEFINITIONS
-- ==============================================================================
-- Inserts baseline background automations for system owner
insert into public.automations (id, name, description, trigger_type, trigger_config, action_type, action_config, status)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    'Task Deadline & Meeting Scanner',
    'Hourly serverless scan checking for overdue commitments and upcoming meetings within 45-minute lead times.',
    'cron',
    '{"cron_expression": "0 * * * *", "timezone": "Asia/Kolkata"}'::jsonb,
    'task_deadline_scan',
    '{"lead_time_minutes": 45}'::jsonb,
    'active'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'Executive Morning Briefing',
    'Daily 07:00 IST briefing synthesizing calendar events, high-priority tasks, and engineering milestones.',
    'cron',
    '{"cron_expression": "0 7 * * *", "timezone": "Asia/Kolkata"}'::jsonb,
    'morning_briefing',
    '{"model": "gemini-1.5-flash"}'::jsonb,
    'active'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'NeoSapien Wearable & MCP Memory Sync',
    'Automated bi-hourly synchronization pulling Neo 1 wearable conversations via official NeoSapien MCP.',
    'cron',
    '{"cron_expression": "0 */2 * * *", "timezone": "Asia/Kolkata"}'::jsonb,
    'neosapien_mcp',
    '{"mcp_endpoint": "https://api.neosapien.xyz/mcp"}'::jsonb,
    'active'
  )
on conflict (id) do nothing;
