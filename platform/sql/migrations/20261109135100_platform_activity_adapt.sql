-- Platform activity, part 2: ADAPTATIONS. One log, one concept (decision D5): COMPASS's named events are the base, NPM's
-- field-diff mechanism writes the event type "field_changed".
--   * activity_events gets NPM's updated_at (the merge window of log_field_changes).
--   * activity_events_immutable: events stay immutable, except a field_changed event that log_field_changes merges.
--   * log_field_changes() is NPM's function; the INSERT / UPDATE / SELECT of the merge now use event_type + metadata
--     {field, old, new, old_label, new_label} instead of the columns field, old_value, new_value, old_label, new_label.
--   * activity_label(kind, value): NPM's hard-coded CASE over tables becomes a registry (activity_label_sources).
--   * the CHECK on entity_type (a fixed list of COMPASS record types) becomes a registry check (check_entity_type_registered).
create function public.check_entity_type_registered() returns trigger
    language plpgsql security definer set search_path to ''
    as $$
begin
  if not exists (select 1 from public.entity_types where entity_type = new.entity_type) then
    raise exception 'Unknown record type %', new.entity_type;
  end if;
  return new;
end;
$$;
revoke all on function public.check_entity_type_registered() from public, anon, authenticated, service_role;
grant execute on function public.check_entity_type_registered() to service_role;
alter table public.activity_events drop constraint activity_events_entity_type_check;
create trigger activity_events_entity_type before insert on public.activity_events
  for each row execute function public.check_entity_type_registered();

alter table public.activity_events add column updated_at timestamp with time zone not null default now();
create index activity_events_field_idx on public.activity_events (entity_type, entity_id, ((metadata ->> 'field')), created_at desc)
  where event_type = 'field_changed';

CREATE OR REPLACE FUNCTION public.activity_events_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if old.event_type = 'field_changed' and new.event_type = 'field_changed' and current_setting('app.activity_merge', true) = '1' then
    return new;
  end if;
  raise exception 'System events are immutable';
end;
$$;

create table public.activity_label_sources (
  kind text primary key,
  table_name text not null check (table_name ~ '^[a-z_][a-z_0-9]*$'),
  label_expression text not null,
  module text not null
);
alter table public.activity_label_sources enable row level security;
create policy "Read label sources" on public.activity_label_sources for select to authenticated using (true);
create policy mfa_required on public.activity_label_sources as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
grant select on public.activity_label_sources to authenticated, service_role;
grant all on public.activity_label_sources to service_role;

-- A module registers the table a column points at: activity_label_register('products', 'products', 'name', 'specs').
-- label_expression is trusted SQL written in a migration (never user input).
create function public.activity_label_register(p_kind text, p_table text, p_expression text, p_module text) returns void
    language sql security definer set search_path to ''
    as $$ insert into public.activity_label_sources (kind, table_name, label_expression, module) values (p_kind, p_table, p_expression, p_module)
          on conflict (kind) do update set table_name = excluded.table_name, label_expression = excluded.label_expression, module = excluded.module; $$;
revoke all on function public.activity_label_register(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.activity_label_register(text, text, text, text) to service_role;

CREATE FUNCTION public.activity_label(p_kind text, p_value text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_source public.activity_label_sources;
  v_label text;
begin
  if p_value is null or p_kind is null then
    return null;
  end if;
  select * into v_source from public.activity_label_sources where kind = p_kind;
  if v_source.kind is null then
    return null;
  end if;
  execute format('select %s from public.%I where id = $1', v_source.label_expression, v_source.table_name) into v_label using p_value::uuid;
  return v_label;
end;
$$;
REVOKE ALL ON FUNCTION public.activity_label(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.activity_label(text, text) TO service_role;

select public.activity_label_register('users', 'users', 'coalesce(name, email)', 'platform');
select public.activity_label_register('teams', 'teams', 'name', 'platform');
select public.activity_label_register('phrases', 'phrases', 'text_en', 'platform');

-- log_field_changes(entity_type, 'column[=kind]', '!column', ...): copied from NPM, see the header for the three changes.
CREATE FUNCTION public.log_field_changes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  c_window constant interval := interval '10 minutes';
  v_entity_type text := tg_argv[0];
  v_user uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_arg text;
  v_field text;
  v_kind text;
  v_no_merge boolean;
  v_old_value text;
  v_new_value text;
  v_last public.activity_events%rowtype;
  i int;
begin
  if tg_op = 'DELETE' then
    delete from public.activity_events where entity_type = v_entity_type and entity_id = old.id;
    return old;
  end if;

  if v_user is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);

  for i in 1 .. coalesce(array_length(tg_argv, 1), 0) - 1 loop
    v_arg := tg_argv[i];
    v_no_merge := left(v_arg, 1) = '!';
    if v_no_merge then
      v_arg := substr(v_arg, 2);
    end if;
    v_field := split_part(v_arg, '=', 1);
    v_kind := nullif(split_part(v_arg, '=', 2), '');
    -- '' counts as empty; a column holding the record's own id counts as empty too (companies store "no group"
    -- as group_company_id = own id); numbers compare by value (1000 = 1000.0).
    v_old_value := nullif(v_old ->> v_field, '');
    v_new_value := nullif(v_new ->> v_field, '');
    if v_old_value = old.id::text then v_old_value := null; end if;
    if v_new_value = new.id::text then v_new_value := null; end if;
    if v_old_value is not distinct from v_new_value then
      continue;
    end if;
    if jsonb_typeof(v_old -> v_field) = 'number' and jsonb_typeof(v_new -> v_field) = 'number'
       and v_old_value::numeric = v_new_value::numeric then
      continue;
    end if;

    v_last := null;
    if not v_no_merge then
      select * into v_last
      from public.activity_events e
      where e.entity_type = v_entity_type and e.entity_id = new.id and e.event_type = 'field_changed' and e.metadata ->> 'field' = v_field
      order by e.created_at desc, e.id desc
      limit 1;
    end if;

    if v_last.id is not null and v_last.author_user_id is not distinct from v_user and v_last.updated_at > now() - c_window then
      if (v_last.metadata ->> 'old') is not distinct from v_new_value then
        delete from public.activity_events where id = v_last.id;
      else
        perform set_config('app.activity_merge', '1', true);
        update public.activity_events
        set metadata = metadata || jsonb_build_object('new', v_new_value, 'new_label', public.activity_label(v_kind, v_new_value)),
            updated_at = now()
        where id = v_last.id;
        perform set_config('app.activity_merge', '', true);
      end if;
    else
      insert into public.activity_events (entity_type, entity_id, author_user_id, event_type, metadata)
      values (v_entity_type, new.id, v_user, 'field_changed',
              jsonb_build_object('field', v_field, 'old', v_old_value, 'new', v_new_value,
                                 'old_label', public.activity_label(v_kind, v_old_value), 'new_label', public.activity_label(v_kind, v_new_value)));
    end if;
  end loop;

  return new;
end;
$$;
REVOKE ALL ON FUNCTION public.log_field_changes() FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.log_field_changes() TO service_role;

alter publication supabase_realtime add table public.activity_events;
