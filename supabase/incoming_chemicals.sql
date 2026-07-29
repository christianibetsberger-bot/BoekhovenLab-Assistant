-- ─────────────────────────────────────────────────────────────────────────────
-- Incoming chemicals — handoff table between the hourly Excel reader (a local
-- Python job) and the app's Inventory "Incoming" section.
--
-- The reader (tools/incoming_chemicals/reader.py) parses the read-only Shopping
-- List and UPSERTs recent, not-yet-arrived chemicals here using the Supabase
-- SERVICE ROLE key (which bypasses RLS). App users only read these rows and flip
-- app_status when they add one to inventory or dismiss it. Nothing here ever
-- touches the Excel file — it is read-only, without exception.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.incoming_chemicals (
  id           uuid primary key default gen_random_uuid(),
  source_key   text not null unique,      -- stable dedup key (weblink or vendor|cat|name hash)
  name         text,
  cas          text,
  vendor       text,
  catalogue    text,
  weblink      text,
  quantity     text,                       -- pack / bottle size as written in the sheet
  ordered_at   date,
  requested_by text,
  arrived      boolean not null default false,
  app_status   text not null default 'incoming',   -- 'incoming' | 'added' | 'dismissed'
  raw          jsonb,                      -- the full parsed row, for drift-proofing
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.incoming_chemicals enable row level security;

-- App users (any authenticated lab member) can read the queue and update the
-- app_status (added / dismissed). Inserts/updates from the reader use the service
-- role key and bypass RLS entirely, so no insert policy is needed for it.
drop policy if exists "incoming read" on public.incoming_chemicals;
create policy "incoming read" on public.incoming_chemicals for select using (auth.role() = 'authenticated');

drop policy if exists "incoming update status" on public.incoming_chemicals;
create policy "incoming update status" on public.incoming_chemicals for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create index if not exists incoming_chemicals_status_idx on public.incoming_chemicals(app_status, arrived, ordered_at desc);
