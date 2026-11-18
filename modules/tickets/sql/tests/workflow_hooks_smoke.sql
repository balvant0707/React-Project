-- Copied from ~/maintenance_tool/supabase/tests/workflow_hooks_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Hooks for tickets and ordering (migration 20261104100000_hooks_for_items_and_tickets.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/workflow_hooks_smoke.sql
begin;
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
  v_general uuid := (select id from public.task_types where key = 'general');
  v_tom uuid := (select id from public.users where email = 'tom.berger@example.com');
  v_t1 uuid; v_t2 uuid; v_task public.tasks; v_ticket uuid; v_ticket2 uuid;
begin
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tickets (title, description) values ('Hook ticket 1', 'x') returning id into v_ticket;
  insert into public.tickets (title, description) values ('Hook ticket 2', 'x') returning id into v_ticket2;
  v_task := public.ticket_convert_to_task(v_ticket, v_general, current_date + 3, null, null, v_tom);
  assert (select status from public.tickets where id = v_ticket) = 'converted_to_task', '1 converted';

  -- 1. Finishing the task resolves the ticket (hook ticket_resolve on the type).
  perform public.task_perform_action(v_task.id, 'complete');
  assert (select status from public.tickets where id = v_ticket) = 'resolved', '1 resolved';

  -- 2. Cancelling gives the ticket back: open again, no task, convertible again.
  v_task := public.ticket_convert_to_task(v_ticket2, v_general, current_date + 3, null, null, v_tom);
  perform public.task_cancel(v_task.id, 'Not needed');
  assert (select status from public.tickets where id = v_ticket2) = 'open', '2 open again';
  assert (select ticket_id from public.tasks where id = v_task.id) is null, '2 link removed';
  assert (select task_id from public.tickets_overview where id = v_ticket2) is null, '2 no task on the ticket';
  assert exists (select 1 from public.activity_events where entity_id = v_ticket2 and event_type = 'ticket_task_cancelled'), '2 event';
  v_task := public.ticket_convert_to_task(v_ticket2, v_general, current_date + 3, null, null, v_tom);
  assert v_task.id is not null, '2 converted again';

  -- 3. A type without the hooks leaves the ticket alone.
  perform pg_temp.act_as('max.wilckens@wilckens.com');
  update public.task_types set hooks = '[]' where id = v_general;
  perform pg_temp.act_as('tom.berger@example.com');
  perform public.task_perform_action(v_task.id, 'complete');
  assert (select status from public.tickets where id = v_ticket2) = 'converted_to_task', '3 no hook, no resolve';

  -- 4. The ordering type carries the order hooks.
  assert (select count(*) from jsonb_array_elements((select hooks from public.task_types where key = 'purchase_request')) e where e ->> 'hook' = 'items_order_finished') = 2, '4 order hooks';
end;
$$;
rollback;
