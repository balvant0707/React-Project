-- Copied from ~/maintenance_tool/supabase/tests/position_appointments_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Appointments and dated position holders (migration 20261216120000_position_appointments.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/position_appointments_smoke.sql
-- Shared seed (Hanna is HR, Tom Manager, Anna and Sara workshop). Rolled back.
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
  v_hanna uuid := (select id from public.users where email = 'hanna.richter@example.com');
  v_anna uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_sara uuid := (select id from public.users where email = 'sara.novak@example.com');
  v_team uuid;
  v_aid uuid;
  v_job uuid;
  v_h1 uuid;
  v_h2 uuid;
  v_tt uuid;
begin
  perform pg_temp.act_as('hanna.richter@example.com');
  insert into public.positions (name, kind) values ('Smoke first aider', 'appointment') returning id into v_aid;
  insert into public.positions (name) values ('Smoke job') returning id into v_job;
  select id into v_team from public.teams where name = 'Werkstatt';

  -- 1. Appointments are never held through a team; a job with teams cannot become an appointment.
  assert pg_temp.fails(format('insert into public.position_teams (position_id, team_id) values (%L, %L)', v_aid, v_team)), '1 no team on an appointment';
  insert into public.position_teams (position_id, team_id) values (v_job, v_team);
  assert pg_temp.fails(format($q$update public.positions set kind = 'appointment' where id = %L$q$, v_job)), '1 job with teams stays a job';

  -- 2. A backdated appointment holds today and on a past date, not before it began.
  insert into public.position_holders (position_id, user_id, valid_from, appointed_by_user_id)
  values (v_aid, v_anna, current_date - 400, v_hanna) returning id into v_h1;
  assert exists (select 1 from public.position_holders_effective where position_id = v_aid and user_id = v_anna and valid_from = current_date - 400), '2 Anna holds it today';
  assert exists (select 1 from public.position_holders_at(v_aid, current_date - 100) where user_id = v_anna), '2 held 100 days ago';
  assert not exists (select 1 from public.position_holders_at(v_aid, current_date - 401)), '2 not before it began';

  -- 3. Overlapping periods of the same person are refused; a period cannot end before it starts.
  assert pg_temp.fails(format('insert into public.position_holders (position_id, user_id, valid_from) values (%L, %L, %L)', v_aid, v_anna, current_date - 10)), '3 overlap refused';
  assert pg_temp.fails(format('update public.position_holders set valid_to = %L where id = %L', current_date - 500, v_h1)), '3 end before start refused';

  -- 4. Ending keeps the row: no holder today, still one yesterday; the log says removed. Person and position are fixed.
  update public.position_holders set valid_to = current_date - 1 where id = v_h1;
  assert not exists (select 1 from public.position_holders_effective where position_id = v_aid and user_id = v_anna), '4 ended';
  assert exists (select 1 from public.position_holders_at(v_aid, current_date - 1) where user_id = v_anna), '4 held yesterday';
  assert (select action || ' ' || valid_from || '..' || valid_to from public.position_assignment_log where position_id = v_aid and user_id = v_anna order by happened_at desc, id desc limit 1)
         = 'removed ' || (current_date - 400) || '..' || (current_date - 1), '4 logged with the period';
  update public.position_holders set valid_from = current_date - 300 where id = v_h1;
  assert (select action from public.position_assignment_log where position_id = v_aid and user_id = v_anna order by happened_at desc, id desc limit 1) = 'changed', '4 moving a date is logged';
  assert pg_temp.fails(format('update public.position_holders set user_id = %L where id = %L', v_sara, v_h1)), '4 person fixed';

  -- 5. Appointed again from today: a second period, the first stays.
  insert into public.position_holders (position_id, user_id) values (v_aid, v_anna) returning id into v_h2;
  assert (select count(*) from public.position_holders where position_id = v_aid and user_id = v_anna) = 2, '5 two periods';

  -- 6. A future appointment does not hold yet.
  insert into public.position_holders (position_id, user_id, valid_from) values (v_aid, v_sara, current_date + 30);
  assert not exists (select 1 from public.position_holders_effective where position_id = v_aid and user_id = v_sara), '6 not yet';

  -- 7. Training requirements follow the appointment; suitability reviews leave it out.
  insert into public.training_types (name) values ('Smoke first aid') returning id into v_tt;
  insert into public.training_requirements (training_type_id, position_id) values (v_tt, v_aid);
  assert exists (select 1 from public.training_status_for_me() where user_id = v_anna and training_type_id = v_tt and required), '7 Anna needs the training';
  assert not exists (select 1 from jsonb_array_elements((public.position_fit_context(v_anna)) -> 'without_description') e where e #>> '{}' = 'Smoke first aider'), '7 not in the review';

  -- 8. Appointment letter: HR adds it, Anna reads it, Sara does not; a row with a letter is not deleted.
  insert into public.attachments (entity_type, entity_id, file_name, storage_path, mime_type, size_bytes)
  values ('position_holders', v_h2, 'letter.pdf', 'position_holders/' || v_h2 || '/letter.pdf', 'application/pdf', 10);
  assert pg_temp.fails(format('delete from public.position_holders where id = %L', v_h2)), '8 kept with a letter';
  perform pg_temp.act_as('anna.weber@example.com');
  assert exists (select 1 from public.attachments where entity_type = 'position_holders' and entity_id = v_h2), '8 Anna reads her letter';
  assert pg_temp.fails(format('update public.position_holders set valid_to = current_date where id = %L', v_h2))
         or not exists (select 1 from public.position_holders where id = v_h2 and valid_to is not null), '8 Anna cannot end it';
  perform pg_temp.act_as('sara.novak@example.com');
  assert not exists (select 1 from public.attachments where entity_type = 'position_holders' and entity_id = v_h2), '8 Sara does not';
  assert exists (select 1 from public.position_holders_effective where position_id = v_aid and user_id = v_anna), '8 but everybody sees who holds it';
  delete from public.attachments where entity_type = 'position_holders' and entity_id = v_h2;

  -- 9. HR removes a wrong letter; then the period can be deleted.
  perform pg_temp.act_as('hanna.richter@example.com');
  assert exists (select 1 from public.attachments where entity_type = 'position_holders' and entity_id = v_h2), '8 Sara could not delete it';
  delete from public.attachments where entity_type = 'position_holders' and entity_id = v_h2;
  assert not exists (select 1 from public.attachments where entity_type = 'position_holders' and entity_id = v_h2), '9 letter removed';
  delete from public.position_holders where id = v_h2;
  assert not exists (select 1 from public.position_holders where id = v_h2), '9 period deleted';
end $$;

rollback;
