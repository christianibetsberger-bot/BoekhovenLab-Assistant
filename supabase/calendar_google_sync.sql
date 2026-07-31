-- ─────────────────────────────────────────────────────────────────────────────
-- Two-way Google Calendar sync for the group Meetings calendar.
--
-- Links each `meetings` row to its Google Calendar event so the sync can dedup,
-- update and delete on both sides without creating loops. The `google-calendar-sync`
-- Edge Function (service account) does the actual pulling/pushing.
--
-- Run in the Supabase SQL editor, THEN deploy:
--   supabase functions deploy google-calendar-sync
-- and set the secrets (service account key must be a FRESH, un-leaked one):
--   supabase secrets set GOOGLE_SA_KEY="$(cat kalender-test-XXXX.json)"
--   supabase secrets set GOOGLE_CALENDAR_ID="....@group.calendar.google.com"
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Link + provenance columns on meetings (idempotent).
alter table public.meetings add column if not exists google_event_id text;
alter table public.meetings add column if not exists google_etag     text;
alter table public.meetings add column if not exists origin          text not null default 'tool';   -- 'tool' | 'google'
alter table public.meetings add column if not exists synced_at        timestamptz;
alter table public.meetings add column if not exists updated_at       timestamptz not null default now();

-- Google-originated meetings have no tool owner — allow null so the service-role
-- upsert can insert them. (RLS visibility comes from scope='lab', not owner_id.)
alter table public.meetings alter column owner_id drop not null;

-- One meeting per Google event.
create unique index if not exists meetings_google_event_id_idx
  on public.meetings(google_event_id) where google_event_id is not null;

-- Keep updated_at fresh so the tool→Google push knows what changed since synced_at.
create or replace function public.meetings_touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;
drop trigger if exists meetings_touch_updated_at on public.meetings;
create trigger meetings_touch_updated_at before update on public.meetings
  for each row execute function public.meetings_touch_updated_at();

-- 2) Sync cursor — Google's incremental syncToken, one row per calendar.
create table if not exists public.calendar_sync_state (
  calendar_id text primary key,
  sync_token  text,
  updated_at  timestamptz not null default now()
);
alter table public.calendar_sync_state enable row level security;
-- No client policies on purpose: only the Edge Function (service role) touches this.
