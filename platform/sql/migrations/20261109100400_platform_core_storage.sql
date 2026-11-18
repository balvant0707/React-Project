-- Platform core, slice 1e: second factor on storage. Copied from COMPASS 20261008100000_require_mfa.sql.
-- Bucket-specific policies come with the modules that own the buckets (attachments, people avatars, ...).
create policy mfa_required on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()));
