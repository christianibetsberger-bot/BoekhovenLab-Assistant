-- Predefined storage locations: table + Row-Level Security.
-- Global locations are readable by everyone; Personal ones only by their creator.
-- Mirrors the inventory table's item_data + scope column layout. Idempotent.

create table if not exists locations (
  item_id    text primary key,
  owner_id   uuid references auth.users(id) on delete cascade,
  scope      text default 'Global',
  item_data  jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists locations_owner_idx on locations(owner_id);
create index if not exists locations_scope_idx on locations(scope);

-- Enable RLS.
alter table locations enable row level security;

-- Drop any prior policies (allows safe re-run).
drop policy if exists "locations_owner_all"   on locations;
drop policy if exists "locations_global_read" on locations;

-- Owner can do anything with their own rows.
create policy "locations_owner_all" on locations
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Any authenticated user can read rows marked Global (plus their own).
create policy "locations_global_read" on locations
  for select using (scope = 'Global' or auth.uid() = owner_id);

-- Auto-update `updated_at` on every UPDATE.
create or replace function locations_set_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists locations_updated_at on locations;
create trigger locations_updated_at
  before update on locations
  for each row execute function locations_set_updated_at();
