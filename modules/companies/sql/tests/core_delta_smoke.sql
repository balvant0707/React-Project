-- WP0 of the NPM migration: owner associate teams, countries, ports. Rolled back.
begin;
do $$
declare v_id uuid; v_port uuid; v_c text;
begin
  assert (select count(*) from public.countries) = 211, 'countries seeded';
  -- creating needs the team-manage right
  begin
    perform public.owner_associate_create('X');
    assert false, 'anonymous create must fail';
  exception when sqlstate '42501' then null; end;
  insert into public.teams (name) values ('Probe') returning id into v_id;
  insert into public.owner_associate_teams (team_id, short_code) values (v_id, 'PRB');
  assert exists (select 1 from public.team_uses where team_id = v_id and use = 'owner_associate'), 'team use set by extension row';
  assert (select managed_path from public.team_use_registry where use = 'owner_associate') = '/admin/tenants', 'use kept on its own page';
  begin
    insert into public.owner_associate_teams (team_id, short_code) values (v_id, 'prb');
    assert false, 'duplicate short code';
  exception when unique_violation then null; end;
  -- port continent follows the country
  select continent into v_c from public.countries where continent is not null limit 1;
  insert into public.ports (name, country_id) select 'Probe Port', id from public.countries where continent = v_c limit 1 returning id into v_port;
  assert (select continent from public.ports where id = v_port) = v_c, 'port continent from country';
  begin
    insert into public.ports (name) values ('probe-port');
    assert false, 'normalized name unique';
  exception when unique_violation then null; end;
  -- the use follows the extension row
  delete from public.owner_associate_teams where team_id = v_id;
  assert not exists (select 1 from public.team_uses where team_id = v_id and use = 'owner_associate'), 'team use removed with the extension row';
end $$;
-- a signed-in team manager cannot set the managed use directly (Admin > Teams shows it as a fixed tag)
do $$
declare v_team uuid := (select id from public.teams where name = 'Logistics');
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = 'max.wilckens@wilckens.com'), 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  begin
    insert into public.team_uses (team_id, use) values (v_team, 'owner_associate');
    assert false, 'managed use set directly';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;
-- a managed use cannot be renamed away, and a team manager who is no admin cannot delete such a team (20261113100000)
do $$
declare v_oa uuid := (select team_id from public.owner_associate_teams limit 1);
        v_user uuid := (select id from public.users where email = 'ugur.akbati@nipponpaint-marine.eu');
begin
  insert into public.team_use_registry (use, module) values ('probe_use', 'test');
  insert into public.role_permissions (role_id, permission) select id, 'teams.manage' from public.roles where name = 'Sales Rep';
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  set local role authenticated;
  assert public.can_manage_teams() and not public.is_admin(), 'probe user manages teams, no admin';
  begin
    update public.team_uses set use = 'probe_use' where team_id = v_oa and use = 'owner_associate';
    assert false, 'managed use updated away';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.teams where id = v_oa;
    assert false, 'managed team deleted by a non-admin';
  exception when insufficient_privilege then null; end;
  -- an ordinary team is still the team manager's
  insert into public.teams (name) values ('Probe plain');
  delete from public.teams where name = 'Probe plain';
  reset role;
end $$;
select 'npm_core_delta_smoke: all checks passed' as result;
rollback;
