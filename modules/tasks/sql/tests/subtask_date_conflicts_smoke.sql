-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/subtask_date_conflicts_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Date conflicts between subtask and parent (migration 20261030120000_subtask_date_conflicts.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/subtask_date_conflicts_smoke.sql
-- Everything runs in one transaction and is rolled back.
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
  v_team uuid := (select id from public.teams where name = 'Werkstatt');
  v_parent uuid;
  v_later uuid;
  v_inside uuid;
  v_overdue uuid;
  v_undated uuid;
  v_done uuid;
  v_grand uuid;
  r record;
begin
  perform pg_temp.act_as('max.wilckens@wilckens.com');

  -- pure function
  assert public.task_date_conflict('open', current_date + 10, 'open', current_date + 5) = 'later', '1 later';
  assert public.task_date_conflict('open', current_date + 3, 'open', current_date + 5) is null, '2 inside';
  assert public.task_date_conflict('open', current_date - 2, 'open', current_date - 1) = 'overdue', '3 overdue child, parent date passed';
  assert public.task_date_conflict('open', current_date - 2, 'open', current_date + 5) is null, '4 overdue child, parent still ahead';
  assert public.task_date_conflict('done', current_date + 10, 'open', current_date + 5) is null, '5 done child';
  assert public.task_date_conflict('open', current_date + 10, 'done', current_date + 5) is null, '6 closed parent';
  assert public.task_date_conflict('open', null, 'open', current_date + 5) is null, '7 no child date';
  assert public.task_date_conflict('open', current_date + 1, 'open', null) is null, '8 no parent date';

  insert into public.tasks (task_type_id, title, team_id, due_date) values (v_general, 'Conflict parent', v_team, current_date + 10) returning id into v_parent;
  insert into public.tasks (task_type_id, title, team_id, due_date, parent_task_id) values (v_general, 'Later', v_team, current_date + 15, v_parent) returning id into v_later;
  insert into public.tasks (task_type_id, title, team_id, due_date, parent_task_id) values (v_general, 'Inside', v_team, current_date + 5, v_parent) returning id into v_inside;
  insert into public.tasks (task_type_id, title, team_id, due_date, parent_task_id) values (v_general, 'Undated', v_team, null, v_parent) returning id into v_undated;
  insert into public.tasks (task_type_id, title, team_id, due_date, parent_task_id) values (v_general, 'Grand', v_team, current_date + 12, v_later) returning id into v_grand;

  -- 9. tree: later child flagged, inside and undated not, grandchild checked against its own parent (later: 12 < 15 -> none)
  for r in select * from public.task_tree(v_parent) loop
    if r.id = v_parent then assert r.date_conflict is null and r.parent_due_date is null, '9 root'; end if;
    if r.id = v_later then assert r.date_conflict = 'later' and r.parent_due_date = current_date + 10 and r.expected_end = current_date + 15, '9 later'; end if;
    if r.id = v_inside then assert r.date_conflict is null, '9 inside'; end if;
    if r.id = v_undated then assert r.date_conflict is null and r.expected_end is null, '9 undated'; end if;
    if r.id = v_grand then assert r.date_conflict is null, '9 grandchild vs. direct parent'; end if;
  end loop;

  -- 10. overview filter column
  assert (select date_conflict from public.tasks_overview where id = v_later) = 'later', '10 overview later';
  assert (select count(*) from public.tasks_overview where parent_task_id = v_parent and date_conflict is not null) = 1, '10 only one';

  -- 11. root of a subtree is checked against its own parent, outside the tree
  assert (select date_conflict from public.task_tree(v_later) where id = v_later) = 'later', '11 root vs. own parent';

  -- 12. an overdue child under an overdue parent: due before the parent's date, but today is already past it
  update public.tasks set due_date = current_date - 3 where id = v_inside;
  update public.tasks set due_date = current_date - 1 where id = v_parent;
  assert (select date_conflict from public.task_tree(v_parent) where id = v_inside) = 'overdue', '12 overdue conflict';
  assert (select expected_end from public.task_tree(v_parent) where id = v_inside) = current_date, '12 expected end is today';

  -- 13. finishing the child clears the flag
  perform public.task_cancel(v_later, null);
  assert (select date_conflict from public.tasks_overview where id = v_later) is null, '13 cancelled child';
end;
$$;
rollback;
