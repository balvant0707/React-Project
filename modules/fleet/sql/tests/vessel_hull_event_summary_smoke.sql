-- Copied from ~/npm_tool/supabase/tests/vessel_hull_event_summary_smoke.sql with the renames of test_renames.json.
-- vessel_hull_event_summary (migration 20261031100000_vessel_hull_event_summary.sql):
-- bash supabase/tests/run.sh vessel_hull_event_summary_smoke.sql
-- The stored summary behind vessels_overview must equal what the old view computed live from hull_events (checked for
-- every vessel against an oracle written with the old expressions), follow inserts / updates / deletes of hull events and
-- new vessels, and the due refresh must pick up a planned event whose date has passed.
-- Runs as the table owner, one transaction, rolled back.
\set ON_ERROR_STOP on
begin;

create temp view oracle as
select v.id,
  coalesce(a.dd_count, 0) as dd_count,
  coalesce(a.has_nb, false) as has_nb,
  coalesce(lm.id = public.own_maker_company_id() and not exp.expired, false) as own,
  coalesce(exp.expired, false) as expired,
  coalesce(exp.expired and a.next_date is null, false) as expired_no_followup,
  a.last_date, a.next_date
from public.vessels v
left join lateral (
  select count(*) filter (where he.supplier_this_hullevent_id = public.own_maker_company_id()) as dd_count,
         bool_or(p.code = 'NB') as has_nb,
         max(he.event_date) filter (where he.event_date <= current_date) as last_date,
         min(he.event_date) filter (where he.event_date > current_date) as next_date,
         (array_agg(he.id order by he.event_date desc, he.created_at desc, he.id desc) filter (where he.event_date <= current_date))[1] as last_id
  from public.hull_events he join public.phrases p on p.id = he.type_phrase_id
  where he.vessel_id = v.id and p.code in ('DD', 'NB')) a on true
left join public.hull_events le on le.id = a.last_id
left join public.companies lm on lm.id = le.supplier_this_hullevent_id
cross join lateral (select coalesce(le.service_period_months is not null and le.event_date + make_interval(months => le.service_period_months) < current_date, false) as expired) exp;

create function pg_temp.diffs() returns bigint language sql as $$
  select count(*) from oracle o join public.vessels_overview n using (id)
  where (o.dd_count, o.has_nb, o.own, o.expired, o.expired_no_followup, o.last_date, o.next_date)
        is distinct from (n.dd_hull_event_count, n.has_nb_hull_event, n.current_maker_is_own, n.service_period_expired,
                          n.service_period_expired_no_followup, n.last_hull_event_date, n.next_hull_event_date)
$$;

do $$
declare
  v_dd uuid := (select id from public.phrases where code = 'DD' limit 1);
  v_own uuid := public.own_maker_company_id();
  v1 uuid; v2 uuid; v3 uuid; e1 uuid; e2 uuid;
begin
  assert (select count(*) from public.vessels) = (select count(*) from public.vessel_hull_event_summary), 'every vessel has a summary row';
  assert pg_temp.diffs() = 0, 'seed data: view equals oracle';

  -- Fresh vessels: expired event without follow-up, running event with own maker, planned event
  insert into public.vessels (imo, name) values ('SMKHS01', 'Smoke HS 1') returning id into v1;
  insert into public.vessels (imo, name) values ('SMKHS02', 'Smoke HS 2') returning id into v2;
  insert into public.vessels (imo, name) values ('SMKHS03', 'Smoke HS 3') returning id into v3;
  assert (select count(*) from public.vessel_hull_event_summary where vessel_id in (v1, v2, v3)) = 3, 'new vessels get a row';
  assert (select current_maker_is_own is false and dd_hull_event_count = 0 from public.vessels_overview where id = v1), 'vessel without events';

  insert into public.hull_events (type_phrase_id, type_code, vessel_id, event_date, service_period_months, supplier_this_hullevent_id)
  values (v_dd, 'DD', v1, current_date - 800, 12, v_own) returning id into e1;                       -- ended long ago
  insert into public.hull_events (type_phrase_id, type_code, vessel_id, event_date, service_period_months, supplier_this_hullevent_id)
  values (v_dd, 'DD', v2, current_date - 100, 60, v_own);                                            -- running, ours
  insert into public.hull_events (type_phrase_id, type_code, vessel_id, event_date, service_period_months, supplier_this_hullevent_id)
  values (v_dd, 'DD', v3, current_date + 30, 60, v_own) returning id into e2;                        -- planned
  assert (select service_period_expired_no_followup and not current_maker_is_own from public.vessels_overview where id = v1), 'v1 expired';
  assert (select current_maker_is_own and not service_period_expired_no_followup from public.vessels_overview where id = v2), 'v2 ours';
  assert (select next_hull_event_date = current_date + 30 and not current_maker_is_own from public.vessels_overview where id = v3), 'v3 planned';
  assert pg_temp.diffs() = 0, 'after inserts: view equals oracle';

  -- A planned event on v1 removes "no follow-up"; deleting it brings it back
  insert into public.hull_events (type_phrase_id, type_code, vessel_id, event_date) values (v_dd, 'DD', v1, current_date + 10) returning id into e1;
  assert (select not service_period_expired_no_followup from public.vessels_overview where id = v1), 'follow-up planned';
  delete from public.hull_events where id = e1;
  assert (select service_period_expired_no_followup from public.vessels_overview where id = v1), 'follow-up deleted';

  -- Moving an event to another vessel updates both
  update public.hull_events set vessel_id = v2 where id = e2;
  assert (select next_hull_event_date is null from public.vessels_overview where id = v3), 'old vessel loses the event';
  assert (select next_hull_event_date = current_date + 30 from public.vessels_overview where id = v2), 'new vessel gets the event';
  assert pg_temp.diffs() = 0, 'after update/delete: view equals oracle';

  -- A planned event whose date has passed: stale until the due refresh
  update public.vessel_hull_event_summary set next_event_date = current_date - 1, due_on = current_date - 1 where vessel_id = v2;
  assert public.refresh_due_vessel_hull_event_summaries() >= 1, 'due refresh finds the stale row';
  assert (select due_on is distinct from current_date - 1 from public.vessel_hull_event_summary where vessel_id = v2), 'row recomputed';
  assert pg_temp.diffs() = 0, 'after due refresh: view equals oracle';
  raise notice 'vessel_hull_event_summary_smoke: ok';
end $$;

-- anon / signed-in access
do $$
begin
  assert not has_table_privilege('anon', 'public.vessel_hull_event_summary', 'select'), 'anon cannot read the summary';
  assert has_table_privilege('authenticated', 'public.vessel_hull_event_summary', 'select'), 'authenticated reads the summary';
  assert not has_function_privilege('authenticated', 'public.refresh_vessel_hull_event_summaries(uuid[])', 'execute'), 'refresh is not callable by users';
  raise notice 'vessel_hull_event_summary_smoke: privileges ok';
end $$;

rollback;
