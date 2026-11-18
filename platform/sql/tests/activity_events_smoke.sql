-- apps: compass
-- New test for the unified activity log: NPM's log_field_changes() (merge, undo, labels) writing COMPASS-style events
-- (event_type field_changed + metadata). Logic of the cases follows NPM's activity_events_smoke.sql. One transaction, rolled back.
begin;

create table public.smoke_records (id uuid primary key default gen_random_uuid(), title text, owner_user_id uuid, amount numeric);
create trigger smoke_log after update on public.smoke_records for each row
  execute function public.log_field_changes('smoke_records', 'title', 'owner_user_id=users', '!amount');
create trigger smoke_log_delete after delete on public.smoke_records for each row
  execute function public.log_field_changes('smoke_records');

create function public.smoke_records_row_allows(p_action text, p_id uuid, p_ctx public.access_context) returns boolean language sql stable as $$ select true $$;
select public.entity_type_register('smoke_records', 'smoke', 'smoke_records_row_allows');

create temp table ids as select (select id from public.users where email = 'anna.weber@example.com') as anna,
                                (select id from public.users where email = 'ben.keller@example.com') as ben,
                                gen_random_uuid() as rec;
grant select on ids to public;
insert into public.smoke_records (id, title) select rec, 'First' from ids;
grant all on public.smoke_records to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select anna from ids), 'role', 'authenticated', 'aal', 'aal2')::text, true);

update public.smoke_records set title = 'Second' where id = (select rec from ids);
do $$ begin
  assert (select count(*) from public.activity_events where entity_type = 'smoke_records') = 1, 'one event after the first change';
  assert (select event_type from public.activity_events where entity_type = 'smoke_records') = 'field_changed', 'event type';
  assert (select metadata ->> 'field' from public.activity_events where entity_type = 'smoke_records') = 'title', 'field in metadata';
  assert (select metadata ->> 'old' from public.activity_events where entity_type = 'smoke_records') = 'First', 'old value';
end $$;

-- the same user changes the same field again within the window: one entry, new value, old value kept
update public.smoke_records set title = 'Third' where id = (select rec from ids);
do $$ begin
  assert (select count(*) from public.activity_events where entity_type = 'smoke_records') = 1, 'merged into one entry';
  assert (select metadata ->> 'new' from public.activity_events where entity_type = 'smoke_records') = 'Third', 'merged new value';
  assert (select metadata ->> 'old' from public.activity_events where entity_type = 'smoke_records') = 'First', 'merged keeps the first old value';
end $$;

-- undone: back to the old value deletes the entry
update public.smoke_records set title = 'First' where id = (select rec from ids);
do $$ begin
  assert (select count(*) from public.activity_events where entity_type = 'smoke_records') = 0, 'undo removes the entry';
end $$;

-- label of a reference
update public.smoke_records set owner_user_id = (select ben from ids) where id = (select rec from ids);
do $$ begin
  assert (select metadata ->> 'new_label' from public.activity_events where entity_type = 'smoke_records' and metadata ->> 'field' = 'owner_user_id') is not null, 'user label';
end $$;

-- "!" fields are never merged
update public.smoke_records set amount = 1 where id = (select rec from ids);
update public.smoke_records set amount = 2 where id = (select rec from ids);
do $$ begin
  assert (select count(*) from public.activity_events where entity_type = 'smoke_records' and metadata ->> 'field' = 'amount') = 2, 'no merge for ! fields';
end $$;

-- events are immutable for anybody else
reset role;
do $$ begin
  begin
    update public.activity_events set event_type = 'x' where entity_type = 'smoke_records';
    raise exception 'update was allowed';
  exception when others then
    assert sqlerrm like '%immutable%', 'immutable: ' || sqlerrm;
  end;
end $$;

-- delete removes the entries
delete from public.smoke_records where id = (select rec from ids);
do $$ begin
  assert (select count(*) from public.activity_events where entity_type = 'smoke_records') = 0, 'delete removes the log';
end $$;

select 'activity_events_smoke: all checks passed' as result;
rollback;
