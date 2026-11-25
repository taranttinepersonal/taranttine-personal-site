-- Agenda: horário vago de UM dia só (além do que se repete toda semana).
-- weekday preenchido = vaga semanal; on_date preenchido = vaga só naquele dia. Só relaxa/acrescenta.
alter table agenda_vagas alter column weekday drop not null;
alter table agenda_vagas add column if not exists on_date date;
alter table agenda_vagas drop constraint if exists agenda_vagas_weekday_start_time_key;
alter table agenda_vagas drop constraint if exists agenda_vagas_when;
alter table agenda_vagas add constraint agenda_vagas_when check ((weekday is not null) <> (on_date is not null));
create unique index if not exists agenda_vagas_weekly_uq on agenda_vagas (weekday, start_time) where on_date is null;
create unique index if not exists agenda_vagas_once_uq on agenda_vagas (on_date, start_time) where on_date is not null;
