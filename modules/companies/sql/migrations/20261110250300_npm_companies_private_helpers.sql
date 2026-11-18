-- Review 2026-11-10: definer helpers that only triggers and other definer functions call (no page calls them; NPM granted
-- them to every signed-in user, so anybody could create companies, add company types or use up numbers directly through the API).
-- Seeds and imports run as postgres / service_role and keep them.
revoke execute on function public.company_add_type(uuid, text), public.company_add_types(uuid[], text[]),
  public.get_or_create_seaweb_company(text), public.get_or_create_seaweb_company(text, text) from public, anon, authenticated;
