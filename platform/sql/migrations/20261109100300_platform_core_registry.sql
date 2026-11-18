-- Platform core, slice 1d: the permission literals and the Admin role the core itself needs.
-- Rows copied from the COMPASS database (modules groups, users, messages); module 'groups' -> 'teams' (T8, plural),
-- column task_family dropped (a tasks-module concern, comes back with that module). The closure is rebuilt by the
-- statement triggers on permissions / permission_implies.
alter table public.permissions drop column task_family;
-- The action and scope vocabulary is owned by the modules (decision "scopes are module vocabulary"): COMPASS fixed both lists in a
-- CHECK, NPM needs the scope "account". The CHECKs become a format rule; literals are written by migrations only.
alter table public.permissions drop constraint permissions_action_check, drop constraint permissions_scope_check;
alter table public.permissions
  add constraint permissions_action_check check (action ~ '^[a-z][a-z_]*$'),
  add constraint permissions_scope_check check (scope is null or scope ~ '^[a-z][a-z_]*$');

insert into public.permissions (key, module, action, scope, sort_order) values
  ('messages.view', 'messages', 'view', null, 154),
  ('messages.check', 'messages', 'check', null, 155),
  ('messages.create', 'messages', 'create', null, 156),
  ('messages.edit', 'messages', 'edit', null, 157),
  ('messages.delete', 'messages', 'delete', null, 158),
  ('users.manage', 'users', 'manage', null, 159),
  ('teams.manage', 'teams', 'manage', null, 160),
  ('teams.create', 'teams', 'create', null, 162),
  -- NEW (the apps handled photos differently: COMPASS leaves them to HR, NPM lets everybody change their own): a literal decides.
  ('users.photo.own', 'users', 'photo', 'own', 163);
insert into public.permission_implies (permission, implies) values
  ('messages.edit', 'messages.check'), ('messages.check', 'messages.view'),
  ('messages.create', 'messages.view'), ('messages.delete', 'messages.view');

-- The Admin role administers (COMPASS model): it holds only harmless literals, content needs a role of its own.
insert into public.roles (name, translations) values ('Admin', '{"de": "Administrator"}');
insert into public.role_permissions (role_id, permission)
  select r.id, p from public.roles r, unnest(array['teams.create', 'messages.check', 'messages.create', 'messages.view']) p
  where r.name = 'Admin';
