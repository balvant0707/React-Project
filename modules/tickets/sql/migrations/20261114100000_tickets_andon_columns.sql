-- Andon support for the ticket queues (kiosk board on the shopfloor PCs). New in the platform, no source app: COMPASS and the
-- NPM tool have nothing like it. Names approved by the user on 2026-11-14.
--
-- ticket_types.group_key        optional cluster for the kiosk (two-step choice later, and analysis by group); no table of its own
-- ticket_types.default_priority priority a ticket of this type starts with (drives the light colour); null = the ticket's own default
-- ticket_types.public_report    opt-in: the no-login QR page offers this type (default off). The public page may only learn the key
--                               and name of such types; everything else stays private.
-- (The kiosk shows every active type of the queue its device user may create in; there is no per-type kiosk flag.)
-- tickets.acknowledged_at       first time somebody took the ticket (response time = acknowledged_at - created_at); set by the
--                               database, never by a client; history before this migration stays null

alter table public.ticket_types
  add column group_key text,
  add column default_priority text,
  add column public_report boolean not null default false,
  add constraint ticket_types_group_key_check check (group_key is null or group_key ~ '^[a-z][a-z0-9_]*$'),
  add constraint ticket_types_default_priority_check check (default_priority is null or default_priority in ('low', 'normal', 'high', 'urgent'));

alter table public.tickets add column acknowledged_at timestamp with time zone;

-- Acknowledged = the ticket leaves "open" or gets a person assigned, whichever comes first. It is never cleared (a reopened
-- ticket keeps its first response time) and a client cannot set it: an insert starts without, an update keeps the stored value.
create function public.tickets_set_acknowledged() returns trigger
  language plpgsql
  set search_path to ''
  as $$
begin
  if tg_op = 'INSERT' then
    new.acknowledged_at := null;
  elsif old.acknowledged_at is not null then
    new.acknowledged_at := old.acknowledged_at;
  elsif new.status <> 'open' or new.assigned_user_id is not null then
    new.acknowledged_at := now();
  else
    new.acknowledged_at := null;
  end if;
  return new;
end;
$$;

alter function public.tickets_set_acknowledged() owner to postgres;
revoke all on function public.tickets_set_acknowledged() from public, anon, authenticated, service_role;
grant all on function public.tickets_set_acknowledged() to service_role;

create trigger tickets_set_acknowledged before insert or update on public.tickets
  for each row execute function public.tickets_set_acknowledged();

-- The overview gets the two new fields at its end (a view can only grow at the end); the rest is unchanged from
-- 20261112120000_tickets.sql.
create or replace view public.tickets_overview with (security_invoker = 'on') as
 select k.id,
    k.ticket_number,
    k.asset_id,
    k.type,
    k.status,
    k.priority,
    k.title,
    k.description,
    k.source,
    k.reporter_user_id,
    k.reporter_name,
    k.reporter_contact,
    k.client_request_id,
    k.assigned_team_id,
    k.assigned_user_id,
    k.created_at,
    k.updated_at,
    k.created_by_user_id,
    k.updated_by_user_id,
    k.resolved_at,
    k.queue_id,
    q.key as queue_key,
    q.name as queue_name,
    tt.name as type_name,
    a.name as asset_name,
    coalesce(ru.name, ru.email, k.reporter_name) as reporter_display_name,
    au.name as assigned_user_name,
    g.name as assigned_team_name,
    tk.id as task_id,
    tk.task_number,
    q.name_de as queue_name_de,
    tt.name_de as type_name_de,
    k.acknowledged_at,
    tt.group_key as type_group_key
   from (((((((public.tickets k
     join public.ticket_queues q on ((q.id = k.queue_id)))
     left join public.ticket_types tt on (((tt.queue_id = k.queue_id) and (tt.key = k.type))))
     left join public.assets a on ((a.id = k.asset_id)))
     left join public.users ru on ((ru.id = k.reporter_user_id)))
     left join public.users au on ((au.id = k.assigned_user_id)))
     left join public.teams g on ((g.id = k.assigned_team_id)))
     left join public.tasks tk on ((tk.ticket_id = k.id)));
