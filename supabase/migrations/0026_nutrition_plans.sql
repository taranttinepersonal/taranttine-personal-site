-- Plano alimentar estruturado, gerado na aba Prescrição do painel.
-- plan jsonb é uma fotografia completa do que foi entregue (refeições,
-- quantidades, trocas, metas, orientações), para o app mostrar e o PDF
-- reimprimir sem depender de recalcular. Cada envio é uma linha nova; o app
-- mostra o mais recente.
create table nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  plan jsonb not null,
  created_at timestamptz not null default now()
);
create index on nutrition_plans (client_id, created_at desc);

alter table nutrition_plans enable row level security;

create policy "client reads own nutrition plans" on nutrition_plans for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer manages nutrition plans" on nutrition_plans for all
  using (is_trainer())
  with check (is_trainer());
