-- The salesperson of a company follows its notes (NPM record_role_followers; see npm-base 20261113140100). Companies keep
-- attach_action 'check' (= view): everybody could add files to a company in the NPM tool.
create function public.companies_followers(p_entity_id uuid) returns uuid[]
  language sql stable security definer set search_path to ''
  as $$ select array_remove(array[c.sales_account_user_id], null) from public.companies c where c.id = p_entity_id; $$;
create trigger conversations_join_record_roles after update of sales_account_user_id on public.companies
  for each row execute function public.conversations_join_record_roles('sales_account_user_id');
update public.entity_types set follower_function = 'companies_followers' where entity_type = 'companies';
select public.entity_types_rebuild();
