-- access_context_for(p_user_id) returns any person's literals and teams, and every signed-in user could call it
-- (20261109110000_platform_entity_access.sql granted it with the access helpers). Only security definer code calls it
-- (access_context() and the modules' access functions), so signed-in users lose it; the NPM tool had the same rule
-- (its permissions test "signed-in users cannot read another user's literals", npm_permissions_smoke.sql).
revoke execute on function public.access_context_for(uuid) from authenticated;
