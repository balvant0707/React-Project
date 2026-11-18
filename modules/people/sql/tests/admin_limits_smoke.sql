-- Copied from ~/maintenance_tool/supabase/tests/admin_limits_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Admin limits (~/maintenance_tool/docs/permissions.md "Admin limits"; migration 20261121100000_role_assignment_log.sql and the later
-- stages). Run on the local database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/admin_limits_smoke.sql
-- One transaction, rolled back; a failed assertion aborts with its message.
-- Each stage adds its checks here: an admin without a content role sees nothing of the area, with a role what the
-- role gives.
begin;

create temp table people on commit drop as select email, id from public.users;
grant select on people to public;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from pg_temp.people where email = p_email $$;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_email), 'role', 'authenticated', 'aal', 'aal2')::text, true);
end $$;
create function pg_temp.role_id(p_name text) returns uuid language sql as $$ select id from public.roles where name = p_name $$;
grant execute on all functions in schema pg_temp to public;

-- The admin under test holds only the role Admin (the seed gives the local admin Manager as a second role).
delete from public.user_roles where user_id = pg_temp.uid('max.wilckens@wilckens.com') and role_id <> pg_temp.role_id('Admin');
create temp table log_start on commit drop as select now() as at, (select count(*) from public.role_assignment_log) as n;
grant select on log_start to public;

-- 0a. The removal above is logged as a system change (no signed-in user).
do $$
begin
  assert exists (select 1 from public.role_assignment_log
                 where kind = 'role' and action = 'removed' and role_name = 'Manager'
                   and user_id = pg_temp.uid('max.wilckens@wilckens.com') and by_user_id is null),
    'removing a role without a session is logged as a system change';
end $$;

-- 0b. The admin changes roles, permissions and teams: every change is logged with the admin as actor.
set local role authenticated;
do $$
declare
  v_admin uuid := pg_temp.uid('max.wilckens@wilckens.com');
  v_anna uuid := pg_temp.uid('anna.weber@example.com');
  v_team uuid := (select team_id from public.user_teams where user_id = pg_temp.uid('anna.weber@example.com') limit 1);
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.user_roles (user_id, role_id) values (v_anna, pg_temp.role_id('Purchasing'));
  delete from public.user_roles where user_id = v_anna and role_id = pg_temp.role_id('Purchasing');
  insert into public.role_permissions (role_id, permission) values (pg_temp.role_id('Workshop'), 'people.edit');
  delete from public.user_teams where user_id = v_anna and team_id = v_team;
  insert into public.user_teams (user_id, team_id) values (v_anna, v_team);
  -- The admin gives themselves a role: the trace the log is for.
  insert into public.user_roles (user_id, role_id) values (v_admin, pg_temp.role_id('HR'));
end $$;
reset role;

do $$
declare
  v_admin uuid := pg_temp.uid('max.wilckens@wilckens.com');
  v_anna uuid := pg_temp.uid('anna.weber@example.com');
begin
  assert (select count(*) from public.role_assignment_log l, pg_temp.log_start s
          where l.happened_at >= s.at and l.by_user_id = v_admin) = 6, 'six changes by the admin';
  assert exists (select 1 from public.role_assignment_log where by_user_id = v_admin and kind = 'role' and action = 'added'
                 and user_id = v_anna and role_name = 'Purchasing' and user_name is not null and by_user_name is not null),
    'role added, with names';
  assert exists (select 1 from public.role_assignment_log where by_user_id = v_admin and kind = 'role' and action = 'removed'
                 and user_id = v_anna and role_name = 'Purchasing'), 'role removed';
  assert exists (select 1 from public.role_assignment_log where by_user_id = v_admin and kind = 'permission'
                 and role_name = 'Workshop' and permission = 'people.edit' and action = 'added'), 'permission added';
  assert exists (select 1 from public.role_assignment_log where by_user_id = v_admin and kind = 'team' and action = 'removed'
                 and user_id = v_anna and team_name is not null), 'team membership removed';
  assert exists (select 1 from public.role_assignment_log where by_user_id = v_admin and kind = 'team' and action = 'added'
                 and user_id = v_anna), 'team membership added';
  assert exists (select 1 from public.role_assignment_log where by_user_id = v_admin and kind = 'role' and action = 'added'
                 and user_id = v_admin and role_name = 'HR'), 'self-assignment logged';
