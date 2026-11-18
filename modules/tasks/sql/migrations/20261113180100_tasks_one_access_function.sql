-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): tasks_row_allows(action,
-- id, ctx) replaces tasks_access(user, id, action). Body: tasks_access as in 20261110200000_tasks.sql (tasks module
-- version); changed: the user is the context's ((p_ctx).user_id). Private: the platform's dispatchers call it.
create function public.tasks_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
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
     and public.user_has_grant(p_user_id, v_task.permission_module, p_action, null, v_task.assigned_user_id, v_task.team_id,
                               v_task.created_by_user_id, v_task.current_assignee_user_id, v_task.current_assignee_team_id,
                               v_task.current_assignee_role_id) then
    return true;
  end if;
  return p_action in ('view', 'check') and public.task_is_worked_by(p_user_id, p_entity_id);
end $fn$;

update public.entity_types set access_function = 'tasks_row_allows' where entity_type = 'tasks';
drop function public.tasks_access(uuid, uuid, text);
select public.entity_types_rebuild();
