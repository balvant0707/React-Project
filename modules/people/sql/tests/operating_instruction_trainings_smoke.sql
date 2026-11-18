-- Copied from ~/maintenance_tool/supabase/tests/operating_instruction_trainings_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Operating instructions taught through trainings (stage 3): docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/operating_instruction_trainings_smoke.sql
-- Link, versions taught per record, status 'reinstruction', the per-person view, reminders. Rolled back.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.fails(p_sql text) returns boolean language plpgsql as $$
declare v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v = 0;
exception when others then
  return true;
end $$;
create or replace function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
-- Ben's status of the smoke training type.
create or replace function pg_temp.ben_status() returns text language sql as $$
  select status from public.training_status_all()
  where user_id = pg_temp.uid('ben.keller@example.com') and training_type_id = (select id from public.training_types where name = 'Smoke instruction training')
$$;
-- Publishes a new version of an instruction directly (the test runs as postgres).
create or replace function pg_temp.publish(p_instruction uuid, p_no integer, p_valid date, p_reinstruct boolean) returns uuid language plpgsql as $$
declare v uuid;
begin
  perform set_config('app.operating_instruction_rpc', 'on', true);
  update public.operating_instruction_versions set status = 'archived' where instruction_id = p_instruction and status = 'published';
  insert into public.operating_instruction_versions (instruction_id, version_no, status, valid_from, requires_reinstruction)
  values (p_instruction, p_no, 'published', p_valid, p_reinstruct) returning id into v;
  insert into public.operating_instruction_texts (version_id, language, title, sections) values (v, 'de', 'Smoke', '{"scope": "<p>x</p>"}');
  perform set_config('app.operating_instruction_rpc', 'off', true);
  return v;
end $$;
grant execute on all functions in schema pg_temp to public;
begin;

create temp table t_ids (key text primary key, id uuid);
grant all on t_ids to public;
insert into public.training_types (name, validity_months) values ('Smoke instruction training', 12);
insert into t_ids select 'type', id from public.training_types where name = 'Smoke instruction training';
insert into public.operating_instructions (kind) values ('machine'), ('substance');
insert into t_ids select 'oi1', id from public.operating_instructions where kind = 'machine' order by number desc limit 1;
insert into t_ids select 'oi2', id from public.operating_instructions where kind = 'substance' order by number desc limit 1;
insert into t_ids select 'v1', pg_temp.publish((select id from t_ids where key = 'oi1'), 1, current_date - 100, false);
insert into public.training_requirements (training_type_id, user_id) values ((select id from t_ids where key = 'type'), pg_temp.uid('ben.keller@example.com'));

select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert pg_temp.fails($q$insert into public.training_type_operating_instructions (training_type_id, instruction_id) values ((select id from t_ids where key = 'type'), (select id from t_ids where key = 'oi1'))$q$), '1 a reader cannot link';
end $$;
reset role;
-- HR edits the catalogue
select pg_temp.as_user('hanna.richter@example.com');
insert into public.training_type_operating_instructions (training_type_id, instruction_id) values ((select id from t_ids where key = 'type'), (select id from t_ids where key = 'oi1'));
reset role;

insert into public.training_records (user_id, training_type_id, completed_on) values (pg_temp.uid('ben.keller@example.com'), (select id from t_ids where key = 'type'), current_date - 10);
do $$ begin
  assert (select version_id from public.training_record_operating_instructions t join public.training_records r on r.id = t.record_id
          where r.user_id = pg_temp.uid('ben.keller@example.com') and r.training_type_id = (select id from t_ids where key = 'type')) = (select id from t_ids where key = 'v1'), '2 the record remembers version 1';
  assert pg_temp.ben_status() = 'valid', '3 covered: valid';
end $$;

-- a version without the flag changes nothing; with the flag it makes the training due again
select pg_temp.publish((select id from t_ids where key = 'oi1'), 2, current_date - 5, false);
do $$ begin assert pg_temp.ben_status() = 'valid', '4 a minor change keeps it valid'; end $$;
insert into t_ids select 'v3', pg_temp.publish((select id from t_ids where key = 'oi1'), 3, current_date - 1, true);
do $$ begin assert pg_temp.ben_status() = 'reinstruction', '5 a change that requires it: reinstruction'; end $$;

