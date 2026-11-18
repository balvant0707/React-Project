-- Copied from ~/maintenance_tool/supabase/tests/permissions_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Permission literals smoke test: docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/permissions_smoke.sql
-- (local stack, freshly seeded). Prints PASS / FAIL per check and fails the run (error at the end) if any check failed.
begin;

create temp table results (n serial, label text, ok boolean);
grant all on results to public;
grant usage on sequence results_n_seq to public;

create function pg_temp.check(p_label text, p_ok boolean) returns void language plpgsql security definer as $$
begin
  insert into results (label, ok) values (p_label, coalesce(p_ok, false));
end $$;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- Rows touched by a statement; -1 if it raised (RLS violation, permission denied, trigger exception).
create function pg_temp.rows(p_sql text) returns bigint language plpgsql as $$
declare
  v bigint;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
exception when others then
  return -1;
end $$;

create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
-- pg_temp helpers are created by postgres, which no longer gets PUBLIC execute by default (20261004130000): the test calls them after switching role.
grant execute on all functions in schema pg_temp to public;

-- ===== Registry and hierarchy =====
select pg_temp.check('registry has 147 literals', (select count(*) from public.permissions) = 147);
select pg_temp.check('edit implies check and view',
  (select array_agg(implied order by implied) from public.permission_closure where permission = 'tasks.edit.team')
    = array['tasks.check.team', 'tasks.edit.team', 'tasks.view.team']);
select pg_temp.check('create implies view, not edit',
  (select array_agg(implied order by implied) from public.permission_closure where permission = 'tickets.create.reported')
    = array['tickets.create.reported', 'tickets.view.reported']);
select pg_temp.check('scopeless literal stays alone',
  (select array_agg(implied) from public.permission_closure where permission = 'checklist_templates.create') = array['checklist_templates.create']);
-- permission_closure is a table kept by a trigger (20261128100000): a new edge shows up at once (with what it
-- implies in turn), and goes again.
insert into public.permission_implies (permission, implies) values ('checklist_templates.create', 'tasks.edit.assigned');
select pg_temp.check('closure follows a new edge, transitively',
  (select array_agg(implied order by implied) from public.permission_closure where permission = 'checklist_templates.create')
    = array['checklist_templates.create', 'tasks.check.assigned', 'tasks.edit.assigned', 'tasks.view.assigned']);
delete from public.permission_implies where permission = 'checklist_templates.create' and implies = 'tasks.edit.assigned';
select pg_temp.check('closure drops a removed edge',
  (select array_agg(implied) from public.permission_closure where permission = 'checklist_templates.create') = array['checklist_templates.create']);
select pg_temp.check('closure equals the recursive definition',
  (select count(*) from public.permission_closure) = (
    with recursive c (permission, implied) as (
      select p.key, p.key from public.permissions p
      union
      select c.permission, i.implies from c join public.permission_implies i on i.permission = c.implied)
    select count(*) from c));

insert into public.tasks (task_type_id, is_initiative, title) values ((select id from public.task_types where key = 'general'), true, 'Smoke initiative');
select pg_temp.check('an initiative uses its own module whatever its type',
  (select permission_module from public.tasks where title = 'Smoke initiative') = 'initiatives');
select pg_temp.check('other types use tasks',
  (select permission_module from public.tasks t join public.task_types tt on tt.id = t.task_type_id where tt.key = 'general' limit 1) = 'tasks');
update public.tasks set permission_module = 'initiatives' where id = (select id from public.tasks where permission_module = 'tasks' limit 1);
select pg_temp.check('a direct write to permission_module is overwritten',
  not exists (select 1 from public.tasks t where t.permission_module = 'initiatives' and not t.is_initiative));

