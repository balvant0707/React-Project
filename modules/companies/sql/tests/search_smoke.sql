-- New test (RADAR): NPM's header search on the platform search registry. Every NPM record type is
-- found; companies, vessels and products are open to everybody (as NPM's lists), hull events and specifications follow row
-- security (a user without task rights finds none). Seeded RADAR data. One transaction, rolled back.
begin;
create temp table hits (who text, entity_type text, title text, subtitle text) on commit drop;
grant all on hits to public;

create function pg_temp.as_user(p_email text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated',
    'aal', 'aal2', 'amr', json_build_array(json_build_object('method', 'password')))::text, true);
$$;

select pg_temp.as_user('max.wilckens@wilckens.com');
set local role authenticated;
insert into hits select 'admin', entity_type, title, subtitle from public.global_search('NORDBALTIC');
insert into hits select 'admin', entity_type, title, subtitle from public.global_search('NPM Primer');
insert into hits select 'admin', entity_type, title, subtitle from public.global_search('NPMTR');
insert into hits select 'admin', entity_type, title, subtitle from public.global_search('26-510442');
reset role;

select pg_temp.as_user('jan.hoessermann@wilckens.com');
set local role authenticated;
insert into hits select 'norole', entity_type, title, subtitle from public.global_search('NORDBALTIC');
insert into hits select 'norole', entity_type, title, subtitle from public.global_search('26-510442');
reset role;

select case when count(*) > 0 then 'ok' else 'FAIL' end || ' admin finds the vessel' from hits where who = 'admin' and entity_type = 'vessels' and title = 'NORDBALTIC' and subtitle = '1025538';
select case when count(*) > 0 then 'ok' else 'FAIL' end || ' admin finds its hull events' from hits where who = 'admin' and entity_type = 'hull_events' and title = 'NORDBALTIC';
select case when count(*) > 0 then 'ok' else 'FAIL' end || ' admin finds the product' from hits where who = 'admin' and entity_type = 'products' and title = 'PR-1001';
select case when count(*) > 0 then 'ok' else 'FAIL' end || ' admin finds the company' from hits where who = 'admin' and entity_type = 'companies' and title = 'NPMTR';
select case when count(*) > 0 then 'ok' else 'FAIL' end || ' admin finds the specification by number' from hits where who = 'admin' and entity_type = 'specifications' and title like '26-510442%';
select case when count(*) > 0 then 'ok' else 'FAIL' end || ' no-role user still finds the vessel' from hits where who = 'norole' and entity_type = 'vessels';
select case when count(*) = 0 then 'ok' else 'FAIL' end || ' no-role user finds no hull events or specifications' from hits where who = 'norole' and entity_type in ('hull_events', 'specifications');
rollback;
