-- Copied from ~/maintenance_tool/supabase/tests/operating_instruction_import_smoke.sql with the renames and platform adaptations.
-- COMPASS app: bash tools/sql-test.sh compass <file>.
-- Operating instruction import (stage 2): docker exec -i supabase_db_maintenance-tool psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/operating_instruction_import_smoke.sql
-- Preview rolls back, new instructions, a new draft from a published version, translations, links, rights. Rolled back.
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = p_email), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema pg_temp to public;
begin;

create temp table t_ids (key text primary key, id uuid);
create temp table t_res (key text primary key, r jsonb);
grant all on t_ids, t_res to public;
insert into public.user_roles (user_id, role_id)
select (select id from public.users where email = 'sara.novak@example.com'), id from public.roles where name = 'Occupational safety' on conflict do nothing;
insert into public.training_types (name, validity_months) values ('Smoke import training', 12);
-- two assets of the same name in different places
insert into public.assets (id, name, team_id) select x.id::uuid, x.name, (select id from public.teams where name = 'Werkstatt')
from (values ('00000000-0000-7000-8000-00000000a001', 'Smoke Line A'), ('00000000-0000-7000-8000-00000000a002', 'Smoke Line B')) x (id, name);
insert into public.assets (id, parent_asset_id, name) values ('00000000-0000-7000-8000-00000000a011', '00000000-0000-7000-8000-00000000a001', 'Smoke Twin'),
  ('00000000-0000-7000-8000-00000000a012', '00000000-0000-7000-8000-00000000a002', 'Smoke Twin');

-- a published instruction to start from
select pg_temp.as_user('sara.novak@example.com');
insert into t_ids select 'oi', public.operating_instruction_create('substance', 'Import Smoke');
update public.operating_instruction_texts set sections = '{"scope": "<p>Alt</p>"}' where version_id = (select id from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi'));
select public.operating_instruction_submit((select id from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi')));
select public.operating_instruction_publish((select id from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi')));
insert into t_ids select 'v1', id from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi');
reset role;
create or replace function pg_temp.item(p jsonb) returns jsonb language sql as $$
  select jsonb_build_object('row', 2, 'instruction_id', (select id from t_ids where key = 'oi'), 'base_version_id', (select id from t_ids where key = 'v1')) || p
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.as_user('sara.novak@example.com');
-- preview: the outcome is reported, nothing stays, no number is taken
insert into t_res select 'preview', public.operating_instruction_import(jsonb_build_array(
  pg_temp.item('{"texts": {"de": {"title": "Import Smoke", "sections": {"scope": "<p>Neu</p>"}}}}'),
  '{"row": 4, "kind": "machine", "texts": {"de": {"title": "Neue Maschine"}}}'::jsonb), false);
do $$ begin
  assert (select r->0->>'result' from t_res where key = 'preview') = 'new_draft', '1 preview: a new draft';
  assert (select r->1->>'result' from t_res where key = 'preview') = 'created', '2 preview: created';
  assert (select r->1->>'number' from t_res where key = 'preview') is null, '3 preview takes no number';
  assert (select count(*) from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi')) = 1, '4 preview rolled back';
end $$;

-- apply
insert into t_res select 'apply', public.operating_instruction_import(jsonb_build_array(
  pg_temp.item('{"signs": {"hazards": ["GHS02"]}, "change_note": "Import", "texts": {"de": {"title": "Import Smoke", "sections": {"scope": "<p>Neu</p>"}}}, "training_types": ["Smoke import training"]}'),
  '{"row": 4, "kind": "machine", "signal_word": "danger", "legacy_number": "ALT-7", "texts": {"de": {"title": "Neue Maschine", "sections": {"scope": "<p>x</p>"}}, "en": {"title": "New machine"}}}'::jsonb), true);
do $$ begin
  assert (select r->0->>'result' from t_res where key = 'apply') = 'new_draft', '5 a new draft';
  assert (select status from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi') and version_no = 2) = 'draft', '6 never published';
  assert (select signs->'hazards'->>0 from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi') and version_no = 2) = 'GHS02', '7 signs set';
  assert (select t.sections->>'scope' from public.operating_instruction_texts t join public.operating_instruction_versions v on v.id = t.version_id
          where v.instruction_id = (select id from t_ids where key = 'oi') and v.version_no = 1 and t.language = 'de') = '<p>Alt</p>', '8 the published version is untouched';
  assert exists (select 1 from public.training_type_operating_instructions where instruction_id = (select id from t_ids where key = 'oi')), '9 training linked';
  assert (select r->1->>'result' from t_res where key = 'apply') = 'created' and (select r->1->>'number' from t_res where key = 'apply') is not null, '10 created with a number';
  assert (select v.signal_word from public.operating_instruction_versions v join public.operating_instructions i on i.id = v.instruction_id
          where i.number = (select (r->1->>'number')::int from t_res where key = 'apply')) is null, '11 no signal word on a machine';
  assert (select count(*) from public.operating_instruction_texts t join public.operating_instruction_versions v on v.id = t.version_id join public.operating_instructions i on i.id = v.instruction_id
          where i.number = (select (r->1->>'number')::int from t_res where key = 'apply')) = 2, '12 both languages';
  assert (select legacy_number from public.operating_instructions where number = (select (r->1->>'number')::int from t_res where key = 'apply')) = 'ALT-7', '12a old number of a new instruction';
end $$;

-- the old base is gone now: refused; the same file again with the draft as base: updated
do $$ begin
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item('{"texts": {"de": {"title": "X"}}}')), true))->0->>'result' = 'error', '13 stale base refused';
end $$;
insert into t_ids select 'v2', id from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi') and version_no = 2;
do $$ begin
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item(jsonb_build_object('base_version_id', (select id from t_ids where key = 'v2'), 'training_types', '[]'::jsonb))), true))->0->>'result' = 'updated', '14 links replaced';
  assert not exists (select 1 from public.training_type_operating_instructions where instruction_id = (select id from t_ids where key = 'oi')), '15 an empty list unlinks';
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item(jsonb_build_object('base_version_id', (select id from t_ids where key = 'v2'), 'assets', '["No such asset"]'::jsonb))), true))->0->>'message' like 'Unknown asset%', '16 unknown asset';
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item(jsonb_build_object('base_version_id', (select id from t_ids where key = 'v2'), 'assets', '["Smoke Twin"]'::jsonb))), true))->0->>'message' like 'Several assets%', '16a an ambiguous name is refused';
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item(jsonb_build_object('base_version_id', (select id from t_ids where key = 'v2'), 'assets', '["smoke line b/Smoke Twin", "Smoke Line A   /   Smoke Twin"]'::jsonb))), true))->0->>'result' = 'error', '16b the separator needs spaces';
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item(jsonb_build_object('base_version_id', (select id from t_ids where key = 'v2'), 'assets', '["smoke line b / Smoke Twin"]'::jsonb))), true))->0->>'result' = 'updated', '16c the path names one asset';
  assert (select array_agg(asset_id) from public.operating_instruction_assets where instruction_id = (select id from t_ids where key = 'oi') and asset_id is not null) = '{00000000-0000-7000-8000-00000000a012}', '16d the right twin';
