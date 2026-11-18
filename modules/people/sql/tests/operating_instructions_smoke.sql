-- Copied from ~/maintenance_tool/supabase/tests/operating_instructions_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Operating instructions smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/operating_instructions_smoke.sql
-- Literals, create, draft editing, submit / return / publish, new version, translations on the published version,
-- review, links, asset lookup. Everything runs in one transaction that is rolled back.
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
grant execute on all functions in schema pg_temp to public;
begin;

-- Sara (Workshop) is the safety officer of this test; Tom (Manager) owns an instruction; Ben (Shopfloor) only reads.
insert into public.user_roles (user_id, role_id)
select pg_temp.uid('sara.novak@example.com'), id from public.roles where name = 'Occupational safety';
create temp table t_ids (key text primary key, id uuid);
grant all on t_ids to public;

select pg_temp.as_user('tom.berger@example.com');
do $$ begin
  assert pg_temp.fails($q$select public.operating_instruction_create('machine', 'Smoke press')$q$), '1 a manager cannot create an instruction';
end $$;
reset role;

select pg_temp.as_user('sara.novak@example.com');
insert into t_ids select 'oi', public.operating_instruction_create('machine', 'Smoke press', pg_temp.uid('tom.berger@example.com'));
insert into t_ids select 'v1', id from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi');
do $$ begin
  assert (select number from public.operating_instructions where id = (select id from t_ids where key = 'oi')) > 0, '2 the instruction has a number';
  assert (select count(*) from public.operating_instruction_texts where version_id = (select id from t_ids where key = 'v1') and language = 'de') = 1, '3 a German text exists';
  assert pg_temp.fails($q$update public.operating_instructions set kind = 'substance' where id = (select id from t_ids where key = 'oi')$q$), '4 the kind is fixed';
  assert pg_temp.fails($q$update public.operating_instructions set review_due_on = current_date where id = (select id from t_ids where key = 'oi')$q$), '5 the review date moves only through the RPC';
end $$;
reset role;

-- Ben cannot see the draft; Tom (owner, edit.own) edits it.
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (select count(*) from public.operating_instruction_versions where id = (select id from t_ids where key = 'v1')) = 0, '6 a reader does not see a draft';
  assert (select count(*) from public.operating_instructions where id = (select id from t_ids where key = 'oi')) = 1, '7 but sees the instruction header';
  assert pg_temp.fails($q$update public.operating_instruction_texts set title = 'x' where version_id = (select id from t_ids where key = 'v1')$q$), '8 a reader cannot write';
end $$;
reset role;

select pg_temp.as_user('tom.berger@example.com');
do $$ begin
  assert pg_temp.fails($q$select public.operating_instruction_submit((select id from t_ids where key = 'v1'))$q$), '9 an empty draft cannot be submitted';
end $$;
update public.operating_instruction_texts set sections = '{"hazards": "<p>Quetschgefahr</p>"}', work_area = 'Halle 1'
  where version_id = (select id from t_ids where key = 'v1') and language = 'de';
update public.operating_instruction_versions set signs = '{"hazards": ["W024"]}' where id = (select id from t_ids where key = 'v1');
insert into public.operating_instruction_texts (version_id, language, title, sections)
  values ((select id from t_ids where key = 'v1'), 'en', 'Smoke press', '{"hazards": "<p>Crushing</p>"}');
update public.operating_instruction_texts set sections = '{"hazards": "<p>Quetschgefahr an der Presse</p>"}'
  where version_id = (select id from t_ids where key = 'v1') and language = 'de';
do $$ begin
  assert (select needs_check from public.operating_instruction_texts where version_id = (select id from t_ids where key = 'v1') and language = 'en'), '10 a changed German text marks the translation';
  assert pg_temp.fails($q$delete from public.operating_instruction_texts where version_id = (select id from t_ids where key = 'v1') and language = 'de'$q$), '11 the German text cannot be removed';
  assert pg_temp.fails($q$update public.operating_instruction_versions set status = 'published' where id = (select id from t_ids where key = 'v1')$q$), '12 the status changes only through the RPCs';
  assert pg_temp.fails($q$select public.operating_instruction_publish((select id from t_ids where key = 'v1'))$q$), '13 an editor cannot publish';
end $$;
select public.operating_instruction_submit((select id from t_ids where key = 'v1'));
do $$ begin
  assert pg_temp.fails($q$update public.operating_instruction_texts set title = 'y' where version_id = (select id from t_ids where key = 'v1') and language = 'de'$q$), '14 a submitted version is fixed';
end $$;
reset role;

do $$ begin
  assert exists (select 1 from public.notifications where user_id = pg_temp.uid('sara.novak@example.com') and type = 'operating_instruction_submitted'), '15 the approver is told';
end $$;

select pg_temp.as_user('sara.novak@example.com');
select public.operating_instruction_return((select id from t_ids where key = 'v1'), 'Erste Hilfe fehlt');
do $$ begin
  assert (select status from public.operating_instruction_versions where id = (select id from t_ids where key = 'v1')) = 'draft', '16 returned to draft';
