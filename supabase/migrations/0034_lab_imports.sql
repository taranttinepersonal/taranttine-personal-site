-- Fase 2 dos exames: leitura do laudo (PDF ou foto) por IA.
-- 1) consentimento próprio para enviar exames à IA (termo versão 2026-10b);
-- 2) arquivo do laudo guardado no bucket privado lab-files, pasta = id do aluno;
-- 3) lab_imports guarda cada leitura (status + valores extraídos) até a
--    revisão; os valores só viram lab_results quando alguém confere e salva.
alter table consents add column uso_ia_exames boolean not null default false;
alter table lab_results add column arquivo text;

create table lab_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  arquivo text not null,
  media_type text not null,
  status text not null default 'pendente' check (status in ('pendente', 'lendo', 'pronto', 'erro')),
  resultado jsonb,
  erro text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on lab_imports (client_id, created_at desc);

alter table lab_imports enable row level security;

create policy "client and trainer manage lab imports" on lab_imports for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());

insert into storage.buckets (id, name, public) values ('lab-files', 'lab-files', false)
  on conflict (id) do nothing;

create policy "lab files read" on storage.objects for select
  using (bucket_id = 'lab-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_trainer()));
create policy "lab files upload" on storage.objects for insert
  with check (bucket_id = 'lab-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_trainer()));
create policy "lab files delete" on storage.objects for delete
  using (bucket_id = 'lab-files' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_trainer()));
