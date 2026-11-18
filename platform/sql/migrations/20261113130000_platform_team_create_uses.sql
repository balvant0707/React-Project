-- team_create() still wrote COMPASS's groups.usable_for_* columns, which 20261109100200_platform_core_adapt.sql replaced by
-- team uses (D2), so creating a team from the Messages page failed. The function as in 20261109130000_platform_messaging.sql
-- (COMPASS 20261208120000_user_created_teams.sql); changed: COMPASS's switches tasks and filters on (the rest off) are the team
-- uses 'tasks' and 'filters', set where an app registers them (the workflows module). Test: compass_user_created_teams_smoke.sql.
CREATE OR REPLACE FUNCTION public.team_create(p_name text, p_description text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_me is null or not (public.can_manage_teams() or public.rls_has('teams.create')) then
    raise exception 'You cannot create a team';
  end if;
  if length(v_name) not between 2 and 60 then
    raise exception 'The name of a team has 2 to 60 characters';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(v_name)) then
    raise exception 'A team with this name exists';
  end if;
  insert into public.teams (name, description, user_created, created_by_user_id)
  values (v_name, nullif(btrim(coalesce(p_description, '')), ''), true, v_me)
  returning id into v_id;
  insert into public.team_uses (team_id, use)
  select v_id, r.use from public.team_use_registry r where r.use in ('tasks', 'filters');
  insert into public.team_owners (team_id, user_id) values (v_id, v_me);
  insert into public.user_teams (user_id, team_id) values (v_me, v_id);
  return v_id;
end;
$$;