end $$;
-- Back to an admin without a content role for the rest of the test.
delete from public.user_roles where user_id = pg_temp.uid('max.wilckens@wilckens.com') and role_id = pg_temp.role_id('HR');
delete from public.role_permissions where role_id = pg_temp.role_id('Workshop') and permission = 'people.edit';

-- 0c. Changing a key in place is refused (it would slip past the log).
do $$
declare v_ok boolean := false;
begin
  begin
    update public.user_roles set role_id = pg_temp.role_id('HR')
    where user_id = pg_temp.uid('anna.weber@example.com');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'user_roles cannot be updated in place';
end $$;

-- 0d. Only HR (people.edit) reads the log; the admin does not, nor does anybody else.
set local role authenticated;
do $$
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert (select count(*) from public.role_assignment_log) = 0, 'the admin does not read the log';
  perform pg_temp.act_as('tom.berger@example.com');
  assert (select count(*) from public.role_assignment_log) = 0, 'a manager does not read the log';
  perform pg_temp.act_as('hanna.richter@example.com');
  assert (select count(*) from public.role_assignment_log) > 0, 'HR reads the log';
end $$;

-- 0e. Nobody changes or removes the log: not HR, not the admin, not the service role, not postgres.
do $$
declare
  v_ok boolean;
  v_who text;
begin
  foreach v_who in array array['hanna.richter@example.com', 'max.wilckens@wilckens.com'] loop
    perform pg_temp.act_as(v_who);
    v_ok := false;
    begin
      update public.role_assignment_log set role_name = 'x';
    exception when insufficient_privilege then v_ok := true;
    end;
    assert v_ok, format('%s cannot update the log', v_who);
    v_ok := false;
    begin
      delete from public.role_assignment_log;
    exception when insufficient_privilege then v_ok := true;
    end;
    assert v_ok, format('%s cannot delete from the log', v_who);
    v_ok := false;
    begin
      insert into public.role_assignment_log (kind, action, role_id, permission) values ('permission', 'added', gen_random_uuid(), 'x');
    exception when insufficient_privilege then v_ok := true;
    end;
    assert v_ok, format('%s cannot write the log', v_who);
  end loop;
end $$;
reset role;

set local role service_role;
do $$
declare v_ok boolean := false;
begin
  begin
    delete from public.role_assignment_log;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'the service role cannot delete from the log';
end $$;
reset role;

do $$
declare v_ok boolean;
begin
  v_ok := false;
  begin
    update public.role_assignment_log set role_name = 'x';
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'postgres cannot update the log';
  v_ok := false;
  begin
    delete from public.role_assignment_log;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'postgres cannot delete from the log';
  v_ok := false;
  begin
    truncate public.role_assignment_log;
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'postgres cannot truncate the log';
end $$;

-- 0f. Deleting a role or a person keeps the log intact (no foreign keys, nothing rewritten).
do $$
declare v_role uuid;
begin
  insert into public.roles (name) values ('Smoke temp role') returning id into v_role;
  insert into public.role_permissions (role_id, permission) values (v_role, 'items.view');
  insert into public.user_roles (user_id, role_id) values (pg_temp.uid('anna.weber@example.com'), v_role);
  delete from public.roles where id = v_role;
  assert (select count(*) from public.role_assignment_log where role_id = v_role) = 4,
    'a deleted role leaves its additions and the cascaded removals in the log';
end $$;

-- ===================================================================================
-- Stage 1: personal data (migration 20261121110000_admin_limits_people.sql)
-- ===================================================================================

-- A training proof of somebody else (uploaded by Anna) to test deletion with.
insert into public.attachments (entity_type, entity_id, storage_path, file_name, uploaded_by_user_id)
select 'training_records', r.id, 'training_records/' || r.id || '/smoke.pdf', 'smoke.pdf', pg_temp.uid('anna.weber@example.com')
from public.training_records r where r.user_id <> pg_temp.uid('max.wilckens@wilckens.com') limit 1;

-- In the seed the admin is Tom's deputy and so stands in for him on Anna's leave; take that away to test the rule.
update public.users set deputy_user_id = null where id = pg_temp.uid('tom.berger@example.com');

