-- Copied from ~/npm_tool/supabase/tests/handover_smoke.sql with the renames of test_renames.json.
-- Responsible person and handover (migration 20261023100000_responsible_user_handover.sql):
-- bash supabase/tests/run.sh handover_smoke.sql
-- Local stack, seeded. Runs as `authenticator` like PostgREST, signed in as an Admin. One transaction, rolled back.
\set ON_ERROR_STOP on
begin;

create temp table fixture on commit drop as
select
  (select id from public.users where email = 'max.wilckens@wilckens.com') as admin_id,
  (select id from public.users where email = 'johan.wilckens@wilckens.com') as rep_id,
  (select id from public.users where email = 'melih.taskin@nipponpaint-marine.eu') as tsr_id,
  (select id from public.vessels order by id limit 1) as vessel_id,
  (select id from public.companies c where exists (select 1 from public.specifications s where s.supplier_id = c.id) order by id limit 1) as supplier_id,
  null::uuid as spec_id;
grant all on fixture to public;

insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date, responsible_user_id)
select 'SMOKE-HO-1', 1, 'draft', f.vessel_id, f.supplier_id, (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15', f.admin_id from fixture f;
update fixture set spec_id = (select id from public.specifications where specification_number = 'SMOKE-HO-1');

update public.users set default_team_id = (select id from public.teams order by id limit 1) where id = (select admin_id from fixture);

select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
  v_failed boolean;
begin
  select * into f from fixture;

  -- A new record starts with its creator.
  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, team_id, currency, delivery_date)
  values ('SMOKE-HO-2', 1, 'draft', f.vessel_id, f.supplier_id, (select id from public.teams order by id limit 1), 'EUR', date '2026-12-15');
  assert (select responsible_user_id from public.specifications where specification_number = 'SMOKE-HO-2') = f.admin_id, 'new spec starts with its creator';

  -- Owner Associate (tenant) defaults to the creator's default tenant when the insert names none.
  insert into public.specifications (specification_number, version, status, vessel_id, supplier_id, currency, delivery_date)
  values ('SMOKE-HO-3', 1, 'draft', f.vessel_id, f.supplier_id, 'EUR', date '2026-12-15');
  assert (select team_id from public.specifications where specification_number = 'SMOKE-HO-3')
    = (select default_team_id from public.users where id = f.admin_id), 'tenant defaults to the creator''s default tenant';

  -- Candidates: users with a login and the edit right.
  assert exists (select 1 from public.assignable_users('specifications', f.spec_id) where id = f.rep_id), 'another admin can be chosen';
  assert not exists (select 1 from public.assignable_users('specifications', f.spec_id) where id is null), 'no empty candidate';

  -- Handing over needs a reason and a different person.
  v_failed := false;
  begin perform public.hand_over('specifications', f.spec_id, f.rep_id, ' '); exception when others then v_failed := true; end;
  assert v_failed, 'reason required';
  v_failed := false;
  begin perform public.hand_over('specifications', f.spec_id, f.admin_id, 'Check availability'); exception when others then v_failed := true; end;
  assert v_failed, 'already with this person';

  perform public.hand_over('specifications', f.spec_id, f.rep_id, 'Check availability', 'Please ask the warehouse');
  assert (select responsible_user_id from public.specifications where id = f.spec_id) = f.rep_id, 'responsible changed';
  assert (select count(*) from public.handovers where entity_id = f.spec_id and to_user_id = f.rep_id and reason = 'Check availability') = 1, 'handover logged';
  assert exists (
    select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
    -- platform: the note names the person in plain text (a platform mention token would add a second notification next to
    -- 'handover'; npm_offers_after.sql hand_over()), NPM wrote an old-style @[Name](user:id) token.
    where c.anchor_type = 'specifications' and c.anchor_id = f.spec_id and m.body like 'Handed over to %' and m.body not like '%@[%' and m.body like '%Please ask the warehouse'),
    'note posted';
end $$;

-- Possible on an accepted specification too (only the responsible column changes).
reset role;
reset session authorization;
-- Notifications are readable by their owner only, so check them as the table owner.
do $$ begin
  assert (select count(*) from public.notifications where user_id = (select rep_id from fixture) and type = 'handover' and entity_id = (select spec_id from fixture)) = 1, 'recipient notified';
end $$;
set local session_replication_role = replica;
update public.specifications set status = 'accepted' where specification_number = 'SMOKE-HO-1';
set local session_replication_role = origin;
select set_config('request.jwt.claims', json_build_object('sub', (select admin_id from fixture), 'role', 'authenticated', 'aal', 'aal2')::text, true);
set local session authorization authenticator;
set local role authenticated;

do $$
declare
  f record;
begin
  select * into f from fixture;
  perform public.hand_over('specifications', f.spec_id, f.admin_id, 'Take back');
  assert (select responsible_user_id from public.specifications where id = f.spec_id) = f.admin_id, 'handover on an accepted spec';
end $$;

rollback;
select 'ok' as handover_smoke;
