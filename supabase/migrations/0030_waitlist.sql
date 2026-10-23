-- Lista de espera da consultoria nutricional integrada (início em junho de
-- 2027). Formulário público (lista-espera.html, sem login): qualquer um
-- insere, só com consentimento marcado; só o treinador lê e atualiza.
create table waitlist (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  whatsapp text not null,
  email text,
  objetivo text,
  ja_aluno text,
  modalidade text,
  mensagem text,
  consentimento boolean not null,
  origem text,
  status text not null default 'novo' check (status in ('novo', 'contatado', 'convertido', 'desistiu')),
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;

create policy "public joins waitlist" on waitlist for insert
  with check (consentimento = true and status = 'novo');
create policy "trainer manages waitlist" on waitlist for all
  using (is_trainer()) with check (is_trainer());
