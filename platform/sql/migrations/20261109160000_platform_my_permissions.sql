-- The permission literals of the signed-in user (with the implied ones), read once per session by the frontend
-- (menu entries, buttons). Same function as in the NPM tool; the rule itself is enforced by the database (RLS), not here.
create function public.my_permissions() returns text[]
  language sql stable security definer set search_path to ''
  as $$ select public.user_permissions(auth.uid()); $$;

revoke all on function public.my_permissions() from public, anon, authenticated, service_role;
grant execute on function public.my_permissions() to authenticated, service_role;