-- reclassified as editorial afterwards: nobody is due; back again: due again (approvers only, logged)
insert into public.user_roles (user_id, role_id)
select pg_temp.uid('sara.novak@example.com'), id from public.roles where name = 'Occupational safety' on conflict do nothing;
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert pg_temp.fails($q$select public.operating_instruction_classify((select id from t_ids where key = 'v3'), false)$q$), '5a a reader cannot reclassify';
end $$;
reset role;
select pg_temp.as_user('sara.novak@example.com');
select public.operating_instruction_classify((select id from t_ids where key = 'v3'), false, 'nur Tippfehler');
reset role;
do $$ begin
  assert pg_temp.ben_status() = 'valid', '5b editorial: valid again';
  assert (select note from public.operating_instruction_log where version_id = (select id from t_ids where key = 'v3') and action = 'classified') = 'editorial: nur Tippfehler', '5c logged';
end $$;
select pg_temp.as_user('sara.novak@example.com');
select public.operating_instruction_classify((select id from t_ids where key = 'v3'), true);
reset role;
do $$ begin assert pg_temp.ben_status() = 'reinstruction', '5d back to a significant change: reinstruction'; end $$;

-- Ben sees it in his own view
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (select count(*) from public.operating_instruction_status_for_me() where user_id = pg_temp.uid('ben.keller@example.com') and training_type_id = (select id from t_ids where key = 'type') and not covered) = 1, '6 his view shows one uncovered instruction';
  assert (select taught_version_no || '/' || baseline_no || '/' || current_no from public.operating_instruction_status_for_me() where user_id = pg_temp.uid('ben.keller@example.com') and training_type_id = (select id from t_ids where key = 'type')) = '1/3/3', '7 taught 1, needed 3, current 3';
end $$;
reset role;

-- reminder
select public.send_training_reminders(current_date);
do $$ begin
  assert exists (select 1 from public.notifications where user_id = pg_temp.uid('ben.keller@example.com') and type = 'training_reinstruction'), '8 Ben is reminded';
end $$;

-- a new record today covers version 3
insert into public.training_records (user_id, training_type_id, completed_on) values (pg_temp.uid('ben.keller@example.com'), (select id from t_ids where key = 'type'), current_date);
do $$ begin assert pg_temp.ben_status() = 'valid', '9 instructed again: valid'; end $$;

-- a published instruction added to the type: due again
select pg_temp.publish((select id from t_ids where key = 'oi2'), 1, current_date - 30, false);
insert into public.training_type_operating_instructions (training_type_id, instruction_id) values ((select id from t_ids where key = 'type'), (select id from t_ids where key = 'oi2'));
do $$ begin assert pg_temp.ben_status() = 'reinstruction', '10 a new instruction on the type: reinstruction'; end $$;

-- a correction of the date recomputes what was taught (before the first version: nothing)
update public.training_records set completed_on = current_date - 200
  where user_id = pg_temp.uid('ben.keller@example.com') and training_type_id = (select id from t_ids where key = 'type') and completed_on = current_date;
do $$ begin
  assert (select count(*) from public.training_record_operating_instructions t join public.training_records r on r.id = t.record_id
          where r.user_id = pg_temp.uid('ben.keller@example.com') and r.completed_on = current_date - 200) = 0, '11 backdated before validity: nothing taught';
end $$;

-- an inactive instruction does not count
update public.training_records set completed_on = current_date where user_id = pg_temp.uid('ben.keller@example.com') and completed_on = current_date - 200;
update public.operating_instructions set active = false where id = (select id from t_ids where key = 'oi2');
do $$ begin assert pg_temp.ben_status() = 'valid', '12 an inactive instruction is ignored'; end $$;

select 'operating instruction trainings smoke: all checks passed';
rollback;
