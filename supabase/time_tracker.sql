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
  created_at  timestamptz default now() -- used to detect Nachbuchungen
);

create index if not exists time_entries_owner_idx on time_entries(owner_id);
create index if not exists time_entries_time_idx  on time_entries(owner_id, checked_in desc);

alter table time_entries enable row level security;
drop policy if exists "time_entries_owner" on time_entries;
create policy "time_entries_owner" on time_entries
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 2. Per-user settings
create table if not exists time_settings (
  owner_id              uuid primary key references auth.users(id) on delete cascade,
  weekly_hours          numeric  not null default 40,
  vacation_days_per_year integer not null default 30,
  timezone              text     not null default 'Europe/Berlin',
  custom_tasks          text[]   not null default array[
    'Lab Work','Meeting','Data Analysis','Writing','Admin',
    'Teaching','Coding','Literature','Break',
    'Conference','Superuser Duties','Group Task','Other'
  ]
);
-- Migration: add columns added in v2
alter table time_settings add column if not exists
  vacation_days_per_year integer not null default 30;
alter table time_settings add column if not exists
  custom_projects text[] not null default '{}';
alter table time_settings add column if not exists
  privacy_mode boolean not null default false;

alter table time_settings enable row level security;
drop policy if exists "time_settings_owner" on time_settings;
create policy "time_settings_owner" on time_settings
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 3. Sick days and vacation days
create table if not exists time_absences (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid references auth.users(id) on delete cascade not null,
  date       date not null,
  type       text not null check (type in ('sick', 'vacation')),
  half_day   boolean not null default false,
  note       text not null default '',
  created_at timestamptz default now()
);

create index if not exists time_absences_owner_idx on time_absences(owner_id);

alter table time_absences enable row level security;
drop policy if exists "time_absences_owner" on time_absences;
create policy "time_absences_owner" on time_absences
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