-- ===== Fixtures: roles, assets, teams, tickets, tasks =====
-- The fixture users are on no queue team: let the queues be open to every holder of a literal (the demo data closes
-- Maintenance to a team, which ticket_queues_smoke.sql covers).
delete from public.ticket_queue_teams;
insert into public.roles (id, name) values
  ('00000000-0000-4000-8000-0000000000b1', 'P Tasks only'),
  ('00000000-0000-4000-8000-0000000000b2', 'P Initiatives only'),
  ('00000000-0000-4000-8000-0000000000b3', 'P Asset scope'),
  ('00000000-0000-4000-8000-0000000000b4', 'P Own and team'),
  ('00000000-0000-4000-8000-0000000000b5', 'P Template creator'),
  ('00000000-0000-4000-8000-0000000000b6', 'P Template deleter');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-4000-8000-0000000000b1', 'tasks.view.all'),
  ('00000000-0000-4000-8000-0000000000b2', 'initiatives.edit.all'),
  ('00000000-0000-4000-8000-0000000000b3', 'assets.edit.assigned_assets'),
  ('00000000-0000-4000-8000-0000000000b3', 'tickets.view.assigned_assets'),
  ('00000000-0000-4000-8000-0000000000b4', 'tickets.delete.reported'),
  ('00000000-0000-4000-8000-0000000000b4', 'tickets.create.team'),
  ('00000000-0000-4000-8000-0000000000b4', 'tasks.delete.team'),
  ('00000000-0000-4000-8000-0000000000b5', 'checklist_templates.create'),
  ('00000000-0000-4000-8000-0000000000b6', 'checklist_templates.delete');

insert into public.assets (id, name) values
  ('00000000-0000-4000-8000-0000000000a1', 'P root A'),
  ('00000000-0000-4000-8000-0000000000a3', 'P root B');
insert into public.assets (id, name, parent_asset_id) values ('00000000-0000-4000-8000-0000000000a2', 'P child A1', '00000000-0000-4000-8000-0000000000a1');
insert into public.teams (id, name) values
  ('00000000-0000-4000-8000-0000000000c1', 'P team'),
  ('00000000-0000-4000-8000-0000000000c2', 'P other team'),
  ('00000000-0000-4000-8000-0000000000c3', 'P tree team');
insert into public.team_uses (team_id, use) values
  ('00000000-0000-4000-8000-0000000000c1', 'assets'), ('00000000-0000-4000-8000-0000000000c3', 'assets');

delete from public.user_roles where user_id in (pg_temp.uid('ben.keller@example.com'), pg_temp.uid('paul.meier@example.com'));
delete from public.user_teams where user_id in (pg_temp.uid('ben.keller@example.com'), pg_temp.uid('paul.meier@example.com'));
insert into public.user_teams (user_id, team_id) values
  (pg_temp.uid('paul.meier@example.com'), '00000000-0000-4000-8000-0000000000c1'),
  (pg_temp.uid('ben.keller@example.com'), '00000000-0000-4000-8000-0000000000c3');
-- Where = the team of a node (assets.team_id). Ben's team is responsible for root A, Paul's for root B.
update public.assets set team_id = '00000000-0000-4000-8000-0000000000c3' where id = '00000000-0000-4000-8000-0000000000a1';
update public.assets set team_id = '00000000-0000-4000-8000-0000000000c1' where id = '00000000-0000-4000-8000-0000000000a3';

insert into public.tickets (id, title, asset_id, reporter_user_id) values
  ('00000000-0000-4000-8000-0000000000d1', 'P ticket on A1', '00000000-0000-4000-8000-0000000000a2', pg_temp.uid('ben.keller@example.com')),
  ('00000000-0000-4000-8000-0000000000d2', 'P ticket on B', '00000000-0000-4000-8000-0000000000a3', pg_temp.uid('anna.weber@example.com')),
  ('00000000-0000-4000-8000-0000000000d3', 'P ticket own', null, pg_temp.uid('paul.meier@example.com')),
  ('00000000-0000-4000-8000-0000000000d4', 'P ticket foreign', null, pg_temp.uid('anna.weber@example.com'));