end $$;
select public.operating_instruction_publish((select id from t_ids where key = 'v1'), true);
do $$ begin
  assert (select status from public.operating_instruction_versions where id = (select id from t_ids where key = 'v1')) = 'published', '17 published';
  assert (select review_due_on from public.operating_instructions where id = (select id from t_ids where key = 'oi')) = (current_date + interval '1 year')::date, '18 next review in a year';
  assert not (select needs_check from public.operating_instruction_texts where version_id = (select id from t_ids where key = 'v1') and language = 'en'), '19 publishing clears the marks';
  assert (select requires_reinstruction from public.operating_instruction_versions where id = (select id from t_ids where key = 'v1')), '19b the approver''s choice is stored';
end $$;
-- a translation on the published version: allowed for the approver, logged; German stays fixed
update public.operating_instruction_texts set title = 'Smoke press (EN)' where version_id = (select id from t_ids where key = 'v1') and language = 'en';
insert into public.operating_instruction_texts (version_id, language, title) values ((select id from t_ids where key = 'v1'), 'pl', 'Prasa');
do $$ begin
  assert (select count(*) from public.operating_instruction_log where instruction_id = (select id from t_ids where key = 'oi') and action = 'translation') = 2, '20 translations are logged';
  assert pg_temp.fails($q$update public.operating_instruction_texts set title = 'z' where version_id = (select id from t_ids where key = 'v1') and language = 'de'$q$), '21 the published German text is fixed';
  assert pg_temp.fails($q$select public.operating_instruction_reviewed((select id from t_ids where key = 'oi'), current_date)$q$), '22 the next review lies in the future';
end $$;
select public.operating_instruction_reviewed((select id from t_ids where key = 'oi'), (current_date + 400)::date, 'geprüft');
do $$ begin
  assert (select review_due_on from public.operating_instructions where id = (select id from t_ids where key = 'oi')) = (current_date + 400)::date, '23 review moved';
  assert pg_temp.fails($q$delete from public.operating_instructions where id = (select id from t_ids where key = 'oi')$q$), '24 a published instruction cannot be deleted';
end $$;
reset role;

-- Ben reads the published version; Tom starts version 2 (a copy with all languages)
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (select count(*) from public.operating_instruction_texts where version_id = (select id from t_ids where key = 'v1')) = 3, '25 a reader sees the published texts';
  assert pg_temp.fails($q$update public.operating_instruction_texts set title = 'x' where version_id = (select id from t_ids where key = 'v1') and language = 'pl'$q$), '26 a reader cannot translate';
end $$;
reset role;

select pg_temp.as_user('tom.berger@example.com');
insert into t_ids select 'v2', public.operating_instruction_new_draft((select id from t_ids where key = 'oi'));
do $$ begin
  assert (select version_no from public.operating_instruction_versions where id = (select id from t_ids where key = 'v2')) = 2, '27 version 2';
  assert (select count(*) from public.operating_instruction_texts where version_id = (select id from t_ids where key = 'v2')) = 3, '28 copied with all languages';
  assert (select signs from public.operating_instruction_versions where id = (select id from t_ids where key = 'v2')) = '{"hazards": ["W024"]}', '29 signs copied';
  assert pg_temp.fails($q$select public.operating_instruction_new_draft((select id from t_ids where key = 'oi'))$q$), '30 one open draft at most';
end $$;
-- links: an asset and its children
insert into public.operating_instruction_assets (instruction_id, asset_id)
select (select id from t_ids where key = 'oi'), a.id from public.assets a
where exists (select 1 from public.assets c where c.parent_asset_id = a.id) order by a.path limit 1;
reset role;

do $$
declare v_parent uuid; v_child uuid;
begin
  select asset_id into v_parent from public.operating_instruction_assets where instruction_id = (select id from t_ids where key = 'oi');
  select id into v_child from public.assets where parent_asset_id = v_parent limit 1;
  assert (select source from public.operating_instructions_for_asset(v_parent) where instruction_id = (select id from t_ids where key = 'oi')) = 'asset', '31 own asset';
  assert (select source from public.operating_instructions_for_asset(v_child) where instruction_id = (select id from t_ids where key = 'oi')) = 'parent', '32 inherited by a child';
end $$;

select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert pg_temp.fails($q$insert into public.operating_instruction_assets (instruction_id, asset_type_id) select (select id from t_ids where key = 'oi'), id from public.asset_types limit 1$q$), '33 a reader cannot link';
  assert (select published_version_no from public.operating_instructions_overview where id = (select id from t_ids where key = 'oi')) = 1, '34 overview shows the published version';
  assert (select open_version_id from public.operating_instructions_overview where id = (select id from t_ids where key = 'oi')) is null, '35 a reader does not see the open draft in the overview';
end $$;
reset role;

select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  assert pg_temp.fails($q$insert into public.operating_instruction_log (instruction_id, action) values ((select id from t_ids where key = 'oi'), 'reviewed')$q$), '36 nobody writes the log';
end $$;
-- deleting a draft and a never published instruction cascades through the text guard
insert into t_ids select 'gone', public.operating_instruction_create('machine', 'Smoke delete');
delete from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'gone');
do $$ begin assert not exists (select 1 from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'gone')), '37 a draft can be deleted'; end $$;
select public.operating_instruction_new_draft((select id from t_ids where key = 'gone'));
delete from public.operating_instructions where id = (select id from t_ids where key = 'gone');
do $$ begin assert not exists (select 1 from public.operating_instructions where id = (select id from t_ids where key = 'gone')), '38 an unpublished instruction can be deleted'; end $$;
reset role;

select 'operating instructions smoke: all checks passed';
rollback;
