-- apps: npm
-- company_vessel_groups must equal the old page query: vessels_overview grouped by the same columns, filtered by the group
-- columns (group parent) or the direct company columns (other companies). Rolled back.
begin;
do $$
declare v_grp uuid; v_sub uuid; v_alone uuid; v_vs uuid; c uuid; n_old bigint; n_new bigint; diff bigint;
begin
  insert into public.companies (name) values ('CVG Parent') returning id into v_grp;
  update public.companies set group_company_id = v_grp where id = v_grp;
  insert into public.companies (name, group_company_id) values ('CVG Sub', v_grp) returning id into v_sub;
  insert into public.companies (name) values ('CVG Alone') returning id into v_alone;
  -- the *_is_manual flags keep the company ids from being re-resolved from the SeaWeb text names by the write trigger
  insert into public.vessels (imo, name, group_owner_company_id, technical_manager_company_id, operator_company_id,
    group_owner_company_is_manual, technical_manager_company_is_manual, operator_company_is_manual)
    values ('9990001', 'CVG V1', v_sub, v_alone, v_sub, true, true, true), ('9990002', 'CVG V2', v_sub, v_alone, v_alone, true, true, true), ('9990003', 'CVG V3', v_alone, v_alone, v_alone, true, true, true);
  foreach c in array array[v_grp, v_sub, v_alone] loop
    if c = v_grp then
      select coalesce(sum(cnt), 0) into n_old from (select count(id) cnt from public.vessels_overview
        where resolved_group_company_id = c or resolved_technical_manager_group_company_id = c or resolved_operator_group_company_id = c
        group by group_owner, group_owner_company_id, resolved_group_owner_company_name, resolved_group_company_name, technical_manager, technical_manager_company_id,
          resolved_technical_manager_company_name, resolved_technical_manager_group_company_name, operator, operator_company_id, resolved_operator_company_name, resolved_operator_group_company_name) x;
    else
      select coalesce(sum(cnt), 0) into n_old from (select count(id) cnt from public.vessels_overview
        where group_owner_company_id = c or technical_manager_company_id = c or operator_company_id = c
        group by group_owner, group_owner_company_id, resolved_group_owner_company_name, resolved_group_company_name, technical_manager, technical_manager_company_id,
          resolved_technical_manager_company_name, resolved_technical_manager_group_company_name, operator, operator_company_id, resolved_operator_company_name, resolved_operator_group_company_name) x;
    end if;
    select coalesce(sum(count), 0) into n_new from public.company_vessel_groups(c);
    if n_old <> n_new then raise exception 'FAIL company_vessel_groups % old % new %', c, n_old, n_new; end if;
  end loop;
  -- the group parent sees the two vessels of its subsidiary only; the standalone company all three through its own roles
  select coalesce(sum(count), 0) into n_new from public.company_vessel_groups(v_grp);
  if n_new <> 2 then raise exception 'FAIL group parent expected 2 got %', n_new; end if;
  select coalesce(sum(count), 0) into n_new from public.company_vessel_groups(v_alone);
  if n_new <> 3 then raise exception 'FAIL standalone expected 3 got %', n_new; end if;
  raise notice 'PASS company_vessel_groups';
end $$;
rollback;
