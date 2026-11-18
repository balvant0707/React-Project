-- RADAR's mails in RADAR blue (apps/npm/src/theme.ts BRAND) instead of the COMPASS red the platform falls back to.
-- Only while nobody has picked a colour on Admin > Configuration > Email.
update public.email_settings set brand_color = '#2952E3' where id and brand_color is null;
