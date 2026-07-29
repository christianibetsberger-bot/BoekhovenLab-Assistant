-- ─────────────────────────────────────────────────────────────────────────────
-- Calendar sync — per-user subscription feed for the Meetings calendar.
--
-- Each user gets one secret token. They add the resulting webcal:// link once to
-- Apple Calendar / Google Calendar, which then re-poll it and keep meetings up to
-- date automatically. The token is served by the `calendar-feed` Edge Function.
--
-- Run this in the Supabase SQL editor, THEN deploy the function:
--   supabase functions deploy calendar-feed --no-verify-jwt
-- (--no-verify-jwt is required: Apple/Google fetch the feed with no login.)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.calendar_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  user_email text not null,
  token      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.calendar_tokens enable row level security;

-- A user can only see and manage their own token row. The Edge Function reads
-- the table with the service-role key, so it bypasses these policies by design —
-- the unguessable token is what authorizes a feed request.
drop policy if exists "calendar_tokens own select" on public.calendar_tokens;
create policy "calendar_tokens own select" on public.calendar_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "calendar_tokens own insert" on public.calendar_tokens;
create policy "calendar_tokens own insert" on public.calendar_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists "calendar_tokens own update" on public.calendar_tokens;
create policy "calendar_tokens own update" on public.calendar_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "calendar_tokens own delete" on public.calendar_tokens;
create policy "calendar_tokens own delete" on public.calendar_tokens
  for delete using (auth.uid() = user_id);

create index if not exists calendar_tokens_token_idx on public.calendar_tokens(token);
