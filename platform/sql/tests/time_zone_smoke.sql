-- apps: npm
-- Copied from ~/npm_tool/supabase/tests/time_zone_smoke.sql with the renames and platform adaptations.
-- RADAR app: bash tools/sql-test.sh npm <file>.
-- Time zones (migration 20261104100000_time_zones.sql): bash supabase/tests/run.sh time_zone_smoke.sql
-- Local stack, seeded. One transaction, rolled back; a failed assertion aborts with its message.
\set ON_ERROR_STOP on
begin;

create temp table people on commit drop as select email, id from public.users;
grant select on people to public;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from pg_temp.people where email = p_email $$;
grant execute on all functions in schema pg_temp to public;

-- 1. A user sets, changes and clears their own zone; an unknown name is refused; another user's row is not theirs.
set local role authenticated;
do $$
declare
  v_me uuid := pg_temp.uid('ugur.akbati@nipponpaint-marine.eu');
  v_other uuid := pg_temp.uid('jenko.harrendorf@nipponpaint-marine.eu');
  v_ok boolean := false;
  v_rows int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_me, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  update public.users set time_zone = 'Asia/Singapore' where id = v_me;
  assert (select time_zone from public.users where id = v_me) = 'Asia/Singapore', 'own zone saved';
  update public.users set time_zone = null where id = v_me;
  assert (select time_zone from public.users where id = v_me) is null, 'own zone cleared (= device zone)';
  begin
    update public.users set time_zone = 'Mars/Olympus_Mons' where id = v_me;
  exception when invalid_parameter_value then v_ok := true;
  end;
  assert v_ok, 'unknown zone refused';
  update public.users set time_zone = 'Europe/Berlin' where id = v_other;
  get diagnostics v_rows = row_count;
  assert v_rows = 0, 'cannot set another user''s zone';
end $$;
reset role;

-- 2. A new dock report starts with its creator's zone unless it names one; the column is validated too.
do $$
declare
  v_admin uuid := pg_temp.uid('max.wilckens@wilckens.com');
  v_event uuid;
  v_spec uuid;
  v_report uuid;
  v_ok boolean := false;
begin
  select h.id, s.id into v_event, v_spec
  from public.hull_events h
  join public.phrases p on p.id = h.type_phrase_id and p.code in ('DD', 'NB')
  join public.specifications s on s.hull_event_id = h.id
  where not exists (select 1 from public.dock_reports d where d.hull_event_id = h.id)
  limit 1;
  if v_event is null then
    raise notice 'skip dock report part: no DD/NB hull event with a specification and without a dock report in the seed';
    return;
  end if;
  update public.users set time_zone = 'America/Chicago' where id = v_admin;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  insert into public.dock_reports (hull_event_id, specification_id) values (v_event, v_spec) returning id into v_report;
  assert (select time_zone from public.dock_reports where id = v_report) = 'America/Chicago', 'dock report starts with the creator''s zone';
  update public.dock_reports set time_zone = 'Asia/Shanghai' where id = v_report;
  begin
    update public.dock_reports set time_zone = 'Nowhere/Town' where id = v_report;
  exception when invalid_parameter_value then v_ok := true;
  end;
  assert v_ok, 'unknown dock report zone refused';
end $$;

select 'time_zone_smoke ok' as result;
rollback;
