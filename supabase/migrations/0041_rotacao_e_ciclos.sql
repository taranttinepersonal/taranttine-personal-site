-- Rotação de exercícios (blocos de 4/6 semanas) e novos ciclos de 16 semanas dos presenciais.
-- Só ACRESCENTA colunas opcionais; nenhum dado existente muda.
--
-- block_weeks: duração do bloco de rotação (4 = iniciante/adaptação, 6 = intermediário/avançado).
--   O INÍCIO do bloco é workout_programs.last_adjusted_at (já existente, "ficha ajustada em");
--   se nulo, vale created_at.
-- cycle_no / previous_program_id: encadeiam os ciclos (macrociclos de 16 semanas) do cliente.
alter table workout_programs add column if not exists block_weeks smallint check (block_weeks between 2 and 12);
alter table workout_programs add column if not exists cycle_no smallint not null default 1;
alter table workout_programs add column if not exists previous_program_id uuid references workout_programs(id) on delete set null;
