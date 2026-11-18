-- Copied from ~/maintenance_tool/supabase/tests/trainings_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Trainings smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/trainings_smoke.sql
-- (freshly reset DB with seeds 10 and 11). Scopes own / reports (supervisor chain) / all, computed validity, status, retention date, proof files
-- as attachments, and the absence of any deletion path. The label says what should happen.
\set ON_ERROR_STOP off
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.rows(p_sql text) returns text language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v::text || ' row(s)';
exception when others then
  return 'blocked: ' || sqlerrm;
end $$;
grant execute on all functions in schema pg_temp to public;
begin;

select '1 literals registered (6)', count(*) from public.permissions where module in ('trainings', 'training_types');
select '2 edit implies view in the same scope', count(*) from public.permission_implies where permission like 'trainings.edit.%' and implies like 'trainings.view.%';
select '3 statuses of the seed (anna hazardous = due_soon, ben hazardous = expired, anna induction = valid)',
  (select status from public.training_records_overview where person_name = 'Anna Weber' and type_name = 'Hazardous substances instruction'),
  (select status from public.training_records_overview where person_name = 'Ben Keller' and type_name = 'Hazardous substances instruction'),
  (select status from public.training_records_overview where person_name = 'Anna Weber' and type_name = 'Machine safety induction');
select '4 valid_until = completed_on + 12 months', (valid_until = (completed_on + interval '12 months')::date) from public.training_records_overview where person_name = 'Anna Weber' and type_name = 'Fire safety instruction';
select '5 retention default is 30 years after leaving', retention_years_after_exit from public.training_types where name = 'Hazardous substances instruction';

-- own scope
select pg_temp.as_user('ben.keller@example.com');
select '6 ben sees only his own records (3 rows, 1 person)', count(*), count(distinct user_id) from public.training_records;
select '7 ben cannot add a record, not even for himself (blocked)', pg_temp.rows($q$insert into public.training_records (user_id, training_type_id, completed_on) values ((select id from public.users where email = 'ben.keller@example.com'), (select id from public.training_types where name = 'First aid'), current_date)$q$);
select '8 ben cannot edit his record (0 rows)', pg_temp.rows($q$update public.training_records set trainer = 'x' where user_id = (select id from public.users where email = 'ben.keller@example.com')$q$);
reset role;

-- reports scope: Tom supervises Anna, Sara, Lena, Ben; Paul has no supervisor (he shares teams with Tom, which counts for nothing)
select pg_temp.as_user('tom.berger@example.com');
select '9 tom sees the records of the people he supervises, not paul (anna visible, paul not)',
  exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'anna.weber@example.com') as anna,
  exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'paul.meier@example.com') as paul;
select '10 tom adds a record for anna (1 row)', pg_temp.rows($q$insert into public.training_records (id, user_id, training_type_id, completed_on, trainer) values ('00000000-0000-4000-8000-0000000000f1', (select id from public.users where email = 'anna.weber@example.com'), (select id from public.training_types where name = 'Fire safety instruction'), current_date, 'smoke')$q$);
select '11 tom cannot add one for paul, who is not below him (blocked)', pg_temp.rows($q$insert into public.training_records (user_id, training_type_id, completed_on) values ((select id from public.users where email = 'paul.meier@example.com'), (select id from public.training_types where name = 'First aid'), current_date)$q$);
select '12 the new record is the latest and valid_until was computed', is_latest, valid_until = (current_date + interval '12 months')::date from public.training_records_overview where id = '00000000-0000-4000-8000-0000000000f1';
select '13 the older fire safety record of anna is no longer latest (false)', is_latest from public.training_records_overview where person_name = 'Anna Weber' and type_name = 'Fire safety instruction' and id <> '00000000-0000-4000-8000-0000000000f1';
select '14 tom cannot change the catalogue (blocked)', pg_temp.rows($q$insert into public.training_types (name) values ('Smoke type')$q$);
select '15 tom cannot move a record to paul (blocked)', pg_temp.rows($q$update public.training_records set user_id = (select id from public.users where email = 'paul.meier@example.com') where id = '00000000-0000-4000-8000-0000000000f1'$q$);