insert into public.tasks (id, task_type_id, title, team_id) values
  ('00000000-0000-4000-8000-0000000000e1', (select id from public.task_types where key = 'general'), 'P task of my team', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000e2', (select id from public.task_types where key = 'general'), 'P task of another team', '00000000-0000-4000-8000-0000000000c2');
insert into public.checklist_templates (id, name) values ('00000000-0000-4000-8000-0000000000f1', 'P template');
insert into public.checklist_template_items (template_id, sort_order, kind, label) values ('00000000-0000-4000-8000-0000000000f1', 1, 'check', 'P item');

-- ===== Tasks and initiatives are separate modules =====
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('ben.keller@example.com'), '00000000-0000-4000-8000-0000000000b1');
select pg_temp.as_user('ben.keller@example.com');
select pg_temp.check('tasks.view.all sees ordinary tasks', (select count(*) from public.tasks where permission_module = 'tasks') > 0);
select pg_temp.check('... but no initiatives', (select count(*) from public.tasks where permission_module = 'initiatives') = 0);
select pg_temp.check('... and cannot create an initiative',
  pg_temp.rows($q$insert into public.tasks (task_type_id, is_initiative, title) values ((select id from public.task_types where key = 'general'), true, 'Nope')$q$) = -1);
reset role;

delete from public.user_roles where user_id = pg_temp.uid('ben.keller@example.com');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('ben.keller@example.com'), '00000000-0000-4000-8000-0000000000b2');
select pg_temp.as_user('ben.keller@example.com');
select pg_temp.check('initiatives.edit.all implies view', (select count(*) from public.tasks where permission_module = 'initiatives') > 0);
select pg_temp.check('... and no ordinary tasks (beyond those assigned to him)', (select count(*) from public.tasks where permission_module = 'tasks' and assigned_user_id is distinct from auth.uid()) = 0);
select pg_temp.check('... can edit an initiative', pg_temp.rows($q$update public.tasks set description = 'edited' where permission_module = 'initiatives'$q$) > 0);
select pg_temp.check('... cannot create one (no create literal)',
  pg_temp.rows($q$insert into public.tasks (task_type_id, is_initiative, title) values ((select id from public.task_types where key = 'general'), true, 'Nope')$q$) = -1);
select pg_temp.check('task_tree shows the initiative', (select count(*) from public.task_tree((select id from public.tasks where permission_module = 'initiatives' limit 1))) > 0);
select pg_temp.check('initiative literal does not edit ordinary tasks', pg_temp.rows($q$update public.tasks set description = 'x' where permission_module = 'tasks'$q$) = 0);
reset role;

