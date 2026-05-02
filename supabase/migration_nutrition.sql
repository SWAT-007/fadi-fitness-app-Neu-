-- ============================================================
-- FitCoach: Nutrition Plan Tables + RLS
-- DIESES FILE IN SUPABASE SQL EDITOR AUSFÜHREN
-- Sicher zum mehrfach Ausführen (idempotent)
-- ============================================================

-- ============================================================
-- 1. TABELLEN
-- ============================================================

create table if not exists nutrition_plans (
  id               uuid        primary key default gen_random_uuid(),
  trainer_id       uuid        not null references profiles(id) on delete cascade,
  name             text        not null,
  description      text,
  goal             text        not null default 'maintain'
                               check (goal in ('cut', 'bulk', 'maintain')),
  target_calories  int         not null default 2000,
  target_protein   int         not null default 150,
  target_carbs     int         not null default 200,
  target_fat       int         not null default 70,
  created_at       timestamptz not null default now()
);

create table if not exists nutrition_meals (
  id           uuid        primary key default gen_random_uuid(),
  plan_id      uuid        not null references nutrition_plans(id) on delete cascade,
  name         text        not null,
  sort_order   int         not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists nutrition_foods (
  id           uuid        primary key default gen_random_uuid(),
  meal_id      uuid        not null references nutrition_meals(id) on delete cascade,
  name         text        not null,
  amount_g     numeric     not null default 100,
  calories     numeric     not null default 0,
  protein      numeric     not null default 0,
  carbs        numeric     not null default 0,
  fat          numeric     not null default 0,
  sort_order   int         not null default 0,
  created_at   timestamptz not null default now()
);

create table if not exists assigned_nutrition_plans (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null references clients(id) on delete cascade,
  plan_id      uuid        not null references nutrition_plans(id) on delete cascade,
  assigned_at  timestamptz not null default now(),
  is_active    boolean     not null default true,
  unique (client_id, plan_id)
);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

alter table nutrition_plans          enable row level security;
alter table nutrition_meals          enable row level security;
alter table nutrition_foods          enable row level security;
alter table assigned_nutrition_plans enable row level security;

-- ============================================================
-- 3. POLICIES: nutrition_plans
-- ============================================================

drop policy if exists "nplans_trainer_all"    on nutrition_plans;
drop policy if exists "nplans_client_select"  on nutrition_plans;

-- Trainer: voller Zugriff auf eigene Pläne
create policy "nplans_trainer_all" on nutrition_plans
  for all using (trainer_id = auth.uid());

-- Client: lesen wenn Plan ihm zugewiesen und aktiv
create policy "nplans_client_select" on nutrition_plans
  for select using (
    exists (
      select 1 from assigned_nutrition_plans anp
      join clients c on c.id = anp.client_id
      where anp.plan_id = nutrition_plans.id
        and c.user_id   = auth.uid()
        and anp.is_active
    )
  );

-- ============================================================
-- 4. POLICIES: nutrition_meals
-- ============================================================

drop policy if exists "nmeals_trainer_all"   on nutrition_meals;
drop policy if exists "nmeals_client_select" on nutrition_meals;

create policy "nmeals_trainer_all" on nutrition_meals
  for all using (
    exists (
      select 1 from nutrition_plans np
      where np.id = plan_id and np.trainer_id = auth.uid()
    )
  );

create policy "nmeals_client_select" on nutrition_meals
  for select using (
    exists (
      select 1 from nutrition_plans np
      join assigned_nutrition_plans anp on anp.plan_id = np.id
      join clients c on c.id = anp.client_id
      where np.id = plan_id
        and c.user_id = auth.uid()
        and anp.is_active
    )
  );

-- ============================================================
-- 5. POLICIES: nutrition_foods
-- ============================================================

drop policy if exists "nfoods_trainer_all"   on nutrition_foods;
drop policy if exists "nfoods_client_select" on nutrition_foods;

create policy "nfoods_trainer_all" on nutrition_foods
  for all using (
    exists (
      select 1 from nutrition_meals nm
      join nutrition_plans np on np.id = nm.plan_id
      where nm.id = meal_id and np.trainer_id = auth.uid()
    )
  );

create policy "nfoods_client_select" on nutrition_foods
  for select using (
    exists (
      select 1 from nutrition_meals nm
      join nutrition_plans np on np.id = nm.plan_id
      join assigned_nutrition_plans anp on anp.plan_id = np.id
      join clients c on c.id = anp.client_id
      where nm.id = meal_id
        and c.user_id = auth.uid()
        and anp.is_active
    )
  );

-- ============================================================
-- 6. POLICIES: assigned_nutrition_plans
-- ============================================================

drop policy if exists "anp_trainer_all"   on assigned_nutrition_plans;
drop policy if exists "anp_client_select" on assigned_nutrition_plans;

create policy "anp_trainer_all" on assigned_nutrition_plans
  for all using (
    exists (
      select 1 from clients c
      where c.id = client_id and c.trainer_id = auth.uid()
    )
  );

create policy "anp_client_select" on assigned_nutrition_plans
  for select using (
    exists (
      select 1 from clients c
      where c.id = client_id and c.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. VERIFY
-- ============================================================

select 'nutrition_plans OK'          as table, count(*) from nutrition_plans;
select 'nutrition_meals OK'          as table, count(*) from nutrition_meals;
select 'nutrition_foods OK'          as table, count(*) from nutrition_foods;
select 'assigned_nutrition_plans OK' as table, count(*) from assigned_nutrition_plans;
