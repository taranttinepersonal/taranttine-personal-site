-- Cargas importadas de planilha (FitPro) não trazem data: o importador estima a data
-- e marca estimated = true. O painel ignora as estimadas para "último treino lançado"
-- e o relatório avisa que as datas são aproximadas. Só ACRESCENTA uma coluna.
alter table load_history add column if not exists estimated boolean not null default false;