-- 1a. The admin without a content role: no private data, no trainings, reviews or leave of others, no HR writes.
set local role authenticated;
do $$
declare
  v_admin uuid := pg_temp.uid('max.wilckens@wilckens.com');
  v_anna uuid := pg_temp.uid('anna.weber@example.com');
  v_ok boolean;
  v_n integer;
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert (select count(*) from public.person_private) = 0, 'admin reads no private person data';
  assert (select count(*) from public.training_records where user_id <> v_admin) = 0, 'admin reads no training records of others';
  assert (select count(*) from public.training_exemptions where user_id <> v_admin) = 0, 'admin reads no exemptions of others';
  assert (select count(*) from public.attachments where entity_type = 'training_records') = 0, 'admin sees no training proofs of others';
  assert (select count(*) from public.job_description_versions where status in ('draft', 'submitted') and created_by_user_id <> v_admin) = 0,
    'admin reads no drafts of others';
  assert not public.user_training_access_for_me(v_anna, 'view'), 'training access: no admin branch';
  assert not public.user_fit_access_for_me(v_anna, 'view'), 'fit review access: no admin branch';
  assert not public.leave_can_enter_for(v_anna), 'admin enters no leave for people outside their line (as admin)';
  -- The admin is at the top of the seeded org chart and sees their reports' leave as a supervisor; what goes is the
  -- company-wide view (leave_visible_user_ids, leave_violations ask leave.view.all without bypass).
  assert not public.rls_has('leave.view.all'), 'admin has no company-wide leave view';

  v_ok := false;
  begin
    insert into public.training_types (name) values ('Smoke admin type');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'admin cannot add a training type';
  v_ok := false;
  begin
    insert into public.person_private (user_id) values (v_anna);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'admin cannot write private person data';
  v_ok := false;
  begin
    insert into public.positions (name) values ('Smoke admin position');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'admin cannot add a position';
  v_ok := false;
  begin
    perform public.job_description_publish((select id from public.job_description_versions limit 1));
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'admin cannot publish a job description';

  delete from public.position_assignment_log;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'admin deletes no assignment log entries';
end $$;
reset role;

do $$
begin
  assert (select count(*) from public.position_assignment_log) > 0, 'assignment log untouched by the admin';
  assert not (pg_temp.uid('max.wilckens@wilckens.com') = any (public.job_description_approvers())), 'admin is no job description approver';
  assert (select count(*) from public.attachments where entity_type = 'training_records' and file_name = 'smoke.pdf') = 1, 'proof untouched';
end $$;

-- 1b. HR reads and erases what the admin no longer may.
set local role authenticated;
do $$
declare v_n integer;
begin
  perform pg_temp.act_as('hanna.richter@example.com');
  assert (select count(*) from public.person_private) > 0, 'HR reads private person data';
  assert public.user_training_access_for_me(pg_temp.uid('anna.weber@example.com'), 'edit'), 'HR edits trainings';
  delete from public.attachments where entity_type = 'training_records' and file_name = 'smoke.pdf';
  get diagnostics v_n = row_count;
  assert v_n = 1, 'HR deletes a training proof';
  delete from public.position_assignment_log where id = (select id from public.position_assignment_log limit 1);
  get diagnostics v_n = row_count;
  assert v_n = 1, 'HR deletes an assignment log entry';
end $$;
reset role;

-- 1c. A content role brings it back: the admin with HR as second role reads private data again.
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('max.wilckens@wilckens.com'), pg_temp.role_id('HR'));
set local role authenticated;
do $$
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert (select count(*) from public.person_private) > 0, 'admin with HR reads private person data';
  assert public.user_training_access_for_me(pg_temp.uid('anna.weber@example.com'), 'view'), 'admin with HR sees trainings';
end $$;
reset role;
delete from public.user_roles where user_id = pg_temp.uid('max.wilckens@wilckens.com') and role_id = pg_temp.role_id('HR');

-- ===================================================================================
-- Stage 1b: delegable administration (migration 20261121120000_admin_limits_delegation.sql)
-- ===================================================================================

-- Tom (Manager) gets teams.manage through a temporary role, so the literal is tested without people.edit.
insert into public.roles (name) values ('Smoke team managers');
insert into public.role_permissions (role_id, permission) values (pg_temp.role_id('Smoke team managers'), 'teams.manage');
insert into public.user_roles (user_id, role_id) values (pg_temp.uid('tom.berger@example.com'), pg_temp.role_id('Smoke team managers'));

do $$
begin
  assert exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'HR' and rp.permission = 'users.manage'), 'HR holds users.manage';
  assert exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'HR' and rp.permission = 'teams.manage'), 'HR holds teams.manage';
end $$;

