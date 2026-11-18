-- apps: compass
-- New test: global_search() with registered sources, comments with access checks, documents, people.
-- One transaction, rolled back.
begin;

create function public.smoke_rec_row_allows(p_action text, p_id uuid, p_ctx public.access_context) returns boolean
  language sql stable as $$ select (p_ctx).user_id = (select id from public.users where email = 'anna.weber@example.com') $$;
create function public.smoke_rec_label(p_id uuid) returns text language sql stable as $$ select '#7 Smoke record' $$;
select public.entity_type_register('smoke_rec', 'smoke', 'smoke_rec_row_allows', p_label_function => 'smoke_rec_label');

create function public.smoke_search_source(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable as $$
  select row('smoke_things', gen_random_uuid(), 1::real, 7::bigint, 'Smoke thing ' || p_term, null, null, null, null, null, null, now(), null)::public.search_hit
$$;
grant execute on function public.smoke_search_source(text, boolean, bigint) to authenticated;
select public.search_source_register('smoke_things', 'smoke', 'smoke_search_source');

create temp table ids as select (select id from public.users where email = 'anna.weber@example.com') as anna,
                                (select id from public.users where email = 'ben.keller@example.com') as ben,
                                gen_random_uuid() as rec;
grant select on ids to public;

insert into public.conversations (kind, anchor_type, anchor_id) select 'record', 'smoke_rec', rec from ids;
insert into public.messages (conversation_id, author_user_id, body)
  select c.id, (select anna from ids), 'The hydraulic gasket leaks again' from public.conversations c where c.anchor_type = 'smoke_rec';
insert into public.attachments (entity_type, entity_id, storage_path, file_name, uploaded_by_user_id)
  select 'smoke_rec', rec, 'smoke_rec/' || rec || '/gasket-drawing.pdf', 'gasket-drawing.pdf', anna from ids;

set local role authenticated;

-- anna may read the record: sees the comment, the document with the record's label, the registered source and herself
select set_config('request.jwt.claims', json_build_object('sub', (select anna from ids), 'role', 'authenticated', 'aal', 'aal2')::text, true);
do $$ begin
  assert exists (select 1 from public.global_search('gasket') where entity_type = 'comments' and parent_title = '#7 Smoke record'), 'comment found with the record label';
  assert exists (select 1 from public.global_search('gasket') where entity_type = 'documents' and parent_title = '#7 Smoke record'), 'document found';
  assert exists (select 1 from public.global_search('gasket') where entity_type = 'smoke_things'), 'registered source is called';
  assert exists (select 1 from public.global_search('anna') where entity_type = 'people'), 'people found';
  assert not exists (select 1 from public.global_search('x')), 'one letter is no search';
end $$;

-- ben may not read the record: the comment is not found (access is checked for the hit)
select set_config('request.jwt.claims', json_build_object('sub', (select ben from ids), 'role', 'authenticated', 'aal', 'aal2')::text, true);
do $$ begin
  assert not exists (select 1 from public.global_search('gasket') where entity_type = 'comments'), 'no comment without access';
  assert exists (select 1 from public.global_search('gasket') where entity_type = 'smoke_things'), 'sources answer for everybody (they check access themselves)';
end $$;

-- the sources can be changed: unregistering by re-registering another function
reset role;
create function public.smoke_search_source2(p_term text, p_fuzzy boolean, p_number bigint) returns setof public.search_hit
  language sql stable as $$ select * from (select null::public.search_hit) x where false $$;
grant execute on function public.smoke_search_source2(text, boolean, bigint) to authenticated;
select public.search_source_register('smoke_things', 'smoke', 'smoke_search_source2');
do $$ begin
  assert not exists (select 1 from public.search_source_hits('q', true, null) where entity_type = 'smoke_things'), 're-register replaces the function';
end $$;

select 'search_smoke: all checks passed' as result;
rollback;
