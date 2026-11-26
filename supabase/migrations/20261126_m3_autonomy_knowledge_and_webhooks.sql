-- Milestone 3: Additive schema for user-created knowledge links,
-- synced research bookmarks, and autonomous self-healing / channel audit logs.
-- Strictly non-destructive (idempotent create / alter only).

create table if not exists public.knowledge_links (
  id text not null,
  user_id uuid not null default auth.uid(),
  source_type text not null,
  source_id text not null,
  source_label text not null,
  target_type text not null,
  target_id text not null,
  target_label text not null,
  relation text not null default 'related_to',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_knowledge_links_user_updated
  on public.knowledge_links (user_id, updated_at desc);

alter table public.knowledge_links enable row level security;
alter table public.knowledge_links replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'knowledge_links'
      and policyname = 'knowledge_links_owner_all'
  ) then
    create policy knowledge_links_owner_all
      on public.knowledge_links
      for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create table if not exists public.research_bookmarks (
  id text not null,
  user_id uuid not null default auth.uid(),
  source text not null,
  external_id text not null,
  title text not null,
  authors jsonb not null default '[]'::jsonb,
  year int,
  url text not null,
  summary text,
  topic text,
  tags text[] not null default '{}'::text[],
  note_id text,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_research_bookmarks_user_saved
  on public.research_bookmarks (user_id, saved_at desc);

alter table public.research_bookmarks enable row level security;
alter table public.research_bookmarks replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'research_bookmarks'
      and policyname = 'research_bookmarks_owner_all'
  ) then
    create policy research_bookmarks_owner_all
      on public.research_bookmarks
      for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create table if not exists public.agent_execution_logs (
  id text not null,
  user_id uuid not null default auth.uid(),
  action_type text not null,
  permission_level int not null default 1 check (permission_level between 1 and 3),
  status text not null default 'executed',
  summary text not null,
  channel text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_agent_execution_logs_user_created
  on public.agent_execution_logs (user_id, created_at desc);

alter table public.agent_execution_logs enable row level security;
alter table public.agent_execution_logs replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'agent_execution_logs'
      and policyname = 'agent_execution_logs_owner_all'
  ) then
    create policy agent_execution_logs_owner_all
      on public.agent_execution_logs
      for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['knowledge_links', 'research_bookmarks', 'agent_execution_logs']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
