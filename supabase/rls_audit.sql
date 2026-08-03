-- ─────────────────────────────────────────────────────────────────────────────
-- RLS audit fix — make lab-shared resources actually editable by the lab.
--
-- THE BUG (systemic, one root cause):
--   store.saveToCloud() re-stamps `owner_id` with the CURRENT user on every upsert
--   (src/stores/labStore.js). Most tables were created with an owner-only write
--   policy — `for all using (auth.uid() = owner_id)`. So when member B edits a
--   Global/Lab item that member A created, the UPDATE is rejected and B sees
--   "Permission Denied: Only the creator can modify this protocol."
--   Read access was fine; WRITE access silently blocked collaboration.
--
--   This was already fixed for `inventory` (supabase/inventory_rls.sql). The same
--   pattern still affects every other shared table. This script fixes them all by
--   adding a matching `<table>_global_write` policy: any authenticated member may
--   create/edit/delete a row whose scope is Global, and must own what they write.
--   Personal (private) rows stay owner-only, exactly as before.
--
-- Postgres combines PERMISSIVE policies with OR, so these ADD capability without
-- weakening the existing owner-only rules.
--
-- Safe to run before the tables exist: every statement is guarded, so missing
-- tables/columns are skipped rather than erroring. Idempotent — safe to re-run.
-- Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Shared resources with a real `scope` column: planners, protocols, locations.
--    Global = lab-shared, Personal = private to its owner.
do $$
declare t text;
begin
  foreach t in array array['locations','reactions','matrices','screenings','plates','protocols']
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'scope')
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'owner_id')
    then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_global_write', t);
      execute format(
        'create policy %I on public.%I for all using (scope = ''Global'') '
        || 'with check (scope = ''Global'' and owner_id = auth.uid())',
        t || '_global_write', t);
      -- Make sure lab-shared rows are readable too (harmless if already present).
      execute format('drop policy if exists %I on public.%I', t || '_global_read', t);
      execute format(
        'create policy %I on public.%I for select using (scope = ''Global'' or owner_id = auth.uid())',
        t || '_global_read', t);
    end if;
  end loop;
end $$;

-- 2) Tables whose scope lives inside the jsonb payload instead of a column.
do $$
declare t text;
begin
  foreach t in array array['kinetics_data','datafig_items']
  loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'data')
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'owner_id')
    then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_global_write', t);
      execute format(
        'create policy %I on public.%I for all using (data->>''scope'' = ''Global'') '
        || 'with check (data->>''scope'' = ''Global'' and owner_id = auth.uid())',
        t || '_global_write', t);
    end if;
  end loop;
end $$;

-- 3) Journals use scope 'Lab' (not 'Global') plus a shared_with email array.
--    Collaborators must be able to edit an entry shared with them — that is the
--    whole point of the co-editing feature.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'journals' and column_name = 'shared_with')
  then
    alter table public.journals enable row level security;
    drop policy if exists "journals_collab_write" on public.journals;
    create policy "journals_collab_write" on public.journals
      for update
      using (scope = 'Lab' or auth.jwt()->>'email' = any(shared_with))
      with check (scope = 'Lab' or auth.jwt()->>'email' = any(shared_with));
  end if;
end $$;

-- 4) Lab-wide catalogues everyone maintains together (no per-row ownership).
do $$
declare t text;
begin
  foreach t in array array['instruments','journal_categories']
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t)
    then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_lab_all', t);
      execute format(
        'create policy %I on public.%I for all using (auth.role() = ''authenticated'') '
        || 'with check (auth.role() = ''authenticated'')',
        t || '_lab_all', t);
    end if;
  end loop;
end $$;

-- 5) Bookings / meetings / error reports: everyone sees the shared schedule, and
--    each person manages their own rows.
do $$
declare t text;
begin
  foreach t in array array['instrument_bookings','meetings','instrument_errors']
  loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t)
    then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_read_all', t);
      execute format('create policy %I on public.%I for select using (auth.role() = ''authenticated'')', t || '_read_all', t);
      execute format('drop policy if exists %I on public.%I', t || '_write_own', t);
      if exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = t and column_name = 'owner_id')
      then
        execute format(
          'create policy %I on public.%I for all using (owner_id = auth.uid() or owner_id is null) '
          || 'with check (owner_id = auth.uid() or owner_id is null)',
          t || '_write_own', t);
      else
        execute format(
          'create policy %I on public.%I for all using (auth.role() = ''authenticated'') '
          || 'with check (auth.role() = ''authenticated'')',
          t || '_write_own', t);
      end if;
    end if;
  end loop;
end $$;

-- 6) user_settings: the original policy specified WITH CHECK but no USING, so the
--    read/update/delete side was unrestricted — every user's settings row was
--    readable. Restore the intended own-row-only rule.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'user_settings' and column_name = 'user_id')
  then
    alter table public.user_settings enable row level security;
    drop policy if exists "Users manage own settings" on public.user_settings;
    drop policy if exists "user_settings_own" on public.user_settings;
    create policy "user_settings_own" on public.user_settings
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ── Verify: list the resulting policies ──────────────────────────────────────
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
