-- Retention of the bell: copied 1:1 from COMPASS (public.cleanup_notifications and its cron job). NPM had its own version
-- (20261024280000); both delete read notifications after 30 days and everything after 180 days.
CREATE FUNCTION public.cleanup_notifications(p_read_days integer DEFAULT 30, p_any_days integer DEFAULT 180) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_deleted integer;
begin
  delete from public.notifications
  where (read_at is not null and read_at < now() - make_interval(days => p_read_days))
     or created_at < now() - make_interval(days => p_any_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
REVOKE ALL ON FUNCTION public.cleanup_notifications(p_read_days integer, p_any_days integer) FROM PUBLIC, anon, authenticated;
GRANT ALL ON FUNCTION public.cleanup_notifications(p_read_days integer, p_any_days integer) TO service_role;
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('cleanup-notifications', '30 3 * * *', 'select public.cleanup_notifications()');
exception when others then
  raise notice 'pg_cron unavailable (%): schedule public.cleanup_notifications() externally', sqlerrm;
end $$;
