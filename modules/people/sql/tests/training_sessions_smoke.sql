-- Copied from ~/maintenance_tool/supabase/tests/training_sessions_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Training sessions (migration 20261215120000_training_sessions.sql): plan, tick, confirm, records, rights.
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/training_sessions_smoke.sql
-- Shared seed (Tom supervises Anna, Sara, Lena, Ben; Paul has no supervisor; Hanna is HR). Rolled back.
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
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_ben uuid := (select id from public.users where email = 'ben.keller@example.com');
  v_paul uuid := (select id from public.users where email = 'paul.meier@example.com');
  v_t1 uuid;
  v_t2 uuid;
  v_s uuid;
  v_n integer;
begin
  perform pg_temp.act_as('hanna.richter@example.com');
  insert into public.training_types (name) values ('Smoke session A') returning id into v_t1;
  insert into public.training_types (name, validity_months) values ('Smoke session B', 12) returning id into v_t2;

  -- 1. Tom (Manager, his reports) plans a session for two types and three of his people.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.training_sessions (held_on, trainer, location) values (current_date + 3, 'Tom', 'Hall 2') returning id into v_s;
  insert into public.training_session_types (session_id, training_type_id) values (v_s, v_t1), (v_s, v_t2);
  insert into public.training_session_participants (session_id, user_id) values (v_s, v_anna), (v_s, v_sara), (v_s, v_ben);
  assert (select participant_count from public.training_sessions_overview where id = v_s) = 3, '1 three invited';
  assert (select can_edit from public.training_sessions_overview where id = v_s), '1 Tom may edit';

  -- 2. Paul is not Tom's: refused. Nobody sets the status by hand.
  assert pg_temp.fails(format('insert into public.training_session_participants (session_id, user_id) values (%L, %L)', v_s, v_paul)), '2 Paul refused for Tom';
  assert pg_temp.fails(format($q$update public.training_sessions set status = 'confirmed', confirmed_at = now() where id = %L$q$, v_s)), '2 status only through the RPC';

  -- 3. A session in the future cannot be confirmed; the planned one can still be moved.
  assert pg_temp.fails(format('select public.training_session_confirm(%L)', v_s)), '3 future refused';
  update public.training_sessions set held_on = current_date where id = v_s;

  -- 4. Ben did not come: unticked. Anna (a participant) sees the session, Paul does not.
  update public.training_session_participants set attended = false where session_id = v_s and user_id = v_ben;
  perform pg_temp.act_as('anna.weber@example.com');
  assert exists (select 1 from public.training_sessions where id = v_s), '4 Anna sees her session';
  assert not (select can_edit from public.training_sessions_overview where id = v_s), '4 Anna may not edit';
  assert pg_temp.fails(format('select public.training_session_confirm(%L)', v_s)), '4 Anna may not confirm';
  perform pg_temp.act_as('paul.meier@example.com');
  assert not exists (select 1 from public.training_sessions where id = v_s), '4 Paul does not see it';

  -- 5. Confirm: two people x two types = four records, with date, trainer and the session.
  perform pg_temp.act_as('tom.berger@example.com');
  v_n := public.training_session_confirm(v_s);
  assert v_n = 4, '5 four records, got ' || v_n;
  assert not exists (select 1 from public.training_records where session_id = v_s and user_id = v_ben), '5 Ben has none';
  assert (select count(*) from public.training_records where session_id = v_s and completed_on = current_date and trainer = 'Tom') = 4, '5 date and trainer';
  assert (select valid_until from public.training_records where session_id = v_s and user_id = v_anna and training_type_id = v_t2)
       = (current_date + interval '12 months')::date, '5 validity computed';

  -- 6. Confirmed = fixed: no new date, no type change, no unticking, no delete, no second confirmation.
  assert pg_temp.fails(format('update public.training_sessions set held_on = current_date - 1 where id = %L', v_s)), '6 date fixed';
  assert pg_temp.fails(format('select public.training_session_confirm(%L)', v_s)), '6 confirmed twice';
  delete from public.training_session_types where session_id = v_s;
  assert (select count(*) from public.training_session_types where session_id = v_s) = 2, '6 types stay';
  update public.training_session_participants set attended = false where session_id = v_s;
  assert (select attended_count from public.training_sessions_overview where id = v_s) = 2, '6 ticks stay';
  delete from public.training_sessions where id = v_s;
  assert exists (select 1 from public.training_sessions where id = v_s), '6 not deleted';

  -- 7. A forgotten person added afterwards gets the records at once.
  delete from public.training_session_participants where session_id = v_s and user_id = v_ben;
  insert into public.training_session_participants (session_id, user_id) values (v_s, (select id from public.users where email = 'lena.fischer@example.com'));
  assert (select count(*) from public.training_records where session_id = v_s) = 6, '7 Lena recorded';

  -- 8. A proof on the session counts for every record it wrote.
  insert into public.attachments (entity_type, entity_id, storage_path, file_name, uploaded_by_user_id)
  values ('training_sessions', v_s, 'training_sessions/' || v_s || '/sheet.pdf', 'sheet.pdf', auth.uid());
  assert (select bool_and(proof_count = 1) from public.training_records_overview where session_id = v_s), '8 proof counted';
  perform pg_temp.act_as('anna.weber@example.com');
  assert (select count(*) from public.attachments where entity_type = 'training_sessions' and entity_id = v_s) = 1, '8 Anna reads the sheet';
  assert (select proof_count from public.training_status where user_id = v_anna and training_type_id = v_t1) = 1, '8 status counts the session proof';

  -- 9. A planned session can be deleted.
  perform pg_temp.act_as('tom.berger@example.com');
  insert into public.training_sessions (held_on) values (current_date) returning id into v_s;
  delete from public.training_sessions where id = v_s;
  assert not exists (select 1 from public.training_sessions where id = v_s), '9 planned deleted';

  -- 9b. A planned session with a proof file is kept (the file would be lost otherwise).
  insert into public.training_sessions (held_on) values (current_date) returning id into v_s;
  insert into public.attachments (entity_type, entity_id, storage_path, file_name, uploaded_by_user_id)
  values ('training_sessions', v_s, 'training_sessions/' || v_s || '/plan.pdf', 'plan.pdf', auth.uid());
  assert pg_temp.fails(format('delete from public.training_sessions where id = %L', v_s)), '9b refused with a proof';

  -- 10. Without an edit literal no session is created.
  perform pg_temp.act_as('ben.keller@example.com');
  assert pg_temp.fails('insert into public.training_sessions (held_on) values (current_date)'), '10 Ben may not plan';
end;
$$;
rollback;
