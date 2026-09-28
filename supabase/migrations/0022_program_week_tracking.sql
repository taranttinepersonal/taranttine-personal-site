-- Semana atual do programa (mesmo conceito da Periodização 16 Semanas do
-- FitPro, agora visível pro cliente no app). O treinador atualiza manualmente
-- toda semana, igual já faz na planilha — não deriva de data automática pra
-- não desalinhar quando o aluno falta ou o ciclo é ajustado.
alter table workout_programs add column current_week smallint;
alter table workout_programs add column total_weeks smallint not null default 16;
