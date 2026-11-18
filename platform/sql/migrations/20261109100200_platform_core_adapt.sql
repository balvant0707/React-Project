-- Platform core, slice 1c: ADAPTATIONS. This file is hand-written and lists every deviation from the copied sources.
--   D1  users is one wide table: NPM columns added (short_code, office_phrase_id, joined_team_at, default_team_id, time_zone).
--   D2  teams: usable_for_* booleans replaced by a use registry (team_use_registry, team_uses).
--   D4  app_settings is key/value (NPM) with a registry of known keys; mfa_satisfied() reads the two keys (COMPASS body,
--       NPM setting reads).
--   D6  translations jsonb instead of text_de / name_de (phrases, roles).

-- D6 ---------------------------------------------------------------------------------------------------------------
alter table public.phrases drop column text_de;
alter table public.phrases add column translations jsonb not null default '{}'::jsonb;
alter table public.roles drop column name_de;
alter table public.roles add column translations jsonb not null default '{}'::jsonb;

-- D1 ---------------------------------------------------------------------------------------------------------------
alter table public.users
  add column short_code text,
  add column office_phrase_id uuid references public.phrases(id) on delete set null,
  add column joined_team_at date,
  add column default_team_id uuid references public.teams(id) on delete set null,
  add column time_zone text;
create trigger users_check_time_zone before insert or update of time_zone on public.users
  for each row execute function public.check_time_zone_column();

-- D2 ---------------------------------------------------------------------------------------------------------------
alter table public.teams
  drop column usable_for_tasks, drop column usable_for_trainings, drop column usable_for_filters,
  drop column usable_for_positions, drop column usable_for_leave, drop column usable_for_assets;

create table public.team_use_registry (
  use text primary key,
  module text not null,
  description text
);
create table public.team_uses (
  team_id uuid not null references public.teams(id) on delete cascade,
  use text not null references public.team_use_registry(use) on delete cascade,
  primary key (team_id, use)
);
create index team_uses_use_idx on public.team_uses (use, team_id);

create function public.team_use_register(p_use text, p_module text, p_description text default null) returns void
  language sql security definer set search_path to ''
  as $$ insert into public.team_use_registry (use, module, description) values (p_use, p_module, p_description)
        on conflict (use) do update set module = excluded.module, description = excluded.description; $$;
revoke all on function public.team_use_register(text, text, text) from public, anon, authenticated;
grant execute on function public.team_use_register(text, text, text) to service_role;

alter table public.team_use_registry enable row level security;
alter table public.team_uses enable row level security;
create policy "Read team uses" on public.team_use_registry for select to authenticated using (true);
create policy "Read team uses" on public.team_uses for select to authenticated using (true);
create policy "Team managers manage team uses" on public.team_uses to authenticated
  using ((select public.can_manage_teams())) with check ((select public.can_manage_teams()));
create policy mfa_required on public.team_use_registry as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
create policy mfa_required on public.team_uses as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
grant all on table public.team_use_registry, public.team_uses to authenticated, service_role;

-- D4 ---------------------------------------------------------------------------------------------------------------
create table public.app_setting_registry (
  key text primary key,
  module text not null,
  value_type text not null check (value_type in ('text', 'boolean', 'integer', 'json')),
  default_value text,
  is_public boolean not null default false,
  description text
);
alter table public.app_setting_registry enable row level security;
create policy "Read setting registry" on public.app_setting_registry for select to authenticated using (true);
create policy mfa_required on public.app_setting_registry as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
grant all on table public.app_setting_registry to authenticated, service_role;

create function public.app_setting_register(p_key text, p_module text, p_value_type text, p_default text default null,
                                           p_public boolean default false, p_description text default null) returns void
  language sql security definer set search_path to ''
  as $$ insert into public.app_setting_registry (key, module, value_type, default_value, is_public, description)
        values (p_key, p_module, p_value_type, p_default, p_public, p_description)
        on conflict (key) do update set module = excluded.module, value_type = excluded.value_type,
          default_value = excluded.default_value, is_public = excluded.is_public, description = excluded.description;
        -- The admin page only updates existing rows (column grant): a registered setting starts with its default.
        insert into public.app_settings (key, value) select p_key, p_default where p_default is not null on conflict (key) do nothing; $$;
revoke all on function public.app_setting_register(text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.app_setting_register(text, text, text, text, boolean, text) to service_role;

-- Settings may hold secrets (the NPM table does): readable and editable by signed-in users only for registered public keys.
create policy "Read public settings" on public.app_settings for select to authenticated
  using (exists (select 1 from public.app_setting_registry r where r.key = app_settings.key and r.is_public));
create policy "Admins change public settings" on public.app_settings for update to authenticated
  using ((select public.is_admin()) and exists (select 1 from public.app_setting_registry r where r.key = app_settings.key and r.is_public))
  with check ((select public.is_admin()) and exists (select 1 from public.app_setting_registry r where r.key = app_settings.key and r.is_public));

grant select on public.app_settings to authenticated;
grant update (value) on public.app_settings to authenticated;

select public.app_setting_register('require_mfa', 'platform', 'boolean', 'true', true, 'Only the value false switches the second factor off; missing = required.');
select public.app_setting_register('sso_satisfies_mfa', 'platform', 'boolean', 'false', true, 'Only true lets an Entra login count as second factor.');
update public.app_settings set value = 'true' where key = 'sso_satisfies_mfa';

create or replace function public.mfa_satisfied() returns boolean
  language sql stable security definer set search_path to ''
  as $function$
  select not public.login_locked() and (
    coalesce((select s.value = 'false' from public.app_settings s where s.key = 'require_mfa'), false)
      or coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or (
        coalesce((select s.value = 'true' from public.app_settings s where s.key = 'sso_satisfies_mfa'), false)
        and case when jsonb_typeof(auth.jwt() -> 'amr') = 'array'
             then exists (select 1 from jsonb_array_elements(auth.jwt() -> 'amr') a where a ->> 'method' = 'oauth')
             else false end
        and case when jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'providers') = 'array'
             then (auth.jwt() -> 'app_metadata' -> 'providers') ? 'azure'
             else false end
        and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.sign_in_method = 'sso')
      ))
