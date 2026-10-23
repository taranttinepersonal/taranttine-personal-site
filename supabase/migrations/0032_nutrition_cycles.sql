-- Ciclos da consultoria nutricional (12 semanas). Uma linha por ciclo; o
-- mais recente é o atual. Ao fim, desfecho diz se o aluno renovou, foi para
-- manutenção ou encerrou. Pausa congela a contagem (até 30 dias).
create table nutrition_cycles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  tipo text not null default 'ciclo' check (tipo in ('ciclo', 'manutencao')),
  inicio date not null default current_date,
  semanas int not null default 12,
  status text not null default 'ativo' check (status in ('ativo', 'pausado', 'encerrado')),
  pausa_inicio date,
  pausa_dias int not null default 0,
  desfecho text check (desfecho in ('renovou', 'manutencao', 'encerrou')),
  encerrado_em date,
  created_at timestamptz not null default now()
);
create index on nutrition_cycles (client_id, created_at desc);

alter table nutrition_cycles enable row level security;

create policy "client reads own cycles" on nutrition_cycles for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer manages cycles" on nutrition_cycles for all
  using (is_trainer())
  with check (is_trainer());
