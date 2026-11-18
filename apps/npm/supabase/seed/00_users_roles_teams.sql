-- Local dev seed of the NPM app: pilot logins (TestPass123!), roles with their literals, teams. Adapted from ~/npm_tool/supabase/seed/00_reference_and_access.sql
-- (countries now come with the migration, tenants are owner associate teams created in 01, the NPM admin overrule is gone: former
-- admins hold the role Admin (administration); the content role Sales Admin is gone (2026-11-13): the dev admins get the dev-only role 'Dev Content Admin' made at the end of this file). The local stack has no MFA; never in the cloud.
insert into public.app_settings (key, value) values ('require_mfa', 'false') on conflict (key) do update set value = 'false';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  u.email, crypt('TestPass123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('max.wilckens@wilckens.com', 'Max Wilckens'),
  ('johan.wilckens@wilckens.com', 'Johan Wilckens'),
  ('ugur.akbati@nipponpaint-marine.eu', 'Ugur Akbati'),
  ('jan.hoessermann@wilckens.com', 'Jan Hössermann'),
  ('jenko.harrendorf@nipponpaint-marine.eu', 'Jenko Harrendorf'),
  ('melih.taskin@nipponpaint-marine.eu', 'Melih Taskin'),
  ('rieke.thormaehlen@wilckens.com', 'Rieke Thormählen'),
  ('niko.yamanoue@nipponpaint-marine.eu', 'Niko Yamanoue'),
  ('takumi.yamanoue@nipponpaint-marine.eu', 'Takumi Yamanoue'),
  ('spiros.dimopoulos@nipponpaint-marine.eu', 'Spiros Dimopoulos'),
  ('theodosis.dimopoulos@wilckens.com', 'Theodosis Dimopoulos')
) as u(email, name)
where not exists (select 1 from auth.users x where x.email = u.email);

insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email), now(), now(), now()
from auth.users u
where not exists (select 1 from auth.identities i where i.user_id = u.id);

insert into public.users (id, email, name)
select u.id, u.email, u.raw_user_meta_data ->> 'name' from auth.users u
on conflict (id) do update set name = excluded.name;

insert into public.roles (name) values ('Sales Rep'), ('Logistics'), ('Manager'), ('Technical Service Rep');
insert into public.roles (name, translations) values ('HR', '{"de": "Personalwesen"}');
insert into public.teams (name) values ('Sales - NPMEU'), ('Sales - NPMTR'), ('Sales - NPMME'), ('Logistics');

insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u cross join public.roles r
where u.email in ('max.wilckens@wilckens.com', 'johan.wilckens@wilckens.com', 'rieke.thormaehlen@wilckens.com', 'niko.yamanoue@nipponpaint-marine.eu', 'takumi.yamanoue@nipponpaint-marine.eu', 'spiros.dimopoulos@nipponpaint-marine.eu', 'theodosis.dimopoulos@wilckens.com') and r.name = 'Admin';
insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u cross join public.roles r
where u.email in ('ugur.akbati@nipponpaint-marine.eu', 'jenko.harrendorf@nipponpaint-marine.eu') and r.name = 'Sales Rep';
insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u cross join public.roles r
where u.email = 'melih.taskin@nipponpaint-marine.eu' and r.name = 'Technical Service Rep';
insert into public.user_teams (user_id, team_id)
select u.id, t.id from public.users u cross join public.teams t
where u.email in ('ugur.akbati@nipponpaint-marine.eu', 'jenko.harrendorf@nipponpaint-marine.eu', 'melih.taskin@nipponpaint-marine.eu') and t.name = 'Sales - NPMEU';

