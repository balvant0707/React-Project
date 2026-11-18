-- Sign-in by e-mail address or username, either / or. A password account with a contact address signs in with that
-- address (it is the GoTrue address of the account); a password account without one keeps <username>@login.rbp.invalid
-- and signs in with the username. The browser decides by the "@" in the input, so no lookup runs before sign-in.
-- The account follows users.email and users.username through the existing trigger users_sync_login_email
-- (sync_login_email, guarded by auth_users_login_email_guard); this migration changes the address it expects and moves
-- the accounts that exist.

create or replace function public.expected_login_email(p_user_id uuid) returns text
    language sql stable security definer
    set search_path to ''
    as $$
  select case
    when u.sign_in_method = 'password' and nullif(u.email, '') is null then public.login_email(u.username)
    else lower(u.email)
  end
  from public.users u where u.id = p_user_id
$$;

-- The activation check answers with the address the person signs in with afterwards.
create or replace function public.login_activation_check(p_username text, p_code text) returns table(code_id uuid, user_id uuid, login_email text)
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_code_id uuid;
  v_user_id uuid;
  v_hash text;
begin
  select c.id, c.user_id, c.code_hash into v_code_id, v_user_id, v_hash
  from public.login_activation_codes c
  join public.users u on u.id = c.user_id
  where u.username = lower(btrim(p_username)) and u.has_login and u.locked_at is null and u.sign_in_method = 'password'
    and c.used_at is null and c.expires_at > now() and c.failed_attempts < 5
  for update of c;
  if v_code_id is null then
    return;
  end if;
  if v_hash is distinct from public.activation_code_hash(p_code) then
    update public.login_activation_codes c set failed_attempts = c.failed_attempts + 1 where c.id = v_code_id;
    return;
  end if;
  return query select v_code_id, v_user_id, public.expected_login_email(v_user_id);
end;
$$;

-- Forgot password takes the e-mail address as well as the username (a username never contains "@"; both are unique).
-- The parameter keeps its name p_username and the old columns stay, so the Edge Function before and after this change
-- works against the database before and after it; the username comes as an extra column for the mail text.
drop function public.login_reset_target(text);
create function public.login_reset_target(p_username text) returns table(user_id uuid, login_email text, email text, name text, language text, username text)
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_person public.users;
  v_login text := lower(btrim(p_username));
begin
  delete from public.login_reset_requests r where r.requested_at < now() - interval '1 day';
  select * into v_person from public.users u
  where (u.username = v_login or lower(u.email) = v_login) and u.has_login and u.sign_in_method = 'password' and u.locked_at is null
    and nullif(u.email, '') is not null;
  if v_person.id is null then
    return;
  end if;
  if (select count(*) from public.login_reset_requests r where r.user_id = v_person.id and r.requested_at > now() - interval '1 hour') >= 3 then
    return;
  end if;
  insert into public.login_reset_requests (user_id) values (v_person.id);
  return query select v_person.id, public.expected_login_email(v_person.id), v_person.email, v_person.name, v_person.language, v_person.username;
end;
$$;

alter function public.login_reset_target(text) owner to postgres;
revoke all on function public.login_reset_target(text) from public, anon, authenticated, service_role;
grant all on function public.login_reset_target(text) to service_role;

-- The sign-in address no longer always follows the username.
create or replace function public.auth_users_login_email_guard() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_expected text := public.expected_login_email(new.id);
begin
  if v_expected is not null and lower(new.email) is distinct from v_expected then
    raise exception 'The sign-in address follows the contact address (the username without one); it cannot be changed here.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A new account whose address GoTrue stores in lower case must not rewrite the contact address the person already has
-- (person-grant-login creates the account for an existing person).
create or replace function public.handle_new_user() returns trigger
    language plpgsql security definer
    set search_path to ''
    as $$
begin
  insert into public.users (id, email, name, has_login)
  values (new.id, case when public.is_login_email(new.email) then null else new.email end,
          coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'), true)
  on conflict (id) do update set has_login = true,
    email = case when lower(public.users.email) = lower(excluded.email) then public.users.email else coalesce(excluded.email, public.users.email) end;
  perform public.sync_login_email(new.id);
  return new;
end;
$$;

-- An address with blanks around it is no address: trim the stored ones first (a clash with another person's address fails
-- here, loudly, and is fixed in the data before the move below).
update public.users set email = nullif(btrim(email), '') where email is distinct from nullif(btrim(email), '');

-- Move the accounts that exist: password accounts with a contact address now sign in with it.
select public.sync_login_email(u.id)
from public.users u
where u.has_login and u.sign_in_method = 'password' and u.email is not null;
