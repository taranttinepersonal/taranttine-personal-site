-- Not every exercise has a demo gif in the media bank (e.g. mobility drills).
-- Make gif_path optional instead of forcing a fake placeholder.
alter table exercises alter column gif_path drop not null;
