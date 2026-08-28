-- Groups two or more workout_exercises into a "conjugado" (superset/bi-set/tri-set)
-- block, done back-to-back with no rest between them. Exercises sharing the same
-- non-null superset_group value within a section are treated as one connected block.
alter table workout_exercises
  add column if not exists superset_group text;

comment on column workout_exercises.superset_group is
  'Free-text label (e.g. "C1") shared by 2+ exercises in the same section that should be performed back-to-back with no rest between them (conjugado/superset). Null = standalone exercise.';
