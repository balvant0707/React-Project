-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/message_switches_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Notification switches and handover (migration 20261209100000_message_notification_switches.sql): a switched-off type
-- creates no bell line, a mention cannot be switched off, only switchable types are stored, and a former assignee
-- leaves the Inbox of the task unless they wrote in it. Run on the local stack with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/message_switches_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;

-- 1. Switches
do $$
declare v_anna uuid := pg_temp.uid('anna.weber@example.com'); v_tom uuid := pg_temp.uid('tom.berger@example.com');
begin
  insert into public.notification_preferences (user_id, muted_types) values (v_anna, array['direct_message', 'mention', 'bogus', 'reaction']);
  assert (select muted_types from public.notification_preferences where user_id = v_anna) = array['direct_message', 'reaction'],
    '1 only switchable types are stored';
  perform public.notify(array[v_anna, v_tom], 'direct_message', 't', null, null, null, null, null, 'sw:1');
  assert not exists (select 1 from public.notifications where user_id = v_anna and dedupe_key = 'sw:1'), '2 muted type creates no line';
  assert exists (select 1 from public.notifications where user_id = v_tom and dedupe_key = 'sw:1'), '3 others still get it';
  perform public.notify(array[v_anna], 'mention', 't', null, null, null, null, null, 'sw:2');
  assert exists (select 1 from public.notifications where user_id = v_anna and dedupe_key = 'sw:2'), '4 a mention always arrives';
  update public.notification_preferences set muted_types = '{}' where user_id = v_anna;
  perform public.notify(array[v_anna], 'direct_message', 't', null, null, null, null, null, 'sw:3');
  assert exists (select 1 from public.notifications where user_id = v_anna and dedupe_key = 'sw:3'), '5 switched back on';
end $$;

-- 2. Handover
do $$
declare v_anna uuid := pg_temp.uid('anna.weber@example.com'); v_sara uuid := pg_temp.uid('sara.novak@example.com'); v_tom uuid := pg_temp.uid('tom.berger@example.com');
        v_paul uuid := pg_temp.uid('paul.meier@example.com'); v_task uuid; v_conv uuid;
begin
  -- A task nobody of the three made, handed to a fourth person first (the generated seed tasks have no creator).
  select id into v_task from public.tasks where coalesce(created_by_user_id, v_tom) not in (v_anna, v_sara, v_paul) limit 1;
  assert v_task is not null, 'seed has no suitable task';
  update public.tasks set assigned_user_id = pg_temp.uid('lena.fischer@example.com') where id = v_task;
  insert into public.conversations (kind, anchor_type, anchor_id) values ('record', 'tasks', v_task) returning id into v_conv;
  insert into public.conversation_participants (conversation_id, user_id) values (v_conv, v_anna), (v_conv, v_sara), (v_conv, v_paul);
  insert into public.messages (conversation_id, author_user_id, body) values (v_conv, v_sara, 'wrote');
  update public.tasks set assigned_user_id = v_anna where id = v_task;
  update public.tasks set assigned_user_id = v_paul where id = v_task;
  assert not (select taking_part from public.conversation_participants where conversation_id = v_conv and user_id = v_anna),
    '6 the former assignee leaves the Inbox';
  assert (select taking_part from public.conversation_participants where conversation_id = v_conv and user_id = v_sara),
    '7 somebody who wrote stays';
  assert (select taking_part from public.conversation_participants where conversation_id = v_conv and user_id = v_paul),
    '8 the new assignee stays';
end $$;

rollback;
