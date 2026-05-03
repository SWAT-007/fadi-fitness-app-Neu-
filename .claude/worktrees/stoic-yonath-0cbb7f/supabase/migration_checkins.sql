-- Migration: Weekly Check-ins  (SAFE TO RE-RUN)
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run

-- =====================
-- TABLE
-- =====================

create table if not exists weekly_checkins (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  week_start date not null,
  body_weight numeric,
  mood int check (mood between 1 and 5),
  energy int check (energy between 1 and 5),
  sleep_quality int check (sleep_quality between 1 and 5),
  hunger int check (hunger between 1 and 5),
  stress int check (stress between 1 and 5),
  comment text,
  created_at timestamptz default now() not null,
  unique (client_id, week_start)
);

alter table weekly_checkins enable row level security;

-- =====================
-- RLS POLICIES
-- Drop old policies first so this file is safe to re-run
-- =====================

drop policy if exists "checkins_client_all"       on weekly_checkins;
drop policy if exists "checkins_client_select"    on weekly_checkins;
drop policy if exists "checkins_client_insert"    on weekly_checkins;
drop policy if exists "checkins_client_update"    on weekly_checkins;
drop policy if exists "checkins_trainer_select"   on weekly_checkins;

-- Client: SELECT own rows
create policy "checkins_client_select" on weekly_checkins
  for select
  using (
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.user_id = auth.uid()
    )
  );

-- Client: INSERT own rows  (explicit WITH CHECK required for INSERT)
create policy "checkins_client_insert" on weekly_checkins
  for insert
  with check (
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.user_id = auth.uid()
    )
  );

-- Client: UPDATE own rows
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

-- Trainer: SELECT their clients' check-ins
create policy "checkins_trainer_select" on weekly_checkins
  for select
  using (
    exists (
      select 1 from clients c
      where c.id = client_id
        and c.trainer_id = auth.uid()
    )
  );
