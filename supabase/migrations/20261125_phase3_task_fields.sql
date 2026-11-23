-- Phase 3 · Tasks v3: columns for subtasks, repeating tasks, "blocked by"
-- links and board stages on the existing public.tasks table.
--
-- Safe to run more than once. Additive only: adds nullable columns, never
-- changes or removes existing ones. Until this runs, the app keeps syncing
-- tasks without these fields (they stay on the device).

do $$
begin
  if to_regclass('public.tasks') is null then
    raise notice 'public.tasks does not exist; skipping Phase 3 task columns.';
    return;
  end if;

  alter table public.tasks add column if not exists subtasks jsonb;
  alter table public.tasks add column if not exists recurrence jsonb;
  alter table public.tasks add column if not exists blocked_by jsonb;
  alter table public.tasks add column if not exists stage text;
  alter table public.tasks add column if not exists recurred_to text;

  if not exists (select 1 from pg_constraint where conname = 'tasks_stage_check') then
    alter table public.tasks add constraint tasks_stage_check check (stage is null or stage in ('todo', 'doing'));
  end if;
end $$;