-- ===== assigned_assets: Ben's team is responsible for root A, Paul's team for root B =====
delete from public.user_roles where user_id = pg_temp.uid('ben.keller@example.com');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('ben.keller@example.com'), '00000000-0000-4000-8000-0000000000b3');
select pg_temp.as_user('ben.keller@example.com');
select pg_temp.check('assignment covers the subtree: root and child visible',
  (select count(*) from public.assets where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2')) = 2);
select pg_temp.check('... other roots stay hidden', (select count(*) from public.assets where id = '00000000-0000-4000-8000-0000000000a3') = 0);
select pg_temp.check('... child asset can be edited', pg_temp.rows($q$update public.assets set name = 'P child A1 edited' where id = '00000000-0000-4000-8000-0000000000a2'$q$) = 1);
select pg_temp.check('... asset outside the subtree cannot', pg_temp.rows($q$update public.assets set name = 'x' where id = '00000000-0000-4000-8000-0000000000a3'$q$) = 0);
select pg_temp.check('... cannot be moved below a node he cannot edit',
  pg_temp.rows($q$update public.assets set parent_asset_id = '00000000-0000-4000-8000-0000000000a3' where id = '00000000-0000-4000-8000-0000000000a2'$q$) = -1);
select pg_temp.check('tickets.view.assigned_assets: ticket on the subtree visible',
  (select count(*) from public.tickets where id = '00000000-0000-4000-8000-0000000000d1') = 1);
select pg_temp.check('... ticket on another root hidden', (select count(*) from public.tickets where id = '00000000-0000-4000-8000-0000000000d2') = 0);
reset role;

delete from public.user_roles where user_id = pg_temp.uid('paul.meier@example.com');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('paul.meier@example.com'), '00000000-0000-4000-8000-0000000000b3');
select pg_temp.as_user('paul.meier@example.com');
select pg_temp.check('team assignment: Paul sees root B', (select count(*) from public.assets where id = '00000000-0000-4000-8000-0000000000a3') = 1);
select pg_temp.check('... but not root A', (select count(*) from public.assets where id = '00000000-0000-4000-8000-0000000000a1') = 0);
select pg_temp.check('... ticket on B visible through the team', (select count(*) from public.tickets where id = '00000000-0000-4000-8000-0000000000d2') = 1);
reset role;

-- ===== asset teams: they add up along the path, literals decide what a member may do, only released teams are set =====
insert into public.assets (id, name, parent_asset_id, team_id) values
  ('00000000-0000-4000-8000-0000000000a4', 'P child B1', '00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000c3');
select pg_temp.check('releasing a team for assets is logged',
  (select count(*) from public.team_uses where use = 'assets') > 0 and exists (select 1 from public.role_assignment_log where kind = 'team_switch' and team_name = 'P team' and action = 'added'));
select pg_temp.check('setting a team on an asset is logged',
  exists (select 1 from public.role_assignment_log where kind = 'asset_grant' and action = 'added'
          and asset_name = 'P child B1' and team_name = 'P tree team' and role_id is null));
select pg_temp.as_user('paul.meier@example.com');
select pg_temp.check('a team higher up keeps its access when a lower node names another team: Paul sees B1',
  (select count(*) from public.assets where id = '00000000-0000-4000-8000-0000000000a4') = 1);
select pg_temp.check('a scoped editor cannot hand the node he works through to a team that is not his: no self-lockout',
  pg_temp.rows($q$update public.assets set team_id = '00000000-0000-4000-8000-0000000000c3' where id = '00000000-0000-4000-8000-0000000000a3'$q$) = -1);
select pg_temp.check('... but a node below may go to another team while his own stays on the path (and back)',
  pg_temp.rows($q$update public.assets set team_id = '00000000-0000-4000-8000-0000000000c1' where id = '00000000-0000-4000-8000-0000000000a4'$q$) = 1
  and pg_temp.rows($q$update public.assets set team_id = '00000000-0000-4000-8000-0000000000c3' where id = '00000000-0000-4000-8000-0000000000a4'$q$) = 1);
select pg_temp.check('a team that is not released for assets cannot be set',
  pg_temp.rows($q$update public.assets set team_id = '00000000-0000-4000-8000-0000000000c2' where id = '00000000-0000-4000-8000-0000000000a3'$q$) = -1);
reset role;
select pg_temp.as_user('ben.keller@example.com');
select pg_temp.check('... and the lower team sees B1 but not root B',
  (select count(*) from public.assets where id = '00000000-0000-4000-8000-0000000000a4') = 1
  and (select count(*) from public.assets where id = '00000000-0000-4000-8000-0000000000a3') = 0);
reset role;
delete from public.user_roles where user_id = pg_temp.uid('paul.meier@example.com');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('paul.meier@example.com'), '00000000-0000-4000-8000-0000000000b2');
select pg_temp.as_user('paul.meier@example.com');
select pg_temp.check('a member of the responsible team without an assigned_assets literal sees nothing there',
  (select count(*) from public.assets where id in ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000a4')) = 0);
reset role;

-- ===== own / team scopes of tickets and tasks =====
delete from public.user_roles where user_id = pg_temp.uid('paul.meier@example.com');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('paul.meier@example.com'), '00000000-0000-4000-8000-0000000000b4');
select pg_temp.as_user('paul.meier@example.com');
select pg_temp.check('tickets.delete.reported: another reporter''s ticket survives', pg_temp.rows($q$delete from public.tickets where id = '00000000-0000-4000-8000-0000000000d4'$q$) = 0);
select pg_temp.check('... own ticket can be deleted', pg_temp.rows($q$delete from public.tickets where id = '00000000-0000-4000-8000-0000000000d3'$q$) = 1);
select pg_temp.check('tickets.create.team: ticket for his team', pg_temp.rows($q$insert into public.tickets (title, assigned_team_id) values ('P team ticket', '00000000-0000-4000-8000-0000000000c1')$q$) = 1);
select pg_temp.check('... ticket for another team is refused', pg_temp.rows($q$insert into public.tickets (title, assigned_team_id) values ('P other', '00000000-0000-4000-8000-0000000000c2')$q$) = -1);
select pg_temp.check('tasks.delete.team: task of another team survives', pg_temp.rows($q$delete from public.tasks where id = '00000000-0000-4000-8000-0000000000e2'$q$) = 0);
select pg_temp.check('... task of his team can be deleted', pg_temp.rows($q$delete from public.tasks where id = '00000000-0000-4000-8000-0000000000e1'$q$) = 1);
reset role;

-- ===== assigned / created / team follow the current step (20261212100000_assigned_scope.sql) =====
-- Paul (team c1) may read what he created and edit what is assigned to him, what a step put with him or his team.
insert into public.roles (id, name) values ('00000000-0000-4000-8000-0000000000b7', 'P Assigned, team, created');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-4000-8000-0000000000b7', 'tasks.edit.assigned'),
  ('00000000-0000-4000-8000-0000000000b7', 'tasks.edit.team'),
  ('00000000-0000-4000-8000-0000000000b7', 'tasks.view.created'),
  ('00000000-0000-4000-8000-0000000000b7', 'tasks.create.created'),
  ('00000000-0000-4000-8000-0000000000b7', 'tickets.edit.assigned'),
  ('00000000-0000-4000-8000-0000000000b7', 'tickets.view.reported');
delete from public.user_roles where user_id = pg_temp.uid('paul.meier@example.com');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('paul.meier@example.com'), '00000000-0000-4000-8000-0000000000b7');
select set_config('request.jwt.claims', '', true);  -- as the system, not as the last test user
update public.users set deputy_user_id = pg_temp.uid('paul.meier@example.com') where id = pg_temp.uid('anna.weber@example.com');
insert into public.tasks (id, task_type_id, title, team_id, created_by_user_id) values
  ('00000000-0000-4000-8000-0000000000e3', (select id from public.task_types where key = 'general'), 'P created by Paul', '00000000-0000-4000-8000-0000000000c2', pg_temp.uid('paul.meier@example.com')),
  ('00000000-0000-4000-8000-0000000000e4', (select id from public.task_types where key = 'general'), 'P step with Paul', '00000000-0000-4000-8000-0000000000c2', null),
  ('00000000-0000-4000-8000-0000000000e5', (select id from public.task_types where key = 'general'), 'P step with his team', '00000000-0000-4000-8000-0000000000c2', null),
  ('00000000-0000-4000-8000-0000000000e6', (select id from public.task_types where key = 'general'), 'P step with a person of his team', '00000000-0000-4000-8000-0000000000c2', null),
  ('00000000-0000-4000-8000-0000000000e7', (select id from public.task_types where key = 'general'), 'P step with Anna (Paul stands in)', '00000000-0000-4000-8000-0000000000c2', null),
  ('00000000-0000-4000-8000-0000000000e8', (select id from public.task_types where key = 'general'), 'P step with Anna, created by Paul', '00000000-0000-4000-8000-0000000000c2', pg_temp.uid('paul.meier@example.com'));
