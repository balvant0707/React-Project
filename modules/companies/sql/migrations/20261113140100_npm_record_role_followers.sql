-- NPM's role followers on the platform. In the NPM tool the responsible person and the salesperson of an offer / order and
-- the salesperson of a hull event or company received every note on it, computed on each message
-- (20261024260000_thread_follow_rules.sql, record_role_followers). The platform keeps followers as conversation participants:
-- the record types name theirs through a follower function (entity_followers, read when the conversation starts) and add a
-- new role holder through the trigger below. NEW (hand-written).
--
-- conversation_join_people: adds people to a record's conversation when it exists. Somebody already in it keeps their level
-- (a mute stays a mute, as NPM left muted people out). Also the backfill used by the RADAR data port (2026-11-14, not in this repo).
create function public.conversation_join_people(p_anchor_type text, p_anchor_id uuid, p_users uuid[])
returns void
language sql
security definer set search_path to ''
as $$
  insert into public.conversation_participants (conversation_id, user_id)
  select c.id, u from public.conversations c, unnest(p_users) u
  where c.kind = 'record' and c.anchor_type = p_anchor_type and c.anchor_id = p_anchor_id and u is not null
    and exists (select 1 from public.users x where x.id = u)
  on conflict (conversation_id, user_id) do nothing;
$$;
revoke all on function public.conversation_join_people(text, uuid, uuid[]) from public, anon, authenticated;

-- Trigger: the role columns named in the trigger arguments; a new holder joins the record's conversation. The previous
-- holder stays (they may have taken part; NPM's hand_over mutes the one handing over).
create function public.conversations_join_record_roles()
returns trigger
language plpgsql
security definer set search_path to ''
as $$
declare
  v_users uuid[] := '{}';
  v_col text;
  v_new uuid;
begin
  foreach v_col in array tg_argv loop
    v_new := (to_jsonb(new) ->> v_col)::uuid;
    if v_new is distinct from (to_jsonb(old) ->> v_col)::uuid then
      v_users := v_users || v_new;
    end if;
  end loop;
  if array_length(v_users, 1) is not null then
    perform public.conversation_join_people(tg_table_name, new.id, v_users);
  end if;
  return null;
end;
$$;
revoke all on function public.conversations_join_record_roles() from public, anon, authenticated;
