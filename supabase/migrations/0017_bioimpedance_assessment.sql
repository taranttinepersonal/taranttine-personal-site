-- Avaliação por bioimpedância (ex: InBody), feita numa clínica parceira e trazida
-- pelo cliente/treinador. Roda em paralelo à avaliação de dobras cutâneas —
-- os dois métodos não são comparáveis entre si, então não reaproveitamos a
-- tabela skinfold_assessments. attachment_path guarda a foto/PDF do laudo
-- completo (dados segmentares, pontuação InBody etc.) sem precisar de uma
-- coluna por campo.
create table bioimpedance_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  recorded_at date not null default current_date,
  peso numeric,
  percentual_gordura numeric,
  massa_muscular_esqueletica numeric,
  massa_gordura numeric,
  gordura_visceral numeric,
  relacao_cintura_quadril numeric,
  taxa_metabolica_basal numeric,
  attachment_path text,
  general_note text,
  created_at timestamptz not null default now()
);

alter table bioimpedance_assessments enable row level security;
create policy "client reads own bioimpedance assessments" on bioimpedance_assessments for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer manages bioimpedance assessments" on bioimpedance_assessments for all
  using (is_trainer())
  with check (is_trainer());
