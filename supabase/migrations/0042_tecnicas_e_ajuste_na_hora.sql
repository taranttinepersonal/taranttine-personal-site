-- Painel Presenciais: técnica usada por exercício na sessão e ajustes na hora do treino.
-- Só ACRESCENTA colunas opcionais; nenhum dado existente muda.
--
-- load_history.technique: técnica avançada usada naquela sessão (bi-set, rest-pause, drop set...), chave de app/js/lib/techniques.js.
-- load_history.substitute_exercise_id: aparelho/exercício feito NO LUGAR do prescrito, só naquele dia (a ficha não muda).
--   A carga lançada não entra na progressão do exercício original.
-- workout_exercises.extra_on / extra_day_id: exercício adicionado "só hoje". A linha fica no programa-arquivo
--   (inativo, invisível pro app do cliente) e o painel a mostra só no dia extra_on, dentro do dia extra_day_id da ficha.
alter table load_history add column if not exists technique text;
alter table load_history add column if not exists substitute_exercise_id text references exercises(id);
alter table workout_exercises add column if not exists extra_on date;
alter table workout_exercises add column if not exists extra_day_id uuid references workout_days(id) on delete cascade;
