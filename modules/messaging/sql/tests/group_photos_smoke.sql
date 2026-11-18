-- apps: compass
-- Copied from ~/maintenance_tool/supabase/tests/group_photos_smoke.sql with the renames and platform adaptations.
-- Group pictures smoke test (migration 20261207120000_group_photos.sql): owners and group managers set and remove the
-- picture and write the file, others cannot, the path must belong to the group. Everything is rolled back.
--   docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/group_photos_smoke.sql
begin;

create function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from public.users where email = p_email $$;
grant execute on all functions in schema pg_temp to public;

insert into public.teams (id, name, audience, posting) values ('00000000-0000-4000-8000-0000000000d1', 'Photo group', 'everyone', 'everyone');
insert into public.team_owners values ('00000000-0000-4000-8000-0000000000d1', pg_temp.uid('ben.keller@example.com'));

do $$
declare v_ok boolean;
begin
  -- 1. The owner writes the file and sets the picture.
  perform pg_temp.as_user('ben.keller@example.com');
  insert into storage.objects (bucket_id, name) values ('team-photos', '00000000-0000-4000-8000-0000000000d1/a.jpg');
  perform public.team_photo_set('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1/a.jpg');
  assert (select photo_path from public.teams where id = '00000000-0000-4000-8000-0000000000d1') = '00000000-0000-4000-8000-0000000000d1/a.jpg', '1 picture set';

  -- 2. Somebody else neither sets it nor writes the file.
  perform pg_temp.as_user('anna.weber@example.com');
  begin
    perform public.team_photo_set('00000000-0000-4000-8000-0000000000d1', null);
    raise exception 'anna removed the picture';
  exception when others then
    assert sqlerrm like 'Only an owner%', '2 refused: ' || sqlerrm;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('team-photos', '00000000-0000-4000-8000-0000000000d1/b.jpg');
    raise exception 'anna wrote a file';
  exception when others then
    assert sqlerrm not like 'anna wrote%', '2b the policy refuses the file';
  end;

  -- 3. Everybody signed in reads the group row with the path.
  assert (select photo_path from public.teams where id = '00000000-0000-4000-8000-0000000000d1') is not null, '3 readable';

  -- 4. The path has to belong to the group.
  perform pg_temp.as_user('ben.keller@example.com');
  begin
    perform public.team_photo_set('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d2/a.jpg');
    raise exception 'foreign path accepted';
  exception when others then
    assert sqlerrm not like 'foreign path%', '4 refused: ' || sqlerrm;
  end;

  -- 5. The owner removes it again; HR (teams.manage) may set it too.
  perform public.team_photo_set('00000000-0000-4000-8000-0000000000d1', null);
  assert (select photo_path from public.teams where id = '00000000-0000-4000-8000-0000000000d1') is null, '5 removed';
  perform pg_temp.as_user('hanna.richter@example.com');
  perform public.team_photo_set('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000d1/c.jpg');
  assert (select photo_path from public.teams where id = '00000000-0000-4000-8000-0000000000d1') like '%/c.jpg', '5b a group manager sets it';
end $$;
rollback;
