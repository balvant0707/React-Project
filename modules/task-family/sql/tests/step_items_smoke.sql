-- Copied from ~/maintenance_tool/supabase/tests/step_items_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Step items (migration 20261215130000_step_items.sql): items defined on a route step are copied into every new task,
-- survive a template change and hold their step; the date kind; who may define them.
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/step_items_smoke.sql
-- Shared seed (the purchase request asks for the delivery date at the step "purchasing"). Rolled back.
begin;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.fails(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;
grant execute on all functions in schema pg_temp to public;
set local role authenticated;

do $$
declare
  v_type uuid := (select id from public.task_types where key = 'purchase_request');
  v_step uuid := (select id from public.task_type_steps where task_type_id = (select id from public.task_types where key = 'purchase_request') and step_key = 'purchasing');
  v_task uuid;
  v_item public.task_checklist_items;
begin
  -- 1. The step fields became an item of the step.
  assert (select count(*) from public.task_type_step_items where step_id = v_step and kind = 'date' and required) = 1, '1 delivery date is a step item';

  -- 2. A new task carries it, marked from_step, on its step.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.tasks (task_type_id, title) values (v_type, 'Smoke step items') returning id into v_task;
  select * into v_item from public.task_checklist_items where task_id = v_task and from_step;
  assert v_item.id is not null and v_item.step_key = 'purchasing' and v_item.kind = 'date' and v_item.required, '2 copied into the task';

  -- 3. Clearing the checklist template keeps it.
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform public.checklist_apply_template(v_task, null);
  assert exists (select 1 from public.task_checklist_items where id = v_item.id), '3 kept on a template change';

  -- 4. A date answer must be a date; a valid one counts as answered.
  assert pg_temp.fails(format($q$update public.task_checklist_items set value_text = 'soon' where id = %L$q$, v_item.id)), '4 not a date';

  -- 5. The step is held while it is open, a negative action passes, the answer releases it.
  update public.task_step_history set left_at = null where task_id = v_task;
  insert into public.task_step_history (task_id, step_key) values (v_task, 'purchasing');
  assert pg_temp.fails(format($q$update public.task_step_history set left_at = now(), action_key = 'ordered' where task_id = %L and step_key = 'purchasing' and left_at is null$q$, v_task)), '5 held';
  update public.task_checklist_items set value_text = '2026-11-02' where id = v_item.id;
  assert public.checklist_item_answered('date', false, null, null, '2026-11-02'), '5 answered';
  update public.task_step_history set left_at = now(), action_key = 'ordered' where task_id = v_task and step_key = 'purchasing' and left_at is null;

  -- 6. Only who may edit the task type defines step items.
  set local role authenticated;
  perform pg_temp.act_as('ben.keller@example.com');
  assert pg_temp.fails(format($q$insert into public.task_type_step_items (step_id, sort_order, kind, label) values (%L, 9, 'check', 'x')$q$, v_step)), '6 Ben refused';
  delete from public.task_type_step_items where step_id = v_step;
  assert exists (select 1 from public.task_type_step_items where step_id = v_step), '6 Ben cannot delete';

  -- 8. Completing: the item of a step the task went through counts, one of a step never entered does not.
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.task_engine', 'on', true);
  insert into public.tasks (task_type_id, title) values (v_type, 'Smoke step items 2') returning id into v_task;
  update public.tasks set status = 'done', completed_at = now() where id = v_task;
  assert (select status from public.tasks where id = v_task) = 'done', '8 step never entered: done';
  insert into public.tasks (task_type_id, title) values (v_type, 'Smoke step items 3') returning id into v_task;
  insert into public.task_step_history (task_id, step_key, left_at, action_key) values (v_task, 'purchasing', now(), 'ordered');
  assert pg_temp.fails(format($q$update public.tasks set status = 'done', completed_at = now() where id = %L$q$, v_task)), '8 entered step: held';
  perform set_config('app.task_action_kind', 'negative', true);
  update public.tasks set status = 'done', completed_at = now() where id = v_task;
  assert (select status from public.tasks where id = v_task) = 'done', '8 a negative finishing action passes';
  perform set_config('app.task_action_kind', '', true);

  -- 7. Old columns are gone.
  assert not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and ((table_name = 'tasks' and column_name = 'step_data') or (table_name = 'task_type_steps' and column_name = 'required_fields'))),
         '7 step fields dropped';
end;
$$;
rollback;