update public.tasks set current_assignee_user_id = null, current_assignee_team_id = null, current_assignee_role_id = null
where id in ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000e5');
update public.tasks set current_assignee_user_id = pg_temp.uid('paul.meier@example.com'), current_assignee_team_id = null, current_assignee_role_id = null
where id = '00000000-0000-4000-8000-0000000000e4';
update public.tasks set current_assignee_team_id = '00000000-0000-4000-8000-0000000000c1', current_assignee_role_id = null where id = '00000000-0000-4000-8000-0000000000e5';
update public.tasks set current_assignee_user_id = pg_temp.uid('sara.novak@example.com'), current_assignee_team_id = '00000000-0000-4000-8000-0000000000c1', current_assignee_role_id = null
where id = '00000000-0000-4000-8000-0000000000e6';
update public.tasks set current_assignee_user_id = pg_temp.uid('anna.weber@example.com'), current_assignee_team_id = null, current_assignee_role_id = null
where id in ('00000000-0000-4000-8000-0000000000e7', '00000000-0000-4000-8000-0000000000e8');
create temp table created_task (id uuid);
grant all on created_task to public;
create temp table older_task as select id from public.tasks where title not like 'P %' and xmin <> pg_current_xact_id()::xid limit 1;
grant all on older_task to public;
insert into public.tickets (id, title, reporter_user_id, assigned_user_id) values
  ('00000000-0000-4000-8000-0000000000d5', 'P ticket assigned to Paul', pg_temp.uid('anna.weber@example.com'), pg_temp.uid('paul.meier@example.com'));

