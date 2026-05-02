-- ============================================================
-- FitCoach: Nutrition v2 – Lebensmittel-DB + Tauschsystem
-- SICHER ZUM MEHRFACH-AUSFÜHREN (idempotent)
-- ============================================================

-- ============================================================
-- 1. LEBENSMITTEL-DATENBANK
-- ============================================================

create table if not exists foods (
  id               uuid        primary key default gen_random_uuid(),
  name             text        not null,
  category         text        not null default 'other'
                               check (category in ('protein','carbs','fat','vegetable','fruit','dairy','other')),
  kcal_per_100g    numeric     not null default 0,
  protein_per_100g numeric     not null default 0,
  carbs_per_100g   numeric     not null default 0,
  fat_per_100g     numeric     not null default 0,
  created_by       uuid        references profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- 2. nutrition_foods ERWEITERN
-- ============================================================

alter table nutrition_foods
  add column if not exists food_id   uuid    references foods(id) on delete set null,
  add column if not exists swappable boolean not null default false;

-- ============================================================
-- 3. TAUSCH-OPTIONEN (Trainer definiert erlaubte Ersatz-Lebensmittel)
-- ============================================================

create table if not exists food_swap_options (
  id                 uuid        primary key default gen_random_uuid(),
  nutrition_food_id  uuid        not null references nutrition_foods(id) on delete cascade,
  food_id            uuid        not null references foods(id) on delete cascade,
  created_at         timestamptz not null default now(),
  unique (nutrition_food_id, food_id)
);

-- ============================================================
-- 4. CLIENT-TAUSCHE (aktive Tausche des Kunden)
-- ============================================================

create table if not exists client_food_swaps (
  id                 uuid        primary key default gen_random_uuid(),
  client_id          uuid        not null references clients(id) on delete cascade,
  nutrition_food_id  uuid        not null references nutrition_foods(id) on delete cascade,
  food_id            uuid        not null references foods(id) on delete cascade,
  amount_g           numeric     not null default 100,
  created_at         timestamptz not null default now(),
  unique (client_id, nutrition_food_id)
);

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================

alter table foods              enable row level security;
alter table food_swap_options  enable row level security;
alter table client_food_swaps  enable row level security;

-- foods: alle eingeloggten User dürfen lesen, Trainer dürfen eigene anlegen
drop policy if exists "foods_read"         on foods;
drop policy if exists "foods_trainer_write" on foods;
drop policy if exists "foods_trainer_delete" on foods;

create policy "foods_read" on foods
  for select using (auth.role() = 'authenticated');

create policy "foods_trainer_insert" on foods
  for insert with check (
    created_by = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'trainer')
  );

create policy "foods_trainer_update" on foods
  for update using (created_by = auth.uid());

create policy "foods_trainer_delete" on foods
  for delete using (created_by = auth.uid());

-- food_swap_options: Trainer des Plans verwalten, Clients lesen
drop policy if exists "fso_trainer_all"   on food_swap_options;
drop policy if exists "fso_client_select" on food_swap_options;

create policy "fso_trainer_all" on food_swap_options
  for all using (
    exists (
      select 1 from nutrition_foods nf
      join nutrition_meals nm on nm.id = nf.meal_id
      join nutrition_plans np on np.id = nm.plan_id
      where nf.id = nutrition_food_id and np.trainer_id = auth.uid()
    )
  );

create policy "fso_client_select" on food_swap_options
  for select using (
    exists (
      select 1 from nutrition_foods nf
      join nutrition_meals nm on nm.id = nf.meal_id
      join nutrition_plans np on np.id = nm.plan_id
      join assigned_nutrition_plans anp on anp.plan_id = np.id
      join clients c on c.id = anp.client_id
      where nf.id = nutrition_food_id and c.user_id = auth.uid() and anp.is_active
    )
  );

-- client_food_swaps
drop policy if exists "cfs_client_all"    on client_food_swaps;
drop policy if exists "cfs_trainer_select" on client_food_swaps;

create policy "cfs_client_all" on client_food_swaps
  for all using (
    exists (select 1 from clients c where c.id = client_id and c.user_id = auth.uid())
  );

create policy "cfs_trainer_select" on client_food_swaps
  for select using (
    exists (select 1 from clients c where c.id = client_id and c.trainer_id = auth.uid())
  );

-- ============================================================
-- 6. SEED-DATEN – 40 Lebensmittel (idempotent via NOT EXISTS)
-- ============================================================

