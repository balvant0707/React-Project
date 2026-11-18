-- replace_dock_report_children wrote into areas of other dock reports (security scan 2026-11-11): the upsert
-- `on conflict (id) do update` took any area id from the payload, so a caller with edit rights on one report could
-- overwrite another report's area by sending that area's id (the row stayed with the other report) and then delete
-- that area's coat lines. Copied 1:1 from 20261110160000_npm_dock_reports.sql (originally the NPM tool's function);
-- the only change: the update is limited to areas of p_dock_report_id, and an area id of another report is refused
-- before anything of that area is touched.
CREATE OR REPLACE FUNCTION public.replace_dock_report_children(p_dock_report_id uuid, p_areas jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_area jsonb;
  v_area_id uuid;
  v_area_product jsonb;
  v_area_product_id uuid;
  v_kept_ids uuid[];
begin
  if not public.can_access_entity('dock_reports', p_dock_report_id, 'edit') then
    raise exception 'Not authorized to edit dock report %', p_dock_report_id;
  end if;

  select coalesce(array_agg((a->>'id')::uuid), array[]::uuid[])
  into v_kept_ids
  from jsonb_array_elements(p_areas) a;

  delete from public.dock_report_areas
  where dock_report_id = p_dock_report_id
    and id != all (v_kept_ids);

  for v_area in select * from jsonb_array_elements(p_areas)
  loop
    v_area_id := (v_area->>'id')::uuid;

    insert into public.dock_report_areas (
      id, dock_report_id, area_id, size_m2, substrate_phrase_id, environment_standard_phrase_id,
      surface_preparation_text, actual_surface_preparation_text, remarks_text,
      fouling_extent_pct, fouling_evaluation_phrase_id, condition_comments_text
    ) values (
      v_area_id,
      p_dock_report_id,
      (v_area->>'area_id')::uuid, (v_area->>'size_m2')::numeric, (v_area->>'substrate_phrase_id')::uuid,
      (v_area->>'environment_standard_phrase_id')::uuid,
      v_area->>'surface_preparation_text', v_area->>'actual_surface_preparation_text', v_area->>'remarks_text',
      (v_area->>'fouling_extent_pct')::numeric, (v_area->>'fouling_evaluation_phrase_id')::uuid, v_area->>'condition_comments_text'
    )
    on conflict (id) do update set
      area_id = excluded.area_id,
      size_m2 = excluded.size_m2,
      substrate_phrase_id = excluded.substrate_phrase_id,
      environment_standard_phrase_id = excluded.environment_standard_phrase_id,
      surface_preparation_text = excluded.surface_preparation_text,
      actual_surface_preparation_text = excluded.actual_surface_preparation_text,
      remarks_text = excluded.remarks_text,
      fouling_extent_pct = excluded.fouling_extent_pct,
      fouling_evaluation_phrase_id = excluded.fouling_evaluation_phrase_id,
      condition_comments_text = excluded.condition_comments_text
    where public.dock_report_areas.dock_report_id = p_dock_report_id;
    if not found then
      raise exception 'Area % does not belong to dock report %', v_area_id, p_dock_report_id;
    end if;

    delete from public.dock_report_area_products where dock_report_area_id = v_area_id;

    -- A coat line with no product picked yet is a placeholder (see
    -- specifications/areasEditor.tsx's own comment) - product_packaging_id
    -- is not null on this table, so it's never sent to begin with.
    for v_area_product in
      select * from jsonb_array_elements(v_area->'products') p
      where p->>'product_packaging_id' is not null
    loop
      insert into public.dock_report_area_products (
        dock_report_area_id, product_packaging_id, coat_mode_phrase_id, coat_pct, application_method_phrase_id,
        dry_film_thickness_um, measured_dry_film_thickness_um
      ) values (
        v_area_id,
        (v_area_product->>'product_packaging_id')::uuid, (v_area_product->>'coat_mode_phrase_id')::uuid,
        (v_area_product->>'coat_pct')::numeric, (v_area_product->>'application_method_phrase_id')::uuid,
        (v_area_product->>'dry_film_thickness_um')::numeric, (v_area_product->>'measured_dry_film_thickness_um')::numeric
      )
      returning id into v_area_product_id;

      insert into public.dock_report_area_product_batches (
        dock_report_area_product_id, batch_number, drum_quantity, consumption_date
      )
      select v_area_product_id, b->>'batch_number', (b->>'drum_quantity')::numeric, (b->>'consumption_date')::date
      from jsonb_array_elements(coalesce(v_area_product->'batches', '[]'::jsonb)) as b;
    end loop;
  end loop;
end;
$$;
