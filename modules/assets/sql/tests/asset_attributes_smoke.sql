-- Copied from ~/maintenance_tool/supabase/tests/asset_attributes_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Asset attributes (migration 20261008130000_asset_attributes.sql). Run on the local database with the seed:
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/asset_attributes_smoke.sql
-- Runs in one transaction and is rolled back.
begin;

create temp table people on commit drop as select email, id from public.users;
grant select on people to public;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from pg_temp.people where email = p_email), 'role', 'authenticated', 'aal', 'aal2')::text, true);
end;
$$;
create function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end;
$$;
grant execute on all functions in schema pg_temp to public;

-- Fixtures as postgres: a number, a list and a boolean attribute; an asset Anna may edit and one Ben may only read.
insert into public.asset_attributes (id, name, data_type, unit) values
  ('00000000-0000-4000-8000-00000000a001', 'Smoke power', 'number', 'kW'),
  ('00000000-0000-4000-8000-00000000a002', 'Smoke vendor', 'list', null),
  ('00000000-0000-4000-8000-00000000a003', 'Smoke ATEX', 'boolean', null);
-- rls_scope_asset_ids reads the JWT, so the fixtures are picked per user.
create temp table fixture (anna_asset uuid, other_asset uuid, ben_asset uuid) on commit drop;
grant select, insert, update on fixture to public;
set local role authenticated;
select pg_temp.act_as('anna.weber@example.com');
insert into fixture (anna_asset, other_asset)
select (public.rls_scope_asset_ids('assets.edit.assigned_assets'))[1],
       (select a.id from public.assets a where not (a.id = any (public.rls_scope_asset_ids('assets.edit.assigned_assets'))) limit 1);
reset role;
-- Ben (Shopfloor: may only see assigned assets) is in a team that is responsible for Anna's asset: he reads it, never writes.
insert into public.teams (id, name) values ('00000000-0000-4000-8000-0000000000c8', 'Attribute smoke team'); insert into public.team_uses (team_id, use) values ('00000000-0000-4000-8000-0000000000c8', 'assets');
insert into public.user_teams (user_id, team_id) values ((select id from public.users where email = 'ben.keller@example.com'), '00000000-0000-4000-8000-0000000000c8');
update public.assets set team_id = '00000000-0000-4000-8000-0000000000c8' where id = (select anna_asset from fixture);
update fixture set ben_asset = anna_asset;

do $$
declare
  f record;
begin
  select * into f from pg_temp.fixture;
  assert f.anna_asset is not null and f.ben_asset is not null, 'fixtures found';

  -- 1. Type check: a number attribute refuses a text value; exactly one value column.
  assert pg_temp.refused(format($q$insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_text)
    values (%L, '00000000-0000-4000-8000-00000000a001', 'x')$q$, f.anna_asset)), 'number refuses text';
  assert pg_temp.refused(format($q$insert into public.asset_attribute_values (asset_id, asset_attribute_id, value_number, value_text)
    values (%L, '00000000-0000-4000-8000-00000000a001', 1, 'x')$q$, f.anna_asset)), 'one value only';
end $$;

-- 2. Anna (edit right on her subtree) saves, changes and clears values through the RPC.
set local role authenticated;
select pg_temp.act_as('anna.weber@example.com');
do $$
declare
  f record;
begin
  select * into f from pg_temp.fixture;
  perform public.asset_save_attribute_values(f.anna_asset,
    '{"00000000-0000-4000-8000-00000000a001": "7.5", "00000000-0000-4000-8000-00000000a002": " Kaeser ", "00000000-0000-4000-8000-00000000a003": true}');
  assert (select value_number from public.asset_attribute_values where asset_id = f.anna_asset and asset_attribute_id = '00000000-0000-4000-8000-00000000a001') = 7.5, 'number saved';
  assert (select value_text from public.asset_attribute_values where asset_id = f.anna_asset and asset_attribute_id = '00000000-0000-4000-8000-00000000a002') = 'Kaeser', 'list value trimmed';
  assert (select value_boolean from public.asset_attribute_values where asset_id = f.anna_asset and asset_attribute_id = '00000000-0000-4000-8000-00000000a003'), 'boolean saved';
  assert (select attribute_values ->> ('a' || replace('00000000-0000-4000-8000-00000000a002', '-', '')) from public.assets_overview where id = f.anna_asset) = 'Kaeser', 'overview key';
  assert (select (attribute_values -> ('a' || replace('00000000-0000-4000-8000-00000000a001', '-', '')))::numeric from public.assets_overview where id = f.anna_asset) = 7.5, 'overview number';

  perform public.asset_save_attribute_values(f.anna_asset, '{"00000000-0000-4000-8000-00000000a001": 9, "00000000-0000-4000-8000-00000000a003": ""}');
  assert (select value_number from public.asset_attribute_values where asset_id = f.anna_asset and asset_attribute_id = '00000000-0000-4000-8000-00000000a001') = 9, 'number changed';
  assert not exists (select 1 from public.asset_attribute_values where asset_id = f.anna_asset and asset_attribute_id = '00000000-0000-4000-8000-00000000a003'), 'empty clears';
  assert exists (select 1 from public.asset_attribute_values where asset_id = f.anna_asset and asset_attribute_id = '00000000-0000-4000-8000-00000000a002'), 'missing key untouched';
  assert pg_temp.refused(format($q$select public.asset_save_attribute_values(%L, '{"00000000-0000-4000-8000-00000000a001": "abc"}')$q$, f.anna_asset)), 'bad number refused';

  -- 3. Suggestions: the values in use.
  assert (select array_agg(value) from public.asset_attribute_suggestions('00000000-0000-4000-8000-00000000a002', 'kae')) = array['Kaeser'], 'suggestion';

  -- 4. Anna cannot write outside her subtree or manage definitions.
  if f.other_asset is not null then
    assert pg_temp.refused(format($q$select public.asset_save_attribute_values(%L, '{"00000000-0000-4000-8000-00000000a001": 1}')$q$, f.other_asset)), 'outside subtree';
  end if;
  assert pg_temp.refused($q$insert into public.asset_attributes (name, data_type) values ('Smoke by Anna', 'text')$q$), 'definitions admin only';
end $$;

-- 5. Ben (view only) reads values but cannot write them.
select pg_temp.act_as('ben.keller@example.com');
do $$
declare
  f record;
begin
  select * into f from pg_temp.fixture;
  assert (select count(*) from public.asset_attributes) >= 3, 'definitions readable';
  assert pg_temp.refused(format($q$select public.asset_save_attribute_values(%L, '{"00000000-0000-4000-8000-00000000a001": 1}')$q$, f.ben_asset)), 'ben cannot write';
  assert exists (select 1 from public.asset_attribute_values), 'ben reads values of visible assets';
end $$;
reset role;

-- 6. The data type of an attribute in use is fixed; text <-> list may change.
do $$
begin
  assert pg_temp.refused($q$update public.asset_attributes set data_type = 'text' where id = '00000000-0000-4000-8000-00000000a001'$q$), 'type fixed in use';
  update public.asset_attributes set data_type = 'text' where id = '00000000-0000-4000-8000-00000000a002';
  assert (select data_type from public.asset_attributes where id = '00000000-0000-4000-8000-00000000a002') = 'text', 'list -> text';
end $$;

rollback;
\echo 'asset_attributes_smoke: all checks passed'
