-- Painel dos clientes presenciais (etapa 1: cargas, progressão e volume).
-- Só ACRESCENTA colunas opcionais: nenhum dado existente muda, e o app dos
-- alunos continua gravando load_history como antes (as colunas novas ficam nulas).

-- Quem é presencial (o painel "Presenciais" lista só esses). Nulo = não classificado.
alter table profiles add column if not exists modalidade text check (modalidade in ('online', 'presencial'));

-- Lançamento do treinador na academia: além da carga, reps feitas, RIR percebido
-- e a semana do programa, que alimentam a sugestão de progressão e a matriz S1→Sn.
alter table load_history add column if not exists reps_done smallint check (reps_done between 0 and 200);
alter table load_history add column if not exists rir_done smallint check (rir_done between 0 and 10);
alter table load_history add column if not exists week_no smallint check (week_no >= 1);

-- Mesociclo curto (3 a 8 semanas) com semana de deload na última (opcional).
-- A semana atual continua em workout_programs.current_week (migração 0022).
alter table workout_programs add column if not exists meso_length smallint not null default 4 check (meso_length between 3 and 8);
alter table workout_programs add column if not exists meso_deload boolean not null default true;
