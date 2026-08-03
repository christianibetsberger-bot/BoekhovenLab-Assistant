-- ─────────────────────────────────────────────────────────────────────────────
-- Journal concurrency — stop co-editors silently overwriting each other.
--
-- THE BUG: two people editing one shared entry both autosave every ~1 s. Each
-- client keeps its own editor body and discards the incoming realtime one, so
-- whoever saves last writes a body that never contained the other's paragraph.
-- The earlier text was gone with no error and no trace.
--
-- THE FIX: a `rev` counter for optimistic concurrency. The app updates with
--   ... .eq('id', id).eq('rev', <the revision it edited>)
-- so a write only lands if nobody else has written since. On a mismatch the app
-- does NOT overwrite: it snapshots the other person's version into
-- journal_versions (visible/diffable/restorable in the History panel), re-bases
-- onto their revision, and tells the user. Nothing is lost either way.
--
-- Until this column exists the app falls back to the old last-write-wins path,
-- so running this is what actually turns the protection on.
--
-- Run in the Supabase SQL editor. Idempotent — safe to re-run.
-- Note: journal_versions must exist too (supabase/journal_eln.sql) for the
-- losing version to be recoverable.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.journals add column if not exists rev integer not null default 0;

-- Every write bumps the revision, including writes from other clients/tools, so
-- a stale editor can never match the current row.
create or replace function public.journals_bump_rev() returns trigger as $$
begin
  if new.rev = old.rev then new.rev = old.rev + 1; end if;
  return new;
end $$ language plpgsql;

drop trigger if exists journals_bump_rev on public.journals;
create trigger journals_bump_rev before update on public.journals
  for each row execute function public.journals_bump_rev();
