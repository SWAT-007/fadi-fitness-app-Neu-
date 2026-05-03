-- ============================================================
-- FitCoach: foods-Tabelle für OpenFoodFacts-Import
-- Idempotent: kann mehrfach ausgeführt werden
-- ============================================================
-- WICHTIG: Spaltennamen behalten das bestehende Schema (kcal_per_100g)
-- für Kompatibilität mit migration_nutrition_v2.sql und allem Code.
-- Zusätzliche Spalten (brand, source, source_id, barcode) sind optional.
-- ============================================================

-- 1. Tabelle anlegen falls nicht vorhanden
create table if not exists public.foods (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  category         text        not null default 'other'
                               check (category in ('protein','carbs','fat','vegetable','fruit','dairy','other')),
  kcal_per_100g    numeric     not null default 0,
  protein_per_100g numeric     not null default 0,
  carbs_per_100g   numeric     not null default 0,
  fat_per_100g     numeric     not null default 0,
  created_by       uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- 2. Optionale Spalten für OpenFoodFacts / Branded Foods
alter table public.foods add column if not exists brand     text;
alter table public.foods add column if not exists source    text default 'manual';
alter table public.foods add column if not exists source_id text;
alter table public.foods add column if not exists barcode   text;

-- 3. RLS aktivieren
alter table public.foods enable row level security;

-- 4. Policies aufräumen + neu setzen (alle eingeloggten User dürfen alles)
drop policy if exists "foods_read"             on public.foods;
drop policy if exists "foods_trainer_insert"   on public.foods;
drop policy if exists "foods_trainer_update"   on public.foods;
drop policy if exists "foods_trainer_delete"   on public.foods;
drop policy if exists "foods_trainer_write"    on public.foods;
drop policy if exists "foods_auth_select"      on public.foods;
drop policy if exists "foods_auth_insert"      on public.foods;
drop policy if exists "foods_auth_update"      on public.foods;
drop policy if exists "foods_auth_delete"      on public.foods;

create policy "foods_auth_select" on public.foods
  for select using (auth.role() = 'authenticated');

create policy "foods_auth_insert" on public.foods
  for insert with check (auth.role() = 'authenticated');

create policy "foods_auth_update" on public.foods
  for update using (auth.role() = 'authenticated');

create policy "foods_auth_delete" on public.foods
  for delete using (auth.role() = 'authenticated');

-- 5. Index für Suche + Source-Lookup
create index if not exists foods_name_idx     on public.foods (lower(name));
create index if not exists foods_source_idx   on public.foods (source, source_id);
create index if not exists foods_barcode_idx  on public.foods (barcode);

-- 6. Schema-Cache reload erzwingen (PostgREST)
notify pgrst, 'reload schema';

-- 7. Verify
select 'foods rows' as t, count(*) from public.foods;