end $$;
-- translations alone on the published version go there (approver), logged
delete from public.operating_instruction_versions where id = (select id from t_ids where key = 'v2');
do $$ begin
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item('{"texts": {"en": {"title": "Import smoke EN"}}}')), true))->0->>'result' = 'translation', '17 translation onto the published version';
  assert exists (select 1 from public.operating_instruction_texts where version_id = (select id from t_ids where key = 'v1') and language = 'en'), '18 English text on version 1';
  assert exists (select 1 from public.operating_instruction_log where version_id = (select id from t_ids where key = 'v1') and action = 'translation'), '19 logged';
end $$;
reset role;

-- a reader can neither create nor change
select pg_temp.as_user('ben.keller@example.com');
do $$ begin
  assert (public.operating_instruction_import('[{"row": 2, "kind": "machine", "texts": {"de": {"title": "Nein"}}}]'::jsonb, true))->0->>'result' = 'error', '20 a reader cannot create';
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item('{"texts": {"de": {"title": "Nein"}}}')), true))->0->>'result' = 'error', '21 a reader cannot write';
end $$;
reset role;

-- a changed note alone starts a draft (it belongs to a version)
select pg_temp.as_user('sara.novak@example.com');
do $$ begin
  assert (public.operating_instruction_import(jsonb_build_array(pg_temp.item('{"change_note": "Nur Notiz"}')), true))->0->>'result' = 'new_draft', '22 a note alone starts a draft';
  assert (select change_note from public.operating_instruction_versions where instruction_id = (select id from t_ids where key = 'oi') and status = 'draft') = 'Nur Notiz', '23 note stored';
end $$;
reset role;

select 'operating instruction import smoke: all checks passed';
rollback;