$function$;

-- D1 (continued): the wide users table in the places that list or protect it ---------------------------------------------
--   * users_admin_overview (copied) gets the NPM columns at its end.
--   * restrict_user_self_update (copied): everybody may set their own time zone (NPM profile page); every other column, including the
--     NPM ones (short_code, office, joined_team_at, default_team_id), stays with HR / user managers through the existing
--     allow-list rule. Own photo: decided by the literal users.photo.own (NPM behaviour for roles that hold it, COMPASS behaviour otherwise).
CREATE OR REPLACE VIEW public.users_admin_overview WITH (security_invoker='on') AS
 SELECT u.id,
    u.name,
    u.email,
    u."position",
    u.supervisor_user_id,
    u.deputy_user_id,
    u.sign_in_method,
    u.has_login,
    s.name AS supervisor_name,
    d.name AS deputy_name,
    COALESCE(ARRAY( SELECT ur.role_id
           FROM public.user_roles ur
          WHERE (ur.user_id = u.id)), '{}'::uuid[]) AS role_ids,
    ( SELECT string_agg(r.name, ', '::text ORDER BY r.name) AS string_agg
           FROM (public.user_roles ur
             JOIN public.roles r ON ((r.id = ur.role_id)))
          WHERE (ur.user_id = u.id)) AS role_names,
    COALESCE(ARRAY( SELECT ug.team_id
           FROM public.user_teams ug
          WHERE (ug.user_id = u.id)), '{}'::uuid[]) AS team_ids,
    ( SELECT string_agg(g.name, ', '::text ORDER BY g.name) AS string_agg
           FROM (public.user_teams ug
             JOIN public.teams g ON ((g.id = ug.team_id)))
          WHERE (ug.user_id = u.id)) AS team_names,
    u.username,
    u.locked_at,
    l.name AS locked_by_name,
    u.short_code,
    u.office_phrase_id,
    u.joined_team_at,
    u.default_team_id,
    u.time_zone
   FROM (((public.users u
     LEFT JOIN public.users s ON ((s.id = u.supervisor_user_id)))
     LEFT JOIN public.users d ON ((d.id = u.deputy_user_id)))
     LEFT JOIN public.users l ON ((l.id = u.locked_by_user_id)));

CREATE OR REPLACE FUNCTION public.restrict_user_self_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if auth.uid() is null then
    return new;
  end if;
  -- has_login moves with the account (the auth triggers, also when user_revoke_login deletes it).
  if new.id <> old.id or (new.has_login is distinct from old.has_login and pg_trigger_depth() = 1)
     or (new.has_left is distinct from old.has_left and pg_trigger_depth() = 1) then
    raise exception 'This field cannot be changed';
  end if;
  if new.sign_in_method is distinct from old.sign_in_method and not public.is_admin() then
    raise exception 'Only an admin can change the sign-in method';
  end if;
  if (new.locked_at is distinct from old.locked_at or new.locked_by_user_id is distinct from old.locked_by_user_id)
     and coalesce(current_setting('app.login_admin', true), '') <> 'on' then
    raise exception 'Locking goes through user_lock / user_unlock';
  end if;
  if new.username is distinct from old.username and not public.can_manage_users() then
    raise exception 'Only a user manager can change the username';
  end if;
  if public.is_admin() then
    return new;
  end if;
  if public.rls_has('people.edit') or public.rls_has('users.manage') then
    -- The contact address of an account receives the password links: only an admin changes it.
    if old.has_login and new.email is distinct from old.email then
      raise exception 'Only an admin can change the e-mail of a person with a login';
    end if;
    return new;
  end if;
  if new.birthday_hidden is distinct from old.birthday_hidden and new.id <> auth.uid() then
    raise exception 'Only the person or HR can hide a birthday';
  end if;
  -- A person with the literal users.photo.own may change their own photo (NPM behaviour); without it photos stay with HR (COMPASS).
  if new.id = auth.uid() and public.rls_has('users.photo.own') then
    if (to_jsonb(new) - 'language' - 'birthday_hidden' - 'last_seen_at' - 'updated_at' - 'time_zone' - 'photo_url')
       is distinct from (to_jsonb(old) - 'language' - 'birthday_hidden' - 'last_seen_at' - 'updated_at' - 'time_zone' - 'photo_url') then
      raise exception 'Only HR or an admin can change this field';
    end if;
    return new;
  end if;
  if (to_jsonb(new) - 'language' - 'birthday_hidden' - 'last_seen_at' - 'updated_at' - 'time_zone')
     is distinct from (to_jsonb(old) - 'language' - 'birthday_hidden' - 'last_seen_at' - 'updated_at' - 'time_zone') then
    raise exception 'Only HR or an admin can change this field';
  end if;
  return new;
end;
$$;
