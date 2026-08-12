-- Classificação objetiva do nível de treinamento (De Salles — Manual de Avaliação
-- Física e do Nível de Treinamento, 2025): 5 parâmetros pontuados de 1 a 4 (tempo
-- sem interrupção, destreino, experiência prévia, técnica, força relativa), média
-- final classifica o aluno. Guardamos os inputs brutos (não só o score) pra manter
-- histórico auditável e permitir recalcular se a régua mudar.
create table training_level_assessments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  recorded_at date not null default current_date,
  currently_training boolean not null default true,
  meses_treino_atual numeric,       -- param 1: se treinando agora, há quantos meses ininterruptos
  meses_destreino numeric,          -- param 2: se parado, há quantos meses
  anos_experiencia_previa numeric,  -- param 3: experiência total antes da interrupção (ou atual, se nunca parou)
  tecnica jsonb,                    -- {"supino": 3, "agachamento": 2, "puxada": 4, "terra": 3} — score 1-4 por exercício
  forca jsonb,                      -- {"supino": {"carga": 80, "reps": 1, "peso_corporal": 75}, ...} — inputs brutos
  score_final numeric,              -- média dos parâmetros avaliados, calculada e congelada no momento do salvamento
  nivel_final text,                 -- 'iniciante' | 'intermediario' | 'avancado' | 'extremamente_avancado'
  general_note text,
  created_at timestamptz not null default now()
);

alter table training_level_assessments enable row level security;
create policy "client reads own training level assessments" on training_level_assessments for select
  using (client_id = auth.uid() or is_trainer());
create policy "trainer manages training level assessments" on training_level_assessments for all
  using (is_trainer())
  with check (is_trainer());
