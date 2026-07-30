-- ─────────────────────────────────────────────────────────────────────────────
-- Phase Predictor "saved conditions" — named, reusable search-space presets.
-- Personal (only you) or Global (shared with the lab). Stores just the config,
-- not experiment points (those live in phase_datasets). Run in the SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.phase_conditions (
  item_id    text primary key,
  owner_id   uuid not null,
  scope      text not null default 'Personal',   -- 'Personal' | 'Global'
  name       text,
  data       jsonb,                                -- the Phase Predictor config
  created_at timestamptz not null default now()
);

alter table public.phase_conditions enable row level security;

-- Read your own presets and any shared Lab-wide.
drop policy if exists "phase_conditions read" on public.phase_conditions;
create policy "phase_conditions read" on public.phase_conditions for select
  using (owner_id = auth.uid() or scope = 'Global');

-- Create / update / delete only your own.
drop policy if exists "phase_conditions insert" on public.phase_conditions;
create policy "phase_conditions insert" on public.phase_conditions for insert
  with check (owner_id = auth.uid());

drop policy if exists "phase_conditions update" on public.phase_conditions;
create policy "phase_conditions update" on public.phase_conditions for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "phase_conditions delete" on public.phase_conditions;
create policy "phase_conditions delete" on public.phase_conditions for delete
  using (owner_id = auth.uid());
