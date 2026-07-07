-- Taranttine Personal — Portal do Cliente
-- Migration 0001: core schema (profiles, exercise library, workout structure,
-- load history, diet toggle, announcements, push tokens) + RLS.
-- progress_entries/progress_photos and referrals are added in later migrations
-- (phases 6 and 7), kept out of this first pass on purpose.

-- ============ ROLES ============
create type user_role as enum ('client', 'trainer');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'client',
  full_name text not null,
  phone text,
  avatar_url text,
  active boolean not null default true,
  referral_code text unique,
  referred_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create or replace function is_trainer() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'trainer');
$$ language sql stable security definer;

alter table profiles enable row level security;
create policy "own profile" on profiles for select using (id = auth.uid() or is_trainer());
create policy "trainer manages profiles" on profiles for all using (is_trainer());

-- ============ EXERCISE LIBRARY (shared) ============
create table muscle_groups (
  id smallint primary key generated always as identity,
  name text not null unique
);

create table exercises (
  id text primary key,
  name text not null,
  muscle_group_id smallint not null references muscle_groups(id),
  gif_path text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on exercises (muscle_group_id);
create index on exercises using gin (tags);

alter table muscle_groups enable row level security;
alter table exercises enable row level security;
create policy "authenticated read muscle groups" on muscle_groups for select using (auth.role() = 'authenticated');
create policy "trainer writes muscle groups" on muscle_groups for all using (is_trainer());
create policy "authenticated read exercises" on exercises for select using (auth.role() = 'authenticated');
create policy "trainer writes exercises" on exercises for all using (is_trainer());

-- ============ WORKOUTS ============
create table workout_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  subtitle text,
  health_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index one_active_program_per_client
  on workout_programs (client_id) where (is_active);

create table workout_days (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references workout_programs(id) on delete cascade,
  label text not null,
  title text not null,
  sort_order smallint not null default 0
);

create table workout_sections (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references workout_days(id) on delete cascade,
  title text not null,
  icon text,
  sort_order smallint not null default 0
);

create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references workout_days(id) on delete cascade,
  section_id uuid references workout_sections(id) on delete set null,
  exercise_id text not null references exercises(id),
  sets text,
  reps text,
  rest_seconds smallint,
  method text,
  tip text,
  sort_order smallint not null default 0
);

alter table workout_programs enable row level security;
alter table workout_days enable row level security;
alter table workout_sections enable row level security;
alter table workout_exercises enable row level security;

create policy "client reads own program" on workout_programs for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer writes programs" on workout_programs for all using (is_trainer());

create policy "client reads own days" on workout_days for select
  using (exists (select 1 from workout_programs p where p.id = program_id and (p.client_id = auth.uid() or is_trainer())));
create policy "trainer writes days" on workout_days for all using (is_trainer());

create policy "client reads own sections" on workout_sections for select
  using (exists (
    select 1 from workout_days d join workout_programs p on p.id = d.program_id
    where d.id = workout_day_id and (p.client_id = auth.uid() or is_trainer())
  ));
create policy "trainer writes sections" on workout_sections for all using (is_trainer());

create policy "client reads own workout exercises" on workout_exercises for select
  using (exists (
    select 1 from workout_days d join workout_programs p on p.id = d.program_id
    where d.id = workout_day_id and (p.client_id = auth.uid() or is_trainer())
  ));
create policy "trainer writes workout exercises" on workout_exercises for all using (is_trainer());

-- ============ LOAD HISTORY & COMPLETIONS ============
-- client_id is denormalized here (not derived via join every read) to keep
-- the RLS check O(1) on the hottest read/write path in the app.
create table load_history (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  load_value text not null,
  logged_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (workout_exercise_id, logged_on)
);
create index on load_history (client_id, logged_on desc);

create table workout_completions (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  completed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (workout_exercise_id, completed_on)
);

alter table load_history enable row level security;
alter table workout_completions enable row level security;
create policy "client rw own load history" on load_history for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());
create policy "client rw own completions" on workout_completions for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());

-- ============ DIET (nullable/optional, off by default per client) ============
create table diet_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  title text,
  content_url text,
  content_text text,
  is_visible boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table diet_plans enable row level security;
create policy "client reads own visible diet" on diet_plans for select
  using ((client_id = auth.uid() and is_visible) or is_trainer());
create policy "trainer writes diet" on diet_plans for all using (is_trainer());

-- ============ ANNOUNCEMENTS ============
create table announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id),
  title text not null,
  body text not null,
  target_client_id uuid references profiles(id),
  sent_at timestamptz not null default now()
);
create table announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, client_id)
);

alter table announcements enable row level security;
alter table announcement_reads enable row level security;
create policy "client reads relevant announcements" on announcements for select
  using (target_client_id = auth.uid() or target_client_id is null or is_trainer());
create policy "trainer writes announcements" on announcements for insert with check (is_trainer());
create policy "client marks own reads" on announcement_reads for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());

-- ============ PUSH NOTIFICATIONS (FCM token registry) ============
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  fcm_token text not null unique,
  device_label text,
  created_at timestamptz not null default now()
);

alter table push_tokens enable row level security;
create policy "client manages own push tokens" on push_tokens for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());

-- ============ STORAGE BUCKETS ============
insert into storage.buckets (id, name, public) values ('exercise-gifs', 'exercise-gifs', true);
insert into storage.buckets (id, name, public) values ('diet-plan-files', 'diet-plan-files', false);

create policy "public read exercise gifs" on storage.objects for select
  using (bucket_id = 'exercise-gifs');
create policy "trainer writes exercise gifs" on storage.objects for insert
  with check (bucket_id = 'exercise-gifs' and is_trainer());

create policy "client reads own diet files" on storage.objects for select
  using (bucket_id = 'diet-plan-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "trainer writes diet files" on storage.objects for all
  using (bucket_id = 'diet-plan-files' and is_trainer());