-- proof files are attachments on the record
select '16 tom attaches a proof to the new record (1 row)', pg_temp.rows($q$insert into public.attachments (entity_type, entity_id, storage_path, file_name, mime_type, size_bytes) values ('training_records', '00000000-0000-4000-8000-0000000000f1', 'training_records/00000000-0000-4000-8000-0000000000f1/smoke.pdf', 'smoke.pdf', 'application/pdf', 10)$q$);
select '17 tom cannot attach a proof to a record of paul (blocked)', pg_temp.rows($q$insert into public.attachments (entity_type, entity_id, storage_path, file_name) select 'training_records', id, 'training_records/' || id || '/x.pdf', 'x.pdf' from public.training_records where user_id = (select id from public.users where email = 'paul.meier@example.com') limit 1$q$);
select '18 proof_count counts it (1)', proof_count from public.training_records_overview where id = '00000000-0000-4000-8000-0000000000f1';
select '19 the uploader cannot delete the proof (0 rows)', pg_temp.rows($q$delete from public.attachments where entity_type = 'training_records'$q$);
select '19b tom uploads the proof file to storage (1 row)', pg_temp.rows($q$insert into storage.objects (bucket_id, name, owner) values ('attachments', 'training_records/00000000-0000-4000-8000-0000000000f1/smoke.pdf', auth.uid())$q$);
select '19c tom cannot upload a file for a record of paul (blocked)', pg_temp.rows($q$insert into storage.objects (bucket_id, name, owner) select 'attachments', 'training_records/' || id || '/x.pdf', auth.uid() from public.training_records where user_id = (select id from public.users where email = 'paul.meier@example.com') limit 1$q$);
select '19d tom cannot delete the proof file, though he uploaded it (0 rows)', pg_temp.rows($q$delete from storage.objects where name = 'training_records/00000000-0000-4000-8000-0000000000f1/smoke.pdf'$q$);
select '20 nobody deletes a record (blocked or 0 rows)', pg_temp.rows($q$delete from public.training_records where id = '00000000-0000-4000-8000-0000000000f1'$q$);
reset role;

select pg_temp.as_user('anna.weber@example.com');
select '21 anna sees her own proof (1 row)', count(*) from public.attachments where entity_type = 'training_records';
select '22 anna sees only her records (1 person)', count(distinct user_id) from public.training_records;
select '22b anna reads the proof file entry (1)', (select count(*) from storage.objects where name like 'training_records/%') as visible;
reset role;
select pg_temp.as_user('ben.keller@example.com');
select '23 ben does not see the proof of anna (0)', count(*) from public.attachments where entity_type = 'training_records';
reset role;

-- HR: everybody, catalogue
select pg_temp.as_user('hanna.richter@example.com');
select '24 HR sees all records (8 people have records)', count(distinct user_id) = 8 from public.training_records;
select '25 HR adds a training type (1 row)', pg_temp.rows($q$insert into public.training_types (id, name, validity_months) values ('00000000-0000-4000-8000-0000000000f2', 'Smoke type', 12)$q$);
select '26 retention default of a new type = 30', retention_years_after_exit from public.training_types where id = '00000000-0000-4000-8000-0000000000f2';
select '27 HR cannot delete a type that has records (blocked)', pg_temp.rows($q$delete from public.training_types where name = 'First aid'$q$);
select '28 HR deletes an unused type (1 row)', pg_temp.rows($q$delete from public.training_types where id = '00000000-0000-4000-8000-0000000000f2'$q$);
select '29 HR cannot delete a person with records (blocked)', pg_temp.rows($q$delete from public.users where name = 'Jan Hoffmann'$q$);
select '30 HR sets an exit date (1 row)', pg_temp.rows($q$insert into public.person_private (user_id, exit_date) select id, '2030-06-30' from public.users where name = 'Karl Brandt' on conflict (user_id) do update set exit_date = excluded.exit_date$q$);
select '30b a future exit date does not mark the person as left (false)', has_left from public.users where name = 'Karl Brandt';
select '31 retain_until = exit + 30 years for hazardous (2060-06-30)', retain_until from public.training_records_overview where person_name = 'Karl Brandt' and type_name = 'Hazardous substances instruction';
select '32 electrical safety keeps 40 years (set per type)', retention_years_after_exit from public.training_types where name = 'Electrical safety';
reset role;

