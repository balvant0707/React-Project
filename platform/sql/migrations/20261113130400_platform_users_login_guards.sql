-- users.has_login belongs to the auth triggers (handle_new_user / handle_deleted_user). Two guards COMPASS lacked, taken over
-- 1:1 from the NPM tool 20261019100000_users_without_login.sql (test: npm_users_without_login_smoke.sql):
--   1. A signed-in admin could insert a person that claims a login without an account (force_no_login_on_insert).
--   2. An admin could delete a person who still has a login through the API (policy "Admins manage users"), leaving the
--      auth account behind; the UI (people page) offers deleting only without a login, as HR's delete policy has it.
create function public.force_no_login_on_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.has_login := false;
  end if;
  return new;
end;
$$;
revoke execute on function public.force_no_login_on_insert() from public, anon, authenticated;
create trigger force_no_login_on_insert
  before insert on public.users
  for each row execute function public.force_no_login_on_insert();

create policy "Users with a login are not deleted" on public.users as restrictive for delete to authenticated
  using (not has_login);
