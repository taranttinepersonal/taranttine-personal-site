-- Postural assessment, filled by the trainer during a presencial evaluation.
-- notes jsonb holds one free-text observation per checklist item, keyed by
-- item id (e.g. "ombros", "cabeca") so the checklist can evolve without a
-- schema migration each time.
create table postural_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  recorded_at date not null default current_date,
  notes jsonb,
  general_note text,
  created_at timestamptz not null default now()
);

alter table postural_assessments enable row level security;
create policy "client reads own postural assessments" on postural_assessments for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer manages postural assessments" on postural_assessments for all
  using (is_trainer())
  with check (is_trainer());
