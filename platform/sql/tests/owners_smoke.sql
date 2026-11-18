-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/owners_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Owners smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/owners_smoke.sql
-- (freshly reset DB). Task types and checklist templates: owner, edit.own / edit.all, admin-only create and delete.
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

select '1 old scopeless literal is gone, edit.own / edit.all exist', (select count(*) from public.permissions where key = 'checklist_templates.edit') as old,
  (select count(*) from public.permissions where key in ('task_types.edit.own', 'task_types.edit.all', 'checklist_templates.edit.own', 'checklist_templates.edit.all')) as new;
select '2 the manager kept the right to edit templates (now edit.all)', exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Manager' and rp.permission = 'checklist_templates.edit.all');

-- fixtures: a template owned by the manager, a role with edit.own for the workshop worker
select pg_temp.as_user('tom.berger@example.com');
insert into public.checklist_templates (id, name) values ('00000000-0000-4000-8000-0000000000c1', 'Owned by Tom');
insert into public.checklist_template_items (template_id, sort_order, kind, label) values ('00000000-0000-4000-8000-0000000000c1', 1, 'check', 'Tom item');
reset role;
select '3 the creator of a template is its owner', owner_user_id = (select id from public.users where email = 'tom.berger@example.com') from public.checklist_templates where id = '00000000-0000-4000-8000-0000000000c1';
insert into public.roles (id, name) values ('00000000-0000-4000-8000-0000000000d1', 'O Owner');
insert into public.role_permissions (role_id, permission) values ('00000000-0000-4000-8000-0000000000d1', 'task_types.edit.own'), ('00000000-0000-4000-8000-0000000000d1', 'checklist_templates.edit.own');
insert into public.user_roles (user_id, role_id) values ((select id from public.users where email = 'anna.weber@example.com'), '00000000-0000-4000-8000-0000000000d1');
insert into public.checklist_templates (id, name, owner_user_id) values ('00000000-0000-4000-8000-0000000000c2', 'Owned by Anna', (select id from public.users where email = 'anna.weber@example.com'));
insert into public.checklist_template_items (template_id, sort_order, kind, label) values ('00000000-0000-4000-8000-0000000000c2', 1, 'check', 'Anna item');
update public.task_types set owner_user_id = (select id from public.users where email = 'anna.weber@example.com') where key = 'general';

-- paul (other site, Workshop) holds no literal at all
select pg_temp.as_user('paul.meier@example.com');
select '4 no literal: task type not editable', pg_temp.rows($q$update public.task_types set description = 'x' where key = 'general'$q$);
select '5 no literal: template not editable', pg_temp.rows($q$update public.checklist_templates set description = 'x' where id = '00000000-0000-4000-8000-0000000000c2'$q$);
reset role;

select pg_temp.as_user('anna.weber@example.com');
select '6 owner edits her task type', pg_temp.rows($q$update public.task_types set description = 'changed by owner' where key = 'general'$q$);
select '7 owner cannot edit a type she does not own', pg_temp.rows($q$update public.task_types set description = 'x' where key = 'inspection'$q$);
select '8 owner edits a step of her type', pg_temp.rows($q$update public.task_type_steps set name = 'Work (owner)' where task_type_id = (select id from public.task_types where key = 'general')$q$);
select '9 owner cannot edit a step of another type', pg_temp.rows($q$update public.task_type_steps set name = 'x' where task_type_id = (select id from public.task_types where key = 'inspection')$q$);
select '10 owner adds a quick link', pg_temp.rows($q$insert into public.task_type_subtask_types (task_type_id, subtask_type_id) values ((select id from public.task_types where key = 'general'), (select id from public.task_types where key = 'purchase_request'))$q$);
select '11 owner cannot create a task type', pg_temp.rows($q$insert into public.task_types (key, name) values ('smoke_type', 'Smoke type')$q$);
select '12 owner cannot delete her task type', pg_temp.rows($q$delete from public.task_types where key = 'general'$q$);
select '13 owner edits her template and its items', pg_temp.rows($q$update public.checklist_templates set description = 'mine' where id = '00000000-0000-4000-8000-0000000000c2'$q$), pg_temp.rows($q$update public.checklist_template_items set label = 'Anna item 2' where template_id = '00000000-0000-4000-8000-0000000000c2'$q$);
select '14 owner cannot edit the template of someone else', pg_temp.rows($q$update public.checklist_templates set description = 'x' where id = '00000000-0000-4000-8000-0000000000c1'$q$), pg_temp.rows($q$update public.checklist_template_items set label = 'x' where template_id = '00000000-0000-4000-8000-0000000000c1'$q$);
select '15 owner cannot delete her template (no delete literal)', pg_temp.rows($q$delete from public.checklist_templates where id = '00000000-0000-4000-8000-0000000000c2'$q$);
select '16 owner cannot add an item to the template of someone else', pg_temp.rows($q$insert into public.checklist_template_items (template_id, sort_order, kind, label) values ('00000000-0000-4000-8000-0000000000c1', 9, 'check', 'x')$q$);
select '17 owner hands the task type over', pg_temp.rows($q$update public.task_types set owner_user_id = (select id from public.users where email = 'tom.berger@example.com') where key = 'general'$q$);
select '18 after the handover she cannot edit it any more', pg_temp.rows($q$update public.task_types set description = 'again' where key = 'general'$q$);
reset role;

select pg_temp.as_user('tom.berger@example.com');
select '19 edit.all edits a template of anyone', pg_temp.rows($q$update public.checklist_templates set description = 'by tom' where id = '00000000-0000-4000-8000-0000000000c2'$q$);
-- Manager holds task_types.edit.own (migration 20261225100000): own types only.
select '20 the manager cannot edit a task type they do not own', pg_temp.rows($q$update public.task_types set description = 'x' where key = 'inspection' and owner_user_id is distinct from auth.uid()$q$);
select '20b the manager edits a task type they own (general, handed over in 17)', pg_temp.rows($q$update public.task_types set description = 'by tom' where key = 'general'$q$);
reset role;

select pg_temp.as_user('max.wilckens@wilckens.com');
select '21 admin edits any task type', pg_temp.rows($q$update public.task_types set description = 'by admin' where key = 'inspection'$q$);
select '22 admin creates a task type', pg_temp.rows($q$insert into public.task_types (key, name) values ('smoke_type', 'Smoke type')$q$);
reset role;
rollback;
