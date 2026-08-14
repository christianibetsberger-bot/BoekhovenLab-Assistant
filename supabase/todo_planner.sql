-- ─────────────────────────────────────────────────────────────────────────────
-- Planner: per-user day planner (Structured-style timeline + inbox todos)
-- Run this in Supabase → SQL Editor. Idempotent (safe to re-run).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Tasks. A task with no date/start is an "inbox" todo waiting to be
--    scheduled; one with date + start_min sits on that day's timeline.
create table if not exists todo_items (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users(id) on delete cascade not null,
  title        text not null,
  notes        text not null default '',
  icon         text not null default 'fa-list-check',   -- Font Awesome class
  category     text not null default '',                -- name from todo_categories
  date         date,                                    -- null = inbox
  start_min    integer,                                 -- minutes from midnight, null = inbox
  duration_min integer not null default 30,
  done         boolean not null default false,
  created_at   timestamptz default now()
);

create index if not exists todo_items_owner_idx on todo_items(owner_id);
create index if not exists todo_items_day_idx   on todo_items(owner_id, date);

alter table todo_items enable row level security;
drop policy if exists "todo_items_owner" on todo_items;
create policy "todo_items_owner" on todo_items
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 2. Categories: the colour code. Seeded client-side on first use.
create table if not exists todo_categories (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid references auth.users(id) on delete cascade not null,
  name      text not null,
  color     text not null default '#2563eb',
  position  integer not null default 0
);

create index if not exists todo_categories_owner_idx on todo_categories(owner_id);

alter table todo_categories enable row level security;
drop policy if exists "todo_categories_owner" on todo_categories;
create policy "todo_categories_owner" on todo_categories
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- 3. Calendar opt-in: include this user's OWN todos in their personal calendar
--    feed (calendar_sync.sql / calendar-feed Edge Function). Strictly per-user:
--    the feed token identifies one user and only ever serves that user's todos —
--    todos never appear in anyone else's feed and are never lab-wide.
--    (No-op if the calendar feed isn't set up yet; run calendar_sync.sql first.)
alter table if exists public.calendar_tokens
  add column if not exists include_todos boolean not null default false;
