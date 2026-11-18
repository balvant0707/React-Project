-- apps: compass
-- New test: the wide users table. Everybody sets their own time zone; the specs columns stay with HR / user managers; the admin overview
-- carries all columns. One transaction, rolled back.
begin;
create temp table people on commit drop as select email, id from public.users;
grant select on people to public;
create function pg_temp.uid(p_email text) returns uuid language sql as $$ select id from pg_temp.people where email = p_email $$;
create function pg_temp.act_as(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid(p_email), 'role', 'authenticated', 'aal', 'aal2')::text, true);
end $$;
grant execute on function pg_temp.uid(text), pg_temp.act_as(text) to public;

set local role authenticated;
select pg_temp.act_as('anna.weber@example.com');
update public.users set time_zone = 'Europe/Berlin', language = 'de' where id = pg_temp.uid('anna.weber@example.com');
do $$ begin
  assert (select time_zone from public.users where id = pg_temp.uid('anna.weber@example.com')) = 'Europe/Berlin', 'own time zone';
  begin
    update public.users set time_zone = 'Mars/Olympus' where id = pg_temp.uid('anna.weber@example.com');
    raise exception 'invalid zone accepted';
  exception when others then assert sqlerrm like '%Unknown time zone%', 'invalid zone refused: ' || sqlerrm; end;
  begin
    update public.users set short_code = 'AW' where id = pg_temp.uid('anna.weber@example.com');
    raise exception 'short code accepted';
  exception when others then assert sqlerrm like '%Only HR or an admin%', 'short code is HR only: ' || sqlerrm; end;
end $$;

-- HR (users.manage) sets the specs columns of somebody else
select pg_temp.act_as('hanna.richter@example.com');
update public.users set short_code = 'AW', joined_team_at = date '2020-01-02' where id = pg_temp.uid('anna.weber@example.com');
do $$ begin
  assert (select short_code from public.users where id = pg_temp.uid('anna.weber@example.com')) = 'AW', 'HR sets the short code';
  assert exists (select 1 from public.users_admin_overview where short_code = 'AW' and time_zone = 'Europe/Berlin'), 'overview carries the wide columns';
end $$;

-- Photo: decided by the literal users.photo.own
select pg_temp.act_as('anna.weber@example.com');
do $$ begin
  begin
    update public.users set photo_url = 'x.png' where id = pg_temp.uid('anna.weber@example.com');
    raise exception 'photo accepted without the literal';
  exception when others then assert sqlerrm like '%Only HR or an admin%', 'photo needs the literal: ' || sqlerrm; end;
end $$;
reset role;
insert into public.role_permissions (role_id, permission) select r.id, 'users.photo.own' from public.roles r where r.name = 'Workshop';
set local role authenticated;
select pg_temp.act_as('anna.weber@example.com');
update public.users set photo_url = 'x.png' where id = pg_temp.uid('anna.weber@example.com');
do $$ begin
  assert (select photo_url from public.users where id = pg_temp.uid('anna.weber@example.com')) = 'x.png', 'own photo with the literal';
  begin
    update public.users set photo_url = 'y.png', position = 'Boss' where id = pg_temp.uid('anna.weber@example.com');
    raise exception 'other column accepted';
  exception when others then assert sqlerrm like '%Only HR or an admin%', 'only the photo is free: ' || sqlerrm; end;
end $$;

select 'users_smoke: all checks passed' as result;
rollback;
