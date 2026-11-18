-- Scope rename own -> assigned for hull events and newbuilding projects (platform decision T7): NPM's "own" meant the person the record is assigned to (sales
-- rep / technical service rep), not its creator. Renames the literals, moves role grants and implications, and rewrites the
-- policies and row functions that name them (text replaced in place, nothing else changes).
do $r$
declare
  v_mods text[] := array['hull_events', 'newbuildings'];
  v_funcs text[] := array['hull_events_row_allows', 'newbuilding_projects_row_allows'];
  v_pat text := '''(' || array_to_string(v_mods, '|') || ')\.([a-z_]+)\.own''';
  r record; v_def text;
begin
  insert into public.permissions (key, module, action, scope, sort_order, task_family)
  select module || '.' || action || '.assigned', module, action, 'assigned', sort_order, task_family
    from public.permissions where scope = 'own' and module = any (v_mods)
  on conflict (key) do nothing;
  insert into public.permission_implies (permission, implies)
  select regexp_replace(permission, '\.own$', '.assigned'), regexp_replace(implies, '\.own$', '.assigned')
    from public.permission_implies
   where permission in (select key from public.permissions where scope = 'own' and module = any (v_mods))
      or implies in (select key from public.permissions where scope = 'own' and module = any (v_mods))
  on conflict do nothing;
  insert into public.role_permissions (role_id, permission)
  select role_id, regexp_replace(permission, '\.own$', '.assigned')
    from public.role_permissions where permission in (select key from public.permissions where scope = 'own' and module = any (v_mods))
  on conflict do nothing;

  for r in select schemaname, tablename, policyname, qual, with_check from pg_policies
            where schemaname in ('public', 'storage') and (qual ~ v_pat or with_check ~ v_pat) loop
    execute format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
      || case when r.qual is not null then ' using (' || regexp_replace(r.qual, v_pat, '''\1.\2.assigned''', 'g') || ')' else '' end
      || case when r.with_check is not null then ' with check (' || regexp_replace(r.with_check, v_pat, '''\1.\2.assigned''', 'g') || ')' else '' end;
  end loop;
  -- row functions build the literal as '<module>.' || p_action || '.own'; other functions may name a literal in full
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
            and (p.proname = any (v_funcs) or p.prosrc ~ v_pat) loop
    v_def := pg_get_functiondef(r.oid);
    if r.proname = any (v_funcs) then v_def := replace(v_def, '|| ''.own'')', '|| ''.assigned'')'); end if;
    execute regexp_replace(v_def, v_pat, '''\1.\2.assigned''', 'g');
  end loop;

  delete from public.role_permissions where permission in (select key from public.permissions where scope = 'own' and module = any (v_mods));
  delete from public.permission_implies
   where permission in (select key from public.permissions where scope = 'own' and module = any (v_mods))
      or implies in (select key from public.permissions where scope = 'own' and module = any (v_mods));
  delete from public.permissions where scope = 'own' and module = any (v_mods);
end $r$;
