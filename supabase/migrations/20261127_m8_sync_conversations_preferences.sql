-- ==============================================================================
-- YASHWANTH HUB M8 — SYNC HARDENING (CONVERSATIONS, MEMORIES, PREFERENCES & FLEET)
-- Strictly additive migration (zero DROP / TRUNCATE statements).
-- ==============================================================================

-- 1. Cross-device synced preferences (V3F rubric state, P-v telemetry summary, workspace prefs)
create table if not exists public.user_preferences (
  id text not null,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.user_preferences enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_preferences' and policyname = 'Owner access for user_preferences'
  ) then
    create policy "Owner access for user_preferences"
      on public.user_preferences for all
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;

-- 2. Extend public.memories for full NeoMemory fidelity (reminders + updated_at merge stamp)
do $$
begin
  if to_regclass('public.memories') is not null then
    alter table public.memories add column if not exists reminders text[] default '{}';
    alter table public.memories add column if not exists updated_at timestamptz default now();
  end if;
end $$;

-- 3. Ensure connected_devices supports conflict-free multi-device upserts by (user_id, hardware_id)
do $$
begin
  if to_regclass('public.connected_devices') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'uq_connected_devices_user_hardware'
         and conrelid = 'public.connected_devices'::regclass
     ) then
    alter table public.connected_devices
      add constraint uq_connected_devices_user_hardware unique (user_id, hardware_id);
  end if;
exception when others then null;
end $$;

-- 4. Ensure Realtime publication & REPLICA IDENTITY FULL across user_preferences, ai_conversations, memories, connected_devices
do $$
declare
  t text;
begin
  foreach t in array array['user_preferences', 'ai_conversations', 'memories', 'connected_devices'] loop
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
