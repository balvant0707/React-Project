-- Copied from ~/npm_tool/supabase/tests/email_thread_links_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Email threads linked to orders + reference token (migration 20261024100000): bash supabase/tests/run.sh email_thread_links_smoke.sql
-- Local stack, seeded. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;
-- (port) mail.access for everybody in this test.
insert into public.roles (name) values ('SMOKE mail access');
insert into public.role_permissions (role_id, permission) select id, 'mail.access' from public.roles where name = 'SMOKE mail access';
insert into public.user_roles (user_id, role_id) select u.id, r.id from public.users u, public.roles r where r.name = 'SMOKE mail access' on conflict do nothing;

do $$
declare
  v_mailbox uuid;
  v_thread uuid;
  v_order uuid := (select id from public.orders order by id limit 1);
  v_failed boolean := false;
begin
  select id into v_mailbox from public.mailboxes limit 1;
  if v_mailbox is null then
    insert into public.mailboxes (address, display_name, kind, owner_user_id)
    values ('smoke-links@example.com', 'Smoke', 'personal', (select id from public.users limit 1)) returning id into v_mailbox;
  end if;
  insert into public.email_threads (mailbox_id, subject, reference_token) values (v_mailbox, 'Smoke [SMOKE-TOKEN-1]', 'SMOKE-TOKEN-1') returning id into v_thread;

  if v_order is not null then
    insert into public.email_thread_entity_links (email_thread_id, entity_type, entity_id) values (v_thread, 'orders', v_order);
    assert (select count(*) from public.email_thread_entity_links where email_thread_id = v_thread) = 1, 'thread linked to an order';
  end if;

  begin
    insert into public.email_thread_entity_links (email_thread_id, entity_type, entity_id) values (v_thread, 'orders', gen_random_uuid());
  exception when others then v_failed := true;
  end;
  assert v_failed, 'a link to a missing order is rejected';

  v_failed := false;
  begin
    insert into public.email_thread_entity_links (email_thread_id, entity_type, entity_id) values (v_thread, 'transports', gen_random_uuid());
  exception when others then v_failed := true;
  end;
  assert v_failed, 'an entity type outside the allow-list is rejected';

  assert (select count(*) from public.email_threads where mailbox_id = v_mailbox and reference_token = 'SMOKE-TOKEN-1') = 1, 'thread found by token';
  raise notice 'ok: email thread links';
end $$;

-- Record threads are shared between an offer and its orders; an inbound mail notifies the responsible person.
do $$
declare
  v_mailbox uuid := (select id from public.mailboxes limit 1);
  v_order record;
  v_user uuid := (select id from public.users where has_login order by id limit 1);
  v_thread uuid;
begin
  select o.id, o.specification_id into v_order from public.orders o where o.specification_id is not null limit 1;
  if v_order.id is null then
    -- the seed has no order: make a minimal one from a specification
    insert into public.orders (order_number, vessel_id, supplier_id, team_id, status_phrase_id, specification_id)
    select 'SMOKE-ORD-1', s.vessel_id, s.supplier_id, s.team_id, (select id from public.phrases where category = 'order_status' limit 1), s.id
    from public.specifications s where s.supplier_id is not null and s.vessel_id is not null and s.team_id is not null limit 1
    returning id, specification_id into v_order;
  end if;
  update public.specifications set responsible_user_id = v_user where id = v_order.specification_id;
  insert into public.email_threads (mailbox_id, subject, reference_token) values (v_mailbox, 'Shared smoke thread', 'SMOKETOKEN') returning id into v_thread;
  insert into public.email_thread_entity_links (email_thread_id, entity_type, entity_id) values (v_thread, 'specifications', v_order.specification_id);

  assert (select responsible_user_id from public.email_threads where id = v_thread) = v_user, 'linking a record assigns the thread to the record''s responsible person';
  assert exists (select 1 from public.email_record_threads('orders', v_order.id) where email_thread_id = v_thread), 'an order sees the thread of its offer';
  assert exists (select 1 from public.email_record_threads('specifications', v_order.specification_id) where email_thread_id = v_thread), 'the offer sees its thread';

  insert into public.email_messages (email_thread_id, direction, from_address, from_display_name, body_text, send_status, sent_at)
  values (v_thread, 'inbound', 'supplier@example.com', 'Supplier', 'yes', 'received', now());
  assert exists (select 1 from public.notifications where user_id = v_user and type = 'email_reply' and dedupe_key = 'email:' || v_thread), 'the responsible person is notified of the reply';
  raise notice 'ok: shared record threads and reply notification';
end $$;

rollback;
