-- Data & Figures module: shareable analysis sets, plot presets, palettes, and
-- published datasets. One table discriminated by data->>'kind'
-- ('analysis_set' | 'plot_preset' | 'palette' | 'dataset').
-- Mirrors kinetics_data.sql (scope Personal/Global + RLS). Idempotent.

create table if not exists datafig_items (
  item_id    text primary key,
  owner_id   uuid references auth.users(id) on delete cascade,
  scope      text default 'Personal',
  data       jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Speed up the common "list mine + globals, by kind" queries.
create index if not exists datafig_items_owner_idx on datafig_items(owner_id);
create index if not exists datafig_items_scope_idx on datafig_items((data->>'scope'));
create index if not exists datafig_items_kind_idx  on datafig_items((data->>'kind'));

-- Enable RLS.
alter table datafig_items enable row level security;

-- Drop any prior policies (allows safe re-run).
drop policy if exists "datafig_items_owner_all"   on datafig_items;
drop policy if exists "datafig_items_global_read" on datafig_items;

-- Owner can do anything with their own rows.
create policy "datafig_items_owner_all" on datafig_items
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Any authenticated user can read rows the owner marked Global.
create policy "datafig_items_global_read" on datafig_items
  for select using (data->>'scope' = 'Global' or auth.uid() = owner_id);

-- Auto-update `updated_at` on every UPDATE.
create or replace function datafig_items_set_updated_at()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists datafig_items_updated_at on datafig_items;
create trigger datafig_items_updated_at
  before update on datafig_items
  for each row execute function datafig_items_set_updated_at();
