-- WP1: companies, company_teams, account helpers, company types. Rolled back.
begin;
do $$
declare v_g uuid; v_c uuid; v_t uuid; v_u uuid;
begin
  insert into public.companies (name, short_code) values ('Grp Co', 'GRPCO') returning id into v_g;
  assert (select group_company_id from public.companies where id = v_g) = v_g, 'a new company is its own group';
  assert (select is_group_company from public.companies where id = v_g), 'generated flag';
  insert into public.companies (name, group_company_id) values ('Child Co', v_g) returning id into v_c;
  perform public.company_add_type(v_c, 'owner');
  perform public.company_add_types(array[v_c, v_g], array['maker', 'maker']);
  assert (select company_types from public.companies where id = v_c) @> array['owner', 'maker'], 'types added';
  begin update public.companies set company_types = array['nonsense'] where id = v_c; assert false; exception when check_violation then null; end;
  -- account rule: owner of the group company sees the group and its children
  select id into v_u from public.users limit 1;
  update public.companies set sales_account_user_id = v_u where id = v_g;
  assert v_c in (select public.user_account_company_ids(v_u)), 'child company in account of the group owner';
  assert v_g in (select public.user_account_company_ids(v_u)), 'group company in account';
  -- owner associate link
  insert into public.teams (name) values ('Assoc') returning id into v_t;
  insert into public.owner_associate_teams (team_id, company_id, short_code) values (v_t, v_g, 'ASC');
  insert into public.company_teams (company_id, team_id, roles) values (v_c, v_t, array['customer']);
  assert exists (select 1 from public.company_search_options where id = v_c and 'customer' = any (all_roles)), 'search options carry roles';
  assert public.can_access_entity_ctx('companies', v_c, 'view', row(array[]::text[], v_u, array[]::uuid[])::public.access_context), 'view open';
  assert not public.can_access_entity_ctx('companies', v_c, 'edit', row(array[]::text[], v_u, array[]::uuid[])::public.access_context), 'edit needs literal';
  assert public.can_access_entity_ctx('companies', v_c, 'edit', row(array['companies.edit'], v_u, array[]::uuid[])::public.access_context), 'edit with literal';
end $$;
select 'npm_companies_smoke: all checks passed' as result;
rollback;
