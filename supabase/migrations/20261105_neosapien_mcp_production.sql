-- ==============================================================================
-- YASHWANTH HUB — NEOSAPIEN MCP PRODUCTION INTEGRATION & CLOUD SYNC MIGRATION
-- Migration: 20261105_neosapien_mcp_production.sql
-- Description: Production-grade tables for NeoSapien MCP connections, memories, and audit history
-- ==============================================================================

create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 1. NEOSAPIEN CONNECTIONS TABLE (Encrypted Token & Session Persistence)
-- ------------------------------------------------------------------------------
create table if not exists public.neosapien_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  provider text not null default 'neosapien',
  mcp_endpoint text not null default 'https://api.neosapien.xyz/mcp',
  auth_type text not null default 'oauth_pkce' check (auth_type in ('oauth_pkce', 'api_key', 'direct_token')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error', 'pending_auth')),
  client_id text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  capabilities jsonb default '[]'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_user_neosapien_provider unique (user_id, provider)
);

alter table public.neosapien_connections enable row level security;

create policy "Users can manage their own NeoSapien connection"
  on public.neosapien_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 2. NEOSAPIEN MEMORIES TABLE (Deduplicated, Indexed, Provenance-Preserved)
-- ------------------------------------------------------------------------------
create table if not exists public.neosapien_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  source_record_id text not null,
  title text not null,
  content_hash text not null,
  source text not null default 'neo_1_device' check (source in ('neo_1_device', 'desktop_meeting', 'web_import', 'mcp_sync', 'webhook')),
  platform text not null default 'in_person' check (platform in ('google_meet', 'zoom', 'microsoft_teams', 'whatsapp', 'in_person', 'phone_call', 'other')),
  captured_at timestamptz not null default now(),
  duration_minutes integer default 15,
  summary text not null,
  transcript text,
  mom text,
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
  is_important boolean default false,
  user_notes text,
  imported_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint unique_user_neo_source_record unique (user_id, source_record_id)
);

create index if not exists idx_neo_memories_user_captured on public.neosapien_memories (user_id, captured_at desc);
create index if not exists idx_neo_memories_content_hash on public.neosapien_memories (user_id, content_hash);
create index if not exists idx_neo_memories_area on public.neosapien_memories (user_id, associated_area);

alter table public.neosapien_memories enable row level security;

create policy "Users can manage their own NeoSapien memories"
  on public.neosapien_memories for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 3. NEOSAPIEN SYNC HISTORY TABLE (Audit Log & Observability)
-- ------------------------------------------------------------------------------
create table if not exists public.neosapien_sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  sync_method text not null default 'mcp' check (sync_method in ('mcp', 'webhook', 'json_export', 'manual')),
  status text not null default 'success' check (status in ('success', 'partial', 'failed')),
  records_imported integer default 0,
  records_updated integer default 0,
  duplicates_skipped integer default 0,
  details text,
  error_message text,
  created_at timestamptz default now()
);

create index if not exists idx_neo_sync_history_user_time on public.neosapien_sync_history (user_id, created_at desc);

alter table public.neosapien_sync_history enable row level security;

create policy "Users can view their own NeoSapien sync history"
  on public.neosapien_sync_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------------
-- 4. REALTIME PUBLICATION
-- ------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.neosapien_connections;
    alter publication supabase_realtime add table public.neosapien_memories;
    alter publication supabase_realtime add table public.neosapien_sync_history;
  end if;
end $$;
