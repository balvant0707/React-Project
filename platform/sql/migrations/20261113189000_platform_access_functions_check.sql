-- NEW: after the modules switched their record types (2026111318xxxx_<module>_one_access_function.sql), every registered
-- access function has the signature (action text, id uuid, ctx access_context) and is private. entity_type_register()
-- refuses a wrong one from now on; a module that changes entity_types.access_function directly is caught here on a reset.
do $$
declare
  v_bad text;
begin
  select string_agg(entity_type || ' -> ' || access_function, ', ') into v_bad
  from public.entity_types
  where to_regprocedure(format('public.%I(text, uuid, public.access_context)', access_function)) is null;
  if v_bad is not null then
    raise exception 'record types without an access function (action text, id uuid, ctx access_context): %', v_bad;
  end if;
  select string_agg(access_function, ', ') into v_bad
  from public.entity_types
  where has_function_privilege('authenticated', to_regprocedure(format('public.%I(text, uuid, public.access_context)', access_function)), 'execute');
  if v_bad is not null then
    raise exception 'access functions executable by signed-in users: %', v_bad;
  end if;
end $$;
