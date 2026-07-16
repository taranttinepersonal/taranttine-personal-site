-- Tracks when a client's program was last adjusted, so we can remind the
-- trainer once 4 weeks have passed (matches the "ajuste a cada 4 semanas"
-- promise in the pricing plans). Falls back to created_at until the first
-- adjustment is marked.
alter table workout_programs add column last_adjusted_at timestamptz;
