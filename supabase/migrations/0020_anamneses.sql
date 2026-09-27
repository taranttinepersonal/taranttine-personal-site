-- Anamnese: online form submissions and presencial (in-person) evaluations,
-- unified in one table/flow. respostas jsonb mirrors anamnese.html's
-- collectData() output directly (label -> value), so the form's fields can
-- evolve without a migration each time — same approach as
-- postural_assessments.notes.
--
-- client_id is nullable: an online submission arrives before the client
-- account exists (anon insert, public form). It gets linked to the profile
-- when the trainer creates the account from that submission.
create table anamneses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles(id) on delete set null,
  source text not null default 'online' check (source in ('online', 'presencial')),
  full_name text,
  phone text,
  email text,
  recorded_at date not null default current_date,
  respostas jsonb not null,
  created_at timestamptz not null default now()
);
create index on anamneses (client_id);
create index on anamneses (phone) where client_id is null;

alter table anamneses enable row level security;

create policy "client reads own anamneses" on anamneses for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer manages anamneses" on anamneses for all
  using (is_trainer())
  with check (is_trainer());
-- Public form (anamnese.html, no login) inserts its own submission with
-- client_id left null — it can never read back or touch existing rows.
-- Not role-restricted (this project's publishable key doesn't map cleanly
-- to the literal "anon" Postgres role) — the check clause is what actually
-- gates it, same as everywhere else in this schema.
create policy "public submits online anamnese" on anamneses for insert
  with check (client_id is null and source = 'online');
