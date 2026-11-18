-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): <type>_row_allows(action,
-- id, ctx) replaces <type>_access(user, id, action). From items_access (20261112130000_items.sql); changed: the user is the context's
-- ((p_ctx).user_id). Private: the platform's dispatchers call them.
create function public.items_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to ''
  as $fn$
declare
  p_user_id uuid := (p_ctx).user_id;
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'items.edit' = any (public.user_permissions(p_user_id));
  end if;
  return exists (select 1 from public.items where id = p_entity_id)
    and ('items.' || case when p_action = 'view' then 'view' else 'edit' end) = any (public.user_permissions(p_user_id));
end $fn$;

update public.entity_types set access_function = 'items_row_allows' where entity_type = 'items';
drop function public.items_access(uuid, uuid, text);
select public.entity_types_rebuild();
