-- ─────────────────────────────────────────────────────────────────────────────
-- Übungs-Datenbank (analog zu foods)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists exercise_library (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  muscle_group text,
  equipment text,
  image_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now() not null
);

create index if not exists exercise_library_name_idx on exercise_library (name);

alter table exercises add column if not exists image_url text;
alter table exercises add column if not exists library_id uuid references exercise_library(id) on delete set null;

-- RLS: alle authentifizierten User dürfen lesen, nur Trainer dürfen schreiben.
alter table exercise_library enable row level security;

drop policy if exists "exercise_library_select" on exercise_library;
create policy "exercise_library_select" on exercise_library
  for select using (auth.role() = 'authenticated');

drop policy if exists "exercise_library_insert_trainer" on exercise_library;
create policy "exercise_library_insert_trainer" on exercise_library
  for insert with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'trainer')
  );

drop policy if exists "exercise_library_update_owner" on exercise_library;
create policy "exercise_library_update_owner" on exercise_library
  for update using (created_by = auth.uid());

drop policy if exists "exercise_library_delete_owner" on exercise_library;
create policy "exercise_library_delete_owner" on exercise_library
  for delete using (created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage-Bucket für Übungsbilder (öffentlich lesbar)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('exercise-images', 'exercise-images', true)
on conflict (id) do nothing;

drop policy if exists "exercise_images_public_read" on storage.objects;
create policy "exercise_images_public_read" on storage.objects
  for select using (bucket_id = 'exercise-images');

drop policy if exists "exercise_images_trainer_write" on storage.objects;
create policy "exercise_images_trainer_write" on storage.objects
  for insert with check (
    bucket_id = 'exercise-images'
    and exists (select 1 from profiles where id = auth.uid() and role = 'trainer')
  );

drop policy if exists "exercise_images_trainer_delete" on storage.objects;
create policy "exercise_images_trainer_delete" on storage.objects
  for delete using (
    bucket_id = 'exercise-images'
    and exists (select 1 from profiles where id = auth.uid() and role = 'trainer')
  );
