-- Copied from ~/maintenance_tool/supabase/tests/asset_tree_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Top rows of the asset tree table (migration 20261202100000_asset_tree_table.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/asset_tree_smoke.sql
-- Everything runs in one transaction and is rolled back.
create or replace function pg_temp.as_user(p_username text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where username = p_username), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema pg_temp to public;

begin;

-- 1. Without row policies a top row is exactly a node without parent.
do $$
begin
  assert not exists (select 1 from public.assets_overview where is_visible_root <> (parent_asset_id is null)),
    '1 for postgres is_visible_root = no parent';
end;
$$;

-- 2. A user with a grant on an inner node: that node is a top row, its parent stays hidden, and every other
--    visible row hangs below a visible parent (ben.keller: Shopfloor, and a team of his is responsible for "Maschinen"
--    and "Flurförderfahrzeuge").
insert into public.teams (id, name) values ('00000000-0000-4000-8000-0000000000c9', 'Tree smoke team'); insert into public.team_uses (team_id, use) values ('00000000-0000-4000-8000-0000000000c9', 'assets');
insert into public.user_teams (user_id, team_id) values ((select id from public.users where email = 'ben.keller@example.com'), '00000000-0000-4000-8000-0000000000c9');
update public.assets set team_id = '00000000-0000-4000-8000-0000000000c9' where name in ('Maschinen', 'Flurförderfahrzeuge');
select pg_temp.as_user('ben.keller');
do $$
declare
  v_maschinen uuid := (select id from public.assets where name = 'Maschinen');
begin
  assert v_maschinen is not null, '2 ben sees Maschinen';
  assert (select is_visible_root and parent_asset_id is not null from public.assets_overview where id = v_maschinen),
    '2 Maschinen is a top row for ben although it has a parent';
  assert not exists (
    select 1 from public.assets_overview o
    where o.is_visible_root = exists (select 1 from public.assets p where p.id = o.parent_asset_id)
  ), '2 top row exactly when the parent is not visible';
  assert (select count(*) from public.assets_overview where is_visible_root)
       < (select count(*) from public.assets_overview), '2 not every row is a top row';
end;
$$;

rollback;
