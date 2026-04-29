-- LIDA Kinetics: data table + Row-Level Security
-- Mirrors the schema convention used by reactions / matrices / screenings / plates.
-- Idempotent: safe to re-run.

create table if not exists kinetics_data (
  item_id    text primary key,
  owner_id   uuid references auth.users(id) on delete cascade,
  scope      text default 'Personal',
  data       jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Speed up the common "list mine + globals" query.
create index if not exists kinetics_data_owner_idx on kinetics_data(owner_id);
create index if not exists kinetics_data_scope_idx on kinetics_data((data->>'scope'));

-- Enable RLS.
alter table kinetics_data enable row level security;

-- Drop any prior policies (allows safe re-run).
drop policy if exists "kinetics_data_owner_all"   on kinetics_data;
drop policy if exists "kinetics_data_global_read" on kinetics_data;

-- Owner can do anything with their own rows.
create policy "kinetics_data_owner_all" on kinetics_data
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Any authenticated user can read rows that the owner has marked Global.
create policy "kinetics_data_global_read" on kinetics_data
  for select using (data->>'scope' = 'Global' or auth.uid() = owner_id);

-- Auto-update `updated_at` on every UPDATE.
create or replace function kinetics_data_set_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists kinetics_data_updated_at on kinetics_data;
create trigger kinetics_data_updated_at
  before update on kinetics_data
  for each row execute function kinetics_data_set_updated_at();
