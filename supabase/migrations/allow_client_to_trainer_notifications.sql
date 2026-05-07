-- Allow client-originated notifications to reach the trainer.
-- Safe to run multiple times in the Supabase SQL editor.

alter table notifications drop constraint if exists notifications_type_check;

alter table notifications
  add constraint notifications_type_check
  check (type in ('message', 'training_plan', 'nutrition_plan', 'workout', 'checkin'));

drop policy if exists "notifications_client_insert_to_trainer" on notifications;

create policy "notifications_client_insert_to_trainer" on notifications
  for insert with check (
    type in ('message', 'workout', 'checkin')
    and is_read = false
    and exists (
      select 1
      from clients c
      where c.user_id = auth.uid()
        and c.trainer_id = notifications.client_id
    )
  );
