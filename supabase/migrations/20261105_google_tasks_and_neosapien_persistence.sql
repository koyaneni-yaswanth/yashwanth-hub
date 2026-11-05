-- ==============================================================================
-- Migration: 20261105_google_tasks_and_neosapien_persistence.sql
-- Description: Server-Side Token Persistence Vault, Google Tasks Sync, & NeoSapien MCP Handshake
-- Target Database: Supabase (Project ID: xjhkxnfahkkgwbbtmhtk)
-- ==============================================================================

-- 1. Ensure Integration Tokens Table Schema with Standard & Encrypted Columns
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
  -- Compatibility columns for existing automations runner
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expiry timestamptz,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_provider_tokens unique (user_id, provider)
);

-- Ensure all required columns exist if table was previously created with fewer columns
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'access_token') then
    alter table public.integration_tokens add column access_token text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'refresh_token') then
    alter table public.integration_tokens add column refresh_token text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'expires_at') then
    alter table public.integration_tokens add column expires_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'scopes') then
    alter table public.integration_tokens add column scopes text[] default '{}';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'token_type') then
    alter table public.integration_tokens add column token_type text default 'Bearer';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'account_email') then
    alter table public.integration_tokens add column account_email text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'metadata') then
    alter table public.integration_tokens add column metadata jsonb default '{}'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'encrypted_access_token') then
    alter table public.integration_tokens add column encrypted_access_token text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'encrypted_refresh_token') then
    alter table public.integration_tokens add column encrypted_refresh_token text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'integration_tokens' and column_name = 'token_expires_at') then
    alter table public.integration_tokens add column token_expires_at timestamptz;
  end if;
end $$;

-- 2. Indexes & Row Level Security on integration_tokens
create index if not exists idx_integration_tokens_user_provider on public.integration_tokens (user_id, provider);

alter table public.integration_tokens enable row level security;

drop policy if exists "Strict server-only token access" on public.integration_tokens;
drop policy if exists "Users can view and manage their own integration tokens" on public.integration_tokens;

create policy "Users can view and manage their own integration tokens"
  on public.integration_tokens for all
  using (auth.uid() = user_id or auth.uid() is null)
  with check (auth.uid() = user_id or auth.uid() is null);

-- 3. Ensure Tasks Table has Google Tasks Mapping Columns
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'google_task_id') then
    alter table public.tasks add column google_task_id text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'synced') then
    alter table public.tasks add column synced boolean default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'last_synced_at') then
    alter table public.tasks add column last_synced_at timestamptz;
  end if;
end $$;

create index if not exists idx_tasks_google_task_id on public.tasks (google_task_id) where google_task_id is not null;

-- 4. Realtime publication additions
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.integration_tokens;
  end if;
exception when others then null;
end $$;
