-- WP3/4: hull event access by scope (own / team / account / all) without any admin overrule. Rolled back.
begin;
do $$
declare v_u1 uuid; v_u2 uuid; v_t uuid; v_co uuid; v_ve uuid; v_he uuid; v_ph uuid;
  ctx_all public.access_context; ctx_own public.access_context; ctx_acc public.access_context; ctx_team public.access_context; ctx_none public.access_context;
begin
  select id into v_u1 from public.users order by id limit 1;
  select id into v_u2 from public.users where id <> v_u1 order by id limit 1;
  insert into public.teams (name) values ('Fleet Probe') returning id into v_t;
  insert into public.companies (name, sales_account_user_id) values ('Acct Co', v_u2) returning id into v_co;
  select id into v_ph from public.phrases where category = 'hull_event_type' and code = 'DD';
  insert into public.hull_events (type_phrase_id, type_code, customer_company_id, assigned_team_id, sales_account_user_id)
    values (v_ph, 'DD', v_co, v_t, v_u1) returning id into v_he;
  ctx_all  := row(array['hull_events.view.all'], v_u2, array[]::uuid[]);
  ctx_own  := row(array['hull_events.view.assigned'], v_u1, array[]::uuid[]);
  ctx_acc  := row(array['hull_events.view.account'], v_u2, array[]::uuid[]);
  ctx_team := row(array['hull_events.view.team'], v_u2, array[v_t]);
  ctx_none := row(array[]::text[], v_u2, array[v_t]);
  assert public.hull_events_row_allows('view', v_he, ctx_all), 'all';
  assert public.hull_events_row_allows('view', v_he, ctx_own), 'own (sales rep)';
  assert not public.hull_events_row_allows('view', v_he, row(array['hull_events.view.assigned'], v_u2, array[]::uuid[])::public.access_context), 'own: other user';
  assert public.hull_events_row_allows('view', v_he, ctx_acc), 'account: sales account owner of the customer';
  assert not public.hull_events_row_allows('view', v_he, row(array['hull_events.view.account'], v_u1, array[]::uuid[])::public.access_context), 'account: not the owner';
  assert public.hull_events_row_allows('view', v_he, ctx_team), 'team';
  assert not public.hull_events_row_allows('view', v_he, ctx_none), 'no literal, no access (no admin overrule)';
  assert v_he in (select public.user_account_hull_event_ids(v_u2)), 'account id set';
  -- edit.account implies view.account
  assert exists (select 1 from public.permission_closure where permission = 'hull_events.edit.account' and implied = 'hull_events.view.account'), 'closure';
end $$;
select 'npm_fleet_access_smoke: all checks passed' as result;
rollback;
