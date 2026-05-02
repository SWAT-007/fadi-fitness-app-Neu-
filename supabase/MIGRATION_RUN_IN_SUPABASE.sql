-- =============================================================
-- FITCOACH – CHECK-IN MIGRATION
-- =============================================================
-- ANLEITUNG:
--   1. Supabase Dashboard öffnen
--   2. SQL Editor → New Query
--   3. Diesen gesamten Inhalt hineinkopieren
--   4. "Run" klicken
--   5. Unten muss erscheinen: "Success. No rows returned"
--      ODER die beiden count()-Zeilen am Ende zeigen 0 Zeilen.
--
-- SICHER ZUM MEHRFACH-AUSFÜHREN (vollständig idempotent)
-- =============================================================


-- =============================================================
-- ABSCHNITT 1: TABELLE weekly_checkins
-- =============================================================
-- HINWEIS zu Spaltennamen:
--   Der App-Code sendet "body_weight", nicht "weight".
--   Die Spalte heißt daher body_weight.
--   "user_id" wird vom Code nicht gesendet und ist nullable.
-- =============================================================

create table if not exists weekly_checkins (
  id            uuid          primary key default gen_random_uuid(),
  client_id     uuid          not null references clients(id) on delete cascade,
  user_id       uuid          references auth.users(id) on delete set null, -- optional, nullable
  week_start    date          not null,
  body_weight   numeric,                                                     -- "weight" im Klartext
  mood          integer       check (mood          between 1 and 5),
  energy        integer       check (energy        between 1 and 5),
  sleep_quality integer       check (sleep_quality between 1 and 5),
  hunger        integer       check (hunger        between 1 and 5),
  stress        integer       check (stress        between 1 and 5),
  comment       text,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  unique (client_id, week_start)          -- wird von onConflict im Code benötigt
);

-- updated_at automatisch aktualisieren
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists weekly_checkins_set_updated_at on weekly_checkins;
create trigger weekly_checkins_set_updated_at
  before update on weekly_checkins
  for each row execute function set_updated_at();


-- =============================================================
-- ABSCHNITT 2: TABELLE checkin_images
-- =============================================================
-- HINWEIS zu Spaltennamen:
--   Der App-Code schreibt "storage_path" (nicht "image_url").
--   storage_path ist NOT NULL.
--   image_url ist optional/nullable (für direkten URL-Zugriff).
-- =============================================================

create table if not exists checkin_images (
  id           uuid        primary key default gen_random_uuid(),
  checkin_id   uuid        not null references weekly_checkins(id) on delete cascade,
  storage_path text        not null,   -- Pfad in Supabase Storage, z.B. "userId/checkinId/uuid.jpg"
  image_url    text,                   -- optionale öffentliche URL (nullable)
  created_at   timestamptz not null default now()
);


-- =============================================================
-- ABSCHNITT 3: ROW LEVEL SECURITY AKTIVIEREN
-- =============================================================

alter table weekly_checkins enable row level security;
alter table checkin_images  enable row level security;


-- =============================================================
-- ABSCHNITT 4: RLS-POLICIES weekly_checkins
-- Erst alle alten Policies löschen (idempotent)
-- =============================================================

drop policy if exists "checkins_client_all"     on weekly_checkins;
drop policy if exists "checkins_client_select"  on weekly_checkins;
drop policy if exists "checkins_client_insert"  on weekly_checkins;
drop policy if exists "checkins_client_update"  on weekly_checkins;
drop policy if exists "checkins_client_delete"  on weekly_checkins;
drop policy if exists "checkins_trainer_select" on weekly_checkins;
drop policy if exists "checkins_admin_select"   on weekly_checkins;

-- Client: eigene Check-ins lesen
create policy "checkins_client_select" on weekly_checkins
  for select
  using (
    exists (
      select 1 from clients c
      where  c.id      = client_id
        and  c.user_id = auth.uid()
    )
  );

-- Client: eigene Check-ins anlegen
create policy "checkins_client_insert" on weekly_checkins
  for insert
  with check (
    exists (
      select 1 from clients c
      where  c.id      = client_id
        and  c.user_id = auth.uid()
    )
  );

-- Client: eigene Check-ins bearbeiten
create policy "checkins_client_update" on weekly_checkins
  for update
  using (
    exists (
      select 1 from clients c
      where  c.id      = client_id
        and  c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from clients c
      where  c.id      = client_id
        and  c.user_id = auth.uid()
    )
  );

-- Client: eigene Check-ins löschen
create policy "checkins_client_delete" on weekly_checkins
  for delete
  using (
    exists (
      select 1 from clients c
      where  c.id      = client_id
        and  c.user_id = auth.uid()
    )
  );

-- Trainer sieht Check-ins seiner eigenen Clients
-- + Admin-E-Mail-Fallback (fadhel.alshadood@gmail.com sieht alles)
create policy "checkins_trainer_select" on weekly_checkins
  for select
  using (
    -- Normaler Trainer: Client gehört ihm
    exists (
      select 1 from clients c
      where  c.id         = client_id
        and  c.trainer_id = auth.uid()
    )
    -- Admin-Fallback per E-Mail
    or (select email from auth.users where id = auth.uid()) = 'fadhel.alshadood@gmail.com'
  );


-- =============================================================
-- ABSCHNITT 5: RLS-POLICIES checkin_images
-- =============================================================

drop policy if exists "ci_client_all"     on checkin_images;
drop policy if exists "ci_client_select"  on checkin_images;
drop policy if exists "ci_client_insert"  on checkin_images;
drop policy if exists "ci_client_delete"  on checkin_images;
drop policy if exists "ci_trainer_select" on checkin_images;

-- Client: eigene Bilder lesen
create policy "ci_client_select" on checkin_images
  for select
  using (
    exists (
      select 1
      from   weekly_checkins wc
      join   clients c on c.id = wc.client_id
      where  wc.id      = checkin_id
        and  c.user_id  = auth.uid()
    )
  );

-- Client: eigene Bilder hochladen
create policy "ci_client_insert" on checkin_images
  for insert
  with check (
    exists (
      select 1
      from   weekly_checkins wc
      join   clients c on c.id = wc.client_id
      where  wc.id      = checkin_id
        and  c.user_id  = auth.uid()
    )
  );

-- Client: eigene Bilder löschen
create policy "ci_client_delete" on checkin_images
  for delete
  using (
    exists (
      select 1
      from   weekly_checkins wc
      join   clients c on c.id = wc.client_id
      where  wc.id      = checkin_id
        and  c.user_id  = auth.uid()
    )
  );

-- Trainer + Admin: Bilder der eigenen Clients lesen
create policy "ci_trainer_select" on checkin_images
  for select
  using (
    exists (
      select 1
      from   weekly_checkins wc
      join   clients c on c.id = wc.client_id
      where  wc.id         = checkin_id
        and  c.trainer_id  = auth.uid()
    )
    or (select email from auth.users where id = auth.uid()) = 'fadhel.alshadood@gmail.com'
  );


-- =============================================================
-- ABSCHNITT 6: VERIFY
-- Diese Queries müssen ohne Fehler durchlaufen.
-- Ergebnis: jeweils 0 (leere Tabellen – das ist korrekt).
-- =============================================================

select 'weekly_checkins OK' as status, count(*) as rows from weekly_checkins;
select 'checkin_images OK'  as status, count(*) as rows from checkin_images;
