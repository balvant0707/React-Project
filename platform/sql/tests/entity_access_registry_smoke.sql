-- New test (no source in COMPASS / NPM): the record access registry generates the dispatchers from one function per
-- type, <type>_row_allows(action, id, ctx) (20261113180000_platform_one_access_function.sql).
-- One transaction, rolled back. Result lines: "N description | expected | actual".
begin;

create function public.smoke_a_row_allows(p_action text, p_id uuid, p_ctx public.access_context) returns boolean
  language sql stable as $$ select p_action = 'view' $$;
create function public.smoke_b_row_allows(p_action text, p_id uuid, p_ctx public.access_context) returns boolean
  language sql stable as $$ select p_action = 'edit' and 'smoke.edit' = any ((p_ctx).permissions) $$;

select public.entity_type_register('smoke_a', 'smoke', 'smoke_a_row_allows');
select public.entity_type_register('smoke_b', 'smoke', 'smoke_b_row_allows');

do $$
declare
  v_user uuid := (select id from public.users order by created_at limit 1);
  v_ctx public.access_context := public.access_context_for(v_user);
  v_id uuid := gen_random_uuid();
begin
  assert public.user_has_access(v_user, 'smoke_a', v_id, 'view'), 'user based: view';
  assert not public.user_has_access(v_user, 'smoke_a', v_id, 'edit'), 'user based: edit denied';
  assert public.can_access_entity_ctx('smoke_a', v_id, 'view', v_ctx), 'ctx: the same function';
  assert public.can_access_entity_ctx('smoke_b', v_id, 'edit', row(array['smoke.edit'], v_user, array[]::uuid[])::public.access_context),
    'ctx: the function reads the context';
  assert not public.user_has_access(v_user, 'smoke_b', v_id, 'edit'), 'by user: the person''s own context (no smoke.edit)';
  assert not public.can_access_entity_ctx('nope', v_id, 'view', v_ctx), 'unknown type: no access';
  assert not public.user_has_access(null, 'smoke_a', v_id, 'view'), 'no user: no access';
  assert (v_ctx).user_id = v_user and (v_ctx).permissions is not null, 'context carries user and rights';
  -- re-registering replaces, nothing is duplicated
  perform public.entity_type_register('smoke_a', 'smoke', 'smoke_b_row_allows');
  assert not public.user_has_access(v_user, 'smoke_a', v_id, 'view'), 're-register switches the function';
  -- the Admin role has no access by itself (admin overrule removed)
  assert not public.can_access_entity_ctx('smoke_b', v_id, 'view', public.access_context_for(v_user)), 'no admin bypass';
end $$;

select 'entity_access_registry_smoke: all checks passed' as result;
rollback;
