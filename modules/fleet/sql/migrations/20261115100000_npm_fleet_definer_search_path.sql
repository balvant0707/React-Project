-- The vessel hull event summary functions run as their owner (SECURITY DEFINER) and had search_path = public. Every
-- object they touch is already schema-qualified, so the path is emptied like it is for every other definer function
-- (checked by platform/sql/tests/security_invariants_smoke.sql).
alter function public.refresh_all_vessel_hull_event_summaries() set search_path = '';
alter function public.refresh_due_vessel_hull_event_summaries() set search_path = '';
alter function public.refresh_vessel_hull_event_summaries(uuid[]) set search_path = '';
alter function public.vessel_hull_event_summary_from_hull_events() set search_path = '';
alter function public.vessel_hull_event_summary_from_vessels() set search_path = '';
