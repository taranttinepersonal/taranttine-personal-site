-- Agenda de atendimentos do treinador (só ele enxerga): horários fixos semanais dos alunos presenciais,
-- ocorrências com status (compareceu, faltou, desmarcou, cancelado), reposições, trocas de horário,
-- avaliações/consultas, bloqueios e lembretes livres. Só ACRESCENTA tabelas.
-- Datas e horas ficam no horário local (Dourados): colunas date + time, sem fuso.

-- Horário fixo semanal de um aluno. weekday: 0 = domingo ... 6 = sábado (mesmo número do JS).
-- Mudar o horário fixo "a partir de X" = encerrar este (valid_until) e criar outro (valid_from).
create table if not exists agenda_slots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references profiles(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  duration_min smallint not null default 60 check (duration_min between 10 and 480),
  valid_from date not null default current_date,
  valid_until date,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists agenda_slots_client_idx on agenda_slots (client_id);

-- Cada atendimento/compromisso concreto. Os treinos dos horários fixos nascem de agenda_generate().
--  kind: treino | reposicao | avaliacao | consulta | bloqueio | lembrete
--  status: agendado | feito | faltou | desmarcou (aluno avisou) | cancelado (eu cancelei)
--  generates_credit: a falta gera crédito de reposição (decisão do treinador, caso a caso)
--  makeup_for: a reposição aponta pra falta que ela repõe
--  slot_id + slot_date: de qual horário fixo e de qual dia da grade veio (não muda quando o atendimento é movido)
--  orig_date/orig_time: onde estava antes de ser movido
--  remind_before_min: aviso push pro treinador X min antes (nulo = padrão: 30 min, lembrete = na hora; -1 = sem aviso); notified_at evita repetir
create table if not exists agenda_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references profiles(id) on delete cascade,
  kind text not null default 'treino' check (kind in ('treino', 'reposicao', 'avaliacao', 'consulta', 'bloqueio', 'lembrete')),
  title text,
  on_date date not null,
  start_time time not null,
  duration_min smallint not null default 60 check (duration_min between 0 and 1440),
  status text not null default 'agendado' check (status in ('agendado', 'feito', 'faltou', 'desmarcou', 'cancelado')),
  generates_credit boolean not null default false,
  makeup_for uuid references agenda_events(id) on delete set null,
  slot_id uuid references agenda_slots(id) on delete set null,
  slot_date date,
  orig_date date,
  orig_time time,
  note text,
  remind_before_min smallint check (remind_before_min between -1 and 2880),
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (slot_id, slot_date)
);
create index if not exists agenda_events_date_idx on agenda_events (on_date);
create index if not exists agenda_events_client_idx on agenda_events (client_id);

alter table agenda_slots enable row level security;
alter table agenda_events enable row level security;
create policy "trainer manages agenda slots" on agenda_slots for all using (is_trainer()) with check (is_trainer());
create policy "trainer manages agenda events" on agenda_events for all using (is_trainer()) with check (is_trainer());

-- Cria os treinos dos horários fixos entre duas datas (inclusive). Idempotente: o que já existe
-- (mesmo movido, cancelado ou apagado do horário) não é recriado nem alterado.
create or replace function agenda_generate(p_from date, p_to date) returns integer
language plpgsql as $$
declare n integer;
begin
  with ins as (
    insert into agenda_events (client_id, kind, on_date, start_time, duration_min, slot_id, slot_date)
    select s.client_id, 'treino', d::date, s.start_time, s.duration_min, s.id, d::date
    from agenda_slots s
    join profiles p on p.id = s.client_id and p.active
    cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    where s.active
      and extract(dow from d)::int = s.weekday
      and d::date >= s.valid_from
      and (s.valid_until is null or d::date <= s.valid_until)
    on conflict (slot_id, slot_date) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;
