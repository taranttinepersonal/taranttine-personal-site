-- Relatório de avaliação em PDF, gerado a partir da tela de Relatório e
-- arquivado por cliente para permitir comparação entre avaliações passadas.
create table assessment_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  recorded_at date not null default current_date,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index on assessment_reports (client_id, recorded_at desc);

alter table assessment_reports enable row level security;
create policy "client reads own assessment reports" on assessment_reports for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer manages assessment reports" on assessment_reports for all
  using (is_trainer()) with check (is_trainer());

insert into storage.buckets (id, name, public) values ('assessment-reports', 'assessment-reports', false);

create policy "client reads own assessment report files" on storage.objects for select
  using (bucket_id = 'assessment-reports' and ((storage.foldername(name))[1] = auth.uid()::text or is_trainer()));
create policy "trainer writes assessment report files" on storage.objects for insert
  with check (bucket_id = 'assessment-reports' and is_trainer());
create policy "trainer deletes assessment report files" on storage.objects for delete
  using (bucket_id = 'assessment-reports' and is_trainer());
