-- JARVIS 5.0: Encrypted Per-User AI Provider Credential & Config Vault
-- Strictly additive migration with owner-only `(select auth.uid()) = user_id` RLS.
create table if not exists public.provider_credentials (
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  provider text not null check (
    provider in ('openai', 'anthropic', 'gemini', 'openrouter', 'huggingface', 'ollama')
  ),
  enabled boolean not null default true,
  selected_model text,
  encrypted_api_key text,
  key_hint text,
  base_url text,
  last_health_status text check (
    last_health_status is null or last_health_status in ('connected', 'not_configured', 'degraded', 'unreachable', 'rate_limited')
  ),
  last_latency_ms int,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.provider_credentials enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'provider_credentials' and policyname = 'Owner access for provider_credentials'
  ) then
    create policy "Owner access for provider_credentials"
      on public.provider_credentials for all
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;
end $$;