-- Role literals (same grants as the NPM seed).
insert into public.role_permissions (role_id, permission)
select r.id, g.permission
from (values
  ('Sales Rep', 'vessels.edit'), ('Sales Rep', 'companies.edit'),
  ('Sales Rep', 'hull_events.edit.assigned'), ('Sales Rep', 'hull_events.edit.team'), ('Sales Rep', 'hull_events.create.assigned'), ('Sales Rep', 'hull_events.create.team'),
  ('Sales Rep', 'specifications.edit.assigned'), ('Sales Rep', 'specifications.edit.team'), ('Sales Rep', 'specifications.create.assigned'), ('Sales Rep', 'specifications.create.team'),
  ('Sales Rep', 'orders.edit.assigned'), ('Sales Rep', 'orders.edit.team'), ('Sales Rep', 'orders.create.assigned'), ('Sales Rep', 'orders.create.team'),
  ('Logistics', 'hull_events.edit.team'), ('Logistics', 'specifications.view.team'), ('Logistics', 'orders.view.team'),
  ('Manager', 'vessels.edit'), ('Manager', 'companies.edit'), ('Manager', 'products.edit'), ('Manager', 'products.create'), ('Manager', 'products.delete'),
  ('Manager', 'hull_events.edit.team'), ('Manager', 'hull_events.approve.team'), ('Manager', 'hull_events.create.team'),
  ('Manager', 'specifications.edit.team'), ('Manager', 'specifications.approve.team'), ('Manager', 'specifications.create.team'),
  ('Manager', 'orders.edit.team'), ('Manager', 'orders.approve.team'), ('Manager', 'orders.create.team'),
  ('Technical Service Rep', 'hull_events.edit.assigned'), ('Technical Service Rep', 'hull_events.edit.team'), ('Technical Service Rep', 'specifications.view.assigned'), ('Technical Service Rep', 'specifications.view.team')
) as g(role_name, permission)
join public.roles r on r.name = g.role_name;
-- Dock reports (the grants of the NPM seed; were left out when the module came).
insert into public.role_permissions (role_id, permission)
select r.id, g.permission
from (values
  ('Logistics', 'dock_reports.view.team'),
  ('Manager', 'dock_reports.view.team'), ('Manager', 'dock_reports.edit.team'), ('Manager', 'dock_reports.create.team'),
  ('Sales Rep', 'dock_reports.view.team'), ('Sales Rep', 'dock_reports.view.assigned'),
  ('Technical Service Rep', 'dock_reports.create.team'), ('Technical Service Rep', 'dock_reports.view.assigned'), ('Technical Service Rep', 'dock_reports.view.team'),
  ('Technical Service Rep', 'dock_reports.edit.assigned'), ('Technical Service Rep', 'dock_reports.edit.team'), ('Technical Service Rep', 'dock_reports.create.assigned')
) as g(role_name, permission)
join public.roles r on r.name = g.role_name
on conflict do nothing;
-- Company notes (companies migration 20261113190100): Sales Rep and Technical Service Rep only for companies whose
-- salesperson shares a team with them, everybody else every company.
insert into public.role_permissions (role_id, permission)
select r.id, case when r.name in ('Sales Rep', 'Technical Service Rep') then p.team else p.all_ end
from public.roles r
cross join (values ('companies.read_notes.team', 'companies.read_notes.all'), ('companies.write_notes.team', 'companies.write_notes.all')) p(team, all_)
on conflict do nothing;
-- newbuildings follow hull events
insert into public.role_permissions (role_id, permission)
select rp.role_id, 'newbuildings.' || substr(rp.permission, length('hull_events.') + 1)
from public.role_permissions rp where rp.permission ~ '^hull_events\.(view|edit|create|delete)\.' on conflict do nothing;

-- HR: user management (users.manage, as the COMPASS HR role): people, positions, supervisor and deputy.
insert into public.role_permissions (role_id, permission)
select r.id, p.key from public.roles r, (values ('users.manage')) p(key) where r.name = 'HR';
insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u, public.roles r where u.email = 'max.wilckens@wilckens.com' and r.name = 'HR';

-- Own photo (NPM: everybody changes their own picture; the platform asks for users.photo.own, COMPASS leaves photos with HR).
insert into public.role_permissions (role_id, permission)
select r.id, 'users.photo.own' from public.roles r on conflict do nothing;

-- E-mail (platform email digest, login mails): the app names itself in the mails and writes English.
update public.email_settings set from_name = 'RADAR', language = 'en';

-- Dev only (not a migration, never in the cloud): a role holding every literal with scope all (or none), so the dev admins see
-- all content like the old Sales Admin did, and the SQL tests that act as an admin keep working. The real operational roles are
-- created and assigned when the people move to the platform (done for RADAR on 2026-11-14: the roles are made in Admin > Roles).
insert into public.roles (name) values ('Dev Content Admin');
insert into public.role_permissions (role_id, permission)
select r.id, p.key from public.roles r, public.permissions p
where r.name = 'Dev Content Admin' and (p.scope = 'all' or p.scope is null)
on conflict do nothing;
insert into public.user_roles (user_id, role_id)
select ur.user_id, (select id from public.roles where name = 'Dev Content Admin')
from public.user_roles ur join public.roles r on r.id = ur.role_id where r.name = 'Admin'
on conflict do nothing;
