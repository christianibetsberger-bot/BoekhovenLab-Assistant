-- ─────────────────────────────────────────────────────────────────────────────
-- Inventory RLS — let the whole lab edit SHARED (Global) stock, not only its
-- creator. Fixes: "new row violates row-level security policy (USING expression)
-- for table inventory" when you edit/save a Lab item you didn't create (or one
-- created under a different account). Personal items stay private to their owner.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table inventory enable row level security;

-- 1) Owners have full control of their own rows (Personal or Global).
drop policy if exists "inventory_owner_all" on inventory;
create policy "inventory_owner_all" on inventory
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- 2) Any authenticated user can read Global rows (plus their own).
drop policy if exists "inventory_global_read" on inventory;
create policy "inventory_global_read" on inventory
  for select using (scope = 'Global' or auth.uid() = owner_id);

-- 3) NEW — any authenticated user can create / edit / delete SHARED (Global) rows.
--    The app reassigns owner_id to whoever saves, so the WITH CHECK requires the
--    saver to be the new owner; USING matches on the existing row being Global.
drop policy if exists "inventory_global_write" on inventory;
create policy "inventory_global_write" on inventory
  for all
  using (scope = 'Global')
  with check (scope = 'Global' and owner_id = auth.uid());
