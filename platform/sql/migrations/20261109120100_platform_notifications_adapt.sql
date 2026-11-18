-- Platform core, slice 3b: ADAPTATIONS of the copied notifications.
--   * notification types come from a registry (notification_types) instead of the hard-coded list in
--     switchable_notification_types(); a module registers its types, "switchable" ones can be muted by each user.
--   * notification_preferences keeps what is platform-wide (email_enabled, muted_types, quiet hours); COMPASS's task /
--     training / item reminder columns belong to those modules and come back with them.
--   * notifications gets NPM's email_claimed_at (the digest mail claims rows before sending).
create table public.notification_types (
  type text primary key,
  module text not null,
  switchable boolean not null default false,
  description text
);
alter table public.notification_types enable row level security;
create policy "Read notification types" on public.notification_types for select to authenticated using (true);
create policy mfa_required on public.notification_types as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
grant select on public.notification_types to authenticated, service_role;
grant all on public.notification_types to service_role;

create function public.notification_type_register(p_type text, p_module text, p_switchable boolean default false, p_description text default null)
  returns void language sql security definer set search_path to ''
  as $$ insert into public.notification_types (type, module, switchable, description) values (p_type, p_module, p_switchable, p_description)
        on conflict (type) do update set module = excluded.module, switchable = excluded.switchable, description = excluded.description; $$;
revoke all on function public.notification_type_register(text, text, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.notification_type_register(text, text, boolean, text) to service_role;

create or replace function public.switchable_notification_types() returns text[]
  language sql stable set search_path to ''
  as $$ select coalesce(array_agg(t.type order by t.type), '{}') from public.notification_types t where t.switchable $$;

alter table public.notification_preferences
  drop column remind_planned_today, drop column remind_due_soon, drop column remind_overdue, drop column due_soon_days,
  drop column remind_trainings, drop column remind_items;
alter table public.notifications add column email_claimed_at timestamp with time zone;

-- Types the platform itself sends (messaging module registers its own).
select public.notification_type_register('mention', 'platform', false, 'Somebody mentioned you');

-- Realtime: the bell updates live (both source apps publish notifications).
alter publication supabase_realtime add table public.notifications;
