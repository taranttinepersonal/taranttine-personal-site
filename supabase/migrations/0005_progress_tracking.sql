-- Phase 6: progress tracking (weight, measurements, photos).
-- Clients log their own entries; trainer can read/manage everyone's.

create table progress_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  recorded_at date not null default current_date,
  weight_kg numeric(5,2),
  body_fat_pct numeric(4,1),
  measurements jsonb,
  note text,
  created_at timestamptz not null default now()
);

alter table progress_entries enable row level security;
create policy "client manages own progress entries" on progress_entries for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());

create table progress_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  storage_path text not null,
  recorded_at date not null default current_date,
  created_at timestamptz not null default now()
);

alter table progress_photos enable row level security;
create policy "client manages own progress photos" on progress_photos for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());

insert into storage.buckets (id, name, public) values ('progress-photos', 'progress-photos', false);

create policy "client reads own progress photos" on storage.objects for select
  using (bucket_id = 'progress-photos' and ((storage.foldername(name))[1] = auth.uid()::text or is_trainer()));
create policy "client writes own progress photos" on storage.objects for insert
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "client deletes own progress photos" on storage.objects for delete
  using (bucket_id = 'progress-photos' and ((storage.foldername(name))[1] = auth.uid()::text or is_trainer()));