-- responsible of a type: consistent combinations only
select pg_temp.as_user('hanna.richter@example.com');
select '34 responsible supervisor without person or text (1 row)', pg_temp.rows($q$update public.training_types set responsible_kind = 'supervisor' where name = 'First aid'$q$);
select '35 responsible person needs a person (blocked)', pg_temp.rows($q$update public.training_types set responsible_kind = 'person' where name = 'First aid'$q$);
select '36 responsible person with a person (1 row)', pg_temp.rows($q$update public.training_types set responsible_kind = 'person', responsible_user_id = (select id from public.users where email = 'tom.berger@example.com') where name = 'First aid'$q$);
select '37 external with a person set (blocked)', pg_temp.rows($q$update public.training_types set responsible_kind = 'external', responsible_external = 'TUEV' where name = 'First aid'$q$);
select '38 external with text only (1 row)', pg_temp.rows($q$update public.training_types set responsible_kind = 'external', responsible_user_id = null, responsible_external = 'TUEV' where name = 'First aid'$q$);
select '39 text without a kind (blocked)', pg_temp.rows($q$update public.training_types set responsible_kind = null where name = 'First aid'$q$);
reset role;

-- HR (people.edit) may remove a wrong proof, the admin no longer (admin limits, stage 1)
select pg_temp.as_user('max.wilckens@wilckens.com');
select '33a admin cannot delete a proof (0 rows)', pg_temp.rows($q$delete from public.attachments where entity_type = 'training_records'$q$);
reset role;
-- the chain is recursive and includes deputies of supervisors; the literal is needed as well
reset role;
select pg_temp.as_user('max.wilckens@wilckens.com');
select 'R1 max, tom''s supervisor, sees anna and ben two levels down, not paul (t t f)',
  exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'anna.weber@example.com') as anna,
  exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'ben.keller@example.com') as ben,
  exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'paul.meier@example.com') as paul;
reset role;
select pg_temp.as_user('sara.novak@example.com');
select 'R2 sara has no Manager role: nothing about ben yet (f)', exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'ben.keller@example.com') as sees_ben;
reset role;
select pg_temp.as_user('max.wilckens@wilckens.com');
select 'R3 the admin makes sara deputy of tom (1 row)', pg_temp.rows($q$update public.users set deputy_user_id = (select id from public.users where email = 'sara.novak@example.com') where email = 'tom.berger@example.com'$q$);
reset role;
select pg_temp.as_user('sara.novak@example.com');
select 'R4 a deputy of a supervisor without the literal still sees nothing (f)', exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'ben.keller@example.com') as sees_ben;
reset role;
select pg_temp.as_user('max.wilckens@wilckens.com');
select 'R5 the admin gives sara the Manager role (1 row)', pg_temp.rows($q$insert into public.user_roles (user_id, role_id) select u.id, r.id from public.users u, public.roles r where u.email = 'sara.novak@example.com' and r.name = 'Manager'$q$);
reset role;
select pg_temp.as_user('sara.novak@example.com');
select 'R6 with the literal the deputy of tom sees ben and anna (t t)',
  exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'ben.keller@example.com') as ben,
  exists (select 1 from public.training_records r join public.users u on u.id = r.user_id where u.email = 'anna.weber@example.com') as anna;
select 'R7 nobody edits their own record through the chain (0 rows)', pg_temp.rows($q$update public.training_records set trainer = 'x' where user_id = (select id from public.users where email = 'sara.novak@example.com')$q$);
select 'R8 my_report_ids has ben, not herself, not paul (t f f)',
  (select id from public.users where email = 'ben.keller@example.com') = any (public.my_report_ids()),
  (select id from public.users where email = 'sara.novak@example.com') = any (public.my_report_ids()),
  (select id from public.users where email = 'paul.meier@example.com') = any (public.my_report_ids());
reset role;
select pg_temp.as_user('hanna.richter@example.com');
select '33 HR deletes a proof (1 row)', pg_temp.rows($q$delete from public.attachments where entity_type = 'training_records'$q$);
reset role;
rollback;
