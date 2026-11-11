-- Agenda: bloqueios que se repetem toda semana (ex.: almoço / buscar as crianças na escola).
-- O horário fixo passa a poder ser de um aluno (kind 'treino') ou um bloqueio sem aluno (kind 'bloqueio', com título).
-- Só relaxa/acrescenta: nenhum dado existente muda.
alter table agenda_slots alter column client_id drop not null;
alter table agenda_slots add column if not exists kind text not null default 'treino' check (kind in ('treino', 'bloqueio'));
alter table agenda_slots add column if not exists title text;
alter table agenda_slots drop constraint if exists agenda_slots_client_or_title;
alter table agenda_slots add constraint agenda_slots_client_or_title check (client_id is not null or title is not null);

-- Mesma função da 0043, agora copiando tipo e título do horário fixo (bloqueios não dependem de aluno ativo).
create or replace function agenda_generate(p_from date, p_to date) returns integer
language plpgsql as $$
declare n integer;
begin
  with ins as (
    insert into agenda_events (client_id, kind, title, on_date, start_time, duration_min, slot_id, slot_date)
    select s.client_id, s.kind, s.title, d::date, s.start_time, s.duration_min, s.id, d::date
    from agenda_slots s
    left join profiles p on p.id = s.client_id
    cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    where s.active
      and (s.client_id is null or p.active)
      and extract(dow from d)::int = s.weekday
      and d::date >= s.valid_from
      and (s.valid_until is null or d::date <= s.valid_until)
    on conflict (slot_id, slot_date) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $$;
