-- One access function per record type (platform 20261113180000_platform_one_access_function.sql).
--   * assets_row_allows(action, id, ctx) replaces assets_access(user, id, action) (20261112110000_assets.sql).
--   * tasks_row_allows: the assets module's version of the task rule (asset scopes; tasks_access as redefined in
--     20261112110000_assets.sql) on top of the tasks module's.
-- Changed: the user is the context's ((p_ctx).user_id); bodies otherwise unchanged. Private: the dispatchers call them.
create function public.assets_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to ''
  as $fn$
declare
  p_user_id uuid := (p_ctx).user_id;
  v_asset public.assets;
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'assets.edit.all' = any (public.user_permissions(p_user_id));
  end if;
  if p_action = 'check' then
    p_action := 'edit';
  end if;
  select * into v_asset from public.assets where id = p_entity_id;
  return v_asset.id is not null
    and public.user_has_grant(p_user_id, 'assets', p_action, v_asset.id, null, null, null);
end $fn$;

create or replace function public.tasks_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to ''
  as $fn$
declare
  p_user_id uuid := (p_ctx).user_id;
  v_task public.tasks;
begin
  if p_user_id is null then
    return false;
  end if;
  select * into v_task from public.tasks where id = p_entity_id;
  if v_task.id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return (v_task.permission_module || '.edit.all') = any (public.user_permissions(p_user_id));
  end if;
  if public.user_task_type_allowed(p_user_id, v_task.task_type_id)
     and public.user_has_grant(p_user_id, v_task.permission_module, p_action, v_task.asset_id, v_task.assigned_user_id, v_task.team_id,
                               v_task.created_by_user_id, v_task.current_assignee_user_id, v_task.current_assignee_team_id,
                               v_task.current_assignee_role_id) then
    return true;
  end if;
  return p_action in ('view', 'check') and public.task_is_worked_by(p_user_id, p_entity_id);
end $fn$;

update public.entity_types set access_function = 'assets_row_allows' where entity_type = 'assets';
drop function public.assets_access(uuid, uuid, text);
select public.entity_types_rebuild();
