-- ==============================================================================
-- PROJECT JARVIS 4.0 — COMPANION MEMORY, TIMELINE & AWARENESS SOURCES
-- Strictly additive migration (zero DROP / TRUNCATE statements).
-- Uses `(select auth.uid()) = user_id` on authenticated RLS policies to avoid initplan.
-- ==============================================================================

create extension if not exists vector with schema extensions;

-- 1. Long-Term Structured Companion Memory (10 Categories + Semantic Vector + Contradiction Links)
create table if not exists public.companion_memories (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  category text not null check (
    category in (
      'preference',
      'goal',
      'project',
      'milestone',
      'architecture',
      'decision',
      'unfinished_task',
      'learning',
      'workflow',
      'contact'
    )
  ),
  title text not null,
  content text not null,
  source text not null default 'conversation' check (
    source in ('conversation', 'awareness', 'manual', 'briefing', 'tool')
  ),
  source_ref text,
  project text,
  importance int not null default 5 check (importance >= 1 and importance <= 10),
  confidence numeric(4,3) not null default 0.850,
  durability text not null default 'long_term' check (durability in ('long_term', 'temporary')),
  expires_at timestamptz,
  verified_by_user boolean not null default false,
  contradicts_id text,
  status text not null default 'active' check (status in ('active', 'superseded', 'archived')),
  tags text[] not null default '{}'::text[],
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_companion_memories_user_cat_status
  on public.companion_memories (user_id, category, status, updated_at desc);

create index if not exists idx_companion_memories_hnsw
  on public.companion_memories using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

alter table public.companion_memories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'companion_memories' and policyname = 'Owner access for companion_memories'
  ) then
    create policy "Owner access for companion_memories"
      on public.companion_memories for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create or replace function public.match_companion_memories(
  query_embedding extensions.vector(768),
  match_count int default 8,
  min_similarity float default 0.30
)
returns table (
  id text,
  category text,
  title text,
  content text,
  project text,
  importance int,
  durability text,
  verified_by_user boolean,
  tags text[],
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    cm.id,
    cm.category,
    cm.title,
    cm.content,
    cm.project,
    cm.importance,
    cm.durability,
    cm.verified_by_user,
    cm.tags,
    1 - (cm.embedding <=> query_embedding) as similarity
  from public.companion_memories cm
  where cm.user_id = (select auth.uid())
    and cm.status = 'active'
    and (cm.expires_at is null or cm.expires_at > now())
    and cm.embedding is not null
    and 1 - (cm.embedding <=> query_embedding) >= min_similarity
  order by cm.embedding <=> query_embedding
  limit greatest(1, least(match_count, 30));
$$;

-- 2. Unified Companion Activity Timeline (never conflates observations, inferences, recommendations, or executed work)
create table if not exists public.companion_timeline (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  kind text not null check (
    kind in (
      'live_observation',
      'historical_info',
      'ai_inference',
      'recommendation',
      'pending_approval',
      'executed_action',
      'learned_memory',
      'error'
    )
  ),
  source text not null default 'jarvis',
  agent_id text,
  project text,
  title text not null,
  summary text not null,
  importance text not null default 'normal' check (importance in ('low', 'normal', 'high', 'critical')),
  status text not null default 'recorded' check (
    status in ('recorded', 'pending_approval', 'approved', 'rejected', 'executed', 'failed', 'dismissed')
  ),
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_companion_timeline_user_created
  on public.companion_timeline (user_id, created_at desc);

create index if not exists idx_companion_timeline_user_kind_status
  on public.companion_timeline (user_id, kind, status);

alter table public.companion_timeline enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'companion_timeline' and policyname = 'Owner access for companion_timeline'
  ) then
    create policy "Owner access for companion_timeline"
      on public.companion_timeline for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- 3. Connected Awareness Sources & Cursors
create table if not exists public.awareness_sources (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  status text not null default 'not_configured' check (
    status in ('connected', 'not_configured', 'degraded', 'error', 'paused')
  ),
  enabled boolean not null default true,
  poll_interval_minutes int not null default 30,
  cursor_token text,
  last_checked_at timestamptz,
  last_event_at timestamptz,
  last_error text,
  latest_summary text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.awareness_sources enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'awareness_sources' and policyname = 'Owner access for awareness_sources'
  ) then
    create policy "Owner access for awareness_sources"
      on public.awareness_sources for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- 4. Realtime publication + REPLICA IDENTITY FULL for new companion tables
do $$
declare
  t text;
begin
  foreach t in array array['companion_memories', 'companion_timeline', 'awareness_sources'] loop
    if to_regclass(format('public.%I', t)) is not null then
      execute format('alter table public.%I replica identity full', t);
      if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
         and not exists (
           select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
         ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end if;
  end loop;
end $$;
