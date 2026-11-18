-- One access function per record type (platform 20261113180000_platform_one_access_function.sql): the module's rule
-- <type>_row_allows(action, id, ctx) is the registered function; the wrappers <type>_access (by user) and <type>_ctx_allows
-- (by context) go. The rule is private: row policies and policy helpers ask the guarded dispatcher can_access_entity_ctx(),
-- which answers only for the caller's own context.
--   * specifications_row_allows, orders_row_allows (the module's rules, unchanged) answer 'check' as 'view' through
--     entity_types.check_action (the wrappers did that).
--   * can_access_specification_area: as in 20261110140000_npm_offers.sql; changed: they ask
--     can_access_entity_ctx() instead of the rule.
--   * Row policies of the child tables: the same expressions, the rule call replaced by can_access_entity_ctx().
create or replace function public.can_access_specification_area(p_area_id uuid, p_action text, p_ctx access_context)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parent uuid;
begin
  select t.specification_id into v_parent from public.specification_areas t where t.id = p_area_id;
  if not found then
    return false;
  end if;
  return public.can_access_entity_ctx('specifications', v_parent, p_action, p_ctx);
end;
$function$;

alter policy "Delete specification areas per parent grant" on public.specification_areas
  using (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert specification areas per parent grant" on public.specification_areas
  with check (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Update specification areas per parent grant" on public.specification_areas
  using (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View specification areas per parent grant" on public.specification_areas
  using (can_access_entity_ctx('specifications', specification_id, 'view'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete specification line items per parent grant" on public.specification_line_items
  using (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert specification line items per parent grant" on public.specification_line_items
  with check (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Update specification line items per parent grant" on public.specification_line_items
  using (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View specification line items per parent grant" on public.specification_line_items
  using (can_access_entity_ctx('specifications', specification_id, 'view'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete specification discounts per parent grant" on public.specification_discounts
  using (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert specification discounts per parent grant" on public.specification_discounts
  with check (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Update specification discounts per parent grant" on public.specification_discounts
  using (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View specification discounts per parent grant" on public.specification_discounts
  using (can_access_entity_ctx('specifications', specification_id, 'view'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete order lines per parent grant" on public.order_lines
  using (can_access_entity_ctx('orders', order_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert order lines per parent grant" on public.order_lines
  with check (can_access_entity_ctx('orders', order_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Update order lines per parent grant" on public.order_lines
  using (can_access_entity_ctx('orders', order_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('orders', order_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View order lines per parent grant" on public.order_lines
  using (can_access_entity_ctx('orders', order_id, 'view'::text, ( SELECT access_context() AS access_context)));
alter policy "Delete order discounts per parent grant" on public.order_discounts
  using (can_access_entity_ctx('orders', order_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Insert order discounts per parent grant" on public.order_discounts
  with check (can_access_entity_ctx('orders', order_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "Update order discounts per parent grant" on public.order_discounts
  using (can_access_entity_ctx('orders', order_id, 'edit'::text, ( SELECT access_context() AS access_context)))
  with check (can_access_entity_ctx('orders', order_id, 'edit'::text, ( SELECT access_context() AS access_context)));
alter policy "View order discounts per parent grant" on public.order_discounts
  using (can_access_entity_ctx('orders', order_id, 'view'::text, ( SELECT access_context() AS access_context)));
alter policy "View availability requests per parent grant" on public.availability_requests
  using ((((specification_id IS NOT NULL) AND can_access_entity_ctx('specifications', specification_id, 'view'::text, ( SELECT access_context() AS access_context))) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.availability_request_id = availability_requests.id) AND can_access_entity_ctx('orders', o.id, 'view'::text, ( SELECT access_context() AS access_context)))))));
alter policy "View supplier api calls per parent grant" on public.supplier_api_calls
  using ((((entity_type = 'orders'::text) AND can_access_entity_ctx('orders', entity_id, 'view'::text, ( SELECT access_context() AS access_context))) OR ((entity_type = 'availability_requests'::text) AND (EXISTS ( SELECT 1
   FROM availability_requests r
  WHERE (r.id = supplier_api_calls.entity_id))))));
alter policy "Create orders per grant" on public.orders
  with check ((((specification_id IS NOT NULL) AND can_access_entity_ctx('specifications', specification_id, 'edit'::text, ( SELECT access_context() AS access_context))) OR ((specification_id IS NULL) AND (( SELECT rls_has('orders.create.all'::text) AS rls_has) OR (( SELECT rls_has('orders.create.assigned'::text) AS rls_has) AND (sales_account_user_id = ( SELECT auth.uid() AS uid))) OR (( SELECT rls_has('orders.create.team'::text) AS rls_has) AND (assigned_team_id = ANY (( SELECT rls_my_team_ids() AS rls_my_team_ids)::uuid[])))))));

update public.entity_types set check_action = 'view' where entity_type in ('specifications', 'orders');
update public.entity_types set access_function = 'specifications_row_allows' where entity_type = 'specifications';
update public.entity_types set access_function = 'orders_row_allows' where entity_type = 'orders';
drop function public.specifications_access(uuid, uuid, text);
drop function public.specifications_ctx_allows(text, uuid, public.access_context);
drop function public.orders_access(uuid, uuid, text);
drop function public.orders_ctx_allows(text, uuid, public.access_context);
select public.entity_types_rebuild();
