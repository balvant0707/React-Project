-- apps: compass
-- Written for the platform (found 2026-11-14 while preparing the COMPASS cutover): the stored file of a training proof is
-- evidence like its row ("Keep training proof" on attachments, "Keep training proof files" on storage.objects): only the
-- holders of people.edit delete it, not the person who uploaded it. The ported trainings_smoke.sql cannot see this: a plain SQL
-- delete from storage.objects is refused by Supabase's protect_delete trigger before row security is asked, so the Storage API's
-- flag (storage.allow_delete_query) is set here, as the API does for its own deletes.
-- Needs the COMPASS seed (tom supervises anna, hanna is HR). One transaction, rolled back; a failed assertion aborts.
begin;

create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema pg_temp to public;

-- tom adds a record for anna and uploads the proof file (as in trainings_smoke.sql 10 and 19b)
select pg_temp.act_as('tom.berger@example.com');
insert into public.training_records (id, user_id, training_type_id, completed_on, trainer)
  values ('00000000-0000-4000-8000-0000000000e1', (select id from public.users where email = 'anna.weber@example.com'), (select id from public.training_types order by name limit 1), current_date, 'smoke');
insert into storage.objects (bucket_id, name, owner)
  values ('attachments', 'training_records/00000000-0000-4000-8000-0000000000e1/proof.pdf', auth.uid());
reset role;

-- the Storage API deletes with this flag set
select set_config('storage.allow_delete_query', 'true', true);

do $$
declare v bigint;
begin
  -- 1. the uploader (not HR) cannot delete the file he uploaded
  perform pg_temp.act_as('tom.berger@example.com');
  assert (select count(*) from storage.objects where name = 'training_records/00000000-0000-4000-8000-0000000000e1/proof.pdf') = 1,
    'tom still sees the file he uploaded';
  delete from storage.objects where name = 'training_records/00000000-0000-4000-8000-0000000000e1/proof.pdf';
  get diagnostics v = row_count;
  reset role;
  assert v = 0, 'the uploader deleted a training proof file (' || v || ' row)';
  assert exists (select 1 from storage.objects where name = 'training_records/00000000-0000-4000-8000-0000000000e1/proof.pdf'), 'the file is gone';

  -- 2. HR (people.edit) can
  perform pg_temp.act_as('hanna.richter@example.com');
  delete from storage.objects where name = 'training_records/00000000-0000-4000-8000-0000000000e1/proof.pdf';
  get diagnostics v = row_count;
  reset role;
  assert v = 1, 'HR could not delete the training proof file (' || v || ' rows)';
end $$;

-- 3. the policy covers the files of training sessions too (their rows are protected the same way)
do $$
begin
  assert (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Keep training proof files' and permissive = 'RESTRICTIVE' and cmd = 'DELETE') like '%training_sessions/%',
    'the restrictive policy does not name training_sessions/';
end $$;

rollback;
select 'training_proof_files_smoke: ok';