set local role authenticated;
do $$
declare
  v_ok boolean;
  v_n integer;
  v_team uuid;
  v_ben uuid := pg_temp.uid('ben.keller@example.com');
begin
  -- 1b-a. HR manages teams and users, but assigns no role and changes no sign-in method or account e-mail.
  perform pg_temp.act_as('hanna.richter@example.com');
  assert public.can_manage_users() and public.can_manage_teams(), 'HR manages users and teams';
  insert into public.teams (name) values ('Smoke HR team') returning id into v_team;
  insert into public.user_teams (user_id, team_id) values (v_ben, v_team);
  insert into public.team_owners (team_id, user_id) values (v_team, v_ben);
  update public.teams set description = 'by HR' where id = v_team;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'HR edits a team';
  update public.users set supervisor_user_id = pg_temp.uid('tom.berger@example.com') where id = v_ben;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'HR sets a supervisor';
  assert (select count(*) from public.user_roles where user_id <> pg_temp.uid('hanna.richter@example.com')) > 0, 'HR reads the role assignments of others';
  v_ok := false;
  begin
    insert into public.user_roles (user_id, role_id) values (pg_temp.uid('hanna.richter@example.com'), pg_temp.role_id('Admin'));
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'HR cannot assign a role (not even Admin to themselves)';
  delete from public.user_roles where user_id = v_ben;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'HR cannot remove roles';
  v_ok := false;
  begin
    insert into public.role_permissions (role_id, permission) values (pg_temp.role_id('HR'), 'tasks.view.all');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'HR cannot change the permission matrix';
  v_ok := false;
  begin
    update public.users set sign_in_method = 'sso' where id = v_ben;
  exception when others then v_ok := true;
  end;
  assert v_ok, 'HR cannot change the sign-in method';
  v_ok := false;
  begin
    update public.users set email = 'other@example.com' where id = v_ben;
  exception when others then v_ok := true;
  end;
  assert v_ok, 'HR cannot change the e-mail of an account';

  -- 1b-b. teams.manage alone: teams yes, people and roles no.
  perform pg_temp.act_as('tom.berger@example.com');
  assert public.can_manage_teams() and not public.can_manage_users(), 'Tom manages teams, not users';
  delete from public.user_teams where team_id = v_team and user_id = v_ben;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'a team manager removes a member';
  update public.users set position = 'changed by a team manager' where id = v_ben;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'a team manager does not edit people';
  delete from public.teams where id = v_team;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'a team manager deletes a team';

  -- 1b-c. Without the literals: no team administration.
  perform pg_temp.act_as('anna.weber@example.com');
  assert not public.can_manage_teams() and not public.can_manage_users(), 'Anna manages nothing';
  v_ok := false;
  begin
    insert into public.teams (name) values ('Smoke Anna team');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'a user without teams.manage cannot add a team';

  -- 1b-d. The admin stays able to act without holding the literals.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert public.can_manage_users() and public.can_manage_teams(), 'the admin manages users and teams without the literals';
  insert into public.teams (name) values ('Smoke admin team') returning id into v_team;
  insert into public.user_teams (user_id, team_id) values (v_ben, v_team);
  update public.users set sign_in_method = 'password' where id = v_ben;
end $$;
reset role;

do $$
begin
  assert exists (select 1 from public.role_assignment_log where kind = 'team' and team_name = 'Smoke HR team'
                 and by_user_id = pg_temp.uid('hanna.richter@example.com') and action = 'added'), 'HR team change is logged';
  assert exists (select 1 from public.role_assignment_log where kind = 'team' and team_name = 'Smoke HR team'
                 and by_user_id = pg_temp.uid('tom.berger@example.com') and action = 'removed'), 'team manager change is logged';
end $$;

-- 1b-e. Owners maintain the members of their own teams, of no other group (migration
-- 20261124100000_group_members_by_owners.sql, owner-only since 20261208130000: no literal). Tom (Manager) and Anna
-- (Workshop) own a group, Ben does not.
delete from public.user_roles where user_id = pg_temp.uid('tom.berger@example.com') and role_id = pg_temp.role_id('Smoke team managers');
insert into public.teams (name) values ('Smoke owned team'), ('Smoke other team');
insert into public.team_owners (team_id, user_id)
select g.id, u from public.teams g, unnest(array[pg_temp.uid('tom.berger@example.com'), pg_temp.uid('anna.weber@example.com')]) u
where g.name = 'Smoke owned team';

