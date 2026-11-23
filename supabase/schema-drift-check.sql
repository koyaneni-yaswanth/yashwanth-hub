-- Schema drift check · READ ONLY (only SELECTs; changes nothing).
--
-- Run in Supabase → SQL Editor, then copy the single JSON result back to Claude.
-- It describes every table in the public schema: columns, primary key, whether
-- row level security is on, its policies, and whether realtime is enabled.
-- Tables the app relies on that have no migration in the repo today:
--   tasks, events, meetings, notes, projects, expenses, notifications, neo_memories
-- With this output they can be captured as migrations (no data is read).

with tbls as (
  select c.oid, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
cols as (
  select table_name,
         jsonb_agg(jsonb_build_object(
           'name', column_name,
           'type', case when data_type = 'USER-DEFINED' then udt_name when data_type = 'ARRAY' then udt_name else data_type end,
           'nullable', is_nullable = 'YES',
           'default', column_default
         ) order by ordinal_position) as columns
  from information_schema.columns
  where table_schema = 'public'
  group by table_name
),
pks as (
  select tc.table_name, jsonb_agg(kcu.column_name order by kcu.ordinal_position) as primary_key
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY'
  group by tc.table_name
),
pols as (
  select tablename as table_name,
         jsonb_agg(jsonb_build_object(
           'name', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'with_check', with_check
         ) order by policyname) as policies
  from pg_policies
  where schemaname = 'public'
  group by tablename
),
rt as (
  select tablename as table_name
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public'
)
select jsonb_pretty(jsonb_agg(jsonb_build_object(
  'table', t.table_name,
  'rls_enabled', t.rls_enabled,
  'rls_forced', t.rls_forced,
  'realtime', exists (select 1 from rt where rt.table_name = t.table_name),
  'primary_key', coalesce(p.primary_key, '[]'::jsonb),
  'columns', coalesce(c.columns, '[]'::jsonb),
  'policies', coalesce(po.policies, '[]'::jsonb)
) order by t.table_name)) as schema_report
from tbls t
left join cols c on c.table_name = t.table_name
left join pks p on p.table_name = t.table_name
left join pols po on po.table_name = t.table_name;
