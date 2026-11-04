import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Environment variables or local overrides configured in Settings
const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let cachedClient: SupabaseClient | null = null;
let currentConfig = {
  url: envUrl,
  anonKey: envKey,
};

export function getSupabaseConfig() {
  if (typeof window !== 'undefined') {
    const savedUrl = localStorage.getItem('yash_supabase_url');
    const savedKey = localStorage.getItem('yash_supabase_key');
    if (savedUrl && savedKey) {
      return { url: savedUrl, anonKey: savedKey };
    }
  }
  return currentConfig;
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('yash_supabase_url', url);
    localStorage.setItem('yash_supabase_key', anonKey);
    cachedClient = null; // Reset cached client to reload
  }
}

export function isSupabaseConfigured(): boolean {
  const cfg = getSupabaseConfig();
  return Boolean(cfg.url && cfg.anonKey && cfg.url.startsWith('https://'));
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey || !cfg.url.startsWith('https://')) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return cachedClient;
}

export const SUPABASE_SCHEMA_SQL = `-- YASHWANTH HUB: Production Cloud Tables & Row Level Security (RLS)
-- Run this in your Supabase SQL Editor to prepare your cloud tables

-- 1. Tasks Table
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  text text not null,
  description text,
  area text not null default 'Personal',
  priority text not null default 'medium',
  due_date date,
  starred boolean default false,
  done boolean default false,
  notes text,
  plan integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.tasks enable row level security;
create policy "Users can only access their own tasks"
  on public.tasks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Events Table
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  date date not null,
  start_time text,
  end_time text,
  kind text not null default 'Meeting',
  place text,
  area text default 'Personal',
  notes text,
  google_event_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.events enable row level security;
create policy "Users can only access their own events"
  on public.events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. Meetings Table
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  date date not null,
  start_time text not null,
  end_time text,
  attendees text,
  location_or_link text,
  area text default 'Personal',
  agenda_and_notes text,
  action_items text,
  status text default 'scheduled',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.meetings enable row level security;
create policy "Users can access their own meetings"
  on public.meetings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Travel Table
create table if not exists public.travel (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  destination text not null,
  purpose text not null,
  start_date date not null,
  end_date date not null,
  mode text default 'Flight',
  booking_reference text,
  area text default 'Personal',
  cost_estimate numeric,
  notes_and_itinerary text,
  status text default 'planning',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.travel enable row level security;
create policy "Users can access their own travel"
  on public.travel for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 5. Notes Table
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  title text not null,
  body text,
  area text default 'Personal',
  pinned boolean default false,
  tags text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.notes enable row level security;
create policy "Users can access their own notes"
  on public.notes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 6. Expenses Table
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  amount numeric not null,
  category text not null,
  area text not null default 'Personal',
  note text,
  date date not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.expenses enable row level security;
create policy "Users can access their own expenses"
  on public.expenses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 7. Contacts Table
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  role text,
  company text,
  phone text,
  email text,
  area text default 'Personal',
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.contacts enable row level security;
create policy "Users can access their own contacts"
  on public.contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 8. Areas Table
create table if not exists public.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  name text not null,
  color text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.areas enable row level security;
create policy "Users can access their own areas"
  on public.areas for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
`;
