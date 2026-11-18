-- Local dev seed for the platform core (COMPASS app). Adapted from maintenance_tool/supabase/seed/00_reference_and_access.sql:
-- users, auth accounts and teams only (roles other than Admin and all module data come with the modules).
-- Everyone logs in with TestPass123!. The local stack has no MFA (key/value setting, D4); never in the cloud.
insert into public.app_settings (key, value) values ('require_mfa', 'false') on conflict (key) do update set value = 'false';


insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
  u.email, crypt('TestPass123!', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('max.wilckens@wilckens.com', 'Max Wilckens'),
  ('tom.berger@example.com', 'Tom Berger'),
  ('anna.weber@example.com', 'Anna Weber'),
  ('sara.novak@example.com', 'Sara Novak'),
  ('lena.fischer@example.com', 'Lena Fischer'),
  ('ben.keller@example.com', 'Ben Keller'),
  ('paul.meier@example.com', 'Paul Meier'),
  ('hanna.richter@example.com', 'Hanna Richter')
) as u(email, name)
where not exists (select 1 from auth.users x where x.email = u.email);

insert into auth.identities (user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select u.id, u.id::text, 'email', jsonb_build_object('sub', u.id::text, 'email', u.email), now(), now(), now()
from auth.users u
where not exists (select 1 from auth.identities i where i.user_id = u.id);

insert into public.users (id, email, name)
select u.id, u.email, u.raw_user_meta_data ->> 'name' from auth.users u
on conflict (id) do nothing;
update public.users set name = 'Max Wilckens' where email = 'max.wilckens@wilckens.com' and name is null;

insert into public.user_roles (user_id, role_id)
select u.id, r.id from public.users u, public.roles r
where u.email = 'max.wilckens@wilckens.com' and r.name = 'Admin' on conflict do nothing;

insert into public.teams (name) values ('Werkstatt'), ('IT'), ('Abfüllung'), ('Produktion');
insert into public.user_teams (user_id, team_id)
select u.id, g.id
from (values
  ('anna.weber@example.com', 'Werkstatt'), ('sara.novak@example.com', 'Werkstatt'),
  ('paul.meier@example.com', 'Werkstatt'), ('ben.keller@example.com', 'Produktion')
) as m(email, team_name)
join public.users u on u.email = m.email
join public.teams g on g.name = m.team_name;

-- Core-only roles: the COMPASS roles with the platform literals they hold (messages, teams, users). The full matrix
-- (tasks, tickets, assets, ...) comes with the COMPASS modules. Same names and assignments as the COMPASS seed.
insert into public.roles (name, translations) values
  ('Manager', '{"de": "Leitung"}'), ('Workshop', '{"de": "Werkstatt"}'), ('Purchasing', '{"de": "Einkauf"}'),
  ('Shopfloor', '{"de": "Produktion"}'), ('HR', '{"de": "Personalwesen"}'), ('IT agent', '{"de": "IT-Support"}');
insert into public.role_permissions (role_id, permission)
select r.id, m.permission from (values
  ('Manager', 'teams.create'), ('Manager', 'messages.check'), ('Manager', 'messages.create'), ('Manager', 'messages.delete'), ('Manager', 'messages.edit'), ('Manager', 'messages.view'),
  ('HR', 'teams.create'), ('HR', 'teams.manage'), ('HR', 'users.manage'), ('HR', 'messages.check'), ('HR', 'messages.create'), ('HR', 'messages.delete'), ('HR', 'messages.edit'), ('HR', 'messages.view'),
  ('Workshop', 'teams.create'), ('Workshop', 'messages.check'), ('Workshop', 'messages.create'), ('Workshop', 'messages.view'),
  ('Purchasing', 'teams.create'), ('Purchasing', 'messages.check'), ('Purchasing', 'messages.create'), ('Purchasing', 'messages.view'),
  ('Shopfloor', 'teams.create'), ('Shopfloor', 'messages.check'), ('Shopfloor', 'messages.create'), ('Shopfloor', 'messages.view'),
  ('IT agent', 'teams.create'), ('IT agent', 'messages.check'), ('IT agent', 'messages.create'), ('IT agent', 'messages.view')
) as m(role_name, permission) join public.roles r on r.name = m.role_name;
insert into public.user_roles (user_id, role_id)
select u.id, r.id from (values
  ('max.wilckens@wilckens.com', 'Manager'), ('max.wilckens@wilckens.com', 'HR'),
  ('tom.berger@example.com', 'Manager'), ('anna.weber@example.com', 'Workshop'), ('sara.novak@example.com', 'Workshop'),
  ('lena.fischer@example.com', 'Purchasing'), ('ben.keller@example.com', 'Shopfloor'), ('paul.meier@example.com', 'Workshop'),
  ('hanna.richter@example.com', 'HR')
) as m(email, role_name) join public.users u on u.email = m.email join public.roles r on r.name = m.role_name;

-- E-mail (platform email digest, login mails): the sender name of COMPASS; German as in COMPASS.
update public.email_settings set from_name = 'Wilckens COMPASS', language = 'de';
