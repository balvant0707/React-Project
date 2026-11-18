-- Hull events and newbuilding projects have a label (entity_label / conversation_label): the title of their conversation. Rolled back.
begin;
do $$
declare v_he uuid; v_np uuid; v_label text;
begin
  select id into v_he from public.hull_events limit 1;
  if v_he is not null then
    v_label := public.entity_label('hull_events', v_he);
    assert v_label is not null and v_label like '% · %', 'hull event label: ' || coalesce(v_label, 'null');
  end if;
  select id into v_np from public.newbuilding_projects limit 1;
  if v_np is not null then
    assert public.entity_label('newbuilding_projects', v_np) = (select title from public.newbuilding_projects where id = v_np), 'newbuilding label is its title';
  end if;
  assert (select label_function from public.entity_types where entity_type = 'hull_events') = 'hull_events_label', 'registered';
end $$;
select 'entity_labels_smoke: all checks passed' as result;
rollback;
