-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Creates a single-row-per-user settings table so theme color, dark mode,
-- global calculator settings, and module layout sync across the browser tab
-- and the standalone PWA (which uses an isolated localStorage partition).

create table if not exists user_settings (
  user_id uuid    primary key references auth.users(id) on delete cascade,
  prefs   jsonb   not null default '{}',   -- isDarkMode, uiSettings, globalSettings
  layout  jsonb   not null default '{}'    -- topOrder, leftOrder, rightOrder, minimized, …
);

alter table user_settings enable row level security;

-- Each user can only read and write their own row
create policy "Users manage own settings"
  on user_settings for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
