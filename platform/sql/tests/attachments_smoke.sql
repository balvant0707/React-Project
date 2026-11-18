-- New test: attachments follow the record registry. One transaction, rolled back.
begin;
create function public.smoke_att_row_allows(p_action text, p_id uuid, p_ctx public.access_context) returns boolean language sql stable as $$ select p_action in ('view', 'check') $$;
select public.entity_type_register('smoke_att', 'smoke', 'smoke_att_row_allows');

do $$
declare
  v_user uuid := (select id from public.users where email = 'anna.weber@example.com');
  v_rec uuid := gen_random_uuid();
begin
  insert into public.attachments (entity_type, entity_id, storage_path, file_name, uploaded_by_user_id)
  values ('smoke_att', v_rec, 'smoke_att/' || v_rec || '/a.txt', 'a.txt', v_user);
  begin
    insert into public.attachments (entity_type, entity_id, storage_path, file_name, uploaded_by_user_id)
    values ('nope', v_rec, 'nope/' || v_rec || '/a.txt', 'a.txt', v_user);
    raise exception 'unregistered type accepted';
  exception when others then
    assert sqlerrm like '%Unknown record type%', 'unregistered type refused: ' || sqlerrm;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  assert public.storage_path_access('smoke_att/' || v_rec || '/a.txt', 'view'), 'path of a registered type: view';
  assert not public.storage_path_access('smoke_att/' || v_rec || '/a.txt', 'edit'), 'path of a registered type: edit denied';
  assert not public.storage_path_access('unknown/' || v_rec || '/a.txt', 'view'), 'unregistered path denied';
  assert not public.storage_path_moderator('smoke_att/' || v_rec || '/a.txt'), 'nobody moderates by default';
  assert (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Read attachment files') = 1, 'storage policy exists';
end $$;

select 'attachments_smoke: all checks passed' as result;
rollback;
