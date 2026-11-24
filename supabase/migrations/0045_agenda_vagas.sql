-- Agenda: horários VAGOS (disponíveis pra encaixar um aluno). Aparecem em verde na grade e somem
-- sozinhos quando algum atendimento ocupa o horário. Só ACRESCENTA uma tabela; nada existente muda.
-- weekday: 0 = domingo ... 6 = sábado (mesmo número do JS e de agenda_slots).
create table if not exists agenda_vagas (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  duration_min smallint not null default 60 check (duration_min between 10 and 480),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (weekday, start_time)
);
alter table agenda_vagas enable row level security;
drop policy if exists "trainer manages agenda vagas" on agenda_vagas;
create policy "trainer manages agenda vagas" on agenda_vagas for all using (is_trainer()) with check (is_trainer());

-- Horários vagos de hoje: segunda e quarta 10h · segunda, quarta e sexta 15h · quarta e sexta 16h.
insert into agenda_vagas (weekday, start_time, duration_min) values
  (1, '10:00', 60), (3, '10:00', 60),
  (1, '15:00', 60), (3, '15:00', 60), (5, '15:00', 60),
  (3, '16:00', 60), (5, '16:00', 60)
on conflict (weekday, start_time) do nothing;
