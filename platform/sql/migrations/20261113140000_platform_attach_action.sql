-- Which right adding a file to a record needs, per record type. The platform took COMPASS's rule (the action 'check': who may
-- check a task may add photos), but the NPM record types answer 'check' with 'view' (a note needs only view), so every viewer
-- could upload to a hull event or a specification and everybody to a vessel; the NPM tool needed edit. A module now sets
-- entity_types.attach_action for its types (default 'check', COMPASS's rule). Policies as in 20261109140000 /
-- 20261109140100 (Add attachments, Upload attachment files); changed: the action comes from the record type.
-- Test: npm_permissions_smoke.sql (vessel and project attachments).
alter table public.entity_types add column attach_action text not null default 'check' check (attach_action in ('check', 'edit'));

create function public.entity_attach_action(p_entity_type text) returns text
  language sql stable set search_path to ''
  as $$ select coalesce((select attach_action from public.entity_types where entity_type = p_entity_type), 'check'); $$;
revoke all on function public.entity_attach_action(text) from public, anon;
grant execute on function public.entity_attach_action(text) to authenticated, service_role;

drop policy "Add attachments" on public.attachments;
create policy "Add attachments" on public.attachments for insert to authenticated
  with check (uploaded_by_user_id = (select auth.uid())
              and public.can_access_entity(entity_type, entity_id, public.entity_attach_action(entity_type)));

-- storage_path_access as in 20261109140100; NEW: the action 'attach' stands for the record type's attach_action.
create or replace function public.storage_path_access(p_path text, p_grant_type text)
returns boolean
language plpgsql
stable security definer
set search_path to ''
as $$
declare
  v_parts text[] := string_to_array(p_path, '/');
begin
  if array_length(v_parts, 1) < 3 or not exists (select 1 from public.entity_types where entity_type = v_parts[1]) then
    return false;
  end if;
  return public.can_access_entity(v_parts[1], v_parts[2]::uuid,
    case when p_grant_type = 'attach' then public.entity_attach_action(v_parts[1]) else p_grant_type end);
exception when invalid_text_representation then
  return false;
end;
$$;

drop policy "Upload attachment files" on storage.objects;
create policy "Upload attachment files" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.storage_path_access(name, 'attach'));
