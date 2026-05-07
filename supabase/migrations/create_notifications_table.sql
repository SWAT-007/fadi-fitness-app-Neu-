-- Notifications for client-facing in-app bell.
-- Safe to run multiple times in the Supabase SQL editor.

create table if not exists notifications (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('message', 'training_plan', 'nutrition_plan', 'workout')),
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_client_created_idx
  on notifications (client_id, created_at desc);

create index if not exists notifications_client_unread_idx
  on notifications (client_id, is_read)
  where is_read = false;

alter table notifications enable row level security;

drop policy if exists "notifications_client_select" on notifications;
drop policy if exists "notifications_client_update" on notifications;
drop policy if exists "notifications_trainer_insert" on notifications;

create policy "notifications_client_select" on notifications
  for select using (client_id = auth.uid());

create policy "notifications_client_update" on notifications
  for update using (client_id = auth.uid())
  with check (client_id = auth.uid());

create policy "notifications_trainer_insert" on notifications
  for insert with check (
    type in ('message', 'training_plan', 'nutrition_plan', 'workout')
    and is_read = false
    and
    exists (
      select 1
      from clients c
      where c.user_id = notifications.client_id
        and c.trainer_id = auth.uid()
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;
