-- ─────────────────────────────────────────────────────────────────────────────
-- Lab user directory — powers the "share with a coworker" dropdowns.
--
-- Supabase doesn't expose auth.users to the client, so each user upserts their own
-- lightweight profile row on login (store.syncProfile) and everyone can read the
-- directory (store.loadProfiles) to share entries with each other.
--
-- Run in the Supabase SQL editor. The app degrades quietly if this table is absent
-- (the picker just falls back to people already seen on shared entries).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Everyone authenticated can read the directory (to share with each other).
drop policy if exists "profiles read all" on public.profiles;
create policy "profiles read all" on public.profiles
  for select using (auth.role() = 'authenticated');

-- Each user manages only their own row.
drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create index if not exists profiles_email_idx on public.profiles(email);
