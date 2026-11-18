-- Security invariants that must hold on every table, view and function of an app, whatever its modules add.
-- Touches no module; runs for both apps. Read only: nothing is created, so there is nothing to roll back.
-- A failing check raises with the names of the offenders; the result row means "passed".
--   1. Row level security is switched on for every public table (a policy on a table without RLS does nothing).
--   2. Every public table and storage.objects carries the restrictive mfa_required policy.
--   3. Every SECURITY DEFINER function pins its search_path to something without schema public.
--   4. The signed-out role (anon) holds no table, view, sequence or function right in public.
--   5. Every public view runs with the rights of the caller (security_invoker), so RLS of its tables applies.
--   6. No storage bucket is public.
do $$
declare
  v_bad text;
begin
  -- 1
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  assert v_bad is null, 'tables without row level security: ' || v_bad;
  assert (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass), 'storage.objects without row level security';

  -- 2
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname and p.policyname = 'mfa_required' and p.permissive = 'RESTRICTIVE');
  assert v_bad is null, 'tables without the restrictive mfa_required policy: ' || v_bad;
  assert exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'mfa_required' and permissive = 'RESTRICTIVE'), 'storage.objects without the mfa_required policy';

  -- 3
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, '{}')) c
      where c like 'search_path=%' and c !~ '(^|[=, "])public([, "]|$)');
  assert v_bad is null, 'SECURITY DEFINER functions without a search_path that leaves out public: ' || v_bad;

  -- 4
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  assert v_bad is null, 'anon can execute: ' || v_bad;

  select string_agg(c.relname, ', ' order by c.relname) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and ((c.relkind in ('r', 'v', 'm', 'p', 'f') and (
            has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
            or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')
            or has_table_privilege('anon', c.oid, 'truncate') or has_table_privilege('anon', c.oid, 'references')
            or has_table_privilege('anon', c.oid, 'trigger')))
      or (c.relkind = 'S' and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('anon', c.oid, 'select')
            or has_sequence_privilege('anon', c.oid, 'update'))));
  assert v_bad is null, 'anon holds rights on: ' || v_bad;

  -- 5
  select string_agg(c.relname, ', ' order by c.relname) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce(c.reloptions @> array['security_invoker=on'] or c.reloptions @> array['security_invoker=true'], false);
  assert v_bad is null, 'views without security_invoker: ' || v_bad;

  -- 6
  select string_agg(id, ', ' order by id) into v_bad from storage.buckets where public;
  assert v_bad is null, 'public storage buckets: ' || v_bad;
end $$;

select 'security_invariants_smoke: all checks passed' as result;
