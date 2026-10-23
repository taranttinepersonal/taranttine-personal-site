-- Termo de consentimento (LGPD) aceito no app. Uma linha por aluno por
-- versão do termo (app/js/lib/consent.js). dados_saude é obrigatório para a
-- consultoria nutricional; uso_ia é opcional (estimativa de refeições por IA).
create table consents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  versao text not null,
  dados_saude boolean not null,
  uso_ia boolean not null default false,
  aceito_em timestamptz not null default now(),
  user_agent text,
  unique (client_id, versao)
);

alter table consents enable row level security;

create policy "client manages own consents" on consents for all
  using (client_id = auth.uid() or is_trainer())
  with check (client_id = auth.uid() or is_trainer());
