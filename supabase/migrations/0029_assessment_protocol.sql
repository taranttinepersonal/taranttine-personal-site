-- Protocolo de avaliação padronizado:
--   profiles.next_assessment_at: próxima avaliação agendada pelo treinador
--     (o app mostra o preparo e um lembrete sai na véspera).
--   bioimpedance_assessments.condicoes: como o aluno chegou (jejum, treino,
--     álcool, bexiga, cafeína, horário, fase do ciclo), para o histórico
--     dizer se uma medida é comparável com a anterior.
alter table profiles add column if not exists next_assessment_at timestamptz;
alter table bioimpedance_assessments add column if not exists condicoes jsonb;