set local role authenticated;
do $$
declare
  v_owned uuid := (select id from public.teams where name = 'Smoke owned team');
  v_other uuid := (select id from public.teams where name = 'Smoke other team');
  v_ben uuid := pg_temp.uid('ben.keller@example.com');
  v_ok boolean;
  v_n integer;
begin
  perform pg_temp.act_as('tom.berger@example.com');
  assert not public.can_manage_teams(), 'Tom manages no teams in general';
  assert public.team_members_editable(v_owned), 'an owner edits the members';
  assert not public.team_members_editable(v_other), 'not the members of a group he does not own';
  v_ok := false;
  begin
    insert into public.user_teams (user_id, team_id) values (v_ben, v_other);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'an owner cannot add members to another group';
  insert into public.user_teams (user_id, team_id) values (v_ben, v_owned), (pg_temp.uid('tom.berger@example.com'), v_owned);
  delete from public.user_teams where team_id = v_owned and user_id = v_ben;
  get diagnostics v_n = row_count;
  assert v_n = 1, 'the owner removes a member';
  update public.teams set name = 'renamed by owner' where id = v_owned;
  get diagnostics v_n = row_count;
  assert v_n = 0, 'the owner does not rename the group';

  perform pg_temp.act_as('anna.weber@example.com');
  assert public.team_members_editable(v_owned), 'the owner needs no role for it (Anna is a Workshop member)';
  perform pg_temp.act_as('ben.keller@example.com');
  assert not public.team_members_editable(v_owned), 'somebody who does not own the group edits no members';
  v_ok := false;
  begin
    insert into public.user_teams (user_id, team_id) values (v_ben, v_owned);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'a non-owner cannot add members';
end $$;
reset role;
do $$
begin
  assert exists (select 1 from public.role_assignment_log where kind = 'team' and team_name = 'Smoke owned team'
                 and by_user_id = pg_temp.uid('tom.berger@example.com') and action = 'removed'), 'owner change is logged';
end $$;

-- ===================================================================================
-- Stage 2: business data (migration 20261123100000_admin_limits_business_data.sql)
-- ===================================================================================

-- A file Anna uploaded on a task Tom (Manager, tasks.edit.all) can see; Sara (Workshop) is in the team.
insert into public.attachments (entity_type, entity_id, storage_path, file_name, uploaded_by_user_id)
select 'tasks', t.id, 'tasks/' || t.id || '/smoke-stage2.pdf', 'smoke-stage2.pdf', pg_temp.uid('anna.weber@example.com')
from public.tasks t where t.permission_module = 'tasks' order by t.created_at limit 1;

set local role authenticated;
do $$
declare
  v_admin uuid := pg_temp.uid('max.wilckens@wilckens.com');
  v_ok boolean;
  v_n integer;
begin
  -- 2a. The admin without a content role sees no business data and changes none.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  assert not public.rls_has('assets.view.all'), 'rls_has has no admin bypass';
  assert (select count(*) from public.assets) = 0, 'admin sees no assets';
  assert (select count(*) from public.tasks where created_by_user_id <> v_admin and assigned_user_id is distinct from v_admin) = 0,
    'admin sees no tasks of others';
  assert (select count(*) from public.tickets) = 0, 'admin sees no tickets';
  assert (select count(*) from public.goals) = 0, 'admin sees no goals';
  assert (select count(*) from public.recurring_task_rules) = 0, 'admin sees no series';
  assert (select count(*) from public.attachments where file_name = 'smoke-stage2.pdf') = 0, 'admin sees no files of tasks';
  assert (select count(*) from public.messages m join public.conversations c on c.id = m.conversation_id where c.kind = 'record') = 0,
    'admin reads no record conversations';
  v_ok := false;
  begin
    insert into public.assets (name) values ('Smoke admin asset');
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'admin cannot add an asset';
  delete from public.attachments where file_name = 'smoke-stage2.pdf';
  get diagnostics v_n = row_count;
  assert v_n = 0, 'admin deletes no files of others';
  -- Configuration stays: the admin still edits task types and checklist templates and reads the tree assignments.
  assert public.task_type_editable((select id from public.task_types limit 1)), 'admin edits task types';
  assert public.checklist_template_editable((select id from public.checklist_templates limit 1)), 'admin edits checklist templates';

  -- 2b. Moderation by literal: Sara (no edit.all) cannot remove Anna's file, Tom (tasks.edit.all) can.
  perform pg_temp.act_as('sara.novak@example.com');
  delete from public.attachments where file_name = 'smoke-stage2.pdf';
  get diagnostics v_n = row_count;
  assert v_n = 0, 'a team member without edit.all deletes no files of others';
  perform pg_temp.act_as('tom.berger@example.com');
  assert (select count(*) from public.attachments where file_name = 'smoke-stage2.pdf') = 1, 'Tom sees the file';
  delete from public.attachments where file_name = 'smoke-stage2.pdf';
  get diagnostics v_n = row_count;
  assert v_n = 1, 'a holder of tasks.edit.all deletes a file of somebody else';
