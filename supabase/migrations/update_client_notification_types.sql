-- Add the client-facing notification types used by the app.
-- Safe to run multiple times in the Supabase SQL editor.

alter table notifications drop constraint if exists notifications_type_check;

alter table notifications
  add constraint notifications_type_check
  check (type in ('message', 'training_plan', 'workout_plan', 'nutrition_plan', 'workout', 'checkin', 'request'));

drop policy if exists "notifications_trainer_insert" on notifications;

create policy "notifications_trainer_insert" on notifications
  for insert with check (
    type in ('message', 'training_plan', 'workout_plan', 'nutrition_plan', 'workout', 'checkin', 'request')
    and is_read = false
    and exists (
      select 1
      from clients c
      where c.user_id = notifications.client_id
        and c.trainer_id = auth.uid()
    )
  );