insert into foods (name, category, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g)
select v.name, v.category, v.kcal, v.protein, v.carbs, v.fat
from (values
  -- PROTEINQUELLEN
  ('Hähnchenbrust',          'protein',   110,  23.0,  0.0,  2.0),
  ('Pute (Brust)',           'protein',   104,  22.0,  0.0,  1.5),
  ('Lachs',                  'protein',   208,  20.0,  0.0, 13.0),
  ('Thunfisch (Dose, Wasser)','protein',  100,  22.0,  0.0,  1.0),
  ('Rinderhack (mager)',     'protein',   176,  21.0,  0.0, 10.0),
  ('Eier',                   'protein',   155,  13.0,  1.0, 11.0),
  ('Whey Protein',           'protein',   380,  74.0,  8.0,  5.0),
  ('Tofu',                   'protein',    76,   8.0,  2.0,  4.0),
  ('Kichererbsen (gegart)',  'protein',   164,   9.0, 27.0,  3.0),
  ('Linsen (gegart)',        'protein',   116,   9.0, 20.0,  0.5),
  ('Mageres Rind',           'protein',   150,  22.0,  0.0,  6.0),
  ('Garnelen',               'protein',    85,  18.0,  0.0,  1.0),
  -- MILCHPRODUKTE
  ('Skyr (natur)',           'dairy',      63,  11.0,  4.0,  0.2),
  ('Magerquark',             'dairy',      67,  12.0,  4.0,  0.2),
  ('Griechischer Joghurt 0%','dairy',      57,  10.0,  4.0,  0.2),
  ('Hüttenkäse',             'dairy',      72,  12.0,  3.0,  2.0),
  ('Vollmilch',              'dairy',      61,   3.2,  4.7,  3.3),
  ('Mozzarella',             'dairy',     254,  18.0,  3.0, 19.0),
  -- KOHLENHYDRATQUELLEN
  ('Reis (gekocht)',         'carbs',     130,   2.7, 28.0,  0.3),
  ('Haferflocken',           'carbs',     370,  13.0, 60.0,  7.0),
  ('Kartoffeln (gekocht)',   'carbs',      77,   2.0, 17.0,  0.1),
  ('Süßkartoffeln',          'carbs',      86,   2.0, 20.0,  0.1),
  ('Pasta (gekocht)',        'carbs',     131,   5.0, 25.0,  1.0),
  ('Vollkornbrot',           'carbs',     247,   9.0, 43.0,  4.0),
  ('Quinoa (gekocht)',       'carbs',     120,   4.0, 21.0,  2.0),
  ('Vollkorn-Toastbrot',     'carbs',     248,  10.0, 41.0,  4.0),
  ('Banane',                 'fruit',      89,   1.1, 23.0,  0.3),
  -- FETTQUELLEN
  ('Olivenöl',               'fat',       884,   0.0,  0.0,100.0),
  ('Avocado',                'fat',       160,   2.0,  9.0, 15.0),
  ('Erdnussbutter',          'fat',       598,  25.0, 20.0, 50.0),
  ('Mandeln',                'fat',       575,  21.0, 22.0, 49.0),
  ('Walnüsse',               'fat',       654,  15.0, 14.0, 65.0),
  ('Cashews',                'fat',       553,  18.0, 30.0, 44.0),
  -- GEMÜSE
  ('Brokkoli',               'vegetable',  34,   3.0,  7.0,  0.4),
  ('Spinat',                 'vegetable',  23,   3.0,  3.0,  0.4),
  ('Paprika (rot)',          'vegetable',  31,   1.0,  6.0,  0.3),
  ('Gurke',                  'vegetable',  12,   0.7,  1.8,  0.1),
  ('Tomate',                 'vegetable',  18,   0.9,  3.5,  0.2),
  ('Karotte',                'vegetable',  41,   0.9, 10.0,  0.2),
  ('Blumenkohl',             'vegetable',  25,   2.0,  5.0,  0.3),
  -- OBST
  ('Apfel',                  'fruit',      52,   0.3, 14.0,  0.2),
  ('Erdbeeren',              'fruit',      32,   0.7,  8.0,  0.3),
  ('Blaubeeren',             'fruit',      57,   0.7, 14.0,  0.3),
  ('Orange',                 'fruit',      47,   0.9, 12.0,  0.1)
) as v(name, category, kcal, protein, carbs, fat)
where not exists (select 1 from foods f where f.name = v.name and f.created_by is null);

-- ============================================================
-- 7. VERIFY
-- ============================================================

select 'foods'             as t, count(*) from foods;
select 'food_swap_options' as t, count(*) from food_swap_options;
select 'client_food_swaps' as t, count(*) from client_food_swaps;
