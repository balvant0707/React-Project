-- Deleting companies by scope (new: the NPM tool had the literal `companies.delete` but no way to delete a company).
--
-- The unscoped `companies.delete` is split into
--   companies.delete.created - companies the user created (created_by_user_id)
--   companies.delete.all     - any company
-- Roles holding `companies.delete` keep their right as `.all`; roles that may create companies (`companies.create` or
-- `companies.edit`, which the insert policy accepts too) get `.created`, so whoever creates a company can delete it again.
-- SeaWeb companies (source = 'seaweb') are never deleted by a user: SeaWeb owns them and the next sync would bring them
-- back. The trigger names the SeaWeb name in the error, the company page shows the same text before it tries.

insert into public.permissions (key, module, action, scope, sort_order) values
  ('companies.delete.created', 'companies', 'delete', 'created', 402),
  ('companies.delete.all', 'companies', 'delete', 'all', 403)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission)
select role_id, 'companies.delete.all' from public.role_permissions where permission = 'companies.delete'
on conflict do nothing;

insert into public.role_permissions (role_id, permission)
select distinct role_id, 'companies.delete.created' from public.role_permissions
where permission in ('companies.create', 'companies.edit')
on conflict do nothing;

drop policy if exists "Delete companies per literal" on public.companies;
drop policy if exists "Delete companies per grant" on public.companies;
-- role_permissions rows go with it (on delete cascade).
delete from public.permissions where key = 'companies.delete';

create policy "Delete companies per grant" on public.companies for delete to authenticated using (
  (select public.rls_has('companies.delete.all'))
  or ((select public.rls_has('companies.delete.created')) and created_by_user_id = (select auth.uid()))
);

-- Signed-in users only (auth.uid() set): a maintenance delete as postgres / service role is not stopped.
create or replace function public.companies_guard_seaweb_delete()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if old.source = 'seaweb' and auth.uid() is not null then
    raise exception 'This company comes from SeaWeb ("%") and cannot be deleted.', coalesce(old.seaweb_match_name, old.name)
      using errcode = 'P0001', hint = 'seaweb_company';
  end if;
  return old;
end;
$$;

drop trigger if exists companies_guard_seaweb_delete on public.companies;
create trigger companies_guard_seaweb_delete
  before delete on public.companies
  for each row execute function public.companies_guard_seaweb_delete();
