-- workout_exercises needs a per-assignment display label sometimes
-- (e.g. "Ativação Ombro (Manguito Rotador)"), which is more specific
-- than the exercise's generic muscle_group — nullable, falls back to
-- exercises->muscle_groups.name in the UI when absent.
alter table workout_exercises add column display_group text;
