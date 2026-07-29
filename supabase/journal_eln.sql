-- ─────────────────────────────────────────────────────────────────────────────
-- ELN upgrade for Lab Journal: immutable version history + Part 11-style
-- electronic signatures. Rows are append-only (no UPDATE/DELETE policies), so the
-- history is tamper-evident. Run this in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.journal_versions (
  id             uuid primary key default gen_random_uuid(),
  entry_id       uuid not null references public.journals(id) on delete cascade,
  version_no     int  not null,
  content        text not null default '',
  content_hash   text not null,                 -- SHA-256 of content (integrity)
  author_id      uuid,
  author_email   text,
  change_summary text default '',
  created_at     timestamptz not null default now(),
  -- Signature block — null until the version is signed. A signed row is a locked
  -- snapshot; signature_hash binds signer + time + meaning + content together.
  signed            boolean not null default false,
  signed_by_email   text,
  signed_at         timestamptz,
  signature_meaning text,
  signature_hash    text,
  unique (entry_id, version_no)
);

alter table public.journal_versions enable row level security;

-- Readable if you can see the parent journal (owner / lab-wide / shared-with).
drop policy if exists "jv read visible" on public.journal_versions;
create policy "jv read visible" on public.journal_versions for select using (
  exists (
    select 1 from public.journals j where j.id = entry_id and (
      j.owner_id = auth.uid()
      or j.scope = 'Lab'
      or (auth.jwt() ->> 'email') = any(j.shared_with)
    )
  )
);

-- Appendable if you can see the parent journal and you are the author.
drop policy if exists "jv append" on public.journal_versions;
create policy "jv append" on public.journal_versions for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from public.journals j where j.id = entry_id and (
      j.owner_id = auth.uid()
      or j.scope = 'Lab'
      or (auth.jwt() ->> 'email') = any(j.shared_with)
    )
  )
);

-- No UPDATE / DELETE policies on purpose: versions are immutable once written.

create index if not exists journal_versions_entry_idx on public.journal_versions(entry_id, version_no desc);
