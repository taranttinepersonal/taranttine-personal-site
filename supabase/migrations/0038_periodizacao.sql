-- Periodização dos presenciais (etapa 2): macrociclo de 16 semanas do FitPro e
-- Sinais do cliente. Só ACRESCENTA: nenhum dado existente muda.
--
-- workout_programs.meso_length / meso_deload (migração 0037) ficam no banco, mas
-- deixam de ser usados: o bloco repetido de N semanas foi substituído pelas fases.

-- Fases personalizadas deste programa (lista de {label, mesociclo, from, to, rir,
-- volume, repsDelta, loadFactor, isDeload}). Nulo = usa o padrão do FitPro
-- (Adaptação 1-4 · Desenvolvimento 5-10 · Intensificação 11-15 · Deload 16).
alter table workout_programs add column if not exists periodization jsonb;

-- Sinais do cliente por semana: o treinador registra e decide o deload (o app
-- só recomenda; "deload é por sinal real, não calendário").
create table if not exists weekly_signals (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references workout_programs(id) on delete cascade,
  client_id uuid not null references profiles(id) on delete cascade,
  week_no smallint not null check (week_no >= 1),
  evoluiu boolean,
  seguiu_plano boolean,
  recuperacao text check (recuperacao in ('boa', 'regular', 'ruim')),
  deload_aplicado boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  unique (program_id, week_no)
);

alter table weekly_signals enable row level security;
create policy "trainer manages weekly signals" on weekly_signals for all
  using (is_trainer())
  with check (is_trainer());
