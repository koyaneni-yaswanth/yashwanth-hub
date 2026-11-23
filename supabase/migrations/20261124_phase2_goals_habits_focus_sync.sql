-- Phase 2 · Data foundation: cloud copies of the local-first Goals & Habits,
-- Daily Compass and Deep Work tables, so they reach Supabase and other devices.
--
-- Safe to run more than once. Additive only: creates new tables, never alters
-- or drops existing ones.
--
-- Design notes
-- * Primary key is (user_id, id). Local ids are only unique per device/user
--   (a daily plan's id is its date, a habit log's id is `${habit_id}:${date}`),
--   so the user is part of the key. user_id defaults to auth.uid(), which lets
--   the app upsert rows without sending it.
-- * No foreign keys between these tables on purpose: the offline queue can
--   upload a child (milestone, habit log) before its parent, and the app
--   already cascades deletes locally and queues each one.
-- * RLS: each user can read and write only their own rows.

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
create table if not exists public.goals (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  why text,
  area text not null default '',
  target_date date,
  status text not null default 'active' check (status in ('active', 'paused', 'achieved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists idx_goals_user_updated on public.goals (user_id, updated_at desc);

create table if not exists public.goal_milestones (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  goal_id text not null,
  title text not null,
  week_start date not null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists idx_goal_milestones_user_goal on public.goal_milestones (user_id, goal_id);

-- ---------------------------------------------------------------------------
-- Habits
-- ---------------------------------------------------------------------------
create table if not exists public.habits (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  title text not null,
  goal_id text,
  area text not null default '',
  weekly_target smallint not null default 7 check (weekly_target between 1 and 7),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.habit_logs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  habit_id text not null,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, habit_id, date)
);

-- ---------------------------------------------------------------------------
-- Daily Compass plans (one per day; id is the date 'YYYY-MM-DD')
-- ---------------------------------------------------------------------------
create table if not exists public.daily_plans (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (id ~ '^\d{4}-\d{2}-\d{2}$'),
  available_minutes integer not null default 0 check (available_minutes >= 0),
  items jsonb not null default '[]'::jsonb,
  rescue boolean not null default false,
  wrap_up jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ---------------------------------------------------------------------------
-- Deep Work sessions
-- ---------------------------------------------------------------------------
create table if not exists public.focus_sessions (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  date date not null,
  preset text not null default 'custom',
  planned_minutes integer not null default 0,
  break_minutes integer not null default 0,
  task_id text,
  goal_id text,
  label text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz,
  actual_minutes numeric not null default 0 check (actual_minutes >= 0),
  completed boolean not null default false,
  interruptions integer not null default 0,
  distractions jsonb not null default '[]'::jsonb,
  focus_rating smallint check (focus_rating between 1 and 5),
  reflection text,
  primary key (user_id, id)
);
create index if not exists idx_focus_sessions_user_date on public.focus_sessions (user_id, date desc);

-- ---------------------------------------------------------------------------
-- Row level security: owner-only access on every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['goals', 'goal_milestones', 'habits', 'habit_logs', 'daily_plans', 'focus_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner can manage own %s" on public.%I', t, t);
    execute format(
      'create policy "Owner can manage own %s" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: other open devices receive changes live
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['goals', 'goal_milestones', 'habits', 'habit_logs', 'daily_plans', 'focus_sessions'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
