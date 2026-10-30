-- Plano 50 Dias (promoção Black Friday, venda pela Greenn).
-- O comprador ganha um acesso de 50 dias corridos: a conta é criada pelo aviso
-- (webhook) da Greenn e a ficha é entregue no primeiro login, conforme o
-- questionário (nível + local). Nada aqui toca nos alunos atuais: as colunas
-- novas ficam nulas pra eles.

alter table profiles add column if not exists plan text;                  -- 'plano50' ou nulo
alter table profiles add column if not exists plan_started_at timestamptz;
alter table profiles add column if not exists access_expires_at timestamptz;
alter table profiles add column if not exists plan_template text;         -- ex.: academia_iniciante
alter table profiles add column if not exists plan_hold boolean not null default false; -- triagem positiva: aguardando o treinador

-- Uma linha por venda da Greenn (idempotência do webhook + contagem das 50 vagas).
create table if not exists plan50_orders (
  id uuid primary key default gen_random_uuid(),
  greenn_sale_id text not null unique,
  client_id uuid references profiles(id) on delete set null,
  email text not null,
  full_name text,
  phone text,
  status text not null default 'paid' check (status in ('paid', 'refunded', 'chargedback')),
  amount numeric,
  note text,
  raw jsonb,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists plan50_orders_status_idx on plan50_orders (status);

alter table plan50_orders enable row level security;

-- Só o treinador lê/edita; o webhook e o questionário usam a chave de serviço
-- (que ignora RLS). O aluno nunca vê esta tabela.
create policy "trainer manages plan50 orders" on plan50_orders for all
  using (is_trainer()) with check (is_trainer());