end $$;
reset role;

do $$ begin
  assert not public.user_has_grant(pg_temp.uid('max.wilckens@wilckens.com'), 'assets', 'view', null, null, null, null), 'user_has_grant has no admin bypass';
end $$;

-- 2c. A step that finds nobody goes to the step's fallback role, else to the default role, never to Admin.
do $$
declare
  v_step uuid := (select s.id from public.task_type_steps s where s.assignee_kind = 'requester_supervisor' limit 1);
  r record;
begin
  update public.task_type_steps set fallback_role_id = null where id = v_step;
  assert (select nullif(value, '')::uuid from public.app_settings where key = 'default_fallback_role_id') = pg_temp.role_id('Manager'), 'default fallback role is Manager';
  if v_step is not null then
    -- Max has no supervisor: the rule finds nobody.
    select * into r from public.resolve_step_assignee(v_step, pg_temp.uid('max.wilckens@wilckens.com'));
    assert r.assignee_user_id is null and r.assignee_role_id = pg_temp.role_id('Manager'), 'falls back to the default role';
    update public.app_settings set value = '' where key = 'default_fallback_role_id';
    select * into r from public.resolve_step_assignee(v_step, pg_temp.uid('max.wilckens@wilckens.com'));
    assert r.assignee_role_id is null, 'without a default the step has no role (whoever may edit acts), not Admin';
  else
    raise notice 'no requester_supervisor step without a fallback role in the seed: 2c skipped';
  end if;
end $$;

-- Manager deletes tasks of their own teams only (migration 20261124110000_manager_task_delete.sql).
insert into public.teams (name) values ('Smoke foreign team');
-- In the seed every team task belongs to a team of Tom; one task without a team goes to a foreign team.
select set_config('request.jwt.claims', '', true);
update public.tasks set team_id = (select id from public.teams where name = 'Smoke foreign team')
where id = (select id from public.tasks where permission_module = 'tasks' and team_id is null order by created_at limit 1);
set local role authenticated;
do $$
declare
  v_tom uuid := pg_temp.uid('tom.berger@example.com');
  v_mine uuid;
  v_other uuid;
  v_n integer;
begin
  perform pg_temp.act_as('tom.berger@example.com');
  select t.id into v_mine from public.tasks t
  where t.permission_module = 'tasks' and t.team_id in (select team_id from public.user_teams where user_id = v_tom) limit 1;
  select t.id into v_other from public.tasks t
  where t.permission_module = 'tasks' and t.team_id is not null
    and t.team_id not in (select team_id from public.user_teams where user_id = v_tom) limit 1;
  if v_other is not null then
    delete from public.tasks where id = v_other;
    get diagnostics v_n = row_count;
    assert v_n = 0, 'a manager deletes no task of another team';
  else
    raise exception 'setup: no task of another team';
  end if;
  if v_mine is not null then
    delete from public.tasks where id = v_mine;
    get diagnostics v_n = row_count;
    assert v_n = 1, 'a manager deletes a task of their team';
  else
    raise notice 'no task of a team of Tom in the seed: check skipped';
  end if;
end $$;
reset role;

