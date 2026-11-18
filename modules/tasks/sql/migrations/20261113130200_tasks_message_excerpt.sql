-- Task cards in excerpts. The platform's message_excerpt() (20261109130100_platform_messaging_adapt.sql) leaves the task-card
-- token out for the tasks module to bring back, which it had not: notifications, Inbox lines and search snippets showed
-- "[[task:<uuid>]]". The function as COMPASS has it (20261207130000_task_card_excerpt.sql, read from the live schema): the
-- platform's version plus the task-card loop. Test: compass_messaging_smoke.sql.
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
  -- A task card ([[task:<uuid>]], ~/maintenance_tool/docs/messaging.md "Task cards") shows only the number: the title belongs to those who may open the task.
  for v_match in select regexp_matches(v_text, '\[\[task:([0-9a-fA-F-]{36})\]\]', 'g') loop
    v_text := replace(v_text, '[[task:' || v_match[1] || ']]',
                      '#' || coalesce((select task_number::text from public.tasks where id = v_match[1]::uuid), '…'));
  end loop;
  -- Block tags separate words, inline tags (<strong>, <a>) do not.
  v_text := regexp_replace(v_text, '</?(p|br|li|ul|ol|div|h[1-6]|blockquote)\b[^>]*>', ' ', 'gi');
  v_text := btrim(regexp_replace(regexp_replace(v_text, '<[^>]*>', '', 'g'), '\s+', ' ', 'g'));
  return left(v_text, p_length);
end;
$$;
