-- 1. The responsible person and the salesperson of an offer or order follow its notes (NPM record_role_followers; see
--    npm-base 20261113140100).
-- 2. Adding a file needs edit, as in the NPM tool (platform 20261113140000).
create function public.specifications_followers(p_entity_id uuid) returns uuid[]
  language sql stable security definer set search_path to ''
  as $$ select array_remove(array[s.responsible_user_id, s.sales_account_user_id], null) from public.specifications s where s.id = p_entity_id; $$;
create function public.orders_followers(p_entity_id uuid) returns uuid[]
  language sql stable security definer set search_path to ''
  as $$ select array_remove(array[o.responsible_user_id, o.sales_account_user_id], null) from public.orders o where o.id = p_entity_id; $$;
create trigger conversations_join_record_roles after update of responsible_user_id, sales_account_user_id on public.specifications
  for each row execute function public.conversations_join_record_roles('responsible_user_id', 'sales_account_user_id');
create trigger conversations_join_record_roles after update of responsible_user_id, sales_account_user_id on public.orders
  for each row execute function public.conversations_join_record_roles('responsible_user_id', 'sales_account_user_id');
update public.entity_types set follower_function = 'specifications_followers' where entity_type = 'specifications';
update public.entity_types set follower_function = 'orders_followers' where entity_type = 'orders';
update public.entity_types set attach_action = 'edit' where entity_type in ('specifications', 'orders');
select public.entity_types_rebuild();
