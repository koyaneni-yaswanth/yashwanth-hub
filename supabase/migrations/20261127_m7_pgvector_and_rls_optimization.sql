-- Milestone 7:
-- 1) Enable pgvector semantic search table (`knowledge_embeddings`) + match RPC
-- 2) Non-destructively optimize 38 legacy RLS policies to cache `(select auth.uid())` per statement

create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_embeddings (
  id text not null,
  user_id uuid not null default auth.uid(),
  entity_type text not null,
  entity_id text not null,
  title text not null,
  content_excerpt text not null,
  content_hash text not null,
  tags text[] not null default '{}'::text[],
  embedding extensions.vector(768) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_knowledge_embeddings_user_type
  on public.knowledge_embeddings (user_id, entity_type);

create index if not exists idx_knowledge_embeddings_hnsw
  on public.knowledge_embeddings using hnsw (embedding extensions.vector_cosine_ops);

alter table public.knowledge_embeddings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'knowledge_embeddings'
      and policyname = 'knowledge_embeddings_owner_all'
  ) then
    create policy knowledge_embeddings_owner_all
      on public.knowledge_embeddings
      for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

create or replace function public.match_knowledge_embeddings(
  query_embedding extensions.vector(768),
  match_count int default 8,
  min_similarity float default 0.35
)
returns table (
  id text,
  entity_type text,
  entity_id text,
  title text,
  content_excerpt text,
  tags text[],
  similarity float
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    ke.id,
    ke.entity_type,
    ke.entity_id,
    ke.title,
    ke.content_excerpt,
    ke.tags,
    1 - (ke.embedding <=> query_embedding) as similarity
  from public.knowledge_embeddings ke
  where ke.user_id = (select auth.uid())
    and 1 - (ke.embedding <=> query_embedding) >= min_similarity
  order by ke.embedding <=> query_embedding
  limit greatest(1, least(match_count, 30));
$$;

-- Non-destructive ALTER POLICY pass to evaluate `(select auth.uid())` once per query
do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('ai_conversations', 'Users can manage their own AI conversations'),
      ('ai_logs', 'Users can view their own AI logs'),
      ('automation_queue', 'Users can manage their automation queue'),
      ('automation_runs', 'Users can view and inspect their own automation runs'),
      ('automations', 'Users can view and manage their own automations'),
      ('connected_devices', 'Users can manage their own connected devices'),
      ('contacts', 'Users can manage their own contacts'),
      ('daily_plans', 'Owner can manage own daily_plans'),
      ('documents', 'Users can manage their own documents'),
      ('events', 'Users can manage their own events'),
      ('expenses', 'Users can manage their own expenses'),
      ('focus_sessions', 'Owner can manage own focus_sessions'),
      ('goal_milestones', 'Owner can manage own goal_milestones'),
      ('goals', 'Owner can manage own goals'),
      ('habit_logs', 'Owner can manage own habit_logs'),
      ('habits', 'Owner can manage own habits'),
      ('integration_tokens', 'Strict user ownership for integration_tokens'),
      ('integrations', 'Users can manage their own integrations'),
      ('meetings', 'Users can manage their own meetings'),
      ('memories', 'Users can manage their own memories'),
      ('neosapien_connections', 'Users can view and manage their own connection'),
      ('neosapien_memories', 'Users can access their own NeoSapien memories'),
      ('neosapien_sync_history', 'Users can view their own sync history'),
      ('notes', 'Users can manage their own notes'),
      ('notifications', 'Users can manage their own notifications'),
      ('projects', 'Users can manage their own projects'),
      ('robotics_experiments', 'Users can manage their own robotics experiments'),
      ('tasks', 'Users can manage their own tasks'),
      ('travel', 'Users can manage their own travel')
    ) as t(tbl, pol)
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = rec.tbl and policyname = rec.pol
    ) then
      execute format(
        'alter policy %I on public.%I using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
        rec.pol, rec.tbl
      );
    end if;
  end loop;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_members' and policyname = 'Members can view their conversation memberships') then
    alter policy "Members can view their conversation memberships" on public.conversation_members using (user_id = (select auth.uid()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_members' and policyname = 'Users can add themselves to a conversation') then
    alter policy "Users can add themselves to a conversation" on public.conversation_members with check (user_id = (select auth.uid()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_members' and policyname = 'Users can remove themselves from a conversation') then
    alter policy "Users can remove themselves from a conversation" on public.conversation_members using (user_id = (select auth.uid()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'Users can insert conversations they created') then
    alter policy "Users can insert conversations they created" on public.conversations with check (created_by = (select auth.uid()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversations' and policyname = 'Users can view conversations they are a member of') then
    alter policy "Users can view conversations they are a member of" on public.conversations using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversations.id and cm.user_id = (select auth.uid())));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_summaries' and policyname = 'Only requester can view summaries') then
    alter policy "Only requester can view summaries" on public.message_summaries using (requested_by = (select auth.uid()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_summaries' and policyname = 'Only requester can insert summaries') then
    alter policy "Only requester can insert summaries" on public.message_summaries with check (requested_by = (select auth.uid()));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'Members can view messages in their conversations') then
    alter policy "Members can view messages in their conversations" on public.messages using (exists (select 1 from public.conversation_members cm where cm.conversation_id = messages.conversation_id and cm.user_id = (select auth.uid())));
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'messages' and policyname = 'Members can insert messages they send') then
    alter policy "Members can insert messages they send" on public.messages with check ((sender_id = (select auth.uid())) and (exists (select 1 from public.conversation_members cm where cm.conversation_id = messages.conversation_id and cm.user_id = (select auth.uid()))));
  end if;
end $$;
