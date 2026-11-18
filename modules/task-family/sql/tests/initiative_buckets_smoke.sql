-- Copied from ~/maintenance_tool/supabase/tests/initiative_buckets_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Task root + initiative buckets smoke test. Run on a database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/initiative_buckets_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;
-- Deleting tasks needs a delete literal; no seeded role holds one (the admin used to pass by bypass, admin limits).
insert into public.role_permissions (role_id, permission)
select r.id, p from public.roles r, unnest(array['tasks.delete.all', 'initiatives.delete.all']) p where r.name = 'Manager'
on conflict do nothing;
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = 'max.wilckens@wilckens.com'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare
  v_init uuid := (select id from public.task_types where key = 'initiative');
  v_general uuid := (select id from public.task_types where key = 'general');
  v_root uuid; v_other uuid; v_a uuid; v_a1 uuid; v_plain uuid;
  v_bucket uuid; v_foreign uuid;
begin
  insert into public.tasks (task_type_id, is_initiative, title) values (v_init, true, 'Bucket initiative') returning id into v_root;
  insert into public.tasks (task_type_id, is_initiative, title) values (v_init, true, 'Other initiative') returning id into v_other;
  insert into public.tasks (task_type_id, title, parent_task_id) values (v_general, 'A', v_root) returning id into v_a;
  insert into public.tasks (task_type_id, title, parent_task_id) values (v_general, 'A1', v_a) returning id into v_a1;
  insert into public.tasks (task_type_id, title) values (v_general, 'Plain') returning id into v_plain;

  assert (select root_task_id from public.tasks where id = v_root) = v_root, 'a root is its own root';
  assert (select root_task_id from public.tasks where id = v_a1) = v_root, 'root propagates to level 3';
  assert (select root_task_id from public.tasks where id = v_plain) = v_plain, 'plain task is its own root';
  assert (select count(*) from public.tasks_overview where root_task_id = v_root) = 3, 'overview filter by root';

  insert into public.initiative_buckets (initiative_task_id, name, position) values (v_root, 'Planning', 1) returning id into v_bucket;
  insert into public.initiative_buckets (initiative_task_id, name, position) values (v_other, 'Elsewhere', 1) returning id into v_foreign;
  update public.tasks set bucket_id = v_bucket where id = v_a1;
  assert (select bucket_id from public.tasks_overview where id = v_a1) = v_bucket, 'task sits in the bucket';

  begin
    update public.tasks set bucket_id = v_foreign where id = v_a1;
    raise exception 'foreign bucket was accepted';
  exception when others then
    assert sqlerrm = 'The bucket belongs to another initiative', sqlerrm;
  end;

  -- Deleting a bucket empties it, the task stays.
  delete from public.initiative_buckets where id = v_bucket;
  assert (select bucket_id from public.tasks where id = v_a1) is null, 'bucket delete clears bucket_id';

  -- Deleting the middle task turns its child into a root.
  delete from public.tasks where id = v_a;
  assert (select root_task_id from public.tasks where id = v_a1) = v_a1, 'orphan becomes its own root';
  raise notice 'initiative_buckets smoke test passed';
end;
$$;
reset role;
rollback;
