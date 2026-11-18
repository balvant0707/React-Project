-- 1. The salesperson of a hull event follows its notes (NPM record_role_followers; see npm-base 20261113140100).
-- 2. Adding a file needs edit, as in the NPM tool (its policy "Insert attachments per parent entity access": edit, vessels
--    vessels.edit); the platform default 'check' is view for these types (platform 20261113140000).
create function public.hull_events_followers(p_entity_id uuid) returns uuid[]
  language sql stable security definer set search_path to ''
  as $$ select array_remove(array[h.sales_account_user_id], null) from public.hull_events h where h.id = p_entity_id; $$;
create trigger conversations_join_record_roles after update of sales_account_user_id on public.hull_events
  for each row execute function public.conversations_join_record_roles('sales_account_user_id');
update public.entity_types set follower_function = 'hull_events_followers' where entity_type = 'hull_events';
update public.entity_types set attach_action = 'edit' where entity_type in ('vessels', 'hull_events', 'newbuilding_projects');
select public.entity_types_rebuild();
