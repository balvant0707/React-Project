-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): <type>_row_allows(action,
-- id, ctx) replaces <type>_access(user, id, action). From position_holders_access (20261112140000_people.sql); training_records_access (20261112140000_people.sql); training_sessions_access (20261112140000_people.sql); changed: the user is the context's
-- ((p_ctx).user_id). Private: the platform's dispatchers call them.
create function public.position_holders_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to ''
  as $fn$
declare
  p_user_id uuid := (p_ctx).user_id;
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'job_descriptions.edit.all' = any (public.user_permissions(p_user_id));
  end if;
  -- Appointment letters: the person themselves and job_descriptions.view.all read, edit.all adds.
  return exists (
    select 1 from public.position_holders h
    where h.id = p_entity_id
      and ((p_action = 'view' and h.user_id = p_user_id)
           or ('job_descriptions.' || case when p_action = 'view' then 'view' else 'edit' end || '.all') = any (public.user_permissions(p_user_id)))
  );
end $fn$;

create function public.training_records_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to ''
  as $fn$
declare
  p_user_id uuid := (p_ctx).user_id;
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'people.edit' = any (public.user_permissions(p_user_id));
  end if;
  if p_action = 'check' then
    p_action := 'edit';
  end if;
  return exists (
    select 1 from public.training_records r
    where r.id = p_entity_id and public.user_training_access(p_user_id, r.user_id, p_action)
  );
end $fn$;

create function public.training_sessions_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to ''
  as $fn$
declare
  p_user_id uuid := (p_ctx).user_id;
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'people.edit' = any (public.user_permissions(p_user_id));
  end if;
  return public.training_session_access(p_user_id, p_entity_id, case when p_action = 'view' then 'view' else 'edit' end);
end $fn$;

update public.entity_types set access_function = 'position_holders_row_allows' where entity_type = 'position_holders';
update public.entity_types set access_function = 'training_records_row_allows' where entity_type = 'training_records';
update public.entity_types set access_function = 'training_sessions_row_allows' where entity_type = 'training_sessions';
drop function public.position_holders_access(uuid, uuid, text);
drop function public.training_records_access(uuid, uuid, text);
drop function public.training_sessions_access(uuid, uuid, text);
select public.entity_types_rebuild();
