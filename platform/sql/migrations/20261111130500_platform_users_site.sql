-- One work-location field per person (docs/shared-parts.md A1): COMPASS's users.site (free text; the leave module's
-- holiday regions read it) stays, NPM's office (users.office_phrase_id, phrase category office) moves into it and is dropped.
-- Admin > Users edits site with suggestions from the values already in use.
update public.users u set site = p.text_en
  from public.phrases p where p.id = u.office_phrase_id and u.site is null;

drop view public.users_admin_overview;
create view public.users_admin_overview with (security_invoker = 'on') as
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
           FROM user_roles ur
          WHERE ur.user_id = u.id), '{}'::uuid[]) AS role_ids,
    ( SELECT string_agg(r.name, ', '::text ORDER BY r.name) AS string_agg
           FROM user_roles ur
             JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = u.id) AS role_names,
    COALESCE(ARRAY( SELECT ug.team_id
           FROM user_teams ug
          WHERE ug.user_id = u.id), '{}'::uuid[]) AS team_ids,
    ( SELECT string_agg(g.name, ', '::text ORDER BY g.name) AS string_agg
           FROM user_teams ug
             JOIN teams g ON g.id = ug.team_id
          WHERE ug.user_id = u.id) AS team_names,
    u.username,
    u.locked_at,
    l.name AS locked_by_name,
    u.short_code,
    u.site,
    u.joined_team_at,
    u.default_team_id,
    u.time_zone
   FROM users u
     LEFT JOIN users s ON s.id = u.supervisor_user_id
     LEFT JOIN users d ON d.id = u.deputy_user_id
     LEFT JOIN users l ON l.id = u.locked_by_user_id;
revoke all on table public.users_admin_overview from anon, authenticated, service_role;
grant all on table public.users_admin_overview to authenticated, service_role;

alter table public.users drop column office_phrase_id;
