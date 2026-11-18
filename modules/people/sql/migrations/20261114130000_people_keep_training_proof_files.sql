-- The storage side of the row policy "Keep training proof" (20261109140000_platform_attachments.sql): a training proof is
-- evidence, only the holders of people.edit remove it, whoever uploaded it. Copied from COMPASS (policy "Keep training proof
-- files" on storage.objects, trainings migration 20261012110000, last altered by 20261215120000_training_sessions.sql).
-- Changed: rls_has('people.edit') as in the row policy (COMPASS's last form also used it).
-- Found 2026-11-14 while preparing the COMPASS cutover: the platform build had only the row
-- policy, and "Delete own attachment files" lets the uploader delete the stored file through the Storage API (owner =
-- auth.uid()), so a proof could be removed although its row stays. Restrictive: it narrows the permissive delete policies.
-- Lives in the people module (trainings are COMPASS-only); first written in platform/sql, moved here on 2026-11-14 before
-- COMPASS got it. RADAR had it applied for a few minutes and dropped it again (version 20261114130000 reverted there).
create policy "Keep training proof files" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'attachments'
         or (name not like 'training_records/%' and name not like 'training_sessions/%')
         or (select public.rls_has('people.edit')));
