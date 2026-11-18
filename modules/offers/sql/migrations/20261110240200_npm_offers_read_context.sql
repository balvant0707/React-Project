-- Read policies with the caller's rights read once per statement (platform 20261110240000).
drop policy "View handovers per record" on public.handovers;
create policy "View handovers per record" on public.handovers for select to authenticated
  using (public.can_access_entity_ctx(entity_type, entity_id, 'view', (select public.access_context())));

drop policy "View transports per record" on public.transports;
create policy "View transports per record" on public.transports for select to authenticated
  using (public.can_access_entity_ctx(case when order_id is not null then 'orders' else 'specifications' end,
                                      coalesce(order_id, specification_id), 'view', (select public.access_context())));
