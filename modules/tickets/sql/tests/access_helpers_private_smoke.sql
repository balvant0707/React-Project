-- New test (20261113160000_platform_access_checks_private.sql, 20261113180000_platform_one_access_function.sql): who may see a record is answered only for records the caller
-- sees. Both apps: bash tools/sql-test.sh <compass|npm> platform/sql/tests/access_helpers_private_smoke.sql
-- Record type: tasks where the seed has some (COMPASS), else specifications (RADAR). One transaction, rolled back; a failed
-- assertion aborts with its message.
\set ON_ERROR_STOP on
begin;

-- A person with a login who sees some records of the type but not all, one record they see and one they do not (decided
-- as postgres).
create temp table fx (etype text, me uuid, seen uuid, unseen uuid, other uuid, visible bigint, conv uuid, conv_ctx public.access_context);
grant select on fx to public;
do $$
declare
  v_type text := case when exists (select 1 from public.tasks) then 'tasks' else 'specifications' end;
begin
  execute format($q$
    insert into fx
    with p as (
      select u.id from public.users u
      where u.has_login and u.locked_at is null and not public.is_admin(u.id)
        and exists (select 1 from public.%1$I r where public.user_has_access(u.id, %1$L, r.id, 'view'))
        and exists (select 1 from public.%1$I r where not public.user_has_access(u.id, %1$L, r.id, 'view'))
      order by u.email limit 1)
    select %1$L, p.id,
           (select r.id from public.%1$I r where public.user_has_access(p.id, %1$L, r.id, 'view') order by r.id limit 1),
           (select r.id from public.%1$I r where not public.user_has_access(p.id, %1$L, r.id, 'view') order by r.id limit 1),
           (select u.id from public.users u where u.id <> p.id and public.is_admin(u.id) limit 1),
           (select count(*) from public.%1$I r where public.user_has_access(p.id, %1$L, r.id, 'view'))
    from p$q$, v_type);
  assert (select me from fx) is not null, 'fixture: a person who sees some ' || v_type || ' but not all';
  -- a record conversation somebody else sees, with that person's context
  update fx set (conv, conv_ctx) = (
    select c.id, public.access_context_for(u.id) from public.conversations c, public.users u
    where c.kind = 'record' and c.deleted_at is null and u.id <> fx.me and public.conversation_access(u.id, c.id, 'view')
    order by c.id, u.id limit 1);
  assert (select conv from fx) is not null, 'fixture: a record conversation somebody else sees';
end $$;

-- As the database (no signed-in caller): the rules and routing for someone else (decided by the platform, not the caller).
do $$
declare
  f record;
  v_group uuid;
begin
  select * into f from fx;
  assert public.conversation_can_ctx(f.conv, 'view', f.conv_ctx), 'a: conversation_can_ctx answers for the person in the context';
  -- 'moderate' keeps conversation_access's own rule: a member of a group chat may write, not moderate
  insert into public.conversations (kind, title, created_by_user_id) values ('group', 'access smoke', f.me) returning id into v_group;
  insert into public.conversation_participants (conversation_id, user_id) values (v_group, f.me);
  assert public.user_has_access(f.me, 'conversations', v_group, 'write_notes'), 'b: a member may write in a group chat';
  assert not public.user_has_access(f.me, 'conversations', v_group, 'moderate'), 'c: a member does not moderate a group chat';
  -- entity_types.actions: the notes questions default to view
  assert public.user_has_access(f.me, f.etype, f.seen, 'write_notes'), 'd: write_notes = view on a record I see';
  assert not public.user_has_access(f.me, f.etype, f.unseen, 'read_notes'), 'e: no read_notes on one I do not see';
end $$;

create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then return true;
end $$;
grant execute on all functions in schema pg_temp to public;

select set_config('request.jwt.claims', json_build_object('sub', (select me from fx), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local role authenticated;
do $$
declare
  f record;
  v_count bigint;
begin
  select * into f from fx;
  -- 1. The helpers that take a person's id are not callable.
  assert pg_temp.denied(format('select public.user_has_access(%L, %L, %L, ''view'')', f.other, f.etype, f.unseen)), '1 user_has_access is private';
  assert pg_temp.denied(format('select public.%I(''view'', %L, public.access_context())', f.etype || '_row_allows', f.unseen)),
    '2 the module''s rule is private';
  -- 2. The row-policy dispatcher answers only for the caller's own context.
  assert public.can_access_entity_ctx(f.etype, f.seen, 'view', public.access_context()), '3 own context: yes for a record I see';
  assert not public.can_access_entity_ctx(f.etype, f.unseen, 'view', public.access_context()), '4 own context: no for a record I do not see';
  assert not public.can_access_entity_ctx(f.etype, f.seen, 'view',
           row((public.access_context()).permissions, f.other, (public.access_context()).team_ids)::public.access_context),
         '5 another person''s id in the context: no answer';
  assert not public.conversation_can_ctx(f.conv, 'view', f.conv_ctx), '5b conversation_can_ctx: no answer for another person''s context';
  -- 3. Row policies still work.
  execute format('select count(*) from public.%I', f.etype) into v_count;
  assert v_count = f.visible, '6 the list shows exactly what user_has_access allows';
  -- 4. Who can see a record: only for a record I see.
  assert not exists (select 1 from public.mentionable_users(f.etype, f.unseen)), '7 no mention list for a record I do not see';
  assert exists (select 1 from public.mentionable_users(f.etype, f.seen)), '8 the mention list of a record I see';
  if f.etype = 'tasks' and to_regprocedure('public.record_access(text,uuid)') is not null then  -- COMPASS's access badge
    assert not exists (select 1 from public.record_access('tasks', f.unseen)), '9 no access list for a task I do not see';
    assert exists (select 1 from public.record_access('tasks', f.seen)), '10 the access list of a task I see';
  end if;
end $$;
reset role;

rollback;
select 'access_helpers_private_smoke ok' as result;
