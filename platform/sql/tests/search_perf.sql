-- New timing test for search (rolled back). 150,000 comments in 6,000 record conversations, 30,000 files, 20,000 people;
-- the caller may read half of the records. Timed as role authenticated (row policies and leakproof statistics matter, see the
-- NPM CLAUDE.md "List performance rules"). Prints milliseconds per call; the budget is 350 ms for global_search and 250 ms for
-- search_messages on a warm cache. Run: tools/sql-test.sh compass platform/sql/tests/search_perf.sql
begin;
set local session_replication_role = replica;

create function public.perf_rec_row_allows(p_action text, p_id uuid, p_ctx public.access_context) returns boolean
  language sql stable as $$ select (('x' || substr(p_id::text, 1, 2))::bit(16)::int % 2) = 0 $$;
select public.entity_type_register('perf_rec', 'perf', 'perf_rec_row_allows');

insert into public.conversations (kind, anchor_type, anchor_id, message_count, created_by_user_id)
  select 'record', 'perf_rec', gen_random_uuid(), 25, null from generate_series(1, 6000);
insert into public.messages (conversation_id, author_user_id, body, created_at)
  select c.id, null,
         (array['The hydraulic pump leaks again', 'Please check the bearing on line ', 'Delivered the spare filters today', 'Waiting for approval of the order',
                'Operator reports noise from the gearbox', 'Cleaning done, nothing found', 'Gasket replaced, test run ok'])[1 + (g % 7)] || ' ' || g,
         now() - (g % 300) * interval '1 day'
  from public.conversations c, generate_series(1, 25) g where c.anchor_type = 'perf_rec';
insert into public.attachments (entity_type, entity_id, storage_path, file_name, uploaded_by_user_id)
  select 'perf_rec', c.anchor_id, 'perf_rec/' || c.anchor_id || '/' || g || '.pdf', 'drawing-' || g || '-' || left(c.id::text, 6) || '.pdf', (select id from public.users limit 1)
  from public.conversations c, generate_series(1, 5) g where c.anchor_type = 'perf_rec';
insert into public.users (username, name, has_login, email)
  select 'perf.user' || g, 'Perf User ' || g || ' Mustermann', false, null from generate_series(1, 20000) g;
analyze public.messages; analyze public.conversations; analyze public.attachments; analyze public.users;
set local session_replication_role = origin;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', (select id from public.users where email = 'anna.weber@example.com'), 'role', 'authenticated', 'aal', 'aal2')::text, true);

do $$
declare
  t0 timestamptz; v_ms numeric; v_rows integer; v_term text;
  v_terms text[] := array['gasket', 'hydraulic', 'bearing line 1', 'Mustermann', 'drawing', 'zzzzzz'];
begin
  foreach v_term in array v_terms loop
    t0 := clock_timestamp();
    select count(*) into v_rows from public.search_messages(v_term, false);
    v_ms := extract(milliseconds from clock_timestamp() - t0);
    raise notice 'search_messages(%): % ms, % rows', v_term, round(v_ms), v_rows;
    t0 := clock_timestamp();
    select count(*) into v_rows from public.global_search(v_term);
    v_ms := extract(milliseconds from clock_timestamp() - t0);
    raise notice 'global_search(%): % ms, % rows', v_term, round(v_ms), v_rows;
  end loop;
end $$;
rollback;
