-- Platform messaging, part 2: ADAPTATIONS of the copied COMPASS messaging. Every function below is the copied one with the
-- listed change; hand-written pieces are marked NEW.
--   conversation_access   record_moderator() (hard-coded per record type) -> user_has_access(..., 'moderate'): a module answers
--                         the action 'moderate' in its own access function.
--   conversation_label    the per-type CASE for record conversations -> entity_label() from the registry.
--   conversation_team     the per-type CASE -> entity_team() from the registry.
--   message_excerpt       the task-card token ([[task:uuid]]) is not rewritten here; the tasks module brings it back.
--   messages_c_notify     NEW generic: record comments go to the conversation's participants (followers), filtered by access.
--   NEW                   record_follow(), entity type "teams", notification types.


CREATE OR REPLACE FUNCTION public.conversation_access(p_user_id uuid, p_conversation_id uuid, p_action text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conversation public.conversations;
begin
  if p_user_id is null then
    return false;
  end if;
  select * into v_conversation from public.conversations where id = p_conversation_id;
  if v_conversation.id is null or v_conversation.deleted_at is not null then
    return false;
  end if;
  if v_conversation.kind in ('direct', 'group') then
    if p_action = 'moderate' then
      return false;
    end if;
    if not exists (select 1 from public.conversation_participants where conversation_id = p_conversation_id and user_id = p_user_id) then
      return false;
    end if;
    -- Reading stays for good; writing stops when the other person can no longer sign in (left, locked, login removed).
    if p_action = 'post' and v_conversation.kind = 'direct' then
      return not exists (
        select 1 from public.conversation_participants p join public.users u on u.id = p.user_id
        where p.conversation_id = p_conversation_id and p.user_id <> p_user_id
          and (not u.has_login or u.has_left or u.locked_at is not null));
    end if;
    return true;
  end if;
  if p_action = 'moderate' then
    -- A record conversation is moderated by holders of the record module's edit.all (admin limits, decision 4); a post
    -- by whoever moderates its group (grant 'edit' on a group: an owner or a holder of messages.edit).
    if v_conversation.kind = 'post' then
      return public.user_has_access(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'edit');
    end if;
    return public.user_has_access(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'moderate');
  end if;
  return public.user_has_access(p_user_id, v_conversation.anchor_type, v_conversation.anchor_id,
                                case when p_action = 'view' then 'view' else 'check' end);
end;
$$;

CREATE OR REPLACE FUNCTION public.conversation_label(p_conversation_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case
    when c.kind = 'record' then coalesce(public.entity_label(c.anchor_type, c.anchor_id), c.title)
    when c.kind = 'post' then coalesce(nullif(btrim(c.title), ''),
      (select public.message_excerpt(m.body, 60) from public.messages m where m.id = c.first_message_id))
    when c.kind = 'direct' then (
      select string_agg(coalesce(u.name, u.email), ', ' order by u.name)
      from public.conversation_participants p join public.users u on u.id = p.user_id
      where p.conversation_id = c.id and (p.user_id is distinct from auth.uid() or auth.uid() is null))
    else coalesce(nullif(btrim(c.title), ''), (
      select string_agg(n, ', ' order by n) || case when max(total) > 4 then ' +' || (max(total) - 4) else '' end
      from (
        select coalesce(u.name, u.email) as n, count(*) over () as total, row_number() over (order by u.name) as rn
        from public.conversation_participants p join public.users u on u.id = p.user_id
        where p.conversation_id = c.id and (p.user_id is distinct from auth.uid() or auth.uid() is null)
      ) x where rn <= 4))
  end
  from public.conversations c where c.id = p_conversation_id;
$$;

CREATE OR REPLACE FUNCTION public.conversation_team(p_anchor_type text, p_anchor_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.entity_team(p_anchor_type, p_anchor_id); $$;

CREATE OR REPLACE FUNCTION public.message_excerpt(p_body text, p_length integer) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_text text := coalesce(p_body, '');
  v_match text[];
begin
  for v_match in select regexp_matches(v_text, '@\[user:([0-9a-fA-F-]{36})\]', 'g') loop
    v_text := replace(v_text, '@[user:' || v_match[1] || ']',
                      '@' || coalesce((select coalesce(name, email) from public.users where id = v_match[1]::uuid), '…'));
  end loop;
  -- A team mention (20261120130000_team_mentions.sql) shows the group's name.
  for v_match in select regexp_matches(v_text, '@\[team:([0-9a-fA-F-]{36})\]', 'g') loop
    v_text := replace(v_text, '@[team:' || v_match[1] || ']',
                      '@' || coalesce((select name from public.teams where id = v_match[1]::uuid), '…'));
  end loop;
  -- Block tags separate words, inline tags (<strong>, <a>) do not.
  v_text := regexp_replace(v_text, '</?(p|br|li|ul|ol|div|h[1-6]|blockquote)\b[^>]*>', ' ', 'gi');
  v_text := btrim(regexp_replace(regexp_replace(v_text, '<[^>]*>', '', 'g'), '\s+', ' ', 'g'));
  return left(v_text, p_length);
end;
$$;

-- NEW: record comments. The recipients are the people following the record's conversation (conversation_participants:
-- taking part, level "all"), not computed from the record. The module that owns the record keeps the followers (assignee,
-- creator, ...) through record_follow(). Nobody is told about a record they may no longer see.
CREATE OR REPLACE FUNCTION public.messages_c_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_conversation public.conversations;
  v_recipients uuid[];
  v_title text;
  v_author text;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;
  if v_conversation.kind <> 'record' then
    return null;
  end if;
  v_title := public.conversation_label(v_conversation.id);
  v_recipients := array(
    select p.user_id from public.conversation_participants p join public.users u on u.id = p.user_id
    where p.conversation_id = v_conversation.id and p.taking_part and p.level = 'all'
      and p.user_id is distinct from new.author_user_id
      and u.has_login and not u.has_left and u.locked_at is null
      and not exists (select 1 from public.message_mentions where message_id = new.id and mentioned_user_id = p.user_id)
      and public.user_has_access(p.user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'view')
  );
  if array_length(v_recipients, 1) is null then
    return null;
  end if;
  select coalesce(name, email, 'Someone') into v_author from public.users where id = new.author_user_id;
  perform public.notify(
    v_recipients, 'comment', coalesce(v_author, 'Someone') || ' commented on ' || coalesce(v_title, 'a record'),
    '/' || v_conversation.anchor_type || '/' || v_conversation.anchor_id,
    public.message_excerpt(new.body, 140),
    new.author_user_id, v_conversation.anchor_type, v_conversation.anchor_id, 'comment:' || v_conversation.anchor_id,
    array['in_app'], jsonb_build_object('actor_name', v_author, 'entity_title', v_title));
  return null;
end;
$$;

-- conversation_get_or_create: copied; the per-type CASE for the first participants (tasks, tickets) is entity_followers().
CREATE FUNCTION public.conversation_get_or_create(p_anchor_type text, p_anchor_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.user_has_access(auth.uid(), p_anchor_type, p_anchor_id, 'check') then
    raise exception 'You cannot write here';
  end if;
  select id into v_id from public.conversations where kind = 'record' and anchor_type = p_anchor_type and anchor_id = p_anchor_id;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.conversations (kind, anchor_type, anchor_id, team_id)
  values ('record', p_anchor_type, p_anchor_id, public.conversation_team(p_anchor_type, p_anchor_id))
  on conflict (anchor_type, anchor_id) where kind = 'record' do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.conversations where kind = 'record' and anchor_type = p_anchor_type and anchor_id = p_anchor_id;
    return v_id;
  end if;
  -- The people the record is about (entity_followers) take part from the start; later changes
  -- are the owning module's business (record_follow).
  insert into public.conversation_participants (conversation_id, user_id)
  select v_id, u from unnest(public.entity_followers(p_anchor_type, p_anchor_id)) u
  where u is not null and exists (select 1 from public.users x where x.id = u)
  on conflict do nothing;
  return v_id;
end;
$$;
REVOKE ALL ON FUNCTION public.conversation_get_or_create(text, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.conversation_get_or_create(text, uuid) TO authenticated, service_role;

-- NEW: a module makes somebody follow a record (creates the record's conversation when it does not exist yet).
-- p_level: 'all' (told about every comment), 'mentions' (only when mentioned), 'mute'. Following never gives access.
CREATE FUNCTION public.record_follow(p_anchor_type text, p_anchor_id uuid, p_user_id uuid, p_level text DEFAULT 'all') RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_id uuid;
begin
  select id into v_id from public.conversations where kind = 'record' and anchor_type = p_anchor_type and anchor_id = p_anchor_id;
  if v_id is null then
    insert into public.conversations (kind, anchor_type, anchor_id) values ('record', p_anchor_type, p_anchor_id)
    on conflict do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.conversations where kind = 'record' and anchor_type = p_anchor_type and anchor_id = p_anchor_id;
    end if;
  end if;
  insert into public.conversation_participants (conversation_id, user_id, level)
  values (v_id, p_user_id, p_level)
  on conflict (conversation_id, user_id) do update set level = excluded.level, taking_part = (excluded.level <> 'mute');
end;
$$;
REVOKE ALL ON FUNCTION public.record_follow(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.record_follow(text, uuid, uuid, text) TO service_role;

-- NEW: the access function of the entity type "teams" (team posts): COMPASS user_has_access() branch 'groups'.
CREATE FUNCTION public.teams_access(p_user_id uuid, p_entity_id uuid, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.team_message_access(p_user_id, p_entity_id,
                   case p_action when 'view' then 'view' when 'check' then 'comment' else 'moderate' end); $$;
-- ... and of "conversations" (COMPASS: conversation_access with view / post).
CREATE FUNCTION public.conversations_access(p_user_id uuid, p_entity_id uuid, p_action text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ select public.conversation_access(p_user_id, p_entity_id, case when p_action = 'view' then 'view' else 'post' end); $$;
REVOKE ALL ON FUNCTION public.teams_access(uuid, uuid, text), public.conversations_access(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON FUNCTION public.teams_access(uuid, uuid, text), public.conversations_access(uuid, uuid, text) TO service_role;
select public.entity_type_register('teams', 'messaging', 'teams_access', null, 'Team posts');
select public.entity_type_register('conversations', 'messaging', 'conversations_access', null, 'Chats');

-- NEW: notification types of messaging (the switchable ones are the list COMPASS hard-coded).
select public.notification_type_register('comment', 'messaging', true, 'Comment on a record you follow');
select public.notification_type_register('team_post', 'messaging', true, 'New post in a team');
select public.notification_type_register('team_comment', 'messaging', true, 'Comment on a team post');
select public.notification_type_register('direct_message', 'messaging', true, 'Direct or group chat message');
select public.notification_type_register('reaction', 'messaging', true, 'Reaction to your message');
select public.notification_type_register('message', 'messaging', false, 'Message');

-- Realtime (both source apps publish these).
alter publication supabase_realtime add table public.conversations, public.messages;

-- Team photos (COMPASS bucket group-photos, renamed team-photos): copied from the COMPASS database.
insert into storage.buckets (id, name, public, file_size_limit) values ('team-photos', 'team-photos', false, 1048576)
  on conflict (id) do nothing;
create policy "Read team photos" on storage.objects for select to authenticated using (bucket_id = 'team-photos');
create policy "Owners write team photos" on storage.objects for all to authenticated
  using (bucket_id = 'team-photos' and public.team_photo_editable((storage.foldername(name))[1]))
  with check (bucket_id = 'team-photos' and public.team_photo_editable((storage.foldername(name))[1]));
