-- Labels of hull events and newbuilding projects (entity_label(), used by conversation_label(): the title of a record's
-- conversation on the Messages page and in notifications). They were registered without one, so those titles were empty.
-- Same shape as vessels_label().
create function public.hull_events_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$
  select coalesce(v.name, h.snapshot_vessel_name, '?') || ' · ' || h.type_code || ' · ' || to_char(h.event_date, 'DD.MM.YYYY')
  from public.hull_events h left join public.vessels v on v.id = h.vessel_id where h.id = p_entity_id; $$;
create function public.newbuilding_projects_label(p_entity_id uuid) returns text
  language sql stable security definer set search_path to '' as $$ select p.title from public.newbuilding_projects p where p.id = p_entity_id; $$;
revoke all on function public.hull_events_label(uuid), public.newbuilding_projects_label(uuid) from public, anon, authenticated;
grant execute on function public.hull_events_label(uuid), public.newbuilding_projects_label(uuid) to authenticated, service_role;
update public.entity_types set label_function = 'hull_events_label' where entity_type = 'hull_events';
update public.entity_types set label_function = 'newbuilding_projects_label' where entity_type = 'newbuilding_projects';
select public.entity_types_rebuild();
