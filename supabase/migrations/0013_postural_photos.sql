-- 4-angle photos for postural assessment (against a grid/simetrógrafo,
-- physical or digital overlay applied at display time).
alter table postural_assessments add column foto_anterior text;
alter table postural_assessments add column foto_posterior text;
alter table postural_assessments add column foto_lateral_direita text;
alter table postural_assessments add column foto_lateral_esquerda text;

-- The existing insert policy on progress-photos only let a client upload to
-- their own folder. Postural photos are taken by the trainer during a
-- presencial evaluation (the client isn't the one operating the app), so the
-- trainer needs to be able to write into a client's folder too — same
-- allowance the select/delete policies already had.
drop policy "client writes own progress photos" on storage.objects;
create policy "client or trainer writes progress photos" on storage.objects for insert
  with check (bucket_id = 'progress-photos' and ((storage.foldername(name))[1] = auth.uid()::text or is_trainer()));
