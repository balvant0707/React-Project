-- The two pg_cron jobs of the NPM tool that the extraction of the fleet SQL left out (found 2026-11-14 while preparing the
-- RADAR cutover: the old Cloud database ran them, the platform build had the functions but no schedule). Copied from the NPM
-- tool: migrations 20260923090000_companies_overview_vessel_role_counts.sql (refresh-companies-vessel-rollup, every 5
-- minutes) and 20261031100000_vessel_hull_event_summary.sql (refresh-vessel-hull-event-summaries, hourly at :05).
-- Changed: a missing pg_cron is a notice (as platform_notification_cleanup), but any other error stops the migration
-- (the NPM form swallowed everything, so a failed schedule left the data silently stale); cron.schedule with a job name
-- replaces a job of that name, so a left-over job with another schedule or command is corrected, not skipped.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron unavailable: run public.refresh_companies_vessel_rollup() every 5 minutes and public.refresh_due_vessel_hull_event_summaries() hourly externally';
    return;
  end if;
  create extension if not exists pg_cron;
  perform cron.schedule('refresh-companies-vessel-rollup', '*/5 * * * *', 'select public.refresh_companies_vessel_rollup();');
  perform cron.schedule('refresh-vessel-hull-event-summaries', '5 * * * *', 'select public.refresh_due_vessel_hull_event_summaries()');
end $$;
