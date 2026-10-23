-- Exames laboratoriais do aluno (app/js/lib/labs.js). Uma linha por exame
-- por data. A referência é a do laboratório que fez o exame; fonte diz quem
-- registrou (aluno, treinador ou, na fase 2, leitura por IA).
create table lab_results (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  data date not null,
  analito text not null,
  valor numeric not null,
  unidade text,
  ref_min numeric,
  ref_max numeric,
  laboratorio text,
  fonte text not null default 'aluno' check (fonte in ('aluno', 'treinador', 'ia')),
  created_at timestamptz not null default now()
);
create index on lab_results (client_id, analito, data desc);

alter table lab_results enable row level security;

create policy "client and trainer manage lab results" on lab_results for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());