select pg_temp.as_user('paul.meier@example.com');
select pg_temp.check('view.created: Paul reads the task he created', (select count(*) from public.tasks where id = '00000000-0000-4000-8000-0000000000e3') = 1);
select pg_temp.check('... but does not edit it (no edit.created)', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000e3'$q$) = 0);
select pg_temp.check('edit.assigned: the step resolved to Paul', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000e4'$q$) = 1);
select pg_temp.check('edit.team: the step is with his team', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000e5'$q$) = 1);
select pg_temp.check('... not once the step names a person', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000e6'$q$) = 0);
select pg_temp.check('edit.assigned: the deputy of the step''s person', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000e7'$q$) = 1);
select pg_temp.check('... but not on a task the deputy created', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000e8'$q$) = 0);
select pg_temp.check('user_has_access agrees (step person edits, creator does not)',
  public.can_access_entity('tasks', '00000000-0000-4000-8000-0000000000e4', 'edit')
  and public.can_access_entity('tasks', '00000000-0000-4000-8000-0000000000e5', 'edit')
  and not public.can_access_entity('tasks', '00000000-0000-4000-8000-0000000000e3', 'edit')
  and not public.can_access_entity('tasks', '00000000-0000-4000-8000-0000000000e6', 'edit'));
select pg_temp.check('tickets.edit.assigned: the ticket assigned to Paul', pg_temp.rows($q$update public.tickets set title = 'x' where id = '00000000-0000-4000-8000-0000000000d5'$q$) = 1);
select pg_temp.check('... not another reporter''s ticket', pg_temp.rows($q$update public.tickets set title = 'x' where id = '00000000-0000-4000-8000-0000000000d4'$q$) = 0);
insert into created_task select public.task_create((select id from public.task_types where key = 'general'), 'P handed over', current_date,
  p_team_id => '00000000-0000-4000-8000-0000000000c2', p_own_items => array['one', 'two']);
select pg_temp.check('task_create: a creator who only reads still sets up the task (own steps)',
  (select count(*) from public.task_checklist_items where task_id = (select id from created_task) and not from_template) = 2);
select pg_temp.check('... and cannot edit it afterwards', pg_temp.rows($q$update public.tasks set title = 'x' where id = (select id from created_task)$q$) = 0);
-- (Every fixture of this test is inserted in its one transaction, so the check takes a task from the seed.)
select pg_temp.check('task_create_finish refuses a task that was not just created by the caller',
  pg_temp.rows($q$select public.task_create_finish((select id from older_task), null, false, null, array['x'], '[]')$q$) = -1);
reset role;

-- ===== The step has precedence; nobody decides their own request (20261212100000_assigned_scope.sql) =====
select set_config('request.jwt.claims', '', true);
insert into public.tasks (id, task_type_id, title, team_id, assigned_user_id) values
  ('00000000-0000-4000-8000-0000000000e9', (select id from public.task_types where key = 'general'), 'P his team, step with a role', '00000000-0000-4000-8000-0000000000c1', null),
  ('00000000-0000-4000-8000-0000000000ea', (select id from public.task_types where key = 'general'), 'P assigned to Paul, step with a role', null, pg_temp.uid('paul.meier@example.com'));
update public.tasks set current_assignee_role_id = (select id from public.roles where name = 'Purchasing'), current_assignee_user_id = null, current_assignee_team_id = null
where id in ('00000000-0000-4000-8000-0000000000e9', '00000000-0000-4000-8000-0000000000ea');
select pg_temp.as_user('paul.meier@example.com');
select pg_temp.check('step precedence: the task''s team gives no edit while a role step runs', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000e9'$q$) = 0);
select pg_temp.check('... nor the task''s person', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000ea'$q$) = 0);
select pg_temp.check('... and user_has_access agrees', not public.can_access_entity('tasks', '00000000-0000-4000-8000-0000000000e9', 'edit'));
select pg_temp.check('... but his team still sees and checks it (precedence is for edit / delete only)',
  (select count(*) from public.tasks where id = '00000000-0000-4000-8000-0000000000e9') = 1
  and public.can_access_entity('tasks', '00000000-0000-4000-8000-0000000000e9', 'check'));
reset role;
select set_config('request.jwt.claims', '', true);
update public.tasks set current_assignee_role_id = null where id = '00000000-0000-4000-8000-0000000000e9';
select pg_temp.as_user('paul.meier@example.com');
select pg_temp.check('... a step without a rule leaves it to the task''s team', pg_temp.rows($q$update public.tasks set title = 'x' where id = '00000000-0000-4000-8000-0000000000e9'$q$) = 1);
reset role;

-- A purchase request by Lena (Purchasing) waiting in the Purchasing step, made a decision step for the test.
select set_config('request.jwt.claims', '', true);
insert into public.tasks (id, task_type_id, title, created_by_user_id, team_id) values
  ('00000000-0000-4000-8000-0000000000eb', (select id from public.task_types where key = 'purchase_request'), 'P Lena''s request', pg_temp.uid('lena.fischer@example.com'), '00000000-0000-4000-8000-0000000000c1');
update public.tasks set current_step_key = 'purchasing', current_assignee_role_id = (select id from public.roles where name = 'Purchasing'),
       current_assignee_user_id = null, current_assignee_team_id = null
where id = '00000000-0000-4000-8000-0000000000eb';
select pg_temp.check('a role step: the requester in that role acts while it is no decision',
  public.task_step_actor(pg_temp.uid('lena.fischer@example.com'), (select t from public.tasks t where id = '00000000-0000-4000-8000-0000000000eb')));
update public.task_type_steps set is_decision = true
where step_key = 'purchasing' and task_type_id = (select id from public.task_types where key = 'purchase_request');
select pg_temp.check('... but never decides her own request',
  not public.task_step_actor(pg_temp.uid('lena.fischer@example.com'), (select t from public.tasks t where id = '00000000-0000-4000-8000-0000000000eb')));
select pg_temp.check('... and it is not in her "to decide" list', not exists (
  select 1 from public.tasks_to_decide where id = '00000000-0000-4000-8000-0000000000eb'
    and created_by_user_id = pg_temp.uid('lena.fischer@example.com')));
-- Tom (Manager, tasks.edit.all) may edit the request but does not act in the Purchasing step.
select pg_temp.as_user('tom.berger@example.com');
select pg_temp.check('a decision step is not forwarded by somebody who only may edit',
  pg_temp.rows($q$select public.task_forward('00000000-0000-4000-8000-0000000000eb', (select id from public.users where email = 'tom.berger@example.com'))$q$) = -1);
reset role;
select set_config('request.jwt.claims', '', true);
update public.task_type_steps set is_decision = false
where step_key = 'purchasing' and task_type_id = (select id from public.task_types where key = 'purchase_request');
select pg_temp.as_user('tom.berger@example.com');
select pg_temp.check('... an ordinary step still is (to himself)',
  pg_temp.rows($q$select public.task_forward('00000000-0000-4000-8000-0000000000eb', (select id from public.users where email = 'tom.berger@example.com'))$q$) = 1);
reset role;
select set_config('request.jwt.claims', '', true);
update public.task_type_steps set assignee_kind = 'requester', assignee_role_id = null, is_decision = true
where step_key = 'purchasing' and task_type_id = (select id from public.task_types where key = 'purchase_request');
select pg_temp.check('a decision step never resolves to the requester (falls back to a role)',
  (select assignee_user_id is null and assignee_role_id is not null
   from public.resolve_step_assignee((select id from public.task_type_steps where step_key = 'purchasing'
                                        and task_type_id = (select id from public.task_types where key = 'purchase_request')),
                                     pg_temp.uid('lena.fischer@example.com'))));

-- ===== checklist templates: create and delete reach the items =====
delete from public.user_roles where user_id = pg_temp.uid('ben.keller@example.com');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('ben.keller@example.com'), '00000000-0000-4000-8000-0000000000b5');
select pg_temp.as_user('ben.keller@example.com');
-- Two statements: the item policy looks the template up (its owner), which a CTE of the same statement does not show yet.
select pg_temp.check('checklist_templates.create: can add a template', pg_temp.rows($q$insert into public.checklist_templates (id, name) values ('00000000-0000-4000-8000-0000000000f9', 'P by creator')$q$) = 1);
select pg_temp.check('... and items to its own template', pg_temp.rows($q$insert into public.checklist_template_items (template_id, sort_order, kind, label) values ('00000000-0000-4000-8000-0000000000f9', 1, 'check', 'x')$q$) = 1);
select pg_temp.check('... but no item to the template of someone else', pg_temp.rows($q$insert into public.checklist_template_items (template_id, sort_order, kind, label) values ('00000000-0000-4000-8000-0000000000f1', 9, 'check', 'x')$q$) = -1);
select pg_temp.check('... cannot edit an existing template', pg_temp.rows($q$update public.checklist_templates set name = 'x' where id = '00000000-0000-4000-8000-0000000000f1'$q$) = 0);
reset role;
delete from public.user_roles where user_id = pg_temp.uid('ben.keller@example.com');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('ben.keller@example.com'), '00000000-0000-4000-8000-0000000000b6');
select pg_temp.as_user('ben.keller@example.com');
select pg_temp.check('checklist_templates.delete: can remove items', pg_temp.rows($q$delete from public.checklist_template_items where template_id = '00000000-0000-4000-8000-0000000000f1'$q$) = 1);
reset role;

-- ===== The permission tables themselves =====
select pg_temp.as_user('anna.weber@example.com');
select pg_temp.check('another user''s literals are not readable',
  pg_temp.rows($q$select public.user_permissions((select id from public.users where email = 'ben.keller@example.com'))$q$) = -1);
select pg_temp.check('a worker cannot give herself a literal',
  pg_temp.rows($q$insert into public.role_permissions (role_id, permission) select role_id, 'assets.delete.all' from public.user_roles limit 1$q$) = -1);
reset role;

select n, case when ok then 'PASS' else 'FAIL' end as result, label from results order by n;
do $$
begin
  if exists (select 1 from results where not ok) then
    raise exception 'permissions smoke test: % check(s) failed', (select count(*) from results where not ok);
  end if;
end $$;
rollback;
