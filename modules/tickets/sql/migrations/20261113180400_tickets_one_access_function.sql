-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): <type>_row_allows(action,
-- id, ctx) replaces <type>_access(user, id, action). From tickets_access (20261112120000_tickets.sql); changed: the user is the context's
-- ((p_ctx).user_id). Private: the platform's dispatchers call them.
create function public.tickets_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context) returns boolean
  language plpgsql stable security definer set search_path to ''
  as $fn$
declare
  p_user_id uuid := (p_ctx).user_id;
begin
  if p_user_id is null then
    return false;
  end if;
  if p_action = 'moderate' then
    return 'tickets.edit.all' = any (public.user_permissions(p_user_id))
      and public.user_has_ticket_access(p_user_id, p_entity_id, 'edit');
  end if;
  return public.user_has_ticket_access(p_user_id, p_entity_id, p_action);
end $fn$;

update public.entity_types set access_function = 'tickets_row_allows' where entity_type = 'tickets';
drop function public.tickets_access(uuid, uuid, text);
select public.entity_types_rebuild();
