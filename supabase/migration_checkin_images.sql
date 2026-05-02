-- Migration: Check-in Images  (SAFE TO RE-RUN)
-- Run AFTER migration_checkins.sql
--
-- STORAGE SETUP (one-time, in Supabase Dashboard):
--   1. Storage → New bucket
--   2. Name: "checkin-images"
--   3. Public: OFF (private)
--   4. Then run the storage policies below

-- =====================
-- TABLE
-- =====================

create table if not exists checkin_images (
  id uuid default gen_random_uuid() primary key,
  checkin_id uuid references weekly_checkins(id) on delete cascade not null,
  storage_path text not null,
  created_at timestamptz default now() not null
);

alter table checkin_images enable row level security;

-- =====================
-- DB TABLE RLS
-- =====================

drop policy if exists "ci_client_all"       on checkin_images;
drop policy if exists "ci_client_select"    on checkin_images;
drop policy if exists "ci_client_insert"    on checkin_images;
drop policy if exists "ci_trainer_select"   on checkin_images;

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

create policy "ci_trainer_select" on checkin_images
  for select
  using (
    exists (
      select 1 from weekly_checkins wc
      join clients c on c.id = wc.client_id
      where wc.id = checkin_id
        and c.trainer_id = auth.uid()
    )
  );

-- =====================
-- STORAGE POLICIES
-- Run in SQL Editor → these target storage.objects
-- =====================

drop policy if exists "checkin_images_upload" on storage.objects;
drop policy if exists "checkin_images_read"   on storage.objects;
drop policy if exists "checkin_images_delete" on storage.objects;

create policy "checkin_images_upload" on storage.objects
  for insert with check (
    bucket_id = 'checkin-images'
    and auth.role() = 'authenticated'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "checkin_images_read" on storage.objects
  for select using (
    bucket_id = 'checkin-images'
    and auth.role() = 'authenticated'
  );

create policy "checkin_images_delete" on storage.objects
  for delete using (
    bucket_id = 'checkin-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
