-- Anamnese nutricional em duas etapas, separada da anamnese de treino
-- (anamneses), porque fetchAnamneseHints lê a mais recente daquela tabela
-- para objetivo/medicamentos e o aluno não pode inserir lá.
--   etapa 1: o próprio aluno responde no app (rotina, recordatório 24h,
--            frequência alimentar, preferências)
--   etapa 2: o treinador preenche na consulta, pelo painel
-- respostas jsonb guarda label -> valor, como em anamneses, para os campos
-- evoluírem sem migração.
--
-- profiles.nutrition_consult: o treinador libera a consultoria por aluno no
-- painel; só quem tem a flag vê a etapa 1 no app.

alter table profiles add column if not exists nutrition_consult boolean not null default false;

create table nutrition_anamneses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  etapa smallint not null check (etapa in (1, 2)),
  respostas jsonb not null,
  recorded_at date not null default current_date,
  updated_at timestamptz not null default now(),
  unique (client_id, etapa)
);

alter table nutrition_anamneses enable row level security;

create policy "client reads own nutrition anamneses" on nutrition_anamneses for select
  using (client_id = auth.uid() or is_trainer());
create policy "client inserts own etapa 1" on nutrition_anamneses for insert
  with check ((client_id = auth.uid() and etapa = 1) or is_trainer());
create policy "client updates own etapa 1" on nutrition_anamneses for update
  using ((client_id = auth.uid() and etapa = 1) or is_trainer())
  with check ((client_id = auth.uid() and etapa = 1) or is_trainer());
create policy "trainer deletes nutrition anamneses" on nutrition_anamneses for delete
  using (is_trainer());
