-- Análise postural por IA (MediaPipe Pose, roda no navegador do avaliador):
-- por vista guardamos os 33 pontos detectados + as métricas calculadas, pra
-- redesenhar as linhas/ângulos no relatório sem reprocessar a foto.
-- Formato: { "anterior": { "w": 2268, "h": 4032, "points": [[x,y,vis],...], "metrics": {...} }, ... }
alter table postural_assessments add column analysis jsonb;
