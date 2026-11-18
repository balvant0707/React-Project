-- Company notes by team (new, decision of 2026-11-13). A company stays visible to every signed-in user (view: lists,
-- search, its page); its notes and files need their own literals:
--   companies.read_notes.team / .write_notes.team - the company's salesperson (sales_account_user_id) shares a team with
--                                                   me, or is me
--   companies.read_notes.all  / .write_notes.all  - every company
-- write_notes implies read_notes. Adding a file is writing (add_files -> write_notes). The platform asks read_notes /
-- write_notes / add_files (20261113190000_platform_notes_questions.sql); companies answer them with these literals
-- (entity_types.actions maps them to themselves).
-- companies_row_allows as in 20261110110000_npm_companies.sql; changed: read_notes / write_notes by the literals above,
-- view for everybody as before ('check' is no question for companies any more), security definer (it reads companies and
-- user_teams).
-- Nobody loses access on the day: every existing role gets .all for both (the seed and the NPM data port grant the same);
-- an admin narrows it per role (Settings > Roles).

insert into public.permissions (key, module, action, scope, sort_order) values
  ('companies.read_notes.team', 'companies', 'read_notes', 'team', 404),
  ('companies.read_notes.all', 'companies', 'read_notes', 'all', 405),
  ('companies.write_notes.team', 'companies', 'write_notes', 'team', 406),
  ('companies.write_notes.all', 'companies', 'write_notes', 'all', 407)
on conflict (key) do nothing;
insert into public.permission_implies (permission, implies) values
  ('companies.write_notes.team', 'companies.read_notes.team'),
  ('companies.write_notes.all', 'companies.read_notes.all')
on conflict do nothing;

insert into public.role_permissions (role_id, permission)
select r.id, p.key from public.roles r cross join (values ('companies.read_notes.all'), ('companies.write_notes.all')) p(key)
on conflict do nothing;

create or replace function public.companies_row_allows(p_action text, p_entity_id uuid, p_ctx public.access_context)
  returns boolean
  language plpgsql stable security definer set search_path to ''
  as $$
begin
  if p_action in ('read_notes', 'write_notes') then
    if ('companies.' || p_action || '.all') = any ((p_ctx).permissions) then
      return true;
    end if;
    if ('companies.' || p_action || '.team') = any ((p_ctx).permissions) then
      return exists (
        select 1 from public.companies c
        where c.id = p_entity_id
          and (c.sales_account_user_id = (p_ctx).user_id
               or exists (select 1 from public.user_teams ut
                          where ut.user_id = c.sales_account_user_id and ut.team_id = any ((p_ctx).team_ids))));
    end if;
    return false;
  end if;
  return p_action = 'view' or ('companies.' || p_action) = any ((p_ctx).permissions);
end;
$$;

update public.entity_types set actions = jsonb_build_object('read_notes', 'read_notes', 'write_notes', 'write_notes')
where entity_type = 'companies';
select public.entity_types_rebuild();
