-- ============================================================
-- Macro-based meals: Trainer setzt Ziel-Makros pro Mahlzeit,
-- Kunde wählt Lebensmittel aus foods-DB selbst.
-- IDEMPOTENT — sicher mehrfach ausführbar.
-- ============================================================

-- 1. nutrition_meals erweitern: Ziel-Makros + erlaubte Kategorien
alter table nutrition_meals
  add column if not exists target_kcal        numeric not null default 0,
  add column if not exists target_protein     numeric not null default 0,
  add column if not exists target_carbs       numeric not null default 0,
  add column if not exists target_fat         numeric not null default 0,
  add column if not exists allowed_categories text[]  not null default array['protein','carbs','fat']::text[];

-- 2. Tabelle für die Auswahl des Kunden pro Mahlzeit
create table if not exists client_meal_foods (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references clients(id)         on delete cascade,
  meal_id     uuid        not null references nutrition_meals(id) on delete cascade,
  food_id     uuid        not null references foods(id)           on delete cascade,
  amount_g    numeric     not null default 100 check (amount_g >= 0),
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists client_meal_foods_client_idx on client_meal_foods(client_id);
create index if not exists client_meal_foods_meal_idx   on client_meal_foods(meal_id);

alter table client_meal_foods enable row level security;

-- Cleanup alter Policies (idempotent)
drop policy if exists "cmf_client_select"  on client_meal_foods;
drop policy if exists "cmf_client_write"   on client_meal_foods;
drop policy if exists "cmf_trainer_select" on client_meal_foods;

-- Kunde sieht/schreibt nur seine eigenen Einträge
create policy "cmf_client_select" on client_meal_foods
  for select using (
    exists (
      select 1 from clients c
      where c.id = client_meal_foods.client_id
        and c.user_id = auth.uid()
    )
  );

create policy "cmf_client_write" on client_meal_foods
  for all using (
    exists (
      select 1 from clients c
      where c.id = client_meal_foods.client_id
        and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from clients c
      where c.id = client_meal_foods.client_id
        and c.user_id = auth.uid()
    )
  );

-- Trainer darf die Auswahl seiner Kunden lesen (für Auswertung)
create policy "cmf_trainer_select" on client_meal_foods
  for select using (
    exists (
      select 1 from clients c
      where c.id = client_meal_foods.client_id
        and c.trainer_id = auth.uid()
    )
  );

-- ============================================================
-- Verifikation
-- ============================================================
select 'nutrition_meals OK'  as table, count(*) from nutrition_meals;
select 'client_meal_foods OK' as table, count(*) from client_meal_foods;
