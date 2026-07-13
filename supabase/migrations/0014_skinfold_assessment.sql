-- Protocolo de 7 dobras (Jackson & Pollock). Guarda as dobras cruas em mm;
-- densidade corporal e %gordura são calculadas no app a partir delas (fórmula
-- única, sem duplicar cálculo salvo que possa ficar desatualizado).
alter table profiles add column sexo text check (sexo in ('M', 'F'));

create table skinfold_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  recorded_at date not null default current_date,
  sexo text not null check (sexo in ('M', 'F')),
  peitoral numeric,
  axilar_media numeric,
  triceps numeric,
  subescapular numeric,
  abdominal numeric,
  suprailiaca numeric,
  coxa numeric,
  general_note text,
  created_at timestamptz not null default now()
);

alter table skinfold_assessments enable row level security;
create policy "client reads own skinfold assessments" on skinfold_assessments for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer manages skinfold assessments" on skinfold_assessments for all
  using (is_trainer())
  with check (is_trainer());
