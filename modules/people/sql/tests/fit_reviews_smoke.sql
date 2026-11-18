-- Copied from ~/maintenance_tool/supabase/tests/fit_reviews_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Requirement lists and suitability reviews: docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/fit_reviews_smoke.sql
-- (freshly reset DB with the demo seeds). Assertions raise on failure; everything is rolled back.
begin;
create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
-- true when the statement raises
create function pg_temp.blocked(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return true; end $$;
grant execute on all functions in schema pg_temp to public;

do $$
declare
  v_a uuid; v_b uuid; v_c uuid; v_va uuid; v_vb uuid; v_vc uuid; v_ctx jsonb; v_items jsonb; v_rev uuid; v_n integer;
begin
  -- HR: three positions, holders, published descriptions with lists
  perform pg_temp.as_user('hanna.richter@example.com');
  insert into public.positions (name) values ('Fit A') returning id into v_a;
  insert into public.positions (name) values ('Fit B') returning id into v_b;
  insert into public.positions (name) values ('Fit C') returning id into v_c;
  insert into public.position_holders values (v_a, pg_temp.uid('ben.keller@example.com')), (v_b, pg_temp.uid('ben.keller@example.com')),
    (v_a, pg_temp.uid('anna.weber@example.com')), (v_c, pg_temp.uid('paul.meier@example.com'));
  v_va := public.job_description_new_draft(v_a);
  update public.job_description_versions set purpose = '<p>x</p>', duties = '<p>y</p>' where id = v_va;
  assert public.job_description_requirement_add(v_va, array['Berufsausbildung Lackierer', 'Staplerschein', '  staplerschein ', '']) = 2, '1 duplicates ignoring case and blanks are skipped';
  perform public.job_description_publish(v_va);
  v_vb := public.job_description_new_draft(v_b);
  update public.job_description_versions set purpose = '<p>x</p>', duties = '<p>y</p>' where id = v_vb;
  perform public.job_description_requirement_add(v_vb, array['STAPLERSCHEIN', 'Erste Hilfe']);
  perform public.job_description_publish(v_vb);
  v_vc := public.job_description_new_draft(v_c);
  update public.job_description_versions set purpose = '<p>x</p>', duties = '<p>y</p>' where id = v_vc;
  perform public.job_description_requirement_add(v_vc, array['Abgeschlossene Ausbildung']);
  perform public.job_description_publish(v_vc);
  reset role;
  select count(*) into v_n from public.requirement_phrases where lower(text) = 'staplerschein';
  assert v_n = 1, '2 one phrase for the same text';

  -- a published list is frozen; a new draft copies it
  perform pg_temp.as_user('hanna.richter@example.com');
  assert pg_temp.blocked(format($q$select public.job_description_requirement_add(%L, array['Neu'])$q$, v_va)), '3 no change in a published version';
  assert pg_temp.blocked(format($q$select public.job_description_requirement_remove(%L)$q$, (select id from public.job_description_requirements where version_id = v_va limit 1))), '4 no removal in a published version';
  assert public.job_description_new_draft(v_a) is not null, '5 new draft';
  select count(*) into v_n from public.job_description_requirements r join public.job_description_versions v on v.id = r.version_id where v.position_id = v_a and v.status = 'draft';
  assert v_n = 2, '6 the draft copies the list (2)';
  reset role;

  -- context for Ben: three distinct requirements, Staplerschein from two positions
  perform pg_temp.as_user('tom.berger@example.com');
  v_ctx := public.position_fit_context(pg_temp.uid('ben.keller@example.com'));
  assert jsonb_array_length(v_ctx -> 'positions') = 2 and jsonb_array_length(v_ctx -> 'requirements') = 3, '7 context: 2 positions, 3 distinct requirements';
  assert (select jsonb_array_length(e -> 'position_ids') from jsonb_array_elements(v_ctx -> 'requirements') e where e ->> 'text' = 'Staplerschein') = 2, '8 Staplerschein comes from two positions';

  -- Tom (team lead of Ben) reviews; incomplete or foreign items are refused
  select jsonb_agg(jsonb_build_object('phrase_id', e ->> 'phrase_id', 'rating', 'fulfilled', 'comment', null)) into v_items from jsonb_array_elements(v_ctx -> 'requirements') e;
  assert pg_temp.blocked(format($q$select public.position_fit_review_save(null, %L, current_date, current_date + 365, null, null, null, null, '[]'::jsonb)$q$, pg_temp.uid('ben.keller@example.com'))), '9 no items refused';
  assert pg_temp.blocked(format($q$select public.position_fit_review_save(null, %L, current_date + 1, current_date + 365, null, null, null, null, %L::jsonb)$q$, pg_temp.uid('ben.keller@example.com'), v_items::text)), '10 a future review date is refused';
  v_rev := public.position_fit_review_save(null, pg_temp.uid('ben.keller@example.com'), current_date, current_date + 365, 'alles gut', null, null, null, v_items);
  assert (select result from public.position_fit_reviews where id = v_rev) = 'fulfilled', '11 all fulfilled gives fulfilled';
  assert (select count(*) from public.position_fit_review_items where review_id = v_rev) = 3, '12 three items stored';
  reset role;

  -- a deviation makes the result a deviation, a correction updates it; the measure status defaults to open
  perform pg_temp.as_user('tom.berger@example.com');
  select jsonb_agg(jsonb_build_object('phrase_id', e ->> 'phrase_id', 'rating', case when e ->> 'text' = 'Erste Hilfe' then 'deviation' else 'fulfilled' end,
                                      'comment', case when e ->> 'text' = 'Erste Hilfe' then 'Kurs abgelaufen' end)) into v_items from jsonb_array_elements(v_ctx -> 'requirements') e;
  v_rev := public.position_fit_review_save(v_rev, null, current_date, current_date + 180, 'Abweichung', 'Kurs buchen', current_date + 30, null, v_items);
  assert (select result || coalesce(measure_status, '-') from public.position_fit_reviews where id = v_rev) = 'deviationopen', '13 correction: deviation, measure open';
  assert (select count(*) from public.position_fit_review_items where review_id = v_rev and rating = 'deviation' and comment = 'Kurs abgelaufen') = 1, '14 comment per requirement kept';
  assert (select count(*) from public.position_fit_reviews where user_id = pg_temp.uid('ben.keller@example.com')) = 1, '15 a correction does not add a review';
  assert (select deviation_open from public.position_fit_status where user_id = pg_temp.uid('ben.keller@example.com')), '16 status shows the open deviation';
  reset role;

  -- access: Lena (no job description right) and Ben himself neither see nor write
  perform pg_temp.as_user('lena.fischer@example.com');
  assert pg_temp.blocked(format($q$select public.position_fit_review_save(null, %L, current_date, current_date + 365, null, null, null, null, %L::jsonb)$q$, pg_temp.uid('ben.keller@example.com'), v_items::text)), '17 a user without the right cannot review';
  assert (select count(*) from public.position_fit_reviews) = 0, '18 and sees no reviews';
  reset role;
  perform pg_temp.as_user('ben.keller@example.com');
  assert (select count(*) from public.position_fit_reviews) = 0, '19 the reviewed person sees no reviews (without view.own)';
  assert pg_temp.blocked(format($q$insert into public.position_fit_reviews (user_id, reviewed_on, next_review_on, result, positions) values (%L, current_date, current_date, 'fulfilled', '[]')$q$, pg_temp.uid('ben.keller@example.com'))), '20 no direct insert';
  reset role;

  -- the right is its own: the job description right alone is not enough, the new literal alone is
  insert into public.roles (name) values ('Smoke job editor') on conflict do nothing;
  insert into public.roles (name) values ('Smoke fit own') on conflict do nothing;
  insert into public.role_permissions (role_id, permission) select id, 'job_descriptions.edit.all' from public.roles where name = 'Smoke job editor';
  insert into public.role_permissions (role_id, permission) select id, 'fit_reviews.view.own' from public.roles where name = 'Smoke fit own';
  insert into public.user_roles (user_id, role_id) select pg_temp.uid('lena.fischer@example.com'), id from public.roles where name = 'Smoke job editor';
  insert into public.user_roles (user_id, role_id) select pg_temp.uid('ben.keller@example.com'), id from public.roles where name = 'Smoke fit own';
  perform pg_temp.as_user('lena.fischer@example.com');
  assert not public.user_fit_access_for_me(pg_temp.uid('ben.keller@example.com'), 'view'), '29 job_descriptions.edit.all alone gives no access to reviews';
  assert pg_temp.blocked(format($q$select public.user_fit_access(%L, %L, 'view')$q$, pg_temp.uid('hanna.richter@example.com'), pg_temp.uid('ben.keller@example.com'))), '29b nobody asks on behalf of somebody else';
  assert pg_temp.blocked(format($q$select public.position_fit_context(%L)$q$, pg_temp.uid('ben.keller@example.com'))), '30 and no context';
  reset role;
  perform pg_temp.as_user('ben.keller@example.com');
  assert (select count(*) from public.position_fit_reviews) = 1, '31 view.own shows the own review only';
  assert not public.user_fit_access_for_me(pg_temp.uid('ben.keller@example.com'), 'edit'), '32 view.own does not allow reviewing';
  reset role;
  -- the defaults were carried over: Manager and HR hold the new literals
  assert exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'Manager' and rp.permission = 'fit_reviews.edit.reports'), '33 Manager has fit_reviews.edit.reports';
  assert exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id where r.name = 'HR' and rp.permission = 'fit_reviews.edit.all'), '34 HR has fit_reviews.edit.all';
  assert not exists (select 1 from public.role_permissions where permission = 'fit_reviews.view.own' and role_id in (select id from public.roles where name not like 'Smoke%')), '35 nobody has view.own by default';

  -- the supervisor chain decides, not the teams: Tom supervises Ben, shares teams with Paul but is not his supervisor
  perform pg_temp.as_user('tom.berger@example.com');
  assert public.user_fit_access_for_me(pg_temp.uid('ben.keller@example.com'), 'edit'), '35b tom may review ben';
  assert not public.user_fit_access_for_me(pg_temp.uid('paul.meier@example.com'), 'view'), '35c a shared team gives tom no access to paul';
  assert not public.user_fit_access_for_me(pg_temp.uid('tom.berger@example.com'), 'edit'), '35d nobody reviews themselves through the chain';
  reset role;

  -- a second person: Paul holds C
  perform pg_temp.as_user('hanna.richter@example.com');
  v_ctx := public.position_fit_context(pg_temp.uid('paul.meier@example.com'));
  select coalesce(jsonb_agg(jsonb_build_object('phrase_id', e ->> 'phrase_id', 'rating', 'fulfilled')), '[]'::jsonb) into v_items from jsonb_array_elements(v_ctx -> 'requirements') e;
  assert exists (select 1 from jsonb_array_elements(v_ctx -> 'requirements') e where e ->> 'text' = 'Abgeschlossene Ausbildung'), '21 Paul sees the requirement of C';
  v_rev := public.position_fit_review_save(null, pg_temp.uid('paul.meier@example.com'), current_date, current_date + 365, null, null, null, null, v_items);
  assert v_rev is not null, '22 review of Paul';
  reset role;

  -- status and reminders
  assert (select status from public.position_fit_status_all() where user_id = pg_temp.uid('anna.weber@example.com')) = 'never', '23 never reviewed';
  assert (select status from public.position_fit_status_all() where user_id = pg_temp.uid('paul.meier@example.com')) = 'ok', '24 ok';
  update public.position_fit_reviews set reviewed_on = current_date - 400, next_review_on = current_date - 1 where user_id = pg_temp.uid('paul.meier@example.com');
  assert (select status from public.position_fit_status_all() where user_id = pg_temp.uid('paul.meier@example.com')) = 'overdue', '25 overdue';
  assert public.send_fit_review_reminders() > 0, '26 reminder sent';
  assert exists (select 1 from public.notifications where user_id = pg_temp.uid('tom.berger@example.com') and type = 'fit_review_digest'), '27 Tom got the digest';
  assert not exists (select 1 from public.notifications where user_id = pg_temp.uid('ben.keller@example.com') and type = 'fit_review_digest'), '28 Ben got none';
end $$;
rollback;
