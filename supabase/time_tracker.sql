-- ─────────────────────────────────────────────────────────────────────────────
-- Time Tracker: per-user work-hour logging (Stechuhr)
-- Run this in Supabase → SQL Editor. Idempotent (safe to re-run).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Individual check-in / check-out records
create table if not exists time_entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade not null,
  checked_in  timestamptz not null,
  checked_out timestamptz,              -- null = currently checked in
  task        text not null default 'Lab Work',
  project     text not null default '',
  note        text not null default '',
  created_at  timestamptz default now()
);

create index if not exists time_entries_owner_idx on time_entries(owner_id);
create index if not exists time_entries_time_idx  on time_entries(owner_id, checked_in desc);

alter table time_entries enable row level security;
drop policy if exists "time_entries_owner" on time_entries;
create policy "time_entries_owner" on time_entries
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 2. Per-user settings (weekly target hours, timezone, custom task list)
create table if not exists time_settings (
  owner_id     uuid primary key references auth.users(id) on delete cascade,
  weekly_hours numeric not null default 40,
  timezone     text    not null default 'Europe/Berlin',
  custom_tasks text[]  not null default array['Lab Work','Meeting','Data Analysis','Writing','Admin','Other']
);

alter table time_settings enable row level security;
drop policy if exists "time_settings_owner" on time_settings;
create policy "time_settings_owner" on time_settings
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
