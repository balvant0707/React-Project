-- Copied from ~/maintenance_tool/supabase/tests/storage_access_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Storage policies vs. parent rows. Run on the local stack:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres < supabase/tests/storage_access_smoke.sql
-- Inserts a probe object for every task / ticket / asset / training record (and an invoice for every task), then for
-- each seeded login checks, with the same row level security the Storage API applies:
--   leak    = objects visible although the parent row is not visible
--   missing = parent row visible but its object is not (would break the UI)
--   write   = objects the user could delete or update (only the uploader and a moderator of the record, i.e. edit.all of
--             its module (record_moderator), may delete; nobody may update)
-- Everything runs in a transaction that is rolled back. Prints "storage_access_smoke: all checks passed" or the failures.
\set ON_ERROR_STOP on
begin;

create temp table probe_result (who text, kind text, n int);
grant all on probe_result to public;

insert into storage.objects (bucket_id, name, owner_id)
select 'attachments', 'tasks/' || id || '/probe.txt', null from public.tasks
union all select 'attachments', 'tickets/' || id || '/probe.txt', null from public.tickets
union all select 'attachments', 'assets/' || id || '/probe.txt', null from public.assets
union all select 'attachments', 'training_records/' || id || '/probe.txt', null from public.training_records
union all select 'invoices', id || '/probe.txt', null from public.tasks;

create or replace function pg_temp.probe(p_who text) returns void language plpgsql as $$
declare
  v_entity text;
  v_table text;
  v_leak int;
  v_missing int;
begin
  foreach v_entity in array array['tasks', 'tickets', 'assets', 'training_records'] loop
    v_table := v_entity;
    execute format($q$
      select count(*) from storage.objects o
      where o.bucket_id = 'attachments' and o.name like %L
        and not exists (select 1 from public.%I t where t.id::text = split_part(o.name, '/', 2))$q$,
      v_entity || '/%', v_table) into v_leak;
    execute format($q$
      select count(*) from public.%I t
      where not exists (select 1 from storage.objects o where o.bucket_id = 'attachments' and o.name = %L || t.id || '/probe.txt')$q$,
      v_table, v_entity || '/') into v_missing;
    insert into probe_result values (p_who, 'leak ' || v_entity, v_leak), (p_who, 'missing ' || v_entity, v_missing);
  end loop;
  -- invoices: only with costs.view, and only for tasks the user can see
  select count(*) into v_leak from storage.objects o
    where o.bucket_id = 'invoices'
      and (not public.rls_has('costs.view') or not exists (select 1 from public.tasks t where t.id::text = split_part(o.name, '/', 1)));
  insert into probe_result values (p_who, 'leak invoices', v_leak);
end $$;

create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

grant execute on all functions in schema pg_temp to public;
-- storage.protect_delete refuses direct deletes; the flag lets the policy decide what the probe may delete
select set_config('storage.allow_delete_query', 'true', true);

do $$
declare
  v_email text;
  v_deleted int;
  v_updated int;
begin
  foreach v_email in array array[
    'tom.berger@example.com', 'anna.weber@example.com', 'sara.novak@example.com', 'paul.meier@example.com',
    'lena.fischer@example.com', 'ben.keller@example.com', 'jonas.richter@example.com', 'hanna.richter@example.com']
  loop
    perform pg_temp.as_user(v_email);
    perform pg_temp.probe(v_email);
    -- probe attachments have no owner: only a moderator of the record may delete one (not tried here, so the objects
    -- stay for the next user), nobody may change one
    with d as (delete from storage.objects where bucket_id = 'attachments' and name like '%/probe.txt'
               and not public.storage_path_moderator(name) returning 1) select count(*) into v_deleted from d;
    with u as (update storage.objects set name = name where name like '%/probe.txt' returning 1) select count(*) into v_updated from u;
    insert into probe_result values (v_email, 'write attachments (delete+update)', v_deleted + v_updated);
    -- invoices may be deleted with costs.edit on a task the user can check, never updated (counted above)
    with d as (delete from storage.objects where bucket_id = 'invoices' and name like '%/probe.txt' returning 1) select count(*) into v_deleted from d;
    insert into probe_result values (v_email, 'delete invoices without costs.edit', case when public.rls_has('costs.edit') then 0 else v_deleted end);
    reset role;
  end loop;

  -- avatars: private bucket, readable by every signed-in user, never by anon
insert into probe_result select 'config', 'avatars bucket is public', count(*) from storage.buckets where id = 'avatars' and public;
reset role;
insert into storage.objects (bucket_id, name) values ('avatars', '00000000-0000-4000-8000-0000000000ff/avatar-probe');
perform pg_temp.as_user('ben.keller@example.com');
insert into probe_result select 'ben.keller@example.com', 'avatar not readable', 1 where not exists (select 1 from storage.objects where bucket_id = 'avatars' and name like '%/avatar-probe');
reset role;

-- signed out: nothing at all
  set local role anon;
  begin
    insert into probe_result select 'anon', 'objects visible', count(*) from storage.objects;
  exception when insufficient_privilege then
    null;
  end;
  reset role;
end $$;

select who, kind, n as problem_count from probe_result
where n > 0
order by who, kind;

select case when exists (select 1 from probe_result where n > 0)
  then 'storage_access_smoke: FAILURES above'
  else 'storage_access_smoke: all checks passed' end as result;
-- Fail hard, so scripts/run-tests.sh notices.
do $$ begin
  if exists (select 1 from probe_result where n > 0) then
    raise exception 'storage_access_smoke: % failing check(s)', (select count(*) from probe_result where n > 0);
  end if;
end $$;
rollback;
