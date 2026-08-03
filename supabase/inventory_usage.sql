-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory usage history + archive — full compound traceability.
--
-- `inventory_usage`: one row per (compound × experiment). Rows are reconciled by
-- the app whenever a journal entry or a planner (matrix / reaction / screening /
-- well plate / kinetics) is saved with a status OTHER than 'in_progress' — only
-- finished experiments count. Going back to in-progress (or removing the compound
-- chip) removes the rows again.
--
-- `inventory_archive`: deleting an inventory item moves it here instead of
-- vanishing — the item's full data is retained, and because usage rows key on the
-- stable item_id, its history stays readable years later.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Usage log ────────────────────────────────────────────────────────────────
create table if not exists public.inventory_usage (
  id           uuid primary key default gen_random_uuid(),
  item_id      text not null,              -- the inventory item's client id (stable across archive)
  item_code    text,                       -- snapshot: human code at time of use
  item_name    text,                       -- snapshot: name at time of use
  source_type  text not null,              -- 'journal' | 'matrix' | 'reaction' | 'screening' | 'plate' | 'kinetics'
  source_id    text not null,              -- journal entry id / plan id
  source_label text,                       -- experiment id or plan name (what the tree shows)
  status       text,                       -- 'success' | 'failure' | 'repeat' (never 'in_progress')
  user_email   text,                       -- who ran it
  used_at      timestamptz,                -- experiment date (journal date, or save time for plans)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One row per compound per experiment — reconciliation upserts on this key.
create unique index if not exists inventory_usage_item_source_idx
  on public.inventory_usage(item_id, source_type, source_id);
create index if not exists inventory_usage_item_idx on public.inventory_usage(item_id);
create index if not exists inventory_usage_source_idx on public.inventory_usage(source_type, source_id);

alter table public.inventory_usage enable row level security;

-- Lab-shared log: any member can read the history and reconcile rows for the
-- experiments they save (the writer is often not the compound's owner).
drop policy if exists "inventory_usage read" on public.inventory_usage;
create policy "inventory_usage read" on public.inventory_usage
  for select using (auth.role() = 'authenticated');
drop policy if exists "inventory_usage write" on public.inventory_usage;
create policy "inventory_usage write" on public.inventory_usage
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- 2) Archive — deleted items are moved here, never lost ───────────────────────
create table if not exists public.inventory_archive (
  item_id     text primary key,            -- same id the item had in `inventory`
  item_data   jsonb not null,              -- the full item object as it was at deletion
  owner_id    uuid,
  owner_email text,
  scope       text,
  deleted_by  text,                        -- email of whoever deleted it
  deleted_at  timestamptz not null default now()
);

alter table public.inventory_archive enable row level security;

-- Archiving must not widen visibility: a Personal (private) stock stays private
-- after it is deleted, exactly as it was in `inventory`. Global/Lab stock is
-- readable by everyone, as before.
drop policy if exists "inventory_archive read" on public.inventory_archive;
create policy "inventory_archive read" on public.inventory_archive
  for select using (coalesce(scope, 'Global') <> 'Personal' or owner_id = auth.uid());
drop policy if exists "inventory_archive insert" on public.inventory_archive;
create policy "inventory_archive insert" on public.inventory_archive
  for insert with check (auth.role() = 'authenticated');
-- The app archives with an UPSERT, so re-archiving an item that was archived and
-- later restored resolves to an UPDATE — without this policy that delete would be
-- refused (the app now blocks deletion when archiving fails).
drop policy if exists "inventory_archive update" on public.inventory_archive;
create policy "inventory_archive update" on public.inventory_archive
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- Delete = "restore" (the app re-inserts the item into `inventory`, then removes it here).
drop policy if exists "inventory_archive delete" on public.inventory_archive;
create policy "inventory_archive delete" on public.inventory_archive
  for delete using (auth.role() = 'authenticated');
