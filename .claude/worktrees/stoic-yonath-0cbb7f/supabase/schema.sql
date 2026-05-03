-- FitCoach App — Full Database Schema
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- =====================
-- TABLES
-- =====================

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  full_name text not null default '',
  role text not null default 'client' check (role in ('trainer', 'client')),
  avatar_url text,
  created_at timestamptz default now() not null
);

create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references profiles(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  notes text,
  created_at timestamptz default now() not null
);

create table if not exists workout_plans (
  id uuid default gen_random_uuid() primary key,
  trainer_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  description text,
  created_at timestamptz default now() not null
);

create table if not exists workout_days (
  id uuid default gen_random_uuid() primary key,
  plan_id uuid references workout_plans(id) on delete cascade not null,
  name text not null,
  description text,
  sort_order int not null default 0,
  created_at timestamptz default now() not null
);

create table if not exists exercises (
  id uuid default gen_random_uuid() primary key,
  day_id uuid references workout_days(id) on delete cascade not null,
  name text not null,
  description text,
  sets int not null default 3,
  reps text not null default '10',
  target_weight numeric,
  rest_seconds int default 90,
  note text,
  sort_order int not null default 0,
  created_at timestamptz default now() not null
);

create table if not exists assigned_plans (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  plan_id uuid references workout_plans(id) on delete cascade not null,
  assigned_at timestamptz default now() not null,
  is_active boolean default true not null
);

create table if not exists workout_logs (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  day_id uuid references workout_days(id) on delete cascade not null,
  date date not null default current_date,
  notes text,
  completed_at timestamptz,
  created_at timestamptz default now() not null
);

create table if not exists exercise_logs (
  id uuid default gen_random_uuid() primary key,
  workout_log_id uuid references workout_logs(id) on delete cascade not null,
  exercise_id uuid references exercises(id) on delete cascade not null,
  actual_weight numeric,
  actual_reps text,
  sets_done int,
  completed boolean default false not null,
  note text,
  created_at timestamptz default now() not null
);

create table if not exists progress_logs (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  date date not null default current_date,
  body_weight numeric,
  notes text,
  created_at timestamptz default now() not null
);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id) on delete cascade not null,
  receiver_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now() not null,
  read_at timestamptz
);

-- =====================
-- ROW LEVEL SECURITY
-- =====================

alter table profiles enable row level security;
alter table clients enable row level security;
alter table workout_plans enable row level security;
alter table workout_days enable row level security;
alter table exercises enable row level security;
alter table assigned_plans enable row level security;
alter table workout_logs enable row level security;
alter table exercise_logs enable row level security;
alter table progress_logs enable row level security;
alter table messages enable row level security;

-- profiles: users see all authenticated profiles (needed for messages/display)
create policy "profiles_select" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

-- clients
create policy "clients_trainer_all" on clients for all using (trainer_id = auth.uid());
create policy "clients_client_select" on clients for select using (user_id = auth.uid());

-- workout_plans
create policy "plans_trainer_all" on workout_plans for all using (trainer_id = auth.uid());
create policy "plans_client_select" on workout_plans for select using (
  exists (
    select 1 from assigned_plans ap
    join clients c on c.id = ap.client_id
    where ap.plan_id = workout_plans.id and c.user_id = auth.uid() and ap.is_active
  )
);

-- workout_days
create policy "days_trainer_all" on workout_days for all using (
  exists (select 1 from workout_plans wp where wp.id = plan_id and wp.trainer_id = auth.uid())
);
create policy "days_client_select" on workout_days for select using (
  exists (
    select 1 from workout_plans wp
    join assigned_plans ap on ap.plan_id = wp.id
    join clients c on c.id = ap.client_id
    where wp.id = plan_id and c.user_id = auth.uid() and ap.is_active
  )
);

-- exercises
create policy "exercises_trainer_all" on exercises for all using (
  exists (
    select 1 from workout_days wd
    join workout_plans wp on wp.id = wd.plan_id
    where wd.id = day_id and wp.trainer_id = auth.uid()
  )
);
create policy "exercises_client_select" on exercises for select using (
  exists (
    select 1 from workout_days wd
    join workout_plans wp on wp.id = wd.plan_id
    join assigned_plans ap on ap.plan_id = wp.id
    join clients c on c.id = ap.client_id
    where wd.id = day_id and c.user_id = auth.uid() and ap.is_active
  )
);

-- assigned_plans
create policy "assigned_trainer_all" on assigned_plans for all using (
  exists (select 1 from clients c where c.id = client_id and c.trainer_id = auth.uid())
);
create policy "assigned_client_select" on assigned_plans for select using (
  exists (select 1 from clients c where c.id = client_id and c.user_id = auth.uid())
);

-- workout_logs
create policy "wlog_client_all" on workout_logs for all using (
  exists (select 1 from clients c where c.id = client_id and c.user_id = auth.uid())
);
create policy "wlog_trainer_select" on workout_logs for select using (
  exists (select 1 from clients c where c.id = client_id and c.trainer_id = auth.uid())
);

-- exercise_logs
create policy "elog_client_all" on exercise_logs for all using (
  exists (
    select 1 from workout_logs wl
    join clients c on c.id = wl.client_id
    where wl.id = workout_log_id and c.user_id = auth.uid()
  )
);
create policy "elog_trainer_select" on exercise_logs for select using (
  exists (
    select 1 from workout_logs wl
    join clients c on c.id = wl.client_id
    where wl.id = workout_log_id and c.trainer_id = auth.uid()
  )
);

-- progress_logs
create policy "progress_client_all" on progress_logs for all using (
  exists (select 1 from clients c where c.id = client_id and c.user_id = auth.uid())
);
create policy "progress_trainer_select" on progress_logs for select using (
  exists (select 1 from clients c where c.id = client_id and c.trainer_id = auth.uid())
);

-- messages
create policy "messages_select" on messages for select
  using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "messages_insert" on messages for insert
  with check (sender_id = auth.uid());
create policy "messages_update_read" on messages for update
  using (receiver_id = auth.uid());

-- =====================
-- TRIGGER: auto-create profile on signup
-- =====================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'client')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
