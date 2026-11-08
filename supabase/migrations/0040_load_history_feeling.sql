-- Sensação do exercício na sessão (o treinador marca ao lançar a carga):
-- pegou bem / regular / não pegou / dor ou incômodo. Alimenta o histórico do exercício,
-- o alerta de "não pegou" repetido (considere trocar) e trava a sugestão de subir
-- carga quando houve dor. Só ACRESCENTA uma coluna opcional.
alter table load_history add column if not exists feeling text
  check (feeling in ('pegou_bem', 'regular', 'nao_pegou', 'dor'));
