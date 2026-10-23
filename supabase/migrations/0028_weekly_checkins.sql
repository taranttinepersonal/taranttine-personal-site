-- Check-in semanal de hábitos (consultoria nutricional). Uma linha por aluno
-- por semana (week_start = segunda-feira, horário local). respostas jsonb
-- usa as chaves de app/js/lib/checkin.js, para as perguntas evoluírem sem
-- migração. O aluno grava e corrige o da semana; o treinador lê tudo.
create table weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  respostas jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, week_start)
);
create index on weekly_checkins (client_id, week_start desc);

alter table weekly_checkins enable row level security;

create policy "client manages own checkins" on weekly_checkins for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());
