-- Copied from ~/maintenance_tool/supabase/tests/icons_colours_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Icons and colours of master data (migrations 20261201100000_icons_and_colours.sql, 20261201110000_asset_icons.sql).
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/icons_colours_smoke.sql
-- Everything runs in one transaction and is rolled back.
begin;

do $$
declare
  v_type uuid := (select id from public.task_types where key = 'general');
  v_asset_type uuid := (select id from public.asset_types limit 1);
  v_team uuid := (select id from public.teams where name = 'Werkstatt');
begin
  -- 1. Keys of the registry and the palette are accepted, nothing set means the defaults.
  assert (select icon is null and color is null from public.task_types where id = v_type), '1 task types start without icon and colour';
  update public.task_types set icon = 'tool', color = 'blue' where id = v_type;
  update public.asset_types set icon = 'engine' where id = v_asset_type;
  update public.teams set color = 'teal' where id = v_team;
  assert (select color from public.teams where id = v_team) = 'teal', '1 a team keeps its colour';

  -- 2. Anything else is refused: hex codes (they would not follow the dark mode) and free text as icon.
  begin
    update public.task_types set color = '#ff0000' where id = v_type;
    assert false, '2 a hex colour must be refused';
  exception when check_violation then null;
  end;
  begin
    update public.teams set color = 'purple' where id = v_team;
    assert false, '2 an unknown colour must be refused';
  exception when check_violation then null;
  end;
  begin
    update public.asset_types set icon = '<svg>' where id = v_asset_type;
    assert false, '2 an icon must be a registry key';
  exception when check_violation then null;
  end;
end;
$$;

-- 3. An asset's icon holds for everything below it until a node sets its own; without any, the type's icon.
do $$
declare
  v_type uuid := (select id from public.asset_types where not is_grouping limit 1);
  v_root uuid; v_mid uuid; v_leaf uuid;
begin
  update public.asset_types set icon = 'gauge' where id = v_type;
  insert into public.assets (name, asset_type_id) values ('Icon root', v_type) returning id into v_root;
  insert into public.assets (name, asset_type_id, parent_asset_id) values ('Icon mid', v_type, v_root) returning id into v_mid;
  insert into public.assets (name, asset_type_id, parent_asset_id) values ('Icon leaf', v_type, v_mid) returning id into v_leaf;
  assert (select effective_icon from public.assets_overview where id = v_leaf) = 'gauge', '3 no icon in the tree: the type''s';
  update public.assets set icon = 'forklift' where id = v_root;
  assert (select effective_icon from public.assets_overview where id = v_leaf) = 'forklift', '3 inherited from the root';
  update public.assets set icon = 'engine' where id = v_mid;
  assert (select effective_icon from public.assets_overview where id = v_leaf) = 'engine', '3 the nearest ancestor wins';
  assert (select effective_icon from public.assets_overview where id = v_root) = 'forklift', '3 the root keeps its own';
  begin
    update public.assets set icon = 'Fork Lift' where id = v_leaf;
    assert false, '3 an asset icon must be a registry key';
  exception when check_violation then null;
  end;
end;
$$;
rollback;
