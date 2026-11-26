-- Universal Workspace Sync & Realtime completeness migration
-- Additive only: ensures every local Dexie workspace model field has matching
-- nullable columns in Supabase and adds all workspace tables to supabase_realtime
-- with REPLICA IDENTITY FULL for cross-device delete/update propagation.

do $$
begin
  -- tasks
  if to_regclass('public.tasks') is not null then
    alter table public.tasks add column if not exists project_id text;
  end if;

  -- events
  if to_regclass('public.events') is not null then
    alter table public.events add column if not exists project_id text;
  end if;

  -- meetings
  if to_regclass('public.meetings') is not null then
    alter table public.meetings add column if not exists google_meet_link text;
    alter table public.meetings add column if not exists project_id text;
  end if;

  -- notes
  if to_regclass('public.notes') is not null then
    alter table public.notes add column if not exists kind text;
    alter table public.notes add column if not exists project_id text;
  end if;

  -- expenses
  if to_regclass('public.expenses') is not null then
    alter table public.expenses add column if not exists payment_method text;
    alter table public.expenses add column if not exists receipt_doc_id text;
    alter table public.expenses add column if not exists receipt_url text;
    alter table public.expenses add column if not exists linked_task_id text;
    alter table public.expenses add column if not exists project_id text;
    alter table public.expenses add column if not exists source text;
    alter table public.expenses add column if not exists created_by text;
    alter table public.expenses add column if not exists last_verified_at timestamptz;
    alter table public.expenses add column if not exists status text;
  end if;

  -- contacts
  if to_regclass('public.contacts') is not null then
    alter table public.contacts add column if not exists company text;
    alter table public.contacts add column if not exists note text;
  end if;

  -- projects
  if to_regclass('public.projects') is not null then
    alter table public.projects add column if not exists verification_note text;
  end if;

  -- documents
  if to_regclass('public.documents') is not null then
    alter table public.documents add column if not exists file_name text;
    alter table public.documents add column if not exists mime_type text;
    alter table public.documents add column if not exists area text;
    alter table public.documents add column if not exists notes text;
    alter table public.documents add column if not exists google_drive_id text;
    alter table public.documents add column if not exists google_drive_link text;
    alter table public.documents add column if not exists project_id text;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks', 'events', 'projects', 'notes', 'meetings', 'expenses',
    'contacts', 'documents', 'travel', 'robotics_experiments', 'memories',
    'goals', 'goal_milestones', 'habits', 'habit_logs', 'daily_plans', 'focus_sessions'
  ] loop
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
