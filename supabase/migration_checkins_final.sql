-- ============================================================
-- FitCoach: Check-in Tables + RLS
-- DIESES FILE IN SUPABASE SQL EDITOR AUSFÜHREN
-- Dashboard → SQL Editor → New Query → Alles reinkopieren → Run
-- SICHER ZUM MEHRFACH-AUSFÜHREN (idempotent)
-- ============================================================

-- ============================================================
-- 1. TABELLE: weekly_checkins
-- ============================================================

create table if not exists weekly_checkins (
  id            uuid        default gen_random_uuid() primary key,
  client_id     uuid        not null references clients(id) on delete cascade,
  week_start    date        not null,
  body_weight   numeric,
  mood          int         check (mood between 1 and 5),
  energy        int         check (energy between 1 and 5),
  sleep_quality int         check (sleep_quality between 1 and 5),
  hunger        int         check (hunger between 1 and 5),
  stress        int         check (stress between 1 and 5),
  comment       text,
  created_at    timestamptz default now() not null,
  unique (client_id, week_start)
);

-- ============================================================
-- 2. TABELLE: checkin_images
-- ============================================================

create table if not exists checkin_images (
  id           uuid        default gen_random_uuid() primary key,
  checkin_id   uuid        not null references weekly_checkins(id) on delete cascade,
  storage_path text        not null,
  created_at   timestamptz default now() not null
);

-- ============================================================
-- 3. RLS AKTIVIEREN
-- ============================================================

alter table weekly_checkins enable row level security;
alter table checkin_images  enable row level security;

-- ============================================================
-- 4. POLICIES: weekly_checkins
-- Erst alle alten Policies löschen (damit idempotent)
-- ============================================================

drop policy if exists "checkins_client_all"    on weekly_checkins;
drop policy if exists "checkins_client_select" on weekly_checkins;
drop policy if exists "checkins_client_insert" on weekly_checkins;
drop policy if exists "checkins_client_update" on weekly_checkins;
drop policy if exists "checkins_client_delete" on weekly_checkins;
drop policy if exists "checkins_trainer_select" on weekly_checkins;
drop policy if exists "checkins_admin_select"   on weekly_checkins;

-- Client: SELECT eigene Check-ins
create policy "checkins_client_select" on weekly_checkins
  for select
  using (
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.user_id = auth.uid()
    )
  );

-- Client: INSERT eigene Check-ins
create policy "checkins_client_insert" on weekly_checkins
  for insert
  with check (
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.user_id = auth.uid()
    )
  );

-- Client: UPDATE eigene Check-ins
create policy "checkins_client_update" on weekly_checkins
  for update
  using (
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.user_id = auth.uid()
    )
  );

-- Client: DELETE eigene Check-ins
create policy "checkins_client_delete" on weekly_checkins
  for delete
  using (
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.user_id = auth.uid()
    )
  );

-- Trainer: SELECT Check-ins seiner Clients
-- + Admin-Email als Fallback
create policy "checkins_trainer_select" on weekly_checkins
  for select
  using (
    -- Trainer sieht Check-ins seiner eigenen Clients
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.trainer_id = auth.uid()
    )
    -- Admin-Email-Fallback (fadhel.alshadood@gmail.com)
    or (
      select email from auth.users where id = auth.uid()
    ) = 'fadhel.alshadood@gmail.com'
  );

-- ============================================================
-- 5. POLICIES: checkin_images
-- ============================================================

drop policy if exists "ci_client_all"     on checkin_images;
drop policy if exists "ci_client_select"  on checkin_images;
drop policy if exists "ci_client_insert"  on checkin_images;
drop policy if exists "ci_trainer_select" on checkin_images;

-- Client: SELECT eigene Bilder
create policy "ci_client_select" on checkin_images
  for select
  using (
    exists (
      select 1 from weekly_checkins wc
      join clients c on c.id = wc.client_id
      where wc.id = checkin_id
        and c.user_id = auth.uid()
    )
  );

-- Client: INSERT eigene Bilder
create policy "ci_client_insert" on checkin_images
  for insert
  with check (
    exists (
      select 1 from weekly_checkins wc
      join clients c on c.id = wc.client_id
      where wc.id = checkin_id
        and c.user_id = auth.uid()
    )
  );

-- Trainer + Admin: SELECT Bilder ihrer Clients
create policy "ci_trainer_select" on checkin_images
  for select
  using (
    exists (
      select 1 from weekly_checkins wc
      join clients c on c.id = wc.client_id
      where wc.id = checkin_id
        and c.trainer_id = auth.uid()
    )
    or (
      select email from auth.users where id = auth.uid()
    ) = 'fadhel.alshadood@gmail.com'
  );

-- ============================================================
-- 6. VERIFY: Tabellen müssen jetzt sichtbar sein
-- (Diese Queries sollen ohne Fehler laufen)
-- ============================================================

select count(*) as weekly_checkins_count from weekly_checkins;
select count(*) as checkin_images_count  from checkin_images;