-- Review fixes (migration 20261124120000_admin_limits_review_fixes.sql): asset grants and group owners are logged,
-- record_moderator is internal.
set local role authenticated;
do $$
declare
  v_admin uuid := pg_temp.uid('max.wilckens@wilckens.com');
  v_root uuid := (select id from public.assets where parent_asset_id is null order by name limit 1);
  v_team uuid := (select id from public.teams where id in (select team_id from public.team_uses where use = 'assets') order by name limit 1);
  v_rows int;
  v_ok boolean;
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  -- Naming a team is an asset edit: the admin without a content role changes nothing (it used to be a free grant).
  update public.assets set team_id = v_team where id = v_root;
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'the admin cannot set a team on an asset without assets.edit';
  insert into public.team_owners (team_id, user_id) values (v_team, v_admin) on conflict do nothing;
  -- (record_moderator: replaced by the access registry's action 'moderate')
  perform public.can_moderate_record('assets', v_root);
end $$;
reset role;
do $$
begin
  -- The log names who set a team (the table owner with a manager's token: only the trigger is under test here).
  perform pg_temp.act_as('tom.berger@example.com');
  update public.assets set team_id = null where parent_asset_id is null and team_id is not null;
  update public.assets set team_id = (select id from public.teams where id in (select team_id from public.team_uses where use = 'assets') order by name limit 1)
  where id = (select id from public.assets where parent_asset_id is null order by name limit 1);
  assert exists (select 1 from public.role_assignment_log where kind = 'asset_grant' and action = 'added'
                 and by_user_id = pg_temp.uid('tom.berger@example.com') and team_id is not null
                 and asset_name is not null), 'a team set on an asset is logged';
  assert exists (select 1 from public.role_assignment_log where kind = 'team_owner' and action = 'added'
                 and user_id = pg_temp.uid('max.wilckens@wilckens.com')), 'becoming a group owner is logged';
end $$;

-- People levers (migration 20261126100000_role_log_people_levers.sql): supervisor, deputy, e-mail, login.
set local role authenticated;
do $$
declare
  v_hanna uuid := pg_temp.uid('hanna.richter@example.com');
  v_ben uuid := pg_temp.uid('ben.keller@example.com');
  v_nologin uuid := (select id from public.users where not has_login order by name limit 1);
  v_ok boolean;
begin
  perform pg_temp.act_as('hanna.richter@example.com');
  update public.users set deputy_user_id = v_hanna, supervisor_user_id = v_hanna where id = v_ben;
  update public.users set email = 'smoke-takeover@example.com' where id = v_nologin;
  -- Only a user manager writes a login_grant, and only for a person with a login.
  v_ok := false;
  begin
    perform public.role_assignment_log_login_grant(v_nologin);
  exception when invalid_parameter_value then v_ok := true;
  end;
  assert v_ok, 'no login_grant for a person without a login';
  perform pg_temp.act_as('anna.weber@example.com');
  v_ok := false;
  begin
    perform public.role_assignment_log_login_grant(v_ben);
  exception when insufficient_privilege then v_ok := true;
  end;
  assert v_ok, 'only a user manager writes a login_grant';
end $$;
reset role;

-- The account is created by GoTrue (no user): handle_new_user sets has_login.
select set_config('request.jwt.claims', '', true);
update public.users set has_login = true where id = (select id from public.users where email = 'smoke-takeover@example.com');
set local role authenticated;
do $$ begin
  perform pg_temp.act_as('hanna.richter@example.com');
  perform public.role_assignment_log_login_grant((select id from public.users where email = 'smoke-takeover@example.com'));
end $$;
reset role;

do $$
declare
  v_hanna uuid := pg_temp.uid('hanna.richter@example.com');
  v_ben uuid := pg_temp.uid('ben.keller@example.com');
  v_person uuid := (select id from public.users where email = 'smoke-takeover@example.com');
begin
  assert exists (select 1 from public.role_assignment_log where kind = 'deputy' and action = 'added' and user_id = v_ben
                 and related_user_id = v_hanna and by_user_id = v_hanna), 'HR making themselves deputy is logged';
  assert exists (select 1 from public.role_assignment_log where kind = 'supervisor' and action = 'removed' and user_id = v_ben
                 and by_user_id = v_hanna), 'the previous supervisor is logged as removed';
  assert exists (select 1 from public.role_assignment_log where kind = 'supervisor' and action = 'added' and user_id = v_ben
                 and related_user_id = v_hanna), 'the new supervisor is logged as added';
  assert exists (select 1 from public.role_assignment_log where kind = 'email' and action = 'changed' and user_id = v_person
                 and new_value = 'smoke-takeover@example.com' and by_user_id = v_hanna), 'the e-mail change is logged';
  assert exists (select 1 from public.role_assignment_log where kind = 'login' and action = 'added' and user_id = v_person
                 and by_user_id is null), 'the account is logged (by the system)';
  assert exists (select 1 from public.role_assignment_log where kind = 'login_grant' and user_id = v_person
                 and by_user_id = v_hanna and new_value = 'smoke-takeover@example.com'), 'who gave the login is logged';
end $$;

rollback;
