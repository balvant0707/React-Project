-- Copied from ~/maintenance_tool/supabase/tests/stock_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Stock keeping (migration 20261031110000_stock.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/stock_smoke.sql
-- Local stack, seeded DB. Everything runs in one transaction and is rolled back.
begin;
-- Deleting tasks needs a delete literal; no seeded role holds one (the admin used to pass by bypass, admin limits).
insert into public.role_permissions (role_id, permission)
select r.id, p from public.roles r, unnest(array['tasks.delete.all', 'initiatives.delete.all']) p where r.name = 'Manager'
on conflict do nothing;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on all functions in schema pg_temp to public;
set local role authenticated;

do $$
declare
  v_team uuid := (select id from public.teams where name = 'Werkstatt');
  v_spare uuid := (select id from public.phrases where category = 'item_category' and code = 'spare_part');
  v_maint uuid := (select id from public.task_types where key = 'maintenance');
  v_purchase uuid := (select id from public.task_types where key = 'purchase_request');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_store uuid; v_shelf uuid; v_cabinet uuid;
  v_item uuid; v_plain uuid;
  v_task uuid; v_line uuid; v_order uuid; v_olines uuid;
  v_msg text;
  v_n integer;
begin
  -- 1. Fixtures as admin: locations (store with a team, shelf below it, cabinet without team) and two items.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.stock_locations (name, team_id) values ('Test store', v_team) returning id into v_store;
  insert into public.stock_locations (name, parent_id) values ('Shelf A', v_store) returning id into v_shelf;
  insert into public.stock_locations (name) values ('Cabinet') returning id into v_cabinet;
  assert (select code from public.stock_locations where id = v_store) ~ '^L[0-9]{4}$', '1 generated code';
  begin
    update public.stock_locations set parent_id = v_shelf where id = v_store;
    raise exception 'a cycle was accepted';
  exception when others then
    assert sqlerrm like 'A stock location cannot sit below itself%', '1 cycle ' || sqlerrm;
  end;
  insert into public.items (item_number, name, category_phrase_id) values ('ST-1', 'Gearbox', v_spare) returning id into v_item;
  insert into public.items (item_number, name, category_phrase_id) values ('ST-2', 'Screw', v_spare) returning id into v_plain;
  begin
    update public.items set stock_managed = true where id = v_item;
    raise exception 'stock-managed without default location accepted';
  exception when others then
    assert sqlerrm like '%items_stock_default_check%', '1 default needed: ' || sqlerrm;
  end;
  update public.items set stock_managed = true, default_stock_location_id = v_store, minimum_stock = 2 where id = v_item;
  insert into public.task_type_item_categories (task_type_id, category_phrase_id) values (v_maint, v_spare) on conflict do nothing;

  -- 2. Who may book: purchasing everywhere, workshop only in the locations of its team, shopfloor nowhere.
  perform pg_temp.act_as('lena.fischer@example.com');
  perform public.stock_adjust(v_item, v_store, 3, 'opening', 'first count');
  perform public.stock_adjust(v_item, v_shelf, 2, 'opening');
  perform pg_temp.act_as('anna.weber@example.com');
  perform public.stock_adjust(v_item, v_store, 1, 'receipt');
  begin
    perform public.stock_adjust(v_item, v_shelf, 1, 'receipt');
    raise exception 'anna booked at a location of another team';
  exception when others then assert sqlerrm = 'You may not book stock at this location', '2 ' || sqlerrm; end;
  perform public.stock_adjust(v_item, v_store, -1, 'correction', 'undo');
  begin
    insert into public.stock_locations (name) values ('Anna cabinet');
    raise exception 'anna created a location';
  exception when others then assert sqlerrm like '%row-level security%', '2 location rls ' || sqlerrm; end;
  perform pg_temp.act_as('ben.keller@example.com');
  begin
    perform public.stock_adjust(v_item, v_store, 1, 'receipt');
    raise exception 'shopfloor booked stock';
  exception when others then assert sqlerrm = 'You may not book stock at this location', '2 shopfloor ' || sqlerrm; end;
  assert (select quantity from public.item_stock_overview where item_id = v_item) = 5, '2 total 5 for everybody with stock.view';

  -- 3. Issue through a task: the parts are taken from the default location first, the rest from the next one.
  perform pg_temp.act_as('anna.weber@example.com');
  insert into public.tasks (task_type_id, title, assigned_user_id, team_id, due_date)
    values (v_maint, 'Stock 1', v_anna, v_team, current_date + 3) returning id into v_task;
  insert into public.task_items (task_id, item_id, quantity, state) values (v_task, v_item, 4, 'used') returning id into v_line;
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_store) = 0, '3 store emptied';
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_shelf) = 1, '3 rest from the shelf';
  assert (select count(*) from public.stock_movements where task_item_id = v_line and kind = 'issue') = 2, '3 two issue rows';

  -- 4. A later change books only the difference and gives back where it was taken, the newest first.
  update public.task_items set quantity = 2 where id = v_line;
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_shelf) = 2, '4 shelf got one back';
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_store) = 1, '4 store got one back';
  delete from public.task_items where id = v_line;
  assert (select quantity from public.item_stock_overview where item_id = v_item) = 5, '4 deleting the line gives everything back';

  -- 5. The usage dialog books with picks; they must add up.
  begin
    perform public.task_items_save_used(v_task, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 3,
      'picks', jsonb_build_array(jsonb_build_object('location_id', v_shelf, 'quantity', 1)))));
    raise exception 'wrong picks accepted';
  exception when others then assert sqlerrm = 'The picked quantities must add up to the quantity', '5 ' || sqlerrm; end;
  perform public.task_items_save_used(v_task, jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 3,
    'picks', jsonb_build_array(jsonb_build_object('location_id', v_shelf, 'quantity', 2), jsonb_build_object('location_id', v_store, 'quantity', 1)))));
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_shelf) = 0, '5 shelf emptied by the pick';
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_store) = 2, '5 one from the store';
  -- An item that is not kept in stock books nothing.
  insert into public.task_items (task_id, item_id, quantity, state) values (v_task, v_plain, 7, 'used');
  assert not exists (select 1 from public.stock_movements where item_id = v_plain), '5 no ledger rows for a plain item';

  -- 6. Transfer and count.
  perform public.stock_transfer(v_item, v_store, v_cabinet, 1, 'to the cabinet');
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_cabinet) = 1, '6 moved';
  begin
    perform public.stock_transfer(v_item, v_store, v_cabinet, 5);
    raise exception 'moved more than there is';
  exception when others then assert sqlerrm = 'Not enough stock at the source location', '6 ' || sqlerrm; end;
  begin
    perform public.stock_transfer(v_item, v_cabinet, v_store, 1);
    raise exception 'anna moved from a location of no team';
  exception when others then assert sqlerrm = 'You may not book stock at this location', '6 ' || sqlerrm; end;
  assert public.stock_count(v_item, v_store, 4, 'counted') = 3, '6 count books the difference';
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_store) = 4, '6 counted';

  -- 7. The ledger is never rewritten, and the balances equal the ledger.
  begin
    update public.stock_movements set quantity = 99 where item_id = v_item;
    get diagnostics v_n = row_count;
    assert v_n = 0, '7 ledger rows were updated';
    delete from public.stock_movements where item_id = v_item;
    get diagnostics v_n = row_count;
    assert v_n = 0, '7 ledger rows were deleted';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.stock_movements where item_id = v_item and quantity = 99) = 0, '7 ledger unchanged';
  select count(*) into v_n
  from (select item_id, stock_location_id, sum(quantity) s from public.stock_movements group by 1, 2) m
  full join public.stock_balances b using (item_id, stock_location_id)
  where b.quantity is distinct from m.s;
  assert v_n = 0, '7 balances equal the ledger';
  perform pg_temp.act_as('lena.fischer@example.com');
  begin
    update public.items set stock_managed = false where id = v_item;
    raise exception 'switched off with stock';
  exception when others then assert sqlerrm = 'Stock keeping cannot be switched off while the item has stock', '7 ' || sqlerrm; end;

  -- 8. Goods in: a completed purchase request books its stock-managed lines into the default location.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  insert into public.tasks (task_type_id, title, team_id) values (v_purchase, 'Order gearbox', v_team) returning id into v_order;
  insert into public.task_items (task_id, item_id, quantity) values (v_order, v_item, 4) returning id into v_olines;
  perform set_config('app.task_engine', 'on', true);
  update public.tasks set status = 'done', completed_at = now() where id = v_order;
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_store) = 8, '8 receipt in the default location';
  assert exists (select 1 from public.stock_movements where task_item_id = v_olines and kind = 'receipt' and quantity = 4), '8 receipt row';
  -- 10. Review fixes: deleting a task whose parts were booked from stock gives them back (the cascade used to fail).
  perform pg_temp.act_as('anna.weber@example.com');
  insert into public.tasks (task_type_id, title, assigned_user_id, team_id, due_date)
    values (v_maint, 'Stock 2', v_anna, v_team, current_date + 3) returning id into v_task;
  select quantity into v_n from public.stock_balances where item_id = v_item and stock_location_id = v_store;
  insert into public.task_items (task_id, item_id, quantity, state) values (v_task, v_item, 1, 'used');
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  delete from public.tasks where id = v_task;
  assert (select quantity from public.stock_balances where item_id = v_item and stock_location_id = v_store) = v_n, '10 task deleted, parts back';

  -- 11. A NaN quantity cannot poison a balance.
  perform pg_temp.act_as('lena.fischer@example.com');
  begin
    perform public.stock_adjust(v_item, v_store, 'NaN'::numeric, 'correction');
    raise exception 'NaN accepted';
  exception when others then assert sqlerrm like '%stock_movements_finite%', '11 ' || sqlerrm; end;
  begin
    insert into public.task_items (task_id, item_id, quantity, state) values (v_task, v_item, 'NaN'::numeric, 'needed');
    raise exception 'NaN line accepted';
  exception when others then assert sqlerrm not like 'NaN line accepted', '11 line ' || sqlerrm; end;

  -- 12. Contents of a location and everything below it, paged.
  assert (select count(*) from public.stock_location_contents(v_store, 50, 0) where item_id = v_item) >= 1, '12 contents of the store include the item';
  assert (select max(total_count) from public.stock_location_contents(v_store, 1, 0)) >= 1, '12 total count on every row';
end;
$$;

-- 9. The minimum report runs as the engine (not callable by users).
reset role;
do $$
declare
  v_item uuid := (select id from public.items where item_number = 'ST-1');
  v_n integer;
begin
  update public.items set minimum_stock = 100 where id = v_item;
  v_n := public.send_stock_reminders(current_date);
  assert v_n >= 1, '9 reminder sent';
  assert exists (select 1 from public.notifications where type = 'stock_below_minimum' and entity_id = v_item), '9 notification';
  assert public.send_stock_reminders(current_date) = 0, '9 not again the same day';
  update public.items set minimum_stock = 1 where id = v_item;
  perform public.send_stock_reminders(current_date);
  assert not exists (select 1 from public.stock_alert_log where item_id = v_item), '9 log cleared when above the minimum';
end;
$$;
rollback;
