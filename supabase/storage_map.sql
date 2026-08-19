-- ─────────────────────────────────────────────────────────────────────────────
-- Storage Map: the physical storage topology — labs → fridges/freezers →
-- shelves → cryo boxes. One row per unit or box, whole object as JSON
-- (item_data), mirroring the inventory/locations envelope.
--
--   unit doc: { id:'su_…', type:'unit', lab, name, kind, shelves, scope, owner_id }
--   box  doc: { id:'sb_…', type:'box', unitId, shelf, name, rows, cols, plain?, scope, owner_id }
--              (plain: true = no grid — items live loose inside the box)
--
-- WHERE an inventory item sits is NOT here: it lives on the item itself
-- (item_data.storage = { boxId, cell, taken? }) — items are already JSON blobs,
-- so positions need no migration and travel with the item everywhere.
--
-- Run this in Supabase → SQL Editor. Idempotent (safe to re-run).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists storage_map (
  item_id    text primary key,
  owner_id   uuid references auth.users(id) on delete cascade not null,
  scope      text default 'Global',
  item_data  jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists storage_map_owner_idx on storage_map(owner_id);
create index if not exists storage_map_scope_idx on storage_map(scope);

alter table storage_map enable row level security;

-- Owner: full CRUD on own rows.
drop policy if exists "storage_map_owner_all" on storage_map;
create policy "storage_map_owner_all" on storage_map
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Everyone can see the lab's shared topology.
drop policy if exists "storage_map_global_read" on storage_map;
create policy "storage_map_global_read" on storage_map
  for select using (scope = 'Global' or auth.uid() = owner_id);

-- A shared fridge belongs to the lab, not its creator: anyone may co-edit
-- Global rows (add boxes to a colleague's freezer). The WITH CHECK pins
-- owner_id to the editor — the app reassigns ownership to whoever saves
-- (saveDoc, like saveItemToCloud does for inventory), and this stops a write
-- from planting rows under someone ELSE's owner_id.
drop policy if exists "storage_map_global_write" on storage_map;
create policy "storage_map_global_write" on storage_map
  for all using (scope = 'Global')
  with check (scope = 'Global' and owner_id = auth.uid());

-- Real-time tracking (optional but recommended): lets open clients see stocks
-- move live as others scan them. Safe to re-run; harmless if Realtime is off.
do $$ begin
  alter publication supabase_realtime add table storage_map;
exception when duplicate_object or undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table inventory;
exception when duplicate_object or undefined_object then null; end $$;

create or replace function storage_map_set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists storage_map_touch on storage_map;
create trigger storage_map_touch before update on storage_map
  for each row execute function storage_map_set_updated_at();
